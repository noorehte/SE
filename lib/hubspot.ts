// Read at request time — module-level access gets baked in as undefined for Sensitive vars
const getKey = () => process.env.HUBSPOT_API_KEY!;
const BASE = "https://api.hubapi.com";

// Maps our internal shortnames to HubSpot user IDs (used for enumeration properties)
const OWNER_TO_HUBSPOT_ID: Record<string, string> = {
  noor:     "93684249",
  maha:     "728213976",
  naumaan:  "161082793",
  mohammad: "164641237",
  kean:     "161225162",
  jean:     "162264876",
  zeke:     "2060158945",
};

// Maps our internal field names to HubSpot company property names + value transforms
const FIELD_TO_HUBSPOT: Record<string, { property: string; transform?: (v: string) => string }> = {
  SE_OWNER:        { property: "solutions_engineer" }, // string — just write the name
  ACCOUNT_MANAGER: { property: "account_manager", transform: (v) => OWNER_TO_HUBSPOT_ID[v] ?? v },
  OPS_OWNER:       { property: "ops_owner",        transform: (v) => OWNER_TO_HUBSPOT_ID[v] ?? v },
  KIND:            {
    property: "company_segment",
    transform: (v) => ({ vip: "VIP", strategic: "Strategic", enterprise: "Enterprise", mid_market: "Mid-Market" }[v] ?? v),
  },
};

export async function updateCompanyField(
  hubspotCompanyId: number,
  field: string,
  value: string
): Promise<void> {
  if (!getKey() || !hubspotCompanyId) return;
  const mapping = FIELD_TO_HUBSPOT[field];
  if (!mapping) return; // field not mapped to HubSpot

  const hsValue = mapping.transform ? mapping.transform(value) : value;
  try {
    await fetch(`${BASE}/crm/v3/objects/companies/${hubspotCompanyId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties: { [mapping.property]: hsValue } }),
    });
  } catch {
    // non-fatal — Notion override still saved
  }
}

export async function getCompanyContactEmails(hubspotCompanyId: number): Promise<string[]> {
  if (!getKey() || !hubspotCompanyId) return [];

  try {
    // Step 1: get associated contact IDs
    const assocRes = await fetch(
      `${BASE}/crm/v4/objects/companies/${hubspotCompanyId}/associations/contact`,
      { headers: { Authorization: `Bearer ${getKey()}` } }
    );
    if (!assocRes.ok) return [];
    const assocData = await assocRes.json();
    const contactIds: string[] = (assocData.results ?? []).map((r: { toObjectId: string }) => String(r.toObjectId));
    if (contactIds.length === 0) return [];

    // Step 2: batch fetch emails
    const batchRes = await fetch(`${BASE}/crm/v3/objects/contacts/batch/read`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: ["email"],
        inputs: contactIds.map((id) => ({ id })),
      }),
    });
    if (!batchRes.ok) return [];
    const batchData = await batchRes.json();

    return (batchData.results ?? [])
      .map((c: { properties: { email?: string } }) => c.properties.email)
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

// HubSpot's `churn_date` company property (label "Pause/Churn date") is the
// business-side churn signal set by CS/Sales — it's more complete than the
// app's own health_brands.discarded_at, which only reflects an in-app soft
// delete. A brand can be churned commercially (churn_date set) while never
// having been discarded in the app at all (e.g. Scandinavian Biolabs), so
// both signals need to be checked. Returns a map of HubSpot company ID ->
// churn_date (as a plain "YYYY-MM-DD" string, per HubSpot's date property format).
export async function getChurnDatesByCompanyId(): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!getKey()) return result;

  try {
    let after: string | undefined;
    do {
      const res = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "churn_date", operator: "HAS_PROPERTY" }] }],
          properties: ["churn_date"],
          limit: 200,
          after,
        }),
      });
      if (!res.ok) break;
      const data = await res.json();
      for (const r of (data.results ?? []) as { id: string; properties: { churn_date?: string } }[]) {
        const id = Number(r.id);
        const churnDate = r.properties?.churn_date;
        if (id && churnDate) result.set(id, churnDate);
      }
      after = data.paging?.next?.after;
    } while (after);
  } catch {
    // non-fatal — brands still get churn detection via discarded_at alone
  }
  return result;
}

// HubSpot's native "Company owner" (the `hubspot_owner_id` property, distinct
// from our custom `account_manager`/`solutions_engineer`/`ops_owner`
// properties) — this is the actual CRM-assigned owner of the account in
// HubSpot. Used as a second, independent check alongside Metabase's own
// owner fields, since Metabase's mirrored values can lag or drift from
// what's actually assigned in HubSpot. Returns a map of HubSpot company ID
// -> owner display name.
export async function getAccountOwnersByCompanyId(): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!getKey()) return result;

  try {
    // Step 1: resolve owner IDs -> display names once, via HubSpot's Owners
    // endpoint (paginated).
    const ownerNameById = new Map<number, string>();
    let ownerAfter: string | undefined;
    do {
      const url = new URL(`${BASE}/crm/v3/owners`);
      url.searchParams.set("limit", "200");
      if (ownerAfter) url.searchParams.set("after", ownerAfter);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getKey()}` } });
      if (!res.ok) break;
      const data: { results?: { id: string; firstName?: string; lastName?: string; email?: string }[]; paging?: { next?: { after?: string } } } = await res.json();
      for (const o of data.results ?? []) {
        const name = [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email;
        if (name) ownerNameById.set(Number(o.id), name);
      }
      ownerAfter = data.paging?.next?.after;
    } while (ownerAfter);

    // Step 2: page through companies that have an owner assigned, and map
    // company ID -> owner name via the lookup above.
    let companyAfter: string | undefined;
    do {
      const res = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "HAS_PROPERTY" }] }],
          properties: ["hubspot_owner_id"],
          limit: 200,
          after: companyAfter,
        }),
      });
      if (!res.ok) break;
      const data: { results?: { id: string; properties: { hubspot_owner_id?: string } }[]; paging?: { next?: { after?: string } } } = await res.json();
      for (const r of data.results ?? []) {
        const companyId = Number(r.id);
        const ownerId = r.properties?.hubspot_owner_id ? Number(r.properties.hubspot_owner_id) : null;
        const ownerName = ownerId != null ? ownerNameById.get(ownerId) : undefined;
        if (companyId && ownerName) result.set(companyId, ownerName);
      }
      companyAfter = data.paging?.next?.after;
    } while (companyAfter);
  } catch {
    // non-fatal — dashboard still gets owners from Metabase alone
  }
  return result;
}

// Returns true if the company has at least one "Closed Won" deal in HubSpot.
// Fails open (returns true) if there's no HubSpot ID or the API call fails.
export async function isCompanyClosedWon(hubspotCompanyId: number): Promise<boolean> {
  if (!getKey() || !hubspotCompanyId) return true;

  try {
    const assocRes = await fetch(
      `${BASE}/crm/v4/objects/companies/${hubspotCompanyId}/associations/deal`,
      { headers: { Authorization: `Bearer ${getKey()}` } }
    );
    if (!assocRes.ok) return true;
    const assocData = await assocRes.json();
    const dealIds: string[] = (assocData.results ?? []).map((r: { toObjectId: string }) => String(r.toObjectId));
    if (dealIds.length === 0) return true;

    const batchRes = await fetch(`${BASE}/crm/v3/objects/deals/batch/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: ["dealstage"],
        inputs: dealIds.map((id) => ({ id })),
      }),
    });
    if (!batchRes.ok) return true;
    const batchData = await batchRes.json();

    return (batchData.results ?? []).some(
      (d: { properties: { dealstage?: string } }) => d.properties.dealstage === "closedwon"
    );
  } catch {
    return true;
  }
}

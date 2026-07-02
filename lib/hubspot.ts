// Read at request time — module-level access gets baked in as undefined for Sensitive vars
const getKey = () => process.env.getKey()!;
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

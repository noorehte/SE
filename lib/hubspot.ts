const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const BASE = "https://api.hubapi.com";

export async function getCompanyContactEmails(hubspotCompanyId: number): Promise<string[]> {
  if (!HUBSPOT_API_KEY || !hubspotCompanyId) return [];

  try {
    // Step 1: get associated contact IDs
    const assocRes = await fetch(
      `${BASE}/crm/v4/objects/companies/${hubspotCompanyId}/associations/contact`,
      { headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` } }
    );
    if (!assocRes.ok) return [];
    const assocData = await assocRes.json();
    const contactIds: string[] = (assocData.results ?? []).map((r: { toObjectId: string }) => String(r.toObjectId));
    if (contactIds.length === 0) return [];

    // Step 2: batch fetch emails
    const batchRes = await fetch(`${BASE}/crm/v3/objects/contacts/batch/read`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
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
  if (!HUBSPOT_API_KEY || !hubspotCompanyId) return true;

  try {
    const assocRes = await fetch(
      `${BASE}/crm/v4/objects/companies/${hubspotCompanyId}/associations/deal`,
      { headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` } }
    );
    if (!assocRes.ok) return true;
    const assocData = await assocRes.json();
    const dealIds: string[] = (assocData.results ?? []).map((r: { toObjectId: string }) => String(r.toObjectId));
    if (dealIds.length === 0) return true;

    const batchRes = await fetch(`${BASE}/crm/v3/objects/deals/batch/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, "Content-Type": "application/json" },
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

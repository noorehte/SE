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

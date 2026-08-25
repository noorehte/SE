// "SE Sprint" queue — brands that filled out the "Request for Assisted
// FrontrowMD Implementation" Google Form, asking SEs to build their draft
// theme. Responses land in the "Form Responses" tab (gid=109511776) of the
// same Customer Success Trackers spreadsheet lib/cai-sheet.ts reads (id
// 1bCEaft8XKzMRUGQInfkJmcqu6XQVcb_g8pzozOWalJM). That tab isn't
// link-shareable (its CSV export returns 401), so — like cai-sheet.ts, and
// unlike the public reachouts sheet — this goes through its own Apps
// Script web app (SE_SPRINT_SHEET_SCRIPT_URL) rather than a plain CSV
// fetch. Deployed as a separate script/URL from CAI_SHEET_SCRIPT_URL
// (rather than extending that one) to keep the two features' deployments
// independent — see that script's doGet() for the sheet-reading logic.

export interface SeSprintEntry {
  name: string;
  timestamp: string; // raw sheet text, e.g. "8/12/2026 14:03:22"
  myshopifyUrl: string;
  hasSharedCode: string; // raw "Yes" / "No" / "Unsure"
  collaboratorCode: string;
  email: string;
}

export async function getSeSprintEntries(): Promise<SeSprintEntry[]> {
  const url = process.env.SE_SPRINT_SHEET_SCRIPT_URL;
  if (!url) return [];
  try {
    // The deployed script defaults to its original "cai" behavior
    // ({ brands: [...] }) unless told otherwise — tab=se_sprint is required
    // to get { entries: [...] } back.
    const res = await fetch(`${url}?tab=se_sprint`, { cache: "no-store" });
    const data = await res.json();
    return (data.entries ?? []) as SeSprintEntry[];
  } catch {
    return [];
  }
}

/** Match sheet brand names to Metabase brand names (case-insensitive, ignoring punctuation) */
export function buildSeSprintLookup(entries: SeSprintEntry[]): Map<string, SeSprintEntry> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = new Map<string, SeSprintEntry>();
  for (const e of entries) {
    map.set(normalize(e.name), e);
  }
  return map;
}

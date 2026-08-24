// "SE Sprint" queue — brands that filled out the "Request for Assisted
// FrontrowMD Implementation" Google Form, asking SEs to build their draft
// theme. Responses land in the "Form Responses" tab (gid=109511776) of the
// same Customer Success Trackers spreadsheet lib/cai-sheet.ts already reads
// (id 1bCEaft8XKzMRUGQInfkJmcqu6XQVcb_g8pzozOWalJM). That tab isn't
// link-shareable (its CSV export returns 401), so — like cai-sheet.ts, and
// unlike the public reachouts sheet — this goes through the same Apps
// Script web app rather than a plain CSV fetch. The existing script behind
// CAI_SHEET_SCRIPT_URL needs a second branch added for this tab's gid;
// see the doGet() below for the exact change to deploy.
//
// ─── Google Apps Script (replaces the existing doGet in that project) ───────
// function doGet(e) {
//   const ss = SpreadsheetApp.openById("1bCEaft8XKzMRUGQInfkJmcqu6XQVcb_g8pzozOWalJM");
//   const tab = (e.parameter && e.parameter.tab) || "cai";
//   if (tab === "se_sprint") {
//     const sheet = ss.getSheets().find(s => s.getSheetId() === 109511776);
//     if (!sheet) return ContentService.createTextOutput(JSON.stringify({ entries: [] }))
//                                      .setMimeType(ContentService.MimeType.JSON);
//     const rows = sheet.getDataRange().getValues();
//     const header = rows[0].map(h => String(h ?? "").trim());
//     const col = (name) => header.indexOf(name);
//     const entries = rows.slice(1)
//       .map(row => ({
//         name: String(row[col("What is your Brand Name?")] ?? "").trim(),
//         timestamp: String(row[col("Timestamp")] ?? "").trim(),
//         myshopifyUrl: String(row[col("Please share your myshopify URL below, this is needed to request collaborator access (e.g brandname.myshopify.com).")] ?? "").trim(),
//         hasSharedCode: String(row[col("Have you already shared your Shopify Collaborator Code?")] ?? "").trim(),
//         collaboratorCode: String(row[col("Share your Collaborator Code below.")] ?? "").trim(),
//         email: String(row[col("Email Address")] ?? "").trim(),
//       }))
//       .filter(en => en.name);
//     return ContentService.createTextOutput(JSON.stringify({ entries }))
//                          .setMimeType(ContentService.MimeType.JSON);
//   }
//   // existing "cai" branch below (unchanged) ...
//   const sheet = ss.getSheets().find(s => s.getSheetId() === 678833984);
//   if (!sheet) return ContentService.createTextOutput(JSON.stringify({ brands: [] }))
//                                    .setMimeType(ContentService.MimeType.JSON);
//   const rows = sheet.getDataRange().getValues();
//   const brands = rows
//     .map(row => ({ name: String(row[0] ?? "").trim(), type: String(row[1] ?? "").trim().toUpperCase() }))
//     .filter(r => r.name && (r.type === "CAI" || r.type === "CAS"));
//   return ContentService.createTextOutput(JSON.stringify({ brands }))
//                        .setMimeType(ContentService.MimeType.JSON);
// }
// ─────────────────────────────────────────────────────────────────────────────

export interface SeSprintEntry {
  name: string;
  timestamp: string; // raw sheet text, e.g. "8/12/2026 14:03:22"
  myshopifyUrl: string;
  hasSharedCode: string; // raw "Yes" / "No" / "Unsure"
  collaboratorCode: string;
  email: string;
}

export async function getSeSprintEntries(): Promise<SeSprintEntry[]> {
  const url = process.env.CAI_SHEET_SCRIPT_URL;
  if (!url) return [];
  try {
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

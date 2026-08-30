// CAI/CAS implementation readiness — sourced from "Ready for CAI Implementation"
// tab (gid=678833984) in Customer Success Trackers Google Spreadsheet.
//
// Setup: Deploy the Apps Script below as a web app (Execute as: Me, Who: Anyone)
// and set CAI_SHEET_SCRIPT_URL in .env.local + Vercel env vars.
//
// ─── Google Apps Script ──────────────────────────────────────────────────────
// function doGet() {
//   const ss = SpreadsheetApp.openById("1bCEaft8XKzMRUGQInfkJmcqu6XQVcb_g8pzozOWalJM");
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

import { cached } from "@/lib/server-cache";

export interface CaiReadyEntry {
  name: string;
  type: "CAI" | "CAS";
}

// Apps Script web apps are slow (often 1-3s per call) and this was hit fresh
// on every page load — cached briefly so repeated loads within the window
// reuse one fetch. See lib/server-cache.ts.
export async function getCaiReadyBrands(): Promise<CaiReadyEntry[]> {
  const url = process.env.CAI_SHEET_SCRIPT_URL;
  if (!url) return [];
  return cached("cai-ready-brands", 60, async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      return (data.brands ?? []) as CaiReadyEntry[];
    } catch {
      return [];
    }
  });
}

/** Match sheet brand names to Metabase brand names (case-insensitive, ignoring punctuation) */
export function buildCaiLookup(entries: CaiReadyEntry[]): Map<string, "CAI" | "CAS"> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = new Map<string, "CAI" | "CAS">();
  for (const e of entries) {
    map.set(normalize(e.name), e.type);
  }
  return map;
}

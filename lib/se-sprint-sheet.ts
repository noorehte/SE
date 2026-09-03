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
  email: string;
  alreadyTriedWidgets: string; // "Have you already tried to implement the FrontrowMD widgets on your end?" — Yes/No/Unsure
  hostedOn: string; // "Where is your website hosted?" — Shopify/Replo/Wordpress/Gempages/Funnelish/Other
  pageBuilder: string; // "Are you using one of the following page builders?"
  isHeadless: string; // "Is your set up Headless?" — Yes/No
  themeToClone: string; // "Which theme should we duplicate before starting the work..."
  extraProductTemplate: string; // "Do you need the FrontrowMD widgets on a Product Template outside of the default..."
  notes: string; // "Is there anything you'd like to share about your website experience..."
  wantsHomepageBadge: string; // "Would you like to feature a badge on the homepage?" — Yes/No/Unsure
  hasSharedCode: string; // raw "Yes" / "No" / "Unsure" — self-reported, don't treat as proof a code exists
  collaboratorCode: string; // the code itself, if the brand typed it into the form
  myshopifyUrl: string;
}

import { cached } from "@/lib/server-cache";

// Apps Script web apps are slow (often 1-3s per call) and this was hit fresh
// on every page load — cached briefly so repeated loads within the window
// reuse one fetch. See lib/server-cache.ts.
export async function getSeSprintEntries(): Promise<SeSprintEntry[]> {
  const url = process.env.SE_SPRINT_SHEET_SCRIPT_URL;
  if (!url) return [];
  return cached("se-sprint-entries", 60, async () => {
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
  });
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

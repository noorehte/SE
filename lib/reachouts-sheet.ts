// "Email reachouts" tracker — a Google Sheet the CS/marketing team maintains
// by hand, listing brands slotted into outreach "buckets" (one per email
// template) with a Y/N "Emailed?" column per bucket. Publicly link-shareable,
// so it's fetched directly via Sheets' CSV export endpoint — no Apps Script
// deployment needed (unlike lib/cai-sheet.ts).
//
// Sheet: https://docs.google.com/spreadsheets/d/1kEMqlC5TauVxxX_4uS9SwBfHWVBFxyvYOIF7WZPCU30
//
// Layout is NOT assumed to be fixed — this sheet is hand-edited by CS/
// marketing and has already shifted once (an extra title row got inserted,
// a "Notes" column got added between buckets, and one bucket gained an
// "Emailed?" column it didn't have before). So instead of hardcoded row/
// column indices, this scans for the header row ("Brands - Bucket N" cells)
// wherever it actually is, finds each bucket's own "Emailed?" column by
// scanning forward from its name column (not assuming a fixed offset), and
// finds its send-date label by scanning upward in that same column for the
// nearest "Send ..." cell (also not a fixed row).
const SHEET_ID = "1kEMqlC5TauVxxX_4uS9SwBfHWVBFxyvYOIF7WZPCU30";
const MAX_BUCKET_WIDTH = 5; // how far right of "Brands - Bucket N" to look for its "Emailed?" column

export interface ReachoutEntry {
  name: string;
  emailed: boolean | null; // null = blank cell (not yet categorized), not necessarily "no"
  sendLabel: string; // raw sheet text, e.g. "Send 7/31" or "Send in Aug"
}

function parseCsvRow(line: string): string[] {
  // Minimal CSV split — this sheet's cells never contain embedded commas or
  // quotes (brand names only), so a naive split is safe and avoids pulling
  // in a CSV parsing dependency for one sheet.
  return line.split(",").map((c) => c.trim());
}

export async function getReachouts(): Promise<ReachoutEntry[]> {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = text.split("\n").map(parseCsvRow);

    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => cell.toLowerCase().startsWith("brands - bucket"))
    );
    if (headerRowIndex === -1) return [];
    const headerRow = rows[headerRowIndex];

    const bucketCols: number[] = [];
    headerRow.forEach((cell, i) => {
      if (cell.toLowerCase().startsWith("brands - bucket")) bucketCols.push(i);
    });

    const entries: ReachoutEntry[] = [];
    for (const col of bucketCols) {
      // Find this bucket's own "Emailed?" column — scan forward, but stop
      // before the next bucket's name column so we never bleed into it.
      const nextBucketCol = bucketCols.find((c) => c > col) ?? Infinity;
      let emailedCol: number | null = null;
      for (let c = col + 1; c < Math.min(col + MAX_BUCKET_WIDTH, nextBucketCol); c++) {
        if ((headerRow[c] ?? "").toLowerCase() === "emailed?") {
          emailedCol = c;
          break;
        }
      }

      // Find this bucket's send-date label — scan upward from the header
      // row in this same column for the nearest "Send ..." cell.
      let sendLabel = "";
      for (let r = headerRowIndex - 1; r >= 0; r--) {
        const cell = (rows[r]?.[col] ?? "").trim();
        if (cell.toLowerCase().startsWith("send")) {
          sendLabel = cell;
          break;
        }
      }

      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const name = (rows[r]?.[col] ?? "").trim();
        if (!name) continue;
        const emailedRaw = emailedCol != null ? (rows[r]?.[emailedCol] ?? "").trim().toUpperCase() : "";
        const emailed = emailedRaw === "Y" ? true : emailedRaw === "N" ? false : null;
        entries.push({ name, emailed, sendLabel });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/** Match sheet brand names to our brand names (case-insensitive, ignoring punctuation) */
export function buildReachoutLookup(entries: ReachoutEntry[]): Map<string, ReachoutEntry> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = new Map<string, ReachoutEntry>();
  for (const e of entries) {
    map.set(normalize(e.name), e);
  }
  return map;
}

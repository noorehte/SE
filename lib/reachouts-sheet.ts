// "Email reachouts" tracker — a Google Sheet the CS/marketing team maintains
// by hand, listing brands slotted into outreach "buckets" (one per email
// template) with a Y/N "Emailed?" column per bucket. Reading is done via
// Sheets' public CSV export endpoint (no auth needed, since the sheet is
// link-shareable) — no Apps Script deployment needed (unlike lib/cai-sheet.ts).
// Writing (see writeReachoutStatus below) goes through the real Sheets API
// instead, using a connected SE/AM's OAuth token (lib/google-auth.ts) — the
// CSV export endpoint is read-only.
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
const SHEET_GID = 0;
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

interface BucketLayout {
  nameCol: number;
  emailedCol: number | null;
  sendLabel: string;
}

// Shared structure-scanner — works on any string[][] grid, whether it came
// from the CSV export (reads) or the Sheets API's values.get (writes), so
// the "don't assume fixed rows/columns" logic lives in exactly one place.
function findBucketLayouts(rows: string[][]): { headerRowIndex: number; buckets: BucketLayout[] } {
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => cell.toLowerCase().startsWith("brands - bucket"))
  );
  if (headerRowIndex === -1) return { headerRowIndex: -1, buckets: [] };
  const headerRow = rows[headerRowIndex];

  const bucketCols: number[] = [];
  headerRow.forEach((cell, i) => {
    if (cell.toLowerCase().startsWith("brands - bucket")) bucketCols.push(i);
  });

  const buckets: BucketLayout[] = bucketCols.map((col) => {
    const nextBucketCol = bucketCols.find((c) => c > col) ?? Infinity;
    let emailedCol: number | null = null;
    for (let c = col + 1; c < Math.min(col + MAX_BUCKET_WIDTH, nextBucketCol); c++) {
      if ((headerRow[c] ?? "").toLowerCase() === "emailed?") {
        emailedCol = c;
        break;
      }
    }
    let sendLabel = "";
    for (let r = headerRowIndex - 1; r >= 0; r--) {
      const cell = (rows[r]?.[col] ?? "").trim();
      if (cell.toLowerCase().startsWith("send")) {
        sendLabel = cell;
        break;
      }
    }
    return { nameCol: col, emailedCol, sendLabel };
  });

  return { headerRowIndex, buckets };
}

export async function getReachouts(): Promise<ReachoutEntry[]> {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = text.split("\n").map(parseCsvRow);

    const { headerRowIndex, buckets } = findBucketLayouts(rows);
    if (headerRowIndex === -1) return [];

    const entries: ReachoutEntry[] = [];
    for (const { nameCol, emailedCol, sendLabel } of buckets) {
      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const name = (rows[r]?.[nameCol] ?? "").trim();
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

function columnToA1(col: number): string {
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface WriteReachoutResult {
  success: boolean;
  error?: string;
}

/**
 * Sets a brand's "Emailed?" cell to Y or N on the live sheet, using an
 * authorized Sheets API client (see lib/google-auth.ts — the read-only CSV
 * export used by getReachouts() can't write). Re-reads the current grid via
 * the API first to locate the brand's actual row/column, since bucket
 * columns and the header row aren't at fixed positions (see file header).
 * Returns an error if the brand isn't found on the sheet, or its bucket has
 * no "Emailed?" column to write to.
 */
export async function writeReachoutStatus(
  auth: import("googleapis").Auth.OAuth2Client,
  brandName: string,
  emailed: boolean
): Promise<WriteReachoutResult> {
  const { google } = await import("googleapis");
  const sheets = google.sheets({ version: "v4", auth });

  // Resolve the actual tab title for SHEET_GID rather than guessing a name —
  // A1 ranges need a title, and this sheet could have any name/be renamed.
  let sheetTitle: string;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const tab = meta.data.sheets?.find((s) => s.properties?.sheetId === SHEET_GID);
    if (!tab?.properties?.title) {
      return { success: false, error: `Couldn't find a tab with gid=${SHEET_GID} on the sheet` };
    }
    sheetTitle = tab.properties.title;
  } catch (err) {
    return { success: false, error: `Couldn't read sheet metadata: ${err instanceof Error ? err.message : String(err)}` };
  }

  let grid: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetTitle}'!A1:Z300`, // generous bound — this sheet's used range is well under this
    });
    grid = (res.data.values ?? []).map((row) => row.map((c) => String(c ?? "").trim()));
  } catch (err) {
    return { success: false, error: `Couldn't read the sheet: ${err instanceof Error ? err.message : String(err)}` };
  }

  const { headerRowIndex, buckets } = findBucketLayouts(grid);
  if (headerRowIndex === -1) {
    return { success: false, error: "Couldn't find the sheet's header row (\"Brands - Bucket N\")" };
  }

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetName = normalize(brandName);

  for (const { nameCol, emailedCol } of buckets) {
    for (let r = headerRowIndex + 1; r < grid.length; r++) {
      const name = (grid[r]?.[nameCol] ?? "").trim();
      if (!name || normalize(name) !== targetName) continue;
      if (emailedCol == null) {
        return { success: false, error: `${brandName}'s bucket has no "Emailed?" column on the sheet` };
      }
      const a1 = `${columnToA1(emailedCol)}${r + 1}`;
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `'${sheetTitle}'!${a1}`,
          valueInputOption: "RAW",
          requestBody: { values: [[emailed ? "Y" : "N"]] },
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  return { success: false, error: `${brandName} isn't listed on the reachouts sheet` };
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

import { Brand } from "./metabase";

function monthKey(iso: string): string {
  return iso.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: "long", timeZone: "UTC" });
}

export interface MonthCount {
  month: string;      // "YYYY-MM"
  label: string;      // "January"
  count: number;
}

// VIP Brands per Month — signup/growth volume, grouped by CLOSE_DATE (the
// HubSpot closed-won deal's closedate), deliberately separate from Live
// Status health scoring (see brief). Brands with no CLOSE_DATE (no
// closed-won deal yet) are excluded rather than bucketed under "unknown".
// Returns a continuous run of `monthsBack` calendar months ending this month
// (gaps filled with count 0) rather than just the last N months that happen
// to have a signup — with sparse history those can span well over a year,
// which produces duplicate month labels (e.g. two "Aug" bars) since the
// label alone doesn't carry a year.
export function buildSignupsByMonth(brands: Brand[], monthsBack: number): MonthCount[] {
  const counts = new Map<string, number>();
  for (const b of brands) {
    if (!b.CLOSE_DATE) continue;
    const key = monthKey(b.CLOSE_DATE);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const now = new Date();
  const months: MonthCount[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push({ month: key, label: monthLabel(key), count: counts.get(key) ?? 0 });
  }
  return months;
}

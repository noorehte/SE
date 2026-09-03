// Scoring for the "This Week" board (formerly SE Sprint) — ranks each SE's
// brands by how much they need attention this week, combining signals that
// used to only live on separate pages: Pylon sentiment, the collab-request
// queue, and how long a brand's been stuck. A brand can match more than one
// reason at once (e.g. frustrated AND stuck) — reasons() below returns every
// reason that applies so the UI can show them all, not just whichever scored
// highest.
//
// Deliberately NOT using Pylon's "number_of_open_issues_last_90_days" custom
// field as a signal — despite the name, it does not reliably track currently-
// open tickets. Spot-checked against a real account: the field reported 1,
// while directly counting issues with no resolution_time set in the same
// 90-day window found 21 genuinely open. Re-add a ticket-volume signal only
// once it's computed directly from /issues (filtering on resolution_time),
// not from this field.
import { Brand, PipelineStatus, isBrandStuck } from "./metabase";

export interface WeeklyFocusReason {
  key: string;
  label: string;
  color: string;
}

const SENTIMENT_WEIGHT: Record<string, number> = {
  high_risk_detractor: 50,
  frustrated: 35,
  neutral: 0,
  positive: -10,
  advocate: -15,
};

const COLLAB_REQUEST_POINTS = 30;
const STUCK_POINTS_PER_DAY = 1.5;
const STUCK_POINTS_CAP = 30;

export function weeklyFocusScore(brand: Brand): number {
  let score = 0;
  if (brand.PYLON_SENTIMENT) score += SENTIMENT_WEIGHT[brand.PYLON_SENTIMENT] ?? 0;
  if (brand.ON_SE_SPRINT_SHEET) score += COLLAB_REQUEST_POINTS;
  if (isBrandStuck(brand)) {
    score += Math.min(brand.DAYS_IN_STATUS * STUCK_POINTS_PER_DAY, STUCK_POINTS_CAP);
  }
  return score;
}

export function weeklyFocusReasons(brand: Brand): WeeklyFocusReason[] {
  const reasons: WeeklyFocusReason[] = [];
  if (brand.PYLON_SENTIMENT === "high_risk_detractor") {
    reasons.push({ key: "high_risk", label: "High risk", color: "#e05c5c" });
  } else if (brand.PYLON_SENTIMENT === "frustrated") {
    reasons.push({ key: "frustrated", label: "Frustrated", color: "#e9a84c" });
  }
  if (brand.ON_SE_SPRINT_SHEET) {
    reasons.push({ key: "collab_request", label: "Collab request", color: "#72a4bf" });
  }
  if (isBrandStuck(brand)) {
    reasons.push({ key: "stuck", label: `Stuck ${brand.DAYS_IN_STATUS}d`, color: "#e05c5c" });
  }
  return reasons;
}

// Only a brand with at least one real reason belongs on the board at all —
// otherwise every quiet "live" brand with a neutral/no sentiment would still
// show up with score 0 and clutter every SE's lane. A pin always overrides
// this (see isWeeklyFocusVisible below).
export function isWeeklyFocusCandidate(brand: Brand): boolean {
  return weeklyFocusReasons(brand).length > 0;
}

// ISO 8601 week string, e.g. "2026-W35" — used to scope a dismissal to just
// the current week rather than forever, so a dismissed brand naturally comes
// back into consideration once a new week starts (no cron/cleanup needed).
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// This Week is for brands an SE still has implementation/onboarding work to
// do on — not steady-state account health for brands that have already
// succeeded. Live and churned are both excluded outright, pin included:
// a live brand's sentiment/collab-request signals don't change that its
// pipeline work is done, and a churned brand's signals predate the churn.
const EXCLUDED_STATUSES: PipelineStatus[] = ["live", "churned"];

// A brand is visible on the board this week if it's pinned (always wins,
// except for the statuses above) or it's a real candidate and hasn't been
// dismissed for the current week.
export function isWeeklyFocusVisible(brand: Brand, currentWeek: string): boolean {
  if (EXCLUDED_STATUSES.includes(brand.PIPELINE_STATUS)) return false;
  if (brand.WEEKLY_FOCUS_PINNED) return true;
  if (brand.WEEKLY_FOCUS_DISMISSED_WEEK === currentWeek) return false;
  return isWeeklyFocusCandidate(brand);
}

const LANE_SIZE = 20;

/**
 * The rank order to FREEZE for a given SE at snapshot time (called once, the
 * first time a given ISO week is seen — see lib/weekly-snapshot.ts). Highest
 * score first, capped at LANE_SIZE non-pinned brands (a pin is meaningless at
 * snapshot time since nothing's been pinned yet this week).
 */
export function rankForSnapshot(brands: Brand[], se: string, currentWeek: string): number[] {
  const owned = brands.filter((b) => b.SE_OWNER === se && isWeeklyFocusVisible(b, currentWeek));
  return [...owned]
    .sort((a, b) => weeklyFocusScore(b) - weeklyFocusScore(a))
    .slice(0, LANE_SIZE)
    .map((b) => b.BRAND_ID);
}

/**
 * Resolves a frozen snapshot order into the actual brands to render for one
 * SE's lane this week: drops anything no longer visible (churned, dismissed,
 * unpinned-and-since-fell-out — though the last case can't happen since the
 * snapshot is frozen), then appends any brand pinned mid-week that wasn't in
 * the original snapshot (a pin should surface a brand even if it missed the
 * cut when the week started).
 */
export function resolveWeeklyLane(
  brandsById: Map<number, Brand>,
  snapshotIds: number[],
  se: string,
  currentWeek: string
): Brand[] {
  const seen = new Set(snapshotIds);
  const fromSnapshot = snapshotIds
    .map((id) => brandsById.get(id))
    .filter((b): b is Brand => !!b && isWeeklyFocusVisible(b, currentWeek));
  const pinnedLateAdds = Array.from(brandsById.values()).filter(
    (b) => b.SE_OWNER === se && b.WEEKLY_FOCUS_PINNED && !seen.has(b.BRAND_ID)
  );
  return [...fromSnapshot, ...pinnedLateAdds];
}

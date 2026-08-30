// Scoring for the "This Week" board (formerly SE Sprint) — ranks each SE's
// brands by how much they need attention this week, combining signals that
// used to only live on separate pages: Pylon sentiment/ticket volume, the
// collab-request queue, and how long a brand's been stuck. A brand can match
// more than one reason at once (e.g. frustrated AND stuck) — reasons() below
// returns every reason that applies so the UI can show them all, not just
// whichever scored highest.
import { Brand, isBrandStuck } from "./metabase";

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

// Open tickets are a graduated signal, not a threshold — more open issues in
// the last 90 days means more SE attention needed, capped so one extreme
// outlier account doesn't dominate every lane.
const OPEN_ISSUES_POINTS_PER_TICKET = 6;
const OPEN_ISSUES_CAP = 40;

const COLLAB_REQUEST_POINTS = 30;
const STUCK_POINTS_PER_DAY = 1.5;
const STUCK_POINTS_CAP = 30;

export function weeklyFocusScore(brand: Brand): number {
  let score = 0;
  if (brand.PYLON_SENTIMENT) score += SENTIMENT_WEIGHT[brand.PYLON_SENTIMENT] ?? 0;
  if (brand.PYLON_OPEN_ISSUES_90D) {
    score += Math.min(brand.PYLON_OPEN_ISSUES_90D * OPEN_ISSUES_POINTS_PER_TICKET, OPEN_ISSUES_CAP);
  }
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
  if (brand.PYLON_OPEN_ISSUES_90D && brand.PYLON_OPEN_ISSUES_90D >= 3) {
    reasons.push({ key: "tickets", label: `${brand.PYLON_OPEN_ISSUES_90D} open tickets`, color: "#e9a84c" });
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

// A brand is visible on the board this week if it's pinned (always wins) or
// it's a real candidate and hasn't been dismissed for the current week.
// Churned brands are excluded outright, pin included — their sentiment/ticket
// signals predate the churn and don't reflect a brand an SE can still act on.
export function isWeeklyFocusVisible(brand: Brand, currentWeek: string): boolean {
  if (brand.PIPELINE_STATUS === "churned") return false;
  if (brand.WEEKLY_FOCUS_PINNED) return true;
  if (brand.WEEKLY_FOCUS_DISMISSED_WEEK === currentWeek) return false;
  return isWeeklyFocusCandidate(brand);
}

import { FOLLOWUP_COHORT, type CohortBrand, type CohortMonth } from "./cohort";
import { getState, type FollowupState } from "./state";
import { MARKS } from "./messages";
import type { Brand } from "@/lib/metabase";

const DAY = 86400000;

// The lanes shown on the follow-up tracker tab, in board order. "live" and
// "replied" are terminal/attention states pulled out of the day-stage flow;
// "scheduled" (snooze date set) and "disabled" are per-brand control states.
export type Lane =
  | "queued"
  | "day10"
  | "day20"
  | "day30"
  | "day40"
  | "live"
  | "replied"
  | "scheduled"
  | "disabled";

export interface TrackerRow {
  id: number;
  name: string;
  month: CohortMonth;
  reviewsSentDate: string;
  lane: Lane;
  caiReady: boolean;      // brand also had CAI ready at cohort build (drives +CAI chip)
  reviewsLive: boolean;   // reviews (qual) widget currently live
  caiLive: boolean;       // CAI widget currently live
  disabled: boolean;      // FOLLOWUPS_DISABLED
  snoozeUntil: string | null; // FOLLOWUP_SNOOZE_UNTIL (ISO), if set
  repliedAt: string | null;   // brand replied in the Pylon thread (from state), if any
  highestMark: number;    // highest bump sent so far (0 = none yet)
  firstBumpAt: string | null; // when Day-10 fired (cohort anchor), if started
  nextDueAt: string | null;   // ISO date the next bump is due, if the sequence is running
  pylonIssueId: string | null;
}

// Cohort cadence: first bump = Day 10, then +10 days per mark. So the due date
// for mark m is firstBumpAt + (m - 10) days.
function nextDue(firstBumpAt: string | null, highestMark: number): string | null {
  if (!firstBumpAt) return null;
  const next = MARKS.find((m) => m > highestMark);
  if (next == null) return null; // 40 already sent — sequence complete
  return new Date(Date.parse(firstBumpAt) + (next - 10) * DAY).toISOString();
}

function laneFor(row: Omit<TrackerRow, "lane">): Lane {
  if (row.reviewsLive) return "live";       // went live — terminal success
  if (row.repliedAt) return "replied";      // needs action
  if (row.disabled) return "disabled";      // hard off-switch
  if (row.snoozeUntil) return "scheduled";  // one-off scheduled date set
  if (row.highestMark >= 40) return "day40";
  if (row.highestMark >= 30) return "day30";
  if (row.highestMark >= 20) return "day20";
  if (row.highestMark >= 10) return "day10";
  return "queued";
}

export function buildTrackerRow(
  cohort: CohortBrand,
  brand: Brand | undefined,
  state: FollowupState | null
): TrackerRow {
  const firstBumpAt = state?.firstBumpAt ?? null;
  // Only count cadence marks once the COHORT engine has launched this brand
  // (firstBumpAt set). Leftover touchesSent from the retired admission-window
  // engine (internal notes, no firstBumpAt) must NOT read as Day 10/20/30 — the
  // brand stays Queued until its month is launched here.
  const highestMark = firstBumpAt && state?.touchesSent?.length ? Math.max(...state.touchesSent) : 0;
  const base = {
    id: cohort.id,
    name: brand?.BRAND_NAME ?? cohort.name,
    month: cohort.month,
    reviewsSentDate: cohort.reviewsSentDate,
    caiReady: cohort.caiReady,
    reviewsLive: brand?.REVIEWS_IMPLEMENTED ?? false,
    caiLive: brand?.CAI_IMPLEMENTED ?? false,
    disabled: brand?.FOLLOWUPS_DISABLED ?? false,
    snoozeUntil: brand?.FOLLOWUP_SNOOZE_UNTIL ?? null,
    repliedAt: state?.repliedAt ?? null,
    highestMark,
    firstBumpAt,
    nextDueAt: nextDue(firstBumpAt, highestMark),
    pylonIssueId: state?.pylonIssueId ?? null,
  };
  return { ...base, lane: laneFor(base) };
}

// Build every cohort row for the tracker tab. `brands` is the full getBrands()
// result; we index it by BRAND_ID and read each brand's persisted follow-up
// state. Read-only: no writes, no Pylon calls.
export async function buildTrackerRows(brands: Brand[]): Promise<TrackerRow[]> {
  const byId = new Map(brands.map((b) => [b.BRAND_ID, b]));
  return Promise.all(
    FOLLOWUP_COHORT.map(async (c) => buildTrackerRow(c, byId.get(c.id), await getState(c.id)))
  );
}

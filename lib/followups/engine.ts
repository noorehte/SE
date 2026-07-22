import { detectSnippetStatus, SNIPPETS, SNIPPET_LABEL, type Snippet } from "./detect";
import { getState, setState, type FollowupState } from "./state";
import { MARKS, buildSubject, buildFollowupBody, buildSnoozeBody } from "./messages";
import { createBumpIssue, appendNote } from "./pylon";
import { getAllOverrides } from "@/lib/overrides";

const DAY = 86400000;

// A snippet only enters the cadence if, the first time we see it ready-and-not-
// live, its ready-date is within this many days. Older = pre-existing backlog,
// baselined out so it never fires. New brands going forward are recent when
// first seen, so they flow in naturally. Keeps the volume to a daily trickle.
const ADMIT_WINDOW_DAYS = 10;

export interface FollowupResult {
  brandId: number;
  brandName: string;
  action: "created" | "appended" | "completed" | "none";
  mark?: number; // touch fired, if any
  outstanding: string[]; // snippet labels included in the message
  pylonIssueId?: string;
  reason?: string; // why nothing fired (for "none")
}

export interface RunOptions {
  dryRun?: boolean; // compute only, don't post to Pylon or persist state
  onlyBrandIds?: number[]; // limit to specific brands (manual/testing)
  // TEST AID ONLY: when stamping a brand's readyAt for the first time, pretend
  // it became ready this many days ago instead of today. Lets us verify the
  // Pylon output without waiting 10+ real days. Leave undefined for the real
  // cron (go-forward: first observation = today).
  seedReadyDaysAgo?: number;
}

export async function runFollowups(opts: RunOptions = {}): Promise<{
  ran: string;
  dryRun: boolean;
  fired: FollowupResult[];
  results: FollowupResult[];
}> {
  const { dryRun = false, onlyBrandIds, seedReadyDaysAgo } = opts;
  const now = Date.now();

  let statuses = await detectSnippetStatus();
  if (onlyBrandIds?.length) statuses = statuses.filter((s) => onlyBrandIds.includes(s.brandId));

  // Per-brand SE-tracker overrides: disable switch + scheduled one-off date.
  // (Brands that aren't partners / are churned never appear in detectSnippetStatus
  // in the first place — its base query filters is_partner and discarded_at.)
  const overrides = await getAllOverrides();

  const results: FollowupResult[] = [];

  for (const status of statuses) {
    const prior = await getState(status.brandId);
    const state: FollowupState = prior ?? {
      brandId: status.brandId,
      brandName: status.brandName,
      snippets: {},
      touchesSent: [],
      completed: false,
      lastRunAt: new Date(now).toISOString(),
    };
    state.brandName = status.brandName;
    state.lastRunAt = new Date(now).toISOString();

    const push = (r: FollowupResult) => results.push(r);

    if (state.completed) {
      push({ brandId: status.brandId, brandName: status.brandName, action: "none", outstanding: [], reason: "sequence already completed" });
      continue;
    }

    // Create the ticket on first touch, append to the same one afterwards.
    const deliver = async (body: string, notePrefix: string): Promise<"created" | "appended"> => {
      if (!state.pylonIssueId) {
        if (!dryRun) state.pylonIssueId = await createBumpIssue(buildSubject(status.brandName), body);
        return "created";
      }
      if (!dryRun) await appendNote(state.pylonIssueId, `${notePrefix}${body}`);
      return "appended";
    };

    const fields = overrides[String(status.brandId)]?.fields ?? {};

    // Hard off-switch — the SE disabled follow-ups for this brand.
    if (fields.FOLLOWUPS_DISABLED === "true") {
      push({ brandId: status.brandId, brandName: status.brandName, action: "none", outstanding: [], reason: "follow-ups disabled" });
      continue;
    }

    // Any snippet currently ready-and-not-live (no admission gate applied here).
    const outstandingAll = SNIPPETS.filter((s) => status.snippets[s].ready && !status.snippets[s].live);

    // Scheduled one-off: the SE set a date (brand said "not ready until X"). This
    // suppresses the normal 10/20/30/40 cadence entirely; on/after the date we
    // send a single widget-agnostic check-in (only if still not live), then stop.
    const snoozeUntil = fields.FOLLOWUP_SNOOZE_UNTIL || null;
    if (snoozeUntil) {
      const snoozeMs = Date.parse(snoozeUntil);
      let result: FollowupResult;
      if (Number.isNaN(snoozeMs) || now < snoozeMs) {
        result = { brandId: status.brandId, brandName: status.brandName, action: "none", outstanding: [], reason: `snoozed until ${snoozeUntil}` };
      } else if (outstandingAll.length === 0) {
        state.completed = true;
        result = { brandId: status.brandId, brandName: status.brandName, action: "completed", outstanding: [], pylonIssueId: state.pylonIssueId, reason: "scheduled date reached — already live" };
      } else {
        const action = await deliver(buildSnoozeBody(), `<p><i>Scheduled follow-up</i></p>`);
        state.completed = true; // one-off only, no further touches
        result = { brandId: status.brandId, brandName: status.brandName, action, outstanding: outstandingAll.map((s) => SNIPPET_LABEL[s]), pylonIssueId: state.pylonIssueId, reason: "scheduled one-off follow-up" };
      }
      if (!dryRun) await setState(state);
      push(result);
      continue;
    }

    // First time we see a snippet ready-and-not-live, make its one-time admission
    // decision: within the 10-day window → active (enters cadence); older → baselined.
    // seedReadyDaysAgo (test aid) overrides the perceived ready-date.
    for (const s of SNIPPETS) {
      const st = status.snippets[s];
      if (!st.ready || st.live || state.snippets[s]) continue;
      const readyAt =
        seedReadyDaysAgo != null
          ? new Date(now - seedReadyDaysAgo * DAY).toISOString()
          : st.readyDate ?? new Date(now).toISOString();
      const ageDays = Math.floor((now - Date.parse(readyAt)) / DAY);
      // seedReadyDaysAgo is a test override — force admission so a touch fires
      // regardless of the window.
      const admitted = seedReadyDaysAgo != null || ageDays <= ADMIT_WINDOW_DAYS;
      state.snippets[s] = { readyAt, status: admitted ? "active" : "baselined" };
    }

    // Active + still-outstanding (ready, not live) snippets drive the cadence.
    const active = (s: Snippet) => state.snippets[s]?.status === "active";
    const outstanding = outstandingAll.filter(active);
    const outstandingLabels = outstanding.map((s) => SNIPPET_LABEL[s]);

    let result: FollowupResult;

    if (outstanding.length === 0) {
      // Either nothing admitted (backlog baselined / nothing ready), or every
      // active snippet has since gone live.
      const hadActive = SNIPPETS.some((s) => active(s));
      const anyActiveStillReady = SNIPPETS.some((s) => active(s) && status.snippets[s].ready && !status.snippets[s].live);
      if (hadActive && !anyActiveStillReady) {
        state.completed = true;
        result = { brandId: status.brandId, brandName: status.brandName, action: "completed", outstanding: [], pylonIssueId: state.pylonIssueId, reason: "all active snippets went live" };
      } else {
        result = { brandId: status.brandId, brandName: status.brandName, action: "none", outstanding: [], reason: "nothing admitted (recent-window) / nothing ready" };
      }
    } else {
      // Sequence age = days since the earliest still-outstanding active snippet became ready.
      const t0 = Math.min(...outstanding.map((s) => Date.parse(state.snippets[s]!.readyAt)));
      const daysSinceT0 = Math.floor((now - t0) / DAY);
      const crossed = MARKS.filter((m) => daysSinceT0 >= m);
      const highestSent = state.touchesSent.length ? Math.max(...state.touchesSent) : 0;
      const dueMark = crossed.length ? Math.max(...crossed) : 0;

      if (dueMark > highestSent) {
        const body = buildFollowupBody(dueMark as (typeof MARKS)[number], outstanding);
        const action = await deliver(body, `<p><i>Day ${dueMark} follow-up</i></p>`);
        // Mark this mark AND any lower crossed marks as done, so a missed day
        // doesn't later fire a stale earlier touch (self-healing, once-per-mark).
        state.touchesSent = Array.from(new Set([...state.touchesSent, ...crossed]));
        if (dueMark === 40) state.completed = true;
        result = { brandId: status.brandId, brandName: status.brandName, action, mark: dueMark, outstanding: outstandingLabels, pylonIssueId: state.pylonIssueId };
      } else {
        result = { brandId: status.brandId, brandName: status.brandName, action: "none", outstanding: outstandingLabels, reason: `age ${daysSinceT0}d, next mark not reached or already sent (highest sent ${highestSent})` };
      }
    }

    if (!dryRun) await setState(state);
    push(result);
  }

  const fired = results.filter((r) => r.action === "created" || r.action === "appended");
  return { ran: new Date(now).toISOString(), dryRun, fired, results };
}

import { FOLLOWUP_COHORT, type CohortMonth } from "./cohort";
import { SEND_CONTACTS } from "./contacts";
import { getState, setState, type FollowupState } from "./state";
import { detectCohortWidgetStatus } from "./cohort-widgets";
import { MARKS, buildSubject, buildBody, outstandingWidgets, renderList, type Mark } from "./cohort-messages";
import { createCustomerBumpIssue, sendCustomerReply, getReplyAt } from "./pylon";
import { pylonAccountIdFor } from "./pylon-accounts";
import { getAllOverrides } from "@/lib/overrides";

const DAY = 86400000;

export type CohortAction = "created" | "sent" | "completed" | "none";

export interface CohortResult {
  brandId: number;
  brandName: string;
  month: CohortMonth;
  action: CohortAction;
  mark?: Mark;               // which bump fired (10/20/30/40)
  widgets?: string;          // rendered widget list in the copy, e.g. "Reviews and Badge"
  recipients?: string[];     // To + CCs
  subject?: string;
  bodyHtml?: string;         // exact body that fired / would fire (dry-run preview)
  pylonIssueId?: string;
  reason?: string;           // why nothing fired
}

export interface CohortRunOptions {
  dryRun?: boolean;              // default true — compute only, no Pylon writes / state changes
  launchMonths?: CohortMonth[];  // months whose brands may fire their FIRST (Day 10) bump now
  onlyBrandIds?: number[];       // limit to specific brands
}

// Read-only reply check that never throws the whole run (a single flaky Pylon
// read shouldn't stop everyone else).
async function safeReplyAt(issueId: string): Promise<string | null> {
  try {
    return await getReplyAt(issueId);
  } catch {
    return null;
  }
}

export async function runCohortFollowups(opts: CohortRunOptions = {}): Promise<{
  ran: string;
  dryRun: boolean;
  launchMonths: CohortMonth[];
  fired: CohortResult[];
  results: CohortResult[];
}> {
  const { dryRun = true, launchMonths = [], onlyBrandIds } = opts;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  // Send-list = cohort brands that have contacts on file. Brands with no entry
  // (VIP-tab, not on the sheet, no-email) are tracked but never emailed.
  let brands = FOLLOWUP_COHORT.filter((b) => SEND_CONTACTS[b.id]?.length);
  if (onlyBrandIds?.length) brands = brands.filter((b) => onlyBrandIds.includes(b.id));

  const widgetStatus = await detectCohortWidgetStatus(brands.map((b) => b.id));
  const overrides = await getAllOverrides();

  const results: CohortResult[] = [];

  for (const brand of brands) {
    const recipients = SEND_CONTACTS[brand.id];
    const status = widgetStatus.get(brand.id);
    const prior = await getState(brand.id);
    const state: FollowupState =
      prior ?? {
        brandId: brand.id,
        brandName: brand.name,
        snippets: {},
        touchesSent: [],
        completed: false,
        lastRunAt: iso(now),
      };
    state.brandName = brand.name;
    state.lastRunAt = iso(now);

    const base = { brandId: brand.id, brandName: brand.name, month: brand.month };
    const done = (r: CohortResult) => results.push(r);
    const persist = async () => {
      if (!dryRun) await setState(state);
    };

    // Only a COHORT-completed brand (one this engine actually launched) is
    // skipped. Legacy "completed" state from the retired engine (no firstBumpAt)
    // must NOT block a future launch — it gets overwritten on the Day-10 fire.
    if (state.firstBumpAt && state.completed) {
      done({ ...base, action: "none", reason: "sequence already completed", pylonIssueId: state.pylonIssueId });
      continue;
    }

    const fields = overrides[String(brand.id)]?.fields ?? {};
    if (fields.FOLLOWUPS_DISABLED === "true") {
      done({ ...base, action: "none", reason: "follow-ups disabled" });
      continue;
    }

    // Brand replied in the thread → stop the cadence entirely. Only checked for
    // brands this engine launched (firstBumpAt) so we never read a legacy
    // internal-note issue and mis-flag it as a customer reply.
    if (state.firstBumpAt && state.pylonIssueId && !state.repliedAt) {
      const replyAt = await safeReplyAt(state.pylonIssueId);
      if (replyAt) {
        state.repliedAt = replyAt;
        state.completed = true;
        await persist();
        done({ ...base, action: "completed", reason: "brand replied — stopped", pylonIssueId: state.pylonIssueId });
        continue;
      }
    }

    // Reviews went live → the cohort's goal is met; complete.
    if (status?.reviewsLive) {
      state.completed = true;
      await persist();
      done({ ...base, action: "completed", reason: "reviews went live", pylonIssueId: state.pylonIssueId });
      continue;
    }

    if (!status) {
      done({ ...base, action: "none", reason: "no widget status available" });
      continue;
    }

    // Churned / no longer a partner (discarded_at set or is_partner=false) →
    // hard stop, never email a churned brand. Re-checked every run since the
    // cohort list is frozen and a brand can churn mid-sequence.
    if (!status.active) {
      done({ ...base, action: "none", reason: "churned / not a partner" });
      continue;
    }

    const widgets = renderList(outstandingWidgets(status));

    // Scheduled one-off (SE set a "next follow-up" date): suppress the normal
    // cadence; on/after the date send a single check-in, then stop.
    const snooze = fields.FOLLOWUP_SNOOZE_UNTIL;
    if (snooze) {
      const snoozeMs = Date.parse(snooze);
      if (Number.isNaN(snoozeMs) || now < snoozeMs) {
        done({ ...base, action: "none", reason: `snoozed until ${snooze}` });
        continue;
      }
      const body = buildBody(10, status);
      if (!dryRun) {
        if (!state.pylonIssueId) {
          state.pylonIssueId = await createCustomerBumpIssue(buildSubject(brand.name), body, recipients, pylonAccountIdFor(brand.id));
        } else {
          await sendCustomerReply(state.pylonIssueId, body, recipients);
        }
      }
      state.completed = true; // one-off only
      await persist();
      done({ ...base, action: state.pylonIssueId ? "sent" : "created", widgets, recipients, subject: buildSubject(brand.name), bodyHtml: body, pylonIssueId: state.pylonIssueId, reason: "scheduled one-off follow-up" });
      continue;
    }

    // First bump = Day 10 — only fires once the brand's month is launched.
    if (!state.firstBumpAt) {
      if (!launchMonths.includes(brand.month)) {
        done({ ...base, action: "none", widgets, recipients, reason: `not launched (${brand.month})` });
        continue;
      }
      const body = buildBody(10, status);
      if (!dryRun) {
        state.pylonIssueId = await createCustomerBumpIssue(buildSubject(brand.name), body, recipients, pylonAccountIdFor(brand.id));
      }
      state.firstBumpAt = iso(now);
      state.touchesSent = [10];
      await persist();
      done({ ...base, action: "created", mark: 10, widgets, recipients, subject: buildSubject(brand.name), bodyHtml: body, pylonIssueId: state.pylonIssueId });
      continue;
    }

    // In-flight: advance to the highest due mark. Day 10 = firstBumpAt + 0d,
    // Day 20 = +10d, Day 30 = +20d, Day 40 = +30d. Self-healing: a missed day
    // catches up to the highest crossed mark, once per mark.
    const daysSince = Math.floor((now - Date.parse(state.firstBumpAt)) / DAY);
    const crossed = MARKS.filter((m) => daysSince >= m - 10);
    const highestSent = state.touchesSent.length ? Math.max(...state.touchesSent) : 0;
    const dueMark = crossed.length ? (Math.max(...crossed) as Mark) : (0 as number);

    if (dueMark > highestSent) {
      const body = buildBody(dueMark as Mark, status);
      if (!dryRun) await sendCustomerReply(state.pylonIssueId!, body, recipients);
      state.touchesSent = Array.from(new Set([...state.touchesSent, ...crossed]));
      if (dueMark === 40) state.completed = true;
      await persist();
      done({ ...base, action: "sent", mark: dueMark as Mark, widgets, recipients, subject: buildSubject(brand.name), bodyHtml: body, pylonIssueId: state.pylonIssueId });
    } else {
      await persist();
      done({ ...base, action: "none", widgets, recipients, reason: `age ${daysSince}d, next mark not due (highest sent ${highestSent})` });
    }
  }

  const fired = results.filter((r) => r.action === "created" || r.action === "sent");
  return { ran: iso(now), dryRun, launchMonths, fired, results };
}

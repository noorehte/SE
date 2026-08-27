import { Brand } from "./metabase";

// Shared "Live Status" classification — the single signal the VIP Exec
// Overview headline/breakdown is built on today, kept here (rather than
// private to one component) so multiple views can compute it identically,
// and so it's a natural place to blend in additional signals later
// (touchpoint recency, sentiment, etc.) without duplicating this logic.

export type BadgeStatus = "not_live" | "ready" | "was_live" | "live";

// readyDate is optional — omitted (or null), this behaves exactly as before
// (3-state), so existing callers (Exec Overview) are unaffected since they
// only ever check `=== "live"`.
export function getBadgeStatus(brand: Brand, types: string[], readyDate?: string | null): BadgeStatus {
  const statuses = brand.WIDGET_STATUSES;
  if (types.some((t) => statuses?.[t]?.isLive)) return "live";
  if (types.some((t) => statuses?.[t]?.wentLiveAt)) return "was_live";
  if (readyDate) return "ready";
  return "not_live";
}

export type ExecStatus = "live_2" | "live_1" | "needs_attention" | "partial" | "not_live" | "not_ready";

// Tiered "ready to go live" for exec purposes — ordered here (and in
// EXEC_STATUS_ORDER) from closest-to-live to furthest, per current judgment
// call that Partial reads as "closer to live" than Needs Attention:
//   Live L2          → badge, reviews, AND CAI/CAS all live
//   Live L1          → badge (quant/sticker, either counts) AND reviews live —
//                       AND, if CAI/CAS was ever expected for this brand
//                       (CAI_READY_DATE set), it must be live too. A brand
//                       CAI/CAS was supposed to have live doesn't get credit
//                       for L1 just because badge+reviews are done — it falls
//                       to Partial until it catches up. If CAI/CAS was never
//                       expected (no CAI_READY_DATE), it doesn't block L1.
//   Partial          → still ramping up for the first time, nothing has
//                       regressed: one of badge/reviews is currently live and
//                       the other isn't yet, or badge+reviews are live but an
//                       expected CAI/CAS hasn't caught up yet.
//   Needs Attention  → badge, reviews, or an expected CAI/CAS WAS live before
//                       and has since gone inactive (e.g. Everyday Dose) — a
//                       regression, and a different problem from a brand
//                       that's simply still ramping up, so it always wins
//                       over Partial even if something else is normally
//                       ramping at the same time. Named/colored to match the
//                       Kanban's "Was Live — Needs Attention" column.
//   Not Live         → badge AND reviews are both fully ready (implemented)
//                       but neither has ever gone live — sitting there,
//                       actionable.
//   Not Ready        → anything else: badge or reviews isn't even ready yet,
//                       and nothing has ever been live. Nothing for an SE to
//                       act on, so no colored status is shown at all.
//
// TODO(noted, not yet implemented): Needs Attention should probably also
// cover a brand that has NEVER gone live at all but has been sitting that
// way for a long time (stale Not Live / Partial), not just brands that
// regressed from live. Needs a staleness threshold, deliberately deferred.
export function getExecStatus(brand: Brand): ExecStatus {
  const badgeStatus = getBadgeStatus(brand, ["quant", "sticker"], brand.BADGE_READY_DATE);
  const reviewsStatus = getBadgeStatus(brand, ["qual"], brand.REVIEWS_READY_DATE);
  const caiStatus = getBadgeStatus(brand, ["gpt", "analysis", "gpt_s"], brand.CAI_READY_DATE);
  const badgeLive = badgeStatus === "live";
  const reviewsLive = reviewsStatus === "live";
  const caiLive = caiStatus === "live";
  const caiExpected = brand.CAI_READY_DATE != null;

  if (badgeLive && reviewsLive && (!caiExpected || caiLive)) return caiLive ? "live_2" : "live_1";

  const regressed = badgeStatus === "was_live" || reviewsStatus === "was_live" || (caiExpected && caiStatus === "was_live");
  if (regressed) return "needs_attention";

  if (badgeLive || reviewsLive || (caiExpected && caiLive)) return "partial";

  if (badgeStatus === "ready" && reviewsStatus === "ready") return "not_live";
  return "not_ready";
}

// Short explanation of which specific piece(s) are live vs. pending — most
// useful for "Partial," which alone doesn't say whether badge, reviews, or
// CAI is driving it, or whether something's still ramping up vs. regressed.
export function getExecStatusDetail(brand: Brand): string {
  const badgeStatus = getBadgeStatus(brand, ["quant", "sticker"], brand.BADGE_READY_DATE);
  const reviewsStatus = getBadgeStatus(brand, ["qual"], brand.REVIEWS_READY_DATE);
  const caiStatus = getBadgeStatus(brand, ["gpt", "analysis", "gpt_s"], brand.CAI_READY_DATE);
  const caiExpected = brand.CAI_READY_DATE != null;

  const parts: { name: string; status: BadgeStatus }[] = [
    { name: "Badge", status: badgeStatus },
    { name: "Reviews", status: reviewsStatus },
    ...(caiExpected ? [{ name: "CAI/CAS", status: caiStatus }] : []),
  ];
  const live = parts.filter((p) => p.status === "live").map((p) => p.name);
  const notLive = parts.filter((p) => p.status !== "live");
  if (notLive.length === 0) return live.join(" + ");

  // Groups not-live parts into "previously live" (a regression) vs "never
  // live" (hasn't gone live yet, whether it's ready to flip on or hasn't
  // even been implemented) — one consistent pair of terms, so e.g. two
  // "never live" parts read as "Reviews + CAI never live" instead of two
  // separate phrases.
  const groups: { category: "previously_live" | "never_live"; names: string[] }[] = [];
  for (const p of notLive) {
    const category = p.status === "was_live" ? "previously_live" : "never_live";
    const group = groups.find((g) => g.category === category);
    if (group) group.names.push(p.name);
    else groups.push({ category, names: [p.name] });
  }
  const groupText = (group: { category: "previously_live" | "never_live"; names: string[] }) => {
    const names = group.names.join(" + ");
    return group.category === "previously_live" ? `${names} previously live` : `${names} never live`;
  };
  const notLiveText = groups.map(groupText).join(" + ");
  return live.length ? `${live.join(" + ")} live — ${notLiveText}` : notLiveText;
}

// What's driving a "Needs Attention" status: which piece(s) are previously live,
// and the last date each actually had views before that.
export function getRegressedParts(brand: Brand): { name: string; lastLiveDate: string | null }[] {
  const caiExpected = brand.CAI_READY_DATE != null;
  const groups: { name: string; types: string[]; readyDate: string | null }[] = [
    { name: "Badge", types: ["quant", "sticker"], readyDate: brand.BADGE_READY_DATE },
    { name: "Reviews", types: ["qual"], readyDate: brand.REVIEWS_READY_DATE },
    ...(caiExpected ? [{ name: "CAI/CAS", types: ["gpt", "analysis", "gpt_s"], readyDate: brand.CAI_READY_DATE }] : []),
  ];
  return groups
    .filter((g) => getBadgeStatus(brand, g.types, g.readyDate) === "was_live")
    .map((g) => {
      const dates = g.types
        .map((t) => brand.WIDGET_STATUSES?.[t]?.wentInactiveAt)
        .filter((d): d is string => !!d);
      return { name: g.name, lastLiveDate: dates.length ? dates.sort().at(-1)! : null };
    });
}

// Later of the two ready-dates — a brand isn't "ready to go live" (Level 1)
// until BOTH badge and reviews are ready, so the date that unlocks it is
// whichever of the two became ready last. Null if either is still missing.
export function getReadyDate(brand: Brand): string | null {
  if (!brand.BADGE_READY_DATE || !brand.REVIEWS_READY_DATE) return null;
  return brand.BADGE_READY_DATE > brand.REVIEWS_READY_DATE ? brand.BADGE_READY_DATE : brand.REVIEWS_READY_DATE;
}

export const EXEC_STATUS_ORDER: Record<ExecStatus, number> = { not_ready: 0, not_live: 1, needs_attention: 2, partial: 3, live_1: 4, live_2: 5 };

// Shared display labels/colors — used by both the VIP Exec Overview page and
// the SE-facing Exec Overview tab in Dashboard.tsx, so the two stay in sync
// by construction rather than needing to be hand-kept-identical. Renumbered
// ascending by maturity:
//   Live L1 = "Partial"           (yellow)      — one signal live, still ramping
//   Live L2 = badge + reviews live
//   Live L3 = badge + reviews + CAI all live
export const EXEC_STATUS_STYLES: Record<ExecStatus, { label: string; color: string }> = {
  partial:         { label: "Live L1",         color: "#eab308" },
  live_1:          { label: "Live L2",         color: "#4caf82" },
  live_2:          { label: "Live L3",         color: "#2f9e6e" },
  needs_attention: { label: "Needs Attention", color: "#e05c5c" },
  not_live:        { label: "Not Live",        color: "#5a6b78" },
  not_ready:       { label: "Not Ready",       color: "rgba(255,255,255,0.3)" },
};

export const EXEC_STATUS_DISPLAY_ORDER: ExecStatus[] = ["live_2", "live_1", "partial", "needs_attention", "not_live", "not_ready"];

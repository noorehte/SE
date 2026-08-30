import { getBrands } from "@/lib/get-brands";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import { getReachouts, buildReachoutLookup } from "@/lib/reachouts-sheet";
import { getSeSprintEntries, buildSeSprintLookup } from "@/lib/se-sprint-sheet";
import { getPylonAccountDataByHubspotId } from "@/lib/pylon-sentiment";
import { getRecurlySubscriptionsByBrandName } from "@/lib/recurly";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [brands, caiEntries, reachoutEntries, seSprintEntries, pylonDataByHubspotId, recurlyByBrandName] = await Promise.all([
      getBrands(),
      getCaiReadyBrands(),
      getReachouts(),
      getSeSprintEntries(),
      getPylonAccountDataByHubspotId().catch((e) => { console.error("getPylonAccountDataByHubspotId failed:", e); return new Map(); }),
      getRecurlySubscriptionsByBrandName().catch((e) => { console.error("getRecurlySubscriptionsByBrandName failed:", e); return new Map(); }),
    ]);
    const caiLookup = buildCaiLookup(caiEntries);
    const reachoutLookup = buildReachoutLookup(reachoutEntries);
    const seSprintLookup = buildSeSprintLookup(seSprintEntries);
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const enriched = brands.map((b) => {
      const reachout = reachoutLookup.get(normalize(b.BRAND_NAME));
      const seSprint = seSprintLookup.get(normalize(b.BRAND_NAME));
      const pylon = b.HUBSPOT_COMPANY_ID != null ? pylonDataByHubspotId.get(String(b.HUBSPOT_COMPANY_ID)) : undefined;
      const recurly = recurlyByBrandName.get(normalize(b.BRAND_NAME));
      return {
        ...b,
        CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
        PYLON_SENTIMENT: pylon?.sentiment ?? null,
        PYLON_LAST_COMMUNICATION_AT: pylon?.lastActivityAt ?? null,
        PYLON_OPEN_ISSUES_90D: pylon?.openIssues90d ?? null,
        RECURLY_STATE: recurly?.state ?? null,
        RECURLY_PLAN_NAME: recurly?.planName ?? null,
        RECURLY_AMOUNT: recurly?.amount ?? null,
        RECURLY_CURRENCY: recurly?.currency ?? null,
        RECURLY_CURRENT_PERIOD_STARTED_AT: recurly?.currentPeriodStartedAt ?? null,
        RECURLY_CURRENT_PERIOD_ENDS_AT: recurly?.currentPeriodEndsAt ?? null,
        RECURLY_CURRENT_TERM_ENDS_AT: recurly?.currentTermEndsAt ?? null,
        RECURLY_AUTO_RENEW: recurly?.autoRenew ?? null,
        RECURLY_BILLING_PORTAL_URL: recurly?.billingPortalUrl ?? null,
        ON_REACHOUT_SHEET: reachout != null,
        REACHED_OUT: reachout?.emailed ?? null,
        REACHED_OUT_SEND_LABEL: reachout?.sendLabel ?? null,
        ON_SE_SPRINT_SHEET: !b.SE_SPRINT_DISMISSED && (b.ON_SE_SPRINT_SHEET || seSprint != null),
        SE_SPRINT_SUBMITTED_AT: seSprint?.timestamp ?? null,
        SE_SPRINT_MYSHOPIFY_URL: b.SE_SPRINT_MYSHOPIFY_URL_OVERRIDE ?? seSprint?.myshopifyUrl ?? null,
        SE_SPRINT_HAS_SHARED_CODE: seSprint?.hasSharedCode ?? null,
        SE_SPRINT_COLLABORATOR_CODE: seSprint?.collaboratorCode ?? null,
      };
    });
    return NextResponse.json(enriched);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
  }
}

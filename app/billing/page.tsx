import { getBrands } from "@/lib/get-brands";
import { getRecurlySubscriptionsByBrandName } from "@/lib/recurly";
import BillingPage from "@/components/BillingPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, recurlyByBrandName] = await Promise.all([
    getBrands(),
    getRecurlySubscriptionsByBrandName().catch((e) => { console.error("getRecurlySubscriptionsByBrandName failed:", e); return new Map(); }),
  ]);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const enriched = brands.map((b) => {
    const recurly = recurlyByBrandName.get(normalize(b.BRAND_NAME));
    return {
      ...b,
      RECURLY_STATE: recurly?.state ?? null,
      RECURLY_PLAN_NAME: recurly?.planName ?? null,
      RECURLY_AMOUNT: recurly?.amount ?? null,
      RECURLY_CURRENCY: recurly?.currency ?? null,
      RECURLY_CURRENT_PERIOD_STARTED_AT: recurly?.currentPeriodStartedAt ?? null,
      RECURLY_CURRENT_PERIOD_ENDS_AT: recurly?.currentPeriodEndsAt ?? null,
      RECURLY_CURRENT_TERM_ENDS_AT: recurly?.currentTermEndsAt ?? null,
      RECURLY_AUTO_RENEW: recurly?.autoRenew ?? null,
      RECURLY_BILLING_PORTAL_URL: recurly?.billingPortalUrl ?? null,
    };
  });
  return <BillingPage initialBrands={enriched} />;
}

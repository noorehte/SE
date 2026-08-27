import { getBrands, Brand } from "@/lib/metabase";
import { getAllScheduled } from "@/lib/scheduled-calls";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import { getReachouts, buildReachoutLookup } from "@/lib/reachouts-sheet";
import { getPylonAccountDataByHubspotId } from "@/lib/pylon-sentiment";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

// TEMP: Metabase creds aren't working yet — using fake data to preview the
// page layout. Revert to the real getBrands() call once auth is sorted.
const USE_MOCK_DATA = false;

function mockVipBrands(): Brand[] {
  const base = {
    SE_OWNER: "Noor E.",
    OPS_OWNER: null,
    ACCOUNT_MANAGER: null,
    BD_REP: null,
    HUBSPOT_COMPANY_ID: null,
    HAS_PAYMENT_METHOD: true,
    SUBMITTED_TO_MAB: true,
    PRODUCTS_COUNT: 12,
    PRODUCTS_APPROVED_COUNT: 10,
    PRODUCT_SHARE_COUNTS: [],
    REVIEWS_REQUESTED: 5,
    HAS_REVIEWS_READY: true,
    CA_REQUESTED: 3,
    HAS_CA_READY: true,
    BRAND_CREATED_AT: "2025-01-01T00:00:00Z",
    ANY_ADMIN_LAST_SIGNED_IN_AT: "2026-08-01T00:00:00Z",
    COLLABORATOR_CODE: null,
    PAYMENT_COMPLETED_AT: "2025-02-01T00:00:00Z",
    CLOSE_DATE: "2025-01-15",
    HAS_PENDING_BOARD_REVIEW: false,
    HAS_REJECTED_BY_BOARD: false,
    HAS_APPROVED_PRODUCTS: true,
    HAS_SHARE_THRESHOLD_MET: true,
    KIND: "vip",
    DAYS_IN_STATUS: 3,
    STATUS_ENTERED_AT: "2026-08-10T00:00:00Z",
    WIDGET_TYPES: ["quant", "qual"],
    WIDGET_STATUSES: {},
    CAI_IMPLEMENTATION_READY: null,
    TOP_PDP: null,
    PDP_COUNT: 0,
    ON_REACHOUT_SHEET: false,
    REACHED_OUT: null,
    REACHED_OUT_SEND_LABEL: null,
    ONBOARDING_CHANNEL: "in_app" as const,
    REVIEWS_DELIVERED: 4,
    BADGE_READY_DATE: null,
    REVIEWS_READY_DATE: null,
    CAI_READY_DATE: null,
    BADGE_IMPLEMENTED: true,
    REVIEWS_IMPLEMENTED: true,
    CAI_IMPLEMENTED: false,
    FOLLOWUP_SNOOZE_UNTIL: null,
    FOLLOWUPS_DISABLED: false,
    AB_TESTING: false,
    AB_TESTING_NOTES: null,
    PYLON_SENTIMENT: null,
  };
  return [
    { ...base, BRAND_ID: 1, BRAND_NAME: "Aurora Skincare", PIPELINE_STATUS: "live" },
    { ...base, BRAND_ID: 2, BRAND_NAME: "Northfield Supplements", PIPELINE_STATUS: "code_snippets_available", DAYS_IN_STATUS: 12 },
    { ...base, BRAND_ID: 3, BRAND_NAME: "Vantage Wellness", PIPELINE_STATUS: "products_approved_needs_call", DAYS_IN_STATUS: 1 },
    {
      ...base, BRAND_ID: 4, BRAND_NAME: "Solstice Beauty", PIPELINE_STATUS: "live", DAYS_IN_STATUS: 6,
      AB_TESTING: true, AB_TESTING_NOTES: "Testing new onboarding checklist copy — variant B",
    },
  ];
}

const isVip = (b: Brand) => b.KIND?.toLowerCase() === "vip";

export default async function Page() {
  if (USE_MOCK_DATA) {
    return (
      <Dashboard
        initialBrands={mockVipBrands()}
        initialScheduledCalls={{}}
        title="VIP brands"
        subtitle="Pipeline view scoped to VIP-segment brands"
        activeNavKey="vip"
        refetchSegment="vip"
        showAbTestingColumn
        showWidgetStatusView
        showExecOverview
        hideKanbanTable
      />
    );
  }

  const [brands, scheduledCalls, caiEntries, reachoutEntries, pylonDataByHubspotId] = await Promise.all([
    getBrands(),
    getAllScheduled().catch((e) => { console.error("getAllScheduled failed:", e); return {} as Record<string, never>; }),
    getCaiReadyBrands(),
    getReachouts(),
    getPylonAccountDataByHubspotId().catch((e) => { console.error("getPylonAccountDataByHubspotId failed:", e); return new Map(); }),
  ]);
  const caiLookup = buildCaiLookup(caiEntries);
  const reachoutLookup = buildReachoutLookup(reachoutEntries);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const enriched = brands
    .filter(isVip)
    .map((b) => {
      const reachout = reachoutLookup.get(normalize(b.BRAND_NAME));
      const pylon = b.HUBSPOT_COMPANY_ID != null ? pylonDataByHubspotId.get(String(b.HUBSPOT_COMPANY_ID)) : undefined;
      return {
        ...b,
        CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
        ON_REACHOUT_SHEET: reachout != null,
        REACHED_OUT: reachout?.emailed ?? null,
        REACHED_OUT_SEND_LABEL: reachout?.sendLabel ?? null,
        PYLON_SENTIMENT: pylon?.sentiment ?? null,
      };
    });
  return (
    <Dashboard
      initialBrands={enriched}
      initialScheduledCalls={scheduledCalls}
      title="VIP brands"
      subtitle="Pipeline view scoped to VIP-segment brands"
      activeNavKey="vip"
      refetchSegment="vip"
      showAbTestingColumn
      showWidgetStatusView
      showExecOverview
      hideKanbanTable
    />
  );
}

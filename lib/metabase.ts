import { getAllOverrides } from "@/lib/overrides";

const METABASE_URL = process.env.METABASE_URL!;
const METABASE_API_KEY = process.env.METABASE_API_KEY!;

async function metabaseQuery(tableId: number, fields?: number[], filters?: unknown[]) {
  const query: Record<string, unknown> = { "source-table": tableId };
  if (fields) query["fields"] = fields.map((id) => ["field", id, null]);
  if (filters) query["filter"] = filters;

  const res = await fetch(`${METABASE_URL}/api/dataset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": METABASE_API_KEY,
    },
    body: JSON.stringify({ database: 67, type: "query", query }),
    cache: "no-store",
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const cols = data.data.cols.map((c: { name: string }) => c.name);
  return data.data.rows.map((row: unknown[]) =>
    Object.fromEntries(cols.map((col: string, i: number) => [col, row[i]]))
  );
}

export interface Brand {
  BRAND_ID: number;
  BRAND_NAME: string;
  SE_OWNER: string | null;
  OPS_OWNER: string | null;
  ACCOUNT_MANAGER: string | null;
  BD_REP: string | null;
  HUBSPOT_COMPANY_ID: number | null;
  HAS_PAYMENT_METHOD: boolean;
  SUBMITTED_TO_MAB: boolean;
  PRODUCTS_COUNT: number;
  REVIEWS_REQUESTED: number;
  HAS_REVIEWS_READY: boolean;
  CA_REQUESTED: number;
  HAS_CA_READY: boolean;
  BRAND_CREATED_AT: string;
  ANY_ADMIN_LAST_SIGNED_IN_AT: string | null;
  COLLABORATOR_CODE: string | null;
  PAYMENT_COMPLETED_AT: string | null;
  HAS_PENDING_BOARD_REVIEW: boolean;
  HAS_REJECTED_BY_BOARD: boolean;
  HAS_SHARE_THRESHOLD_MET: boolean;
  KIND: string | null;
  PIPELINE_STATUS: PipelineStatus;
  DAYS_IN_STATUS: number;
}

export type PipelineStatus =
  | "just_signed"
  | "pending_mab_review"
  | "products_rejected"
  | "code_snippets_available"
  | "live"
  | "was_live";

function computePipelineStatus(
  brand: Omit<Brand, "PIPELINE_STATUS" | "DAYS_IN_STATUS">,
  hasRecentWidgetViews: boolean,
  hasAnyWidgetViews: boolean
): PipelineStatus {
  if (hasRecentWidgetViews) return "live";
  if (hasAnyWidgetViews) return "was_live";
  if (brand.HAS_REJECTED_BY_BOARD) return "products_rejected";
  if (brand.HAS_PENDING_BOARD_REVIEW) return "pending_mab_review";
  if (brand.SUBMITTED_TO_MAB) return "code_snippets_available";
  return "just_signed";
}

export async function getBrands(): Promise<Brand[]> {
  const BRAND_FIELDS = [
    3382, // BRAND_ID
    3383, // BRAND_NAME
    3384, // BD_REP
    3385, // OPS_OWNER
    3386, // SE_OWNER
    3387, // ACCOUNT_MANAGER
    3393, // BRAND_CREATED_AT
    3394, // ANY_ADMIN_LAST_SIGNED_IN_AT
    3395, // PRODUCTS_COUNT
    3397, // REVIEWS_REQUESTED
    3398, // HAS_REVIEWS_READY
    3401, // CA_REQUESTED
    3404, // HAS_CA_READY
    3406, // HAS_PAYMENT_METHOD
    3407, // SUBMITTED_TO_MAB
  ];

  const BRAND_STG_FIELDS = [766, 769, 764, 3282, 3279, 3280, 3281, 767, 760]; // ID, NAME, HUBSPOT_COMPANY_ID, COLLABORATOR_CODE, SE_OWNER, OPS_OWNER, ACCOUNT_MANAGER, CREATED_AT, KIND
  const WIDGET_FIELDS = [3552, 3551, 3555];  // BRAND_ID, DAY, VIEWS
  const PRODUCT_FIELDS = [738, 731, 729];    // HEALTH_BRAND_ID, STATUS, DATE_PASSED_PROVIDER_THRESHOLD

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [onboardingRows, stgBrandRows, widgetRows, productRows] = await Promise.all([
    metabaseQuery(447, BRAND_FIELDS),
    metabaseQuery(203, BRAND_STG_FIELDS),
    metabaseQuery(464, WIDGET_FIELDS),
    metabaseQuery(202, PRODUCT_FIELDS),
  ]);

  // Full STG brand lookup (name, hubspot, owners, created_at)
  const stgMap = new Map<number, {
    NAME: string;
    HUBSPOT_COMPANY_ID: number | null;
    COLLABORATOR_CODE: string | null;
    SE_OWNER: string | null;
    OPS_OWNER: string | null;
    ACCOUNT_MANAGER: string | null;
    CREATED_AT: string;
    KIND: string | null;
  }>();
  for (const r of stgBrandRows) {
    stgMap.set(r.ID, {
      NAME: r.NAME,
      HUBSPOT_COMPANY_ID: r.HUBSPOT_COMPANY_ID,
      COLLABORATOR_CODE: r.COLLABORATOR_CODE,
      SE_OWNER: r.SE_OWNER,
      OPS_OWNER: r.OPS_OWNER,
      ACCOUNT_MANAGER: r.ACCOUNT_MANAGER,
      CREATED_AT: r.CREATED_AT,
      KIND: r.KIND ?? null,
    });
  }

  // Widget activity
  const recentWidgetBrands = new Set<number>();
  const anyWidgetBrands = new Set<number>();
  for (const r of widgetRows) {
    if (r.VIEWS > 0) {
      anyWidgetBrands.add(r.BRAND_ID);
      if (r.DAY >= thirtyDaysAgo) recentWidgetBrands.add(r.BRAND_ID);
    }
  }

  // Product status per brand
  const pendingBoardReview = new Set<number>();
  const rejectedByBoard = new Set<number>();
  const shareThresholdMet = new Set<number>();
  for (const r of productRows) {
    if (r.STATUS === "pending_board_review") pendingBoardReview.add(r.HEALTH_BRAND_ID);
    if (r.STATUS === "rejected_by_board") rejectedByBoard.add(r.HEALTH_BRAND_ID);
    if (r.DATE_PASSED_PROVIDER_THRESHOLD) shareThresholdMet.add(r.HEALTH_BRAND_ID);
  }

  const now = Date.now();
  const overrides = getAllOverrides();
  const onboardingIds = new Set(onboardingRows.map((r: { BRAND_ID: number }) => r.BRAND_ID));

  function buildBrand(
    brandId: number,
    base: {
      BRAND_NAME: string;
      SE_OWNER: string | null;
      OPS_OWNER: string | null;
      ACCOUNT_MANAGER: string | null;
      BD_REP: string | null;
      BRAND_CREATED_AT: string;
      ANY_ADMIN_LAST_SIGNED_IN_AT: string | null;
      PRODUCTS_COUNT: number;
      REVIEWS_REQUESTED: number;
      HAS_REVIEWS_READY: boolean;
      CA_REQUESTED: number;
      HAS_CA_READY: boolean;
      HAS_PAYMENT_METHOD: boolean;
      SUBMITTED_TO_MAB: boolean;
    }
  ): Brand {
    const stg = stgMap.get(brandId);
    const brandWithExtra = {
      BRAND_ID: brandId,
      ...base,
      HUBSPOT_COMPANY_ID: stg?.HUBSPOT_COMPANY_ID ?? null,
      COLLABORATOR_CODE: stg?.COLLABORATOR_CODE ?? null,
      KIND: stg?.KIND ?? null,
      PAYMENT_COMPLETED_AT: null,
      HAS_PENDING_BOARD_REVIEW: pendingBoardReview.has(brandId),
      HAS_REJECTED_BY_BOARD: rejectedByBoard.has(brandId),
      HAS_SHARE_THRESHOLD_MET: shareThresholdMet.has(brandId),
    };
    const computedStatus = computePipelineStatus(
      brandWithExtra,
      recentWidgetBrands.has(brandId),
      anyWidgetBrands.has(brandId)
    );
    const pipelineStatus = overrides[String(brandId)] ?? computedStatus;
    const createdAt = new Date(base.BRAND_CREATED_AT).getTime();
    const daysInStatus = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    return { ...brandWithExtra, PIPELINE_STATUS: pipelineStatus, DAYS_IN_STATUS: daysInStatus };
  }

  // Brands from FCT_BRAND_ONBOARDING
  const result: Brand[] = onboardingRows.map((r: {
    BRAND_ID: number; BRAND_NAME: string; SE_OWNER: string | null; OPS_OWNER: string | null;
    ACCOUNT_MANAGER: string | null; BD_REP: string | null; BRAND_CREATED_AT: string;
    ANY_ADMIN_LAST_SIGNED_IN_AT: string | null; PRODUCTS_COUNT: number; REVIEWS_REQUESTED: number;
    HAS_REVIEWS_READY: boolean; CA_REQUESTED: number; HAS_CA_READY: boolean;
    HAS_PAYMENT_METHOD: boolean; SUBMITTED_TO_MAB: boolean;
  }) => buildBrand(r.BRAND_ID, {
    BRAND_NAME: r.BRAND_NAME,
    SE_OWNER: r.SE_OWNER,
    OPS_OWNER: r.OPS_OWNER,
    ACCOUNT_MANAGER: r.ACCOUNT_MANAGER,
    BD_REP: r.BD_REP,
    BRAND_CREATED_AT: r.BRAND_CREATED_AT,
    ANY_ADMIN_LAST_SIGNED_IN_AT: r.ANY_ADMIN_LAST_SIGNED_IN_AT,
    PRODUCTS_COUNT: r.PRODUCTS_COUNT,
    REVIEWS_REQUESTED: r.REVIEWS_REQUESTED,
    HAS_REVIEWS_READY: r.HAS_REVIEWS_READY,
    CA_REQUESTED: r.CA_REQUESTED,
    HAS_CA_READY: r.HAS_CA_READY,
    HAS_PAYMENT_METHOD: r.HAS_PAYMENT_METHOD,
    SUBMITTED_TO_MAB: r.SUBMITTED_TO_MAB,
  }));

  // Add rejected brands not in FCT_BRAND_ONBOARDING
  for (const brandId of rejectedByBoard) {
    if (onboardingIds.has(brandId)) continue;
    const stg = stgMap.get(brandId);
    if (!stg) continue;
    result.push(buildBrand(brandId, {
      BRAND_NAME: stg.NAME,
      SE_OWNER: stg.SE_OWNER,
      OPS_OWNER: stg.OPS_OWNER,
      ACCOUNT_MANAGER: stg.ACCOUNT_MANAGER,
      BD_REP: null,
      BRAND_CREATED_AT: stg.CREATED_AT,
      ANY_ADMIN_LAST_SIGNED_IN_AT: null,
      PRODUCTS_COUNT: 0,
      REVIEWS_REQUESTED: 0,
      HAS_REVIEWS_READY: false,
      CA_REQUESTED: 0,
      HAS_CA_READY: false,
      HAS_PAYMENT_METHOD: false,
      SUBMITTED_TO_MAB: false,
    }));
  }

  return result;
}

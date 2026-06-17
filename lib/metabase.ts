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
    next: { revalidate: 300 }, // cache 5 min
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
  PIPELINE_STATUS: PipelineStatus;
  DAYS_IN_STATUS: number;
}

export type PipelineStatus =
  | "waiting_on_brand_setup"
  | "onboarding_tasks_complete"
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
  if (brand.SUBMITTED_TO_MAB) return "code_snippets_available";
  if (brand.HAS_PAYMENT_METHOD && brand.PRODUCTS_COUNT > 0) return "onboarding_tasks_complete";
  return "waiting_on_brand_setup";
}

export async function getBrands(): Promise<Brand[]> {
  // FCT_BRAND_ONBOARDING fields
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

  // STG_BRANDS fields for hubspot_company_id and collaborator_code
  const BRAND_STG_FIELDS = [766, 764, 3282]; // ID, HUBSPOT_COMPANY_ID, COLLABORATOR_CODE

  // FCT_DAILY_WIDGET_USAGE fields: BRAND_ID, DAY, VIEWS
  const WIDGET_FIELDS = [3552, 3551, 3555]; // BRAND_ID, DAY, VIEWS

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [onboardingRows, stgBrandRows, widgetRows] = await Promise.all([
    metabaseQuery(447, BRAND_FIELDS),
    metabaseQuery(203, BRAND_STG_FIELDS),
    metabaseQuery(464, WIDGET_FIELDS),
  ]);

  // Build lookup maps
  const hubspotMap = new Map<number, { HUBSPOT_COMPANY_ID: number | null; COLLABORATOR_CODE: string | null }>();
  for (const r of stgBrandRows) {
    hubspotMap.set(r.ID, { HUBSPOT_COMPANY_ID: r.HUBSPOT_COMPANY_ID, COLLABORATOR_CODE: r.COLLABORATOR_CODE });
  }

  // Widget activity per brand: recent (last 30d) and any historical
  const recentWidgetBrands = new Set<number>();
  const anyWidgetBrands = new Set<number>();
  for (const r of widgetRows) {
    if (r.VIEWS > 0) {
      anyWidgetBrands.add(r.BRAND_ID);
      if (r.DAY >= thirtyDaysAgo) recentWidgetBrands.add(r.BRAND_ID);
    }
  }

  const now = Date.now();
  const overrides = getAllOverrides();

  return onboardingRows.map((r: Omit<Brand, "PIPELINE_STATUS" | "DAYS_IN_STATUS" | "HUBSPOT_COMPANY_ID" | "COLLABORATOR_CODE" | "SUBSCRIPTION_STATUS">) => {
    const extra = hubspotMap.get(r.BRAND_ID) ?? { HUBSPOT_COMPANY_ID: null, COLLABORATOR_CODE: null };
    const brandWithExtra = { ...r, ...extra, SUBSCRIPTION_STATUS: null };
    const computedStatus = computePipelineStatus(
      brandWithExtra,
      recentWidgetBrands.has(r.BRAND_ID),
      anyWidgetBrands.has(r.BRAND_ID)
    );
    const pipelineStatus = overrides[String(r.BRAND_ID)] ?? computedStatus;
    const createdAt = new Date(r.BRAND_CREATED_AT).getTime();
    const daysInStatus = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    return {
      ...brandWithExtra,
      PIPELINE_STATUS: pipelineStatus,
      DAYS_IN_STATUS: daysInStatus,
    };
  });
}

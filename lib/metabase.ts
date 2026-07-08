import { getAllOverrides, OverrideEntry } from "@/lib/overrides";

async function metabaseQuery(tableId: number, fields?: number[], filters?: unknown[]) {
  // Read at request time — module-level access gets baked in as undefined for Sensitive vars
  const METABASE_URL = process.env.METABASE_URL!;
  const METABASE_API_KEY = process.env.METABASE_API_KEY!;

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

export const WIDGET_TYPE_LABELS: Record<string, string> = {
  gpt:      "Clinician AI",
  analysis: "Analysis",
  quant:    "Embedded",
  sticker:  "Banner",
  qual:     "Testimonials",
};

export interface WidgetTypeStatus {
  wentLiveAt: string | null; // first view date for this widget type
  lastViewAt: string | null; // most recent view date for this widget type
  isLive: boolean;           // viewed within the last 30 days
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
  HAS_APPROVED_PRODUCTS: boolean;
  HAS_SHARE_THRESHOLD_MET: boolean;
  KIND: string | null;
  PIPELINE_STATUS: PipelineStatus;
  DAYS_IN_STATUS: number;
  WIDGET_TYPES: string[];
  WIDGET_STATUSES: Record<string, WidgetTypeStatus>;
  CAI_IMPLEMENTATION_READY: "CAI" | "CAS" | null;
}

export type PipelineStatus =
  | "products_approved_needs_call"
  | "code_snippets_available"
  | "collaborator_code_brand"
  | "live"
  | "was_live";

function computePipelineStatus(
  brand: Omit<Brand, "PIPELINE_STATUS" | "DAYS_IN_STATUS">,
  hasRecentWidgetViews: boolean,
  hasAnyWidgetViews: boolean
): PipelineStatus | null {
  if (hasRecentWidgetViews) return "live";
  if (hasAnyWidgetViews) return "was_live";
  // No products yet — nothing to work with
  if (brand.PRODUCTS_COUNT === 0) return null;
  // All products still pending — wait until at least one clears review
  if (brand.HAS_PENDING_BOARD_REVIEW && !brand.HAS_APPROVED_PRODUCTS) return null;
  // "collaborator_code_brand" is set manually via Notion override — no auto-detect
  // Share threshold met = code snippets available for self-serve
  if (brand.HAS_SHARE_THRESHOLD_MET) return "code_snippets_available";
  // Products approved but not yet at threshold — SE needs to book onboarding call
  return "products_approved_needs_call";
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

  const WIDGET_FIELDS = [3552, 3551, 3555];  // BRAND_ID, DAY, VIEWS
  const PRODUCT_FIELDS = [738, 731, 729];    // HEALTH_BRAND_ID, STATUS, DATE_PASSED_PROVIDER_THRESHOLD

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // No explicit field list for table 203 or 201 here (unlike the other tables)
  // — we need to find specific columns by name below, and don't yet know their
  // field IDs the way we do for the columns we've been selecting explicitly.
  const [onboardingRows, allStgBrandRows, widgetRows, productRows, allWidgetTypeRows] = await Promise.all([
    metabaseQuery(447, BRAND_FIELDS),
    metabaseQuery(203),
    metabaseQuery(464, WIDGET_FIELDS),
    metabaseQuery(202, PRODUCT_FIELDS),
    metabaseQuery(201),
  ]);

  // Only brands flagged as an actual partner belong on the dashboard — table 203
  // also contains leads/prospects/test accounts that never became partners,
  // which is what was flooding the board with old/irrelevant brands.
  const partnerKey = allStgBrandRows.length > 0
    ? Object.keys(allStgBrandRows[0]).find((k) => /^is[_ ]?partner$/i.test(k))
    : undefined;

  if (!partnerKey) {
    throw new Error(
      "Could not find an \"is partner\"-like column on table 203 — check the exact column name in Metabase and update lib/metabase.ts."
    );
  }

  const stgBrandRows = allStgBrandRows.filter((r: Record<string, unknown>) => !!r[partnerKey]);

  // Table 203 (stg-brands) is the comprehensive brand list — every brand flows in
  // here, including ones that never went through the onboarding portal. Table 447
  // (FCT_BRAND_ONBOARDING) only covers portal brands, so from here on it's used
  // as an enrichment lookup keyed by brand ID, not the base list.
  const onboardingMap = new Map<number, {
    BRAND_NAME: string;
    SE_OWNER: string | null;
    OPS_OWNER: string | null;
    ACCOUNT_MANAGER: string | null;
    BD_REP: string | null;
    BRAND_CREATED_AT: string;
    ANY_ADMIN_LAST_SIGNED_IN_AT: string | null;
    REVIEWS_REQUESTED: number;
    HAS_REVIEWS_READY: boolean;
    CA_REQUESTED: number;
    HAS_CA_READY: boolean;
    HAS_PAYMENT_METHOD: boolean;
    SUBMITTED_TO_MAB: boolean;
  }>();
  for (const r of onboardingRows) {
    onboardingMap.set(r.BRAND_ID, {
      BRAND_NAME: r.BRAND_NAME,
      SE_OWNER: r.SE_OWNER,
      OPS_OWNER: r.OPS_OWNER,
      ACCOUNT_MANAGER: r.ACCOUNT_MANAGER,
      BD_REP: r.BD_REP,
      BRAND_CREATED_AT: r.BRAND_CREATED_AT,
      ANY_ADMIN_LAST_SIGNED_IN_AT: r.ANY_ADMIN_LAST_SIGNED_IN_AT,
      REVIEWS_REQUESTED: r.REVIEWS_REQUESTED,
      HAS_REVIEWS_READY: r.HAS_REVIEWS_READY,
      CA_REQUESTED: r.CA_REQUESTED,
      HAS_CA_READY: r.HAS_CA_READY,
      HAS_PAYMENT_METHOD: r.HAS_PAYMENT_METHOD,
      SUBMITTED_TO_MAB: r.SUBMITTED_TO_MAB,
    });
  }

  // Widget activity — overall brand-level live/was_live detection
  const recentWidgetBrands = new Set<number>();
  const anyWidgetBrands = new Set<number>();
  const firstWidgetViewDate = new Map<number, string>(); // earliest date with views
  const lastWidgetViewDate = new Map<number, string>();  // most recent date with views
  for (const r of widgetRows) {
    if (r.VIEWS > 0) {
      anyWidgetBrands.add(r.BRAND_ID);
      if (r.DAY >= thirtyDaysAgo) recentWidgetBrands.add(r.BRAND_ID);
      const prev = firstWidgetViewDate.get(r.BRAND_ID);
      if (!prev || r.DAY < prev) firstWidgetViewDate.set(r.BRAND_ID, r.DAY);
      const prevLast = lastWidgetViewDate.get(r.BRAND_ID);
      if (!prevLast || r.DAY > prevLast) lastWidgetViewDate.set(r.BRAND_ID, r.DAY);
    }
  }

  // Per-widget-type "went live" tracking, from table 201 (stg-widgets) —
  // one row per widget, with its own first/last view dates already computed.
  // Column names are detected by pattern rather than hardcoded field IDs,
  // since we don't have those IDs confirmed the way we do for other tables.
  const widgetStatusByBrand = new Map<number, Record<string, WidgetTypeStatus>>();
  if (allWidgetTypeRows.length > 0) {
    const sampleKeys = Object.keys(allWidgetTypeRows[0]);
    const brandIdKey = sampleKeys.find((k: string) => /^(health_)?brand[_ ]?id$/i.test(k));
    const typeKey = sampleKeys.find((k: string) => /presentation[_ ]?type/i.test(k)) ?? sampleKeys.find((k: string) => /^type$/i.test(k));
    const firstViewKey = sampleKeys.find((k: string) => /first[_ ]?view/i.test(k));
    const lastViewKey = sampleKeys.find((k: string) => /last[_ ]?view/i.test(k));

    if (!brandIdKey || !typeKey || !firstViewKey || !lastViewKey) {
      console.error(
        "Could not find expected columns on table 201 (stg-widgets) for per-widget-type live tracking.",
        { brandIdKey, typeKey, firstViewKey, lastViewKey, availableColumns: sampleKeys }
      );
    } else {
      const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const r of allWidgetTypeRows as Record<string, unknown>[]) {
        const brandId = r[brandIdKey] as number | null;
        const type = r[typeKey] as string | null;
        if (brandId == null || !type) continue;

        const wentLiveAt = (r[firstViewKey] as string | null) ?? null;
        const lastViewAt = (r[lastViewKey] as string | null) ?? null;
        const isLive = !!lastViewAt && new Date(lastViewAt).getTime() >= thirtyDaysAgoMs;

        const existing = widgetStatusByBrand.get(brandId) ?? {};
        existing[type] = { wentLiveAt, lastViewAt, isLive };
        widgetStatusByBrand.set(brandId, existing);
      }
    }
  }

  // Product status + count per brand — PRODUCTS_COUNT is computed directly from
  // table 202 (rather than trusted from table 447) so it works the same way for
  // every brand, whether or not it has an onboarding-portal record.
  const pendingBoardReview = new Set<number>();
  const rejectedByBoard = new Set<number>();
  const approvedProductBrands = new Set<number>(); // has at least one approved product
  const shareThresholdMet = new Set<number>();
  const firstThresholdDate = new Map<number, string>(); // when share threshold was first met
  const productCountByBrand = new Map<number, number>();
  for (const r of productRows) {
    productCountByBrand.set(r.HEALTH_BRAND_ID, (productCountByBrand.get(r.HEALTH_BRAND_ID) ?? 0) + 1);
    if (r.STATUS === "pending_board_review") pendingBoardReview.add(r.HEALTH_BRAND_ID);
    else if (r.STATUS === "rejected_by_board") rejectedByBoard.add(r.HEALTH_BRAND_ID);
    else approvedProductBrands.add(r.HEALTH_BRAND_ID); // any other status = approved
    if (r.DATE_PASSED_PROVIDER_THRESHOLD) {
      shareThresholdMet.add(r.HEALTH_BRAND_ID);
      const prev = firstThresholdDate.get(r.HEALTH_BRAND_ID);
      if (!prev || r.DATE_PASSED_PROVIDER_THRESHOLD < prev) {
        firstThresholdDate.set(r.HEALTH_BRAND_ID, r.DATE_PASSED_PROVIDER_THRESHOLD);
      }
    }
  }

  const now = Date.now();
  const overrides = await getAllOverrides();

  function buildBrand(
    brandId: number,
    stg: { // returns null if brand should be excluded from the board
      NAME: string;
      HUBSPOT_COMPANY_ID: number | null;
      COLLABORATOR_CODE: string | null;
      SE_OWNER: string | null;
      OPS_OWNER: string | null;
      ACCOUNT_MANAGER: string | null;
      CREATED_AT: string;
      KIND: string | null;
    }
  ): Brand | null {
    // Enrichment from the onboarding-portal table, when this brand has a record
    // there. Non-portal brands fall back to table 203's own fields, or sensible
    // defaults for data that only ever comes from the portal flow.
    const onboarding = onboardingMap.get(brandId);
    const override: OverrideEntry | undefined = overrides[String(brandId)];
    const f = override?.fields ?? {};
    const brandWithExtra = {
      BRAND_ID: brandId,
      BRAND_NAME: onboarding?.BRAND_NAME ?? stg.NAME,
      SE_OWNER: f.SE_OWNER ?? onboarding?.SE_OWNER ?? stg.SE_OWNER,
      OPS_OWNER: f.OPS_OWNER ?? onboarding?.OPS_OWNER ?? stg.OPS_OWNER,
      ACCOUNT_MANAGER: f.ACCOUNT_MANAGER ?? onboarding?.ACCOUNT_MANAGER ?? stg.ACCOUNT_MANAGER,
      BD_REP: f.BD_REP ?? onboarding?.BD_REP ?? null,
      BRAND_CREATED_AT: onboarding?.BRAND_CREATED_AT ?? stg.CREATED_AT,
      ANY_ADMIN_LAST_SIGNED_IN_AT: onboarding?.ANY_ADMIN_LAST_SIGNED_IN_AT ?? null,
      PRODUCTS_COUNT: productCountByBrand.get(brandId) ?? 0,
      REVIEWS_REQUESTED: onboarding?.REVIEWS_REQUESTED ?? 0,
      HAS_REVIEWS_READY: onboarding?.HAS_REVIEWS_READY ?? false,
      CA_REQUESTED: onboarding?.CA_REQUESTED ?? 0,
      HAS_CA_READY: onboarding?.HAS_CA_READY ?? false,
      HAS_PAYMENT_METHOD: onboarding?.HAS_PAYMENT_METHOD ?? false,
      SUBMITTED_TO_MAB: onboarding?.SUBMITTED_TO_MAB ?? false,
      HUBSPOT_COMPANY_ID: stg.HUBSPOT_COMPANY_ID ?? null,
      COLLABORATOR_CODE: f.COLLABORATOR_CODE ?? stg.COLLABORATOR_CODE ?? null,
      KIND: f.KIND ?? stg.KIND ?? null,
      PAYMENT_COMPLETED_AT: null,
      HAS_PENDING_BOARD_REVIEW: pendingBoardReview.has(brandId),
      HAS_REJECTED_BY_BOARD: rejectedByBoard.has(brandId),
      HAS_APPROVED_PRODUCTS: approvedProductBrands.has(brandId),
      HAS_SHARE_THRESHOLD_MET: shareThresholdMet.has(brandId),
      WIDGET_TYPES: Object.keys(widgetStatusByBrand.get(brandId) ?? {}),
      WIDGET_STATUSES: widgetStatusByBrand.get(brandId) ?? {},
      CAI_IMPLEMENTATION_READY: null as "CAI" | "CAS" | null,
    };
    const computedStatus = computePipelineStatus(
      brandWithExtra,
      recentWidgetBrands.has(brandId),
      anyWidgetBrands.has(brandId)
    );
    const pipelineStatus = override?.status ?? computedStatus;
    if (!pipelineStatus) return null; // excluded from board
    // Use the override's changedAt if set; otherwise use stage-appropriate data timestamps.
    // Falling back to BRAND_CREATED_AT is wrong — a brand can be months old but just entered a stage.
    let statusEnteredAt: number;
    if (override?.changedAt) {
      statusEnteredAt = new Date(override.changedAt).getTime();
    } else if (pipelineStatus === "live") {
      // "Live" since first widget views appeared
      const d = firstWidgetViewDate.get(brandId);
      statusEnteredAt = d ? new Date(d).getTime() : now;
    } else if (pipelineStatus === "was_live") {
      // "Was live" since last widget views (roughly when activity stopped)
      const d = lastWidgetViewDate.get(brandId);
      statusEnteredAt = d ? new Date(d).getTime() : now;
    } else if (pipelineStatus === "code_snippets_available") {
      // "Code snippets" since share threshold was first met
      const d = firstThresholdDate.get(brandId);
      statusEnteredAt = d ? new Date(d).getTime() : now;
    } else {
      // products_approved_needs_call / collaborator_code_brand — no natural timestamp in our data.
      // Default to now (0 days) rather than misleading creation date.
      statusEnteredAt = now;
    }
    const daysInStatus = Math.floor((now - statusEnteredAt) / (1000 * 60 * 60 * 24));
    return { ...brandWithExtra, PIPELINE_STATUS: pipelineStatus, DAYS_IN_STATUS: daysInStatus };
  }

  // Brands from table 203 (stg-brands) — the comprehensive list, including
  // brands with no onboarding-portal record. Table 447 data is merged in above
  // via onboardingMap for the brands that do have one.
  const result: Brand[] = (stgBrandRows.map((r: {
    ID: number; NAME: string; HUBSPOT_COMPANY_ID: number | null; COLLABORATOR_CODE: string | null;
    SE_OWNER: string | null; OPS_OWNER: string | null; ACCOUNT_MANAGER: string | null;
    CREATED_AT: string; KIND: string | null;
  }) => buildBrand(r.ID, {
    NAME: r.NAME,
    HUBSPOT_COMPANY_ID: r.HUBSPOT_COMPANY_ID,
    COLLABORATOR_CODE: r.COLLABORATOR_CODE,
    SE_OWNER: r.SE_OWNER,
    OPS_OWNER: r.OPS_OWNER,
    ACCOUNT_MANAGER: r.ACCOUNT_MANAGER,
    CREATED_AT: r.CREATED_AT,
    KIND: r.KIND ?? null,
  })) as (Brand | null)[]).filter((b): b is Brand => b !== null);

  // Rejected brands fall off the board — no longer added here

  return result;
}

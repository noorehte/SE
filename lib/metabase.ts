import { getAllOverrides, OverrideEntry } from "@/lib/overrides";

async function metabaseQuery(tableId: number, fields?: number[], filters?: unknown[], limit?: number) {
  // Read at request time — module-level access gets baked in as undefined for Sensitive vars
  const METABASE_URL = process.env.METABASE_URL!;
  const METABASE_API_KEY = process.env.METABASE_API_KEY!;

  const query: Record<string, unknown> = { "source-table": tableId };
  if (fields) query["fields"] = fields.map((id) => ["field", id, null]);
  if (filters) query["filter"] = filters;
  // Metabase's /api/dataset defaults to a 2000-row cap and silently truncates
  // beyond it — pass an explicit limit for any table that might exceed that.
  if (limit) query["limit"] = limit;

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

// Widget live-status is queried directly from the app's Postgres database via
// Grafana's datasource proxy, rather than through Metabase's stg-widgets
// mirror (table 201). Two reasons: (1) Metabase's /api/dataset caps results at
// 2000 rows with no pagination, and the widgets table has 10k+ live rows, so
// table 201 was silently truncated; (2) querying Postgres directly lets us
// aggregate per brand+type in SQL instead of hand-rolling dedup logic over a
// row-per-widget-version dataset.
async function queryGrafanaPostgres(rawSql: string) {
  const GRAFANA_URL = process.env.GRAFANA_URL!;
  const GRAFANA_API_KEY = process.env.GRAFANA_API_KEY!;
  const GRAFANA_WIDGETS_DATASOURCE_UID = process.env.GRAFANA_WIDGETS_DATASOURCE_UID!;

  const res = await fetch(`${GRAFANA_URL}/api/ds/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GRAFANA_API_KEY}`,
    },
    body: JSON.stringify({
      queries: [
        {
          refId: "A",
          datasource: { type: "postgres", uid: GRAFANA_WIDGETS_DATASOURCE_UID },
          rawSql,
          format: "table",
        },
      ],
      // Grafana requires a time range on every query even when the SQL has no
      // $__timeFilter macro — the range itself is unused here.
      from: "now-5y",
      to: "now",
    }),
    cache: "no-store",
  });

  const data = await res.json();
  const frame = data?.results?.A?.frames?.[0];
  if (!frame) throw new Error(`Grafana query failed: ${JSON.stringify(data)}`);
  if (frame.error) throw new Error(`Grafana query error: ${frame.error}`);

  const fieldNames: string[] = frame.schema.fields.map((f: { name: string }) => f.name);
  const values: unknown[][] = frame.data.values; // one array per column
  const rowCount = values[0]?.length ?? 0;

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, unknown> = {};
    fieldNames.forEach((name, colIdx) => {
      row[name] = values[colIdx][i];
    });
    rows.push(row);
  }
  return rows;
}

export const WIDGET_TYPE_LABELS: Record<string, string> = {
  gpt:      "Clinician AI",
  analysis: "Analysis",
  quant:    "Embedded",
  sticker:  "Banner",
  qual:     "Testimonials",
};

export interface WidgetTypeStatus {
  wentLiveAt: string | null;     // first-ever view date for this widget type
  wentInactiveAt: string | null; // set when the widget stops getting views (cleared back
                                  // to null once fresh views come in) — mirrors the Rails
                                  // `last_view_date` column's actual semantics, which is
                                  // NOT "most recent view" despite the name.
  isLive: boolean;                // has been viewed at least once and hasn't gone inactive
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
  STATUS_ENTERED_AT: string; // ISO date the brand entered its current PIPELINE_STATUS
  WIDGET_TYPES: string[];
  WIDGET_STATUSES: Record<string, WidgetTypeStatus>;
  CAI_IMPLEMENTATION_READY: "CAI" | "CAS" | null;
}

export type PipelineStatus =
  | "not_started"
  | "pending_review"
  | "products_approved_needs_call"
  | "code_snippets_available"
  | "collaborator_code_brand"
  | "live"
  | "was_live"
  | "churned";

function computePipelineStatus(
  brand: Omit<Brand, "PIPELINE_STATUS" | "DAYS_IN_STATUS" | "STATUS_ENTERED_AT">,
  hasLiveWidget: boolean,
  hasWidgetHistory: boolean,
  isChurned: boolean
): PipelineStatus {
  // A brand can be soft-deleted (discarded_at set on health_brands) while
  // still flagged is_partner=true — e.g. Vital GOAT, and ~90 others. That
  // status takes priority over everything else: a churned brand shouldn't
  // sit in "Code Snippets Available" or even "Live" just because its widget
  // data hasn't caught up yet.
  if (isChurned) return "churned";
  if (hasLiveWidget) return "live";
  if (hasWidgetHistory) return "was_live";
  // No products yet — nothing to work with. Previously this (and the pending-review
  // case below) returned null and got the brand excluded from the dashboard
  // entirely. Now every partnered brand gets a status so it always shows up
  // under "view all".
  if (brand.PRODUCTS_COUNT === 0) return "not_started";
  // All products still pending — wait until at least one clears review
  if (brand.HAS_PENDING_BOARD_REVIEW && !brand.HAS_APPROVED_PRODUCTS) return "pending_review";
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

  const PRODUCT_FIELDS = [738, 731, 729];    // HEALTH_BRAND_ID, STATUS, DATE_PASSED_PROVIDER_THRESHOLD

  // No explicit field list for table 203 here (unlike the other tables) — we
  // need to find specific columns by name below, and don't yet know their
  // field IDs the way we do for the columns we've been selecting explicitly.
  const [onboardingRows, allStgBrandRows, productRows, widgetStatusRows, churnedBrandRows] = await Promise.all([
    metabaseQuery(447, BRAND_FIELDS),
    metabaseQuery(203),
    metabaseQuery(202, PRODUCT_FIELDS),
    // Per-brand, per-widget-type live status, straight from Postgres via
    // Grafana — see queryGrafanaPostgres() above for why this replaced
    // Metabase table 201. Aggregated here in SQL rather than client-side:
    // a brand+type is "live" if ANY of its (non-discarded) widget-version
    // rows currently has first_view_date set and last_view_date null — this
    // mirrors the CS team's own Grafana "Widget Statuses" dashboard query.
    queryGrafanaPostgres(`
      select
        w.health_brand_id,
        w.presentation_type,
        bool_or(w.first_view_date is not null and w.last_view_date is null) as is_live,
        max(w.first_view_date) filter (where w.first_view_date is not null and w.last_view_date is null) as live_first_view_date,
        max(w.first_view_date) as latest_first_view_date,
        max(w.last_view_date) as latest_went_inactive_date
      from widgets w
      where w.discarded_at is null
      group by w.health_brand_id, w.presentation_type
    `),
    // Churned brands: soft-deleted (discarded_at set) on health_brands. This
    // does NOT track with is_partner — ~90 brands are discarded but still
    // have is_partner=true (e.g. Vital GOAT), so table 203's is_partner
    // filter alone lets churned brands keep showing up as active. Queried
    // straight from Postgres rather than trusting table 203 to mirror
    // discarded_at faithfully.
    queryGrafanaPostgres(`
      select id as health_brand_id, discarded_at
      from health_brands
      where discarded_at is not null
    `),
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

  // Per-widget-type "went live" tracking. `widgetStatusRows` is already
  // aggregated per brand+type in SQL (see the queryGrafanaPostgres call
  // above), so this is just a straight mapping — epoch-ms timestamps from
  // Grafana's Postgres datasource, no per-row dedup or discard filtering
  // needed here (that's all handled in the query itself).
  const widgetStatusByBrand = new Map<number, Record<string, WidgetTypeStatus>>();
  let widgetStatusLiveCount = 0;
  for (const r of widgetStatusRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    const type = r.presentation_type as string | null;
    if (brandId == null || !type) continue;

    const isLive = !!r.is_live;
    const toIso = (ms: unknown) => (typeof ms === "number" ? new Date(ms).toISOString() : null);
    const wentLiveAt = isLive ? toIso(r.live_first_view_date) : toIso(r.latest_first_view_date);
    const wentInactiveAt = isLive ? null : toIso(r.latest_went_inactive_date);
    if (isLive) widgetStatusLiveCount++;

    const existing = widgetStatusByBrand.get(brandId) ?? {};
    existing[type] = { wentLiveAt, wentInactiveAt, isLive };
    widgetStatusByBrand.set(brandId, existing);
  }
  console.log("Widget live-tracking summary (via Grafana/Postgres):", {
    brandTypeGroups: widgetStatusRows.length,
    liveCount: widgetStatusLiveCount,
  });

  const churnedAtByBrand = new Map<number, string>();
  for (const r of churnedBrandRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    if (brandId == null) continue;
    if (typeof r.discarded_at === "number") {
      churnedAtByBrand.set(brandId, new Date(r.discarded_at).toISOString());
    }
  }

  // Brand-level live/was_live status is derived directly from the per-type
  // data above — NOT from a separate 30-day-rolling-window view count. That
  // older approach (previously table 464) could mark a brand "live" just
  // because it had some page view within the last 30 days even after every
  // individual widget had already gone inactive, which is exactly the "shows
  // Live but every widget says (inactive)" bug that was reported. A brand is
  // only "live" if at least one of its widget types is currently live.
  const brandHasLiveWidget = new Set<number>();
  const brandHasWidgetHistory = new Set<number>();
  const brandFirstLiveDate = new Map<number, string>();   // earliest wentLiveAt among currently-live types
  const brandLastInactiveDate = new Map<number, string>(); // most recent wentInactiveAt among inactive types
  for (const [brandId, statuses] of widgetStatusByBrand) {
    for (const status of Object.values(statuses)) {
      if (status.wentLiveAt) brandHasWidgetHistory.add(brandId);
      if (status.isLive) {
        brandHasLiveWidget.add(brandId);
        if (status.wentLiveAt) {
          const prev = brandFirstLiveDate.get(brandId);
          if (!prev || status.wentLiveAt < prev) brandFirstLiveDate.set(brandId, status.wentLiveAt);
        }
      } else if (status.wentInactiveAt) {
        const prev = brandLastInactiveDate.get(brandId);
        if (!prev || status.wentInactiveAt > prev) {
          brandLastInactiveDate.set(brandId, status.wentInactiveAt);
        }
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
      brandHasLiveWidget.has(brandId),
      brandHasWidgetHistory.has(brandId),
      churnedAtByBrand.has(brandId)
    );
    const pipelineStatus = override?.status ?? computedStatus;
    if (!pipelineStatus) return null; // excluded from board
    // Use the override's changedAt if set; otherwise use stage-appropriate data timestamps.
    // Falling back to BRAND_CREATED_AT is wrong — a brand can be months old but just entered a stage.
    let statusEnteredAt: number;
    if (override?.changedAt) {
      statusEnteredAt = new Date(override.changedAt).getTime();
    } else if (pipelineStatus === "churned") {
      // "Churned" since the brand was discarded
      const d = churnedAtByBrand.get(brandId);
      statusEnteredAt = d ? new Date(d).getTime() : now;
    } else if (pipelineStatus === "live") {
      // "Live" since the earliest of its currently-live widget types went live
      const d = brandFirstLiveDate.get(brandId);
      statusEnteredAt = d ? new Date(d).getTime() : now;
    } else if (pipelineStatus === "was_live") {
      // "Was live" since the most recent time any widget went inactive
      const d = brandLastInactiveDate.get(brandId);
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
    return {
      ...brandWithExtra,
      PIPELINE_STATUS: pipelineStatus,
      DAYS_IN_STATUS: daysInStatus,
      STATUS_ENTERED_AT: new Date(statusEnteredAt).toISOString(),
    };
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

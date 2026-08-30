import { getAllOverrides, OverrideEntry } from "@/lib/overrides";
import { getHubSpotOwnerChecksByCompanyId, getCloseDatesByCompanyId, normalizeOwnerName } from "@/lib/hubspot";

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

  if (!res.ok) {
    // Metabase (or a proxy in front of it) can reject a request with a plain-
    // text body (e.g. "Unauthenticated") instead of JSON — parsing that as
    // JSON throws an opaque SyntaxError with no indication of the real cause.
    throw new Error(`Metabase request failed (${res.status}): ${await res.text()}`);
  }
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
export async function queryGrafanaPostgres(rawSql: string) {
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

  if (!res.ok) {
    // Grafana (or a proxy in front of it) can reject a request with a plain-
    // text body (e.g. "Unauthenticated") instead of JSON — parsing that as
    // JSON throws an opaque SyntaxError with no indication of the real cause.
    throw new Error(`Grafana request failed (${res.status}): ${await res.text()}`);
  }
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
  PRODUCTS_APPROVED_COUNT: number; // products not pending_board_review/rejected_by_board — out of PRODUCTS_COUNT
  PRODUCT_SHARE_COUNTS: { name: string; count: number }[]; // per-product store_presence_count, not summed
  REVIEWS_REQUESTED: number;
  HAS_REVIEWS_READY: boolean;
  CA_REQUESTED: number;
  HAS_CA_READY: boolean;
  BRAND_CREATED_AT: string;
  ANY_ADMIN_LAST_SIGNED_IN_AT: string | null;
  COLLABORATOR_CODE: string | null;
  PAYMENT_COMPLETED_AT: string | null;
  CLOSE_DATE: string | null; // HubSpot closed-won deal's closedate, if any
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
  // Best-performing published product page (highest live-signal combo, ties
  // broken by name) — surfaced in the Exec Overview so a click lands on the
  // PDP that actually demonstrates what's live, not just any product's page.
  // null if the brand has no published, non-discarded product with a URL.
  TOP_PDP: { name: string; url: string; badgeLive: boolean; reviewsLive: boolean; caiLive: boolean } | null;
  PDP_COUNT: number; // published, non-discarded products with a page URL
  PYLON_SENTIMENT: string | null; // Pylon account's "Sentiment" custom field, matched by HUBSPOT_COMPANY_ID — null if no Pylon account or no sentiment set
  PYLON_LAST_COMMUNICATION_AT: string | null; // Pylon account's latest_customer_activity_time — null if no Pylon account or no activity on file
  PYLON_OPEN_ISSUES_90D: number | null; // Pylon account's "number_of_open_issues_last_90_days" custom field — null if no Pylon account or field unset
  PYLON_ACCOUNT_ID: string | null; // Pylon's own account id — null if no Pylon account found
  RECURLY_STATE: string | null; // Recurly subscription state ("active" | "future" | "expired" | "failed" | "paused" | ...) for the brand's most recent subscription — null if no Recurly account/subscription found
  RECURLY_PLAN_NAME: string | null;
  RECURLY_AMOUNT: number | null;
  RECURLY_CURRENCY: string | null;
  RECURLY_CURRENT_PERIOD_STARTED_AT: string | null;
  RECURLY_CURRENT_PERIOD_ENDS_AT: string | null;
  RECURLY_CURRENT_TERM_ENDS_AT: string | null;
  RECURLY_AUTO_RENEW: boolean | null;
  RECURLY_BILLING_PORTAL_URL: string | null; // brand-facing self-service billing link — treat as sensitive, see lib/recurly.ts
  ON_REACHOUT_SHEET: boolean; // true if the brand appears in any bucket on the email-reachouts sheet at all
  REACHED_OUT: boolean | null; // "Emailed?" from the email-reachouts sheet — null if not on the sheet, or listed but not yet marked Y/N
  REACHED_OUT_SEND_LABEL: string | null; // that bucket's send date/label, e.g. "Send 7/31" or "Send in Aug"
  ON_SE_SPRINT_SHEET: boolean; // true if the brand submitted the "Request for Assisted Implementation" form (or was added manually), and hasn't been dismissed from the queue
  SE_SPRINT_SUBMITTED_AT: string | null; // raw form Timestamp text, or null if not on the sheet
  SE_SPRINT_MYSHOPIFY_URL: string | null;
  SE_SPRINT_HAS_SHARED_CODE: string | null; // raw "Yes" / "No" / "Unsure" from the form
  SE_SPRINT_COLLABORATOR_CODE: string | null; // code the brand typed into the form itself
  SE_SPRINT_MYSHOPIFY_URL_OVERRIDE: string | null; // SE-corrected myshopify domain — wins over what the brand typed into the form
  SE_SPRINT_DISMISSED: boolean; // manually removed from the SE Sprint queue — wins over both the form and a manual add
  ONBOARDING_CHANNEL: "in_app" | "external" | null; // "in_app" = onboarded via Brand Portal (and has portal access)
  REVIEWS_DELIVERED: number;
  BADGE_READY_DATE: string | null;
  REVIEWS_READY_DATE: string | null;
  CAI_READY_DATE: string | null;
  BADGE_IMPLEMENTED: boolean; // quant/sticker widget is currently live (isLive), not just that the ready-email was sent
  REVIEWS_IMPLEMENTED: boolean; // qual widget is currently live
  CAI_IMPLEMENTED: boolean; // gpt/analysis/gpt_s widget is currently live
  // Automated snippet follow-ups (SE-tracker controls, stored as field overrides):
  FOLLOWUP_SNOOZE_UNTIL: string | null; // ISO date — send one agnostic follow-up on this date, then stop
  FOLLOWUPS_DISABLED: boolean;           // hard-off switch for this brand
  // "This Week" board controls (stored as field overrides):
  WEEKLY_FOCUS_PINNED: boolean;             // always show on the board this week, regardless of score
  WEEKLY_FOCUS_DISMISSED_WEEK: string | null; // ISO week (e.g. "2026-W35") the brand was dismissed for — stale once the week has passed
  WEEKLY_FOCUS_DONE_WEEK: string | null;    // ISO week the brand was marked handled — still shown (collapsed), unlike dismissed
  // VIP-board-only Kanban column (SE-tracker control, stored as a field override) —
  // moves a brand out of its real PIPELINE_STATUS column into "A/B Testing" without
  // losing that real status, so it lands back in the right column once removed.
  AB_TESTING: boolean;
  AB_TESTING_NOTES: string | null;
}

// "Stuck" means sitting too long in a status that still needs SE action.
// "Live" and "Churned" are both terminal/resolved states — a brand that's
// been live for 90 days isn't stuck, it's succeeding, and a churned brand
// isn't stuck either, it's done. Only pre-live and "was live" statuses (which
// genuinely need re-engagement) should ever show as stuck.
export function isBrandStuck(brand: Pick<Brand, "DAYS_IN_STATUS" | "PIPELINE_STATUS">): boolean {
  return brand.DAYS_IN_STATUS > 7 && brand.PIPELINE_STATUS !== "live" && brand.PIPELINE_STATUS !== "churned";
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

// The actual data-fetching — no caching here. Deliberately kept free of any
// fs/Vercel-KV import: this file (lib/metabase.ts) is imported by client
// components for its types (Brand, PipelineStatus, etc.), and bundling a
// Node-only module like fs/promises into it breaks the client build. The
// cached, server-only entry point is getBrands() in lib/get-brands.ts, which
// wraps this function — server code should import getBrands from there, not
// call this directly.
export async function fetchBrandsFromSources(): Promise<Brand[]> {
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

  // No explicit field list for table 203 here (unlike the other tables) — we
  // need to find specific columns by name below, and don't yet know their
  // field IDs the way we do for the columns we've been selecting explicitly.
  const [onboardingRows, allStgBrandRows, productRows, widgetStatusRows, churnedBrandRows, onboardingChannelRows, reviewsDeliveredRows, readyDateRows, productWidgetStatusRows, pdpProductRows, approvedAssessmentRows] = await Promise.all([
    metabaseQuery(447, BRAND_FIELDS),
    metabaseQuery(203),
    // health_brand_products has 5,900+ rows — table 202 (Metabase's mirror)
    // hits the same 2000-row /api/dataset cap that bit table 201. That
    // silently truncated newer brands' products entirely (e.g. Well Mist,
    // created May 2026 — 4 published products in Postgres, 0 via table 202),
    // which zeroes PRODUCTS_COUNT and misclassifies the brand as
    // "not_started" even though its products are fully approved. Queried
    // directly from Postgres via Grafana instead, same as the widgets fix.
    queryGrafanaPostgres(`
      select health_brand_id, name, status, date_passed_provider_threshold, store_presence_count, product_page_url
      from health_brand_products
    `),
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
    // "in_app" = onboarded/self-served through the Brand Portal; "external" =
    // onboarded some other way (e.g. manually by an SE). Also doubles as
    // brand-portal access, since only "in_app" brands have portal accounts.
    queryGrafanaPostgres(`
      select id as health_brand_id, onboarding_channel
      from health_brands
    `),
    // Reviews "delivered" = notes rows actually shared with the brand,
    // counted (not just min(created_at) like detectSnippetStatus's ready-date).
    queryGrafanaPostgres(`
      select hbp.health_brand_id, count(*) as reviews_delivered
      from notes n
      join health_brand_products hbp on hbp.id = n.health_brand_product_id
      where n.share_with_brands and hbp.discarded_at is null
      group by 1
    `),
    // Ready dates per snippet type — same rules as lib/followups/detect.ts,
    // with CA corrected to match the Rails app's actual "ready" definition
    // (HealthBrand#cai_snippet_available?/cas_snippet_available?, which is
    // what gates cai_ready_email_sent_at in lib/tasks/brand_onboarding.rake):
    //   Badge   → a product with store_presence_count >= 100 AND a provider-
    //             threshold crossing date set.
    //   Reviews → a review (notes row) with share_with_brands = true.
    //   CA      → an approved product_assessment AND a matching gpt/analysis/
    //             gpt_s widget on the SAME product both existing at once —
    //             an approved assessment with no widget yet doesn't actually
    //             trigger the real email or render any CAI content.
    queryGrafanaPostgres(`
      with badge as (
        select health_brand_id as bid, min(date_passed_provider_threshold) as ready_at
        from health_brand_products
        where discarded_at is null
          and store_presence_count >= 100
          and date_passed_provider_threshold is not null
        group by 1
      ),
      reviews as (
        select hbp.health_brand_id as bid, min(n.created_at) as ready_at
        from notes n join health_brand_products hbp on hbp.id = n.health_brand_product_id
        where n.share_with_brands and hbp.discarded_at is null
        group by 1
      ),
      ca as (
        select hbp.health_brand_id as bid, min(greatest(pa.updated_at, w.created_at)) as ready_at
        from product_assessments pa
          join health_brand_products hbp on hbp.id = pa.health_brand_product_id
          join widgets w on w.health_brand_product_id = pa.health_brand_product_id
            and w.presentation_type in ('gpt', 'analysis', 'gpt_s')
            and w.discarded_at is null
        where pa.approved and hbp.discarded_at is null
        group by 1
      )
      select
        coalesce(badge.bid, reviews.bid, ca.bid) as health_brand_id,
        badge.ready_at as badge_ready_at,
        reviews.ready_at as reviews_ready_at,
        ca.ready_at as ca_ready_at
      from badge
        full outer join reviews on reviews.bid = badge.bid
        full outer join ca on ca.bid = coalesce(badge.bid, reviews.bid)
    `),
    // Same live-widget logic as WIDGET_STATUSES above, but grouped down to the
    // individual product rather than collapsed to brand+type — needed to tell
    // which specific PDP is driving a brand's live status (Exec Overview's
    // "PDP Links" field), since a brand's products can be at different
    // live-signal levels from each other.
    queryGrafanaPostgres(`
      select
        w.health_brand_product_id,
        w.presentation_type,
        bool_or(w.first_view_date is not null and w.last_view_date is null) as is_live
      from widgets w
      where w.discarded_at is null
      group by w.health_brand_product_id, w.presentation_type
    `),
    // Published, non-discarded products with an actual page URL — the
    // candidate pool for the Exec Overview's PDP link. Unpublished/discarded
    // rows can carry junk URLs (affiliate redirects, onboarding placeholders).
    queryGrafanaPostgres(`
      select id, health_brand_id, name, product_page_url
      from health_brand_products
      where discarded_at is null and status = 'published' and product_page_url is not null
    `),
    // Approved assessments, per product — same "CA ready" rule as the CTE
    // above (approved assessment + matching widget on the same product), but
    // needed per-product here rather than rolled up to a single brand-level date.
    queryGrafanaPostgres(`
      select distinct health_brand_product_id
      from product_assessments
      where approved
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

  // Second check on SE/Account-Manager/Ops assignments, read straight from
  // HubSpot rather than Metabase (see getHubSpotOwnerChecksByCompanyId's own
  // comment for the field mapping and why it's scoped to just this
  // pipeline's company IDs rather than searching the whole portal — HubSpot's
  // Search API caps out at 10,000 results, which a portal-wide query would
  // blow past and silently drop brands beyond the cap).
  const pipelineCompanyIds = stgBrandRows
    .map((r: Record<string, unknown>) => r.HUBSPOT_COMPANY_ID as number | null)
    .filter((id: number | null): id is number => id != null);
  // Independent of each other and of getAllOverrides() below (Notion) — run
  // together rather than paying three sequential round-trips.
  const [hubspotOwnerChecksByCompanyId, closeDatesByCompanyId, overrides] = await Promise.all([
    getHubSpotOwnerChecksByCompanyId(pipelineCompanyIds),
    getCloseDatesByCompanyId(pipelineCompanyIds),
    getAllOverrides(),
  ]);

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

  // App-side churn signal (discarded_at on health_brands) — combined with the
  // HubSpot churn_date signal inside buildBrand, where HUBSPOT_COMPANY_ID is
  // available, since the two are keyed differently (brand ID vs. HubSpot ID).
  const appDiscardedAtByBrand = new Map<number, string>();
  for (const r of churnedBrandRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    if (brandId == null) continue;
    if (typeof r.discarded_at === "number") {
      appDiscardedAtByBrand.set(brandId, new Date(r.discarded_at).toISOString());
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

  const onboardingChannelByBrand = new Map<number, "in_app" | "external">();
  for (const r of onboardingChannelRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    const channel = r.onboarding_channel as string | null;
    if (brandId == null || (channel !== "in_app" && channel !== "external")) continue;
    onboardingChannelByBrand.set(brandId, channel);
  }

  const reviewsDeliveredByBrand = new Map<number, number>();
  for (const r of reviewsDeliveredRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    if (brandId == null) continue;
    reviewsDeliveredByBrand.set(brandId, Number(r.reviews_delivered ?? 0));
  }

  // Grafana's Postgres datasource returns timestamps as epoch ms.
  const toIso = (v: unknown): string | null => (typeof v === "number" ? new Date(v).toISOString() : null);

  // "Implemented" means the widget is actually live, not that the ready-email
  // went out — a brand can have badge_ready_email_sent_at/cai_ready_email_sent_at
  // set on health_brands while never having gone live (e.g. Mars Men: both
  // emails sent, but every widget's first_view_date is still null). Reuses the
  // same isLive computed for WIDGET_STATUSES above (first_view_date set AND
  // last_view_date null), so this reflects real Grafana/Postgres widget data
  // rather than an email-sent flag that can fire before implementation happens.
  const isTypeLive = (statuses: Record<string, WidgetTypeStatus> | undefined, types: string[]) =>
    types.some((t) => statuses?.[t]?.isLive);
  const implementedByBrand = new Map<number, { badge: boolean; reviews: boolean; cai: boolean }>();
  for (const [brandId, statuses] of widgetStatusByBrand) {
    implementedByBrand.set(brandId, {
      badge: isTypeLive(statuses, ["quant", "sticker"]),
      reviews: isTypeLive(statuses, ["qual"]),
      cai: isTypeLive(statuses, ["gpt", "analysis", "gpt_s"]),
    });
  }

  const readyDatesByBrand = new Map<number, { badge: string | null; reviews: string | null; cai: string | null }>();
  for (const r of readyDateRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    if (brandId == null) continue;
    readyDatesByBrand.set(brandId, {
      badge: toIso(r.badge_ready_at),
      reviews: toIso(r.reviews_ready_at),
      cai: toIso(r.ca_ready_at),
    });
  }

  // Product status + count per brand — PRODUCTS_COUNT is computed directly from
  // health_brand_products (rather than trusted from table 447) so it works the
  // same way for every brand, whether or not it has an onboarding-portal record.
  const pendingBoardReview = new Set<number>();
  const rejectedByBoard = new Set<number>();
  const approvedProductBrands = new Set<number>(); // has at least one approved product
  const shareThresholdMet = new Set<number>();
  const firstThresholdDate = new Map<number, string>(); // when share threshold was first met
  const productCountByBrand = new Map<number, number>();
  const approvedProductCountByBrand = new Map<number, number>();
  const productShareCountsByBrand = new Map<number, { name: string; count: number }[]>();
  for (const r of productRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    if (brandId == null) continue;
    const name = r.name as string | null;
    const status = r.status as string | null;
    const thresholdMs = r.date_passed_provider_threshold as number | null;
    const storePresenceCount = r.store_presence_count as number | null;

    productCountByBrand.set(brandId, (productCountByBrand.get(brandId) ?? 0) + 1);
    if (storePresenceCount != null) {
      const list = productShareCountsByBrand.get(brandId) ?? [];
      list.push({ name: name ?? "Unnamed product", count: storePresenceCount });
      productShareCountsByBrand.set(brandId, list);
    }
    if (status === "pending_board_review") pendingBoardReview.add(brandId);
    else if (status === "rejected_by_board") rejectedByBoard.add(brandId);
    else {
      approvedProductBrands.add(brandId); // any other status = approved
      approvedProductCountByBrand.set(brandId, (approvedProductCountByBrand.get(brandId) ?? 0) + 1);
    }
    if (typeof thresholdMs === "number") {
      const thresholdIso = new Date(thresholdMs).toISOString();
      shareThresholdMet.add(brandId);
      const prev = firstThresholdDate.get(brandId);
      if (!prev || thresholdIso < prev) {
        firstThresholdDate.set(brandId, thresholdIso);
      }
    }
  }

  // Per-product live-widget status, keyed by product id — same "quant/sticker
  // = badge, qual = reviews, gpt/analysis/gpt_s = CAI" grouping as
  // isTypeLive/implementedByBrand above, just scoped to one product instead
  // of rolled up across the whole brand.
  const widgetLiveByProduct = new Map<number, Record<string, boolean>>();
  for (const r of productWidgetStatusRows as Record<string, unknown>[]) {
    const productId = r.health_brand_product_id as number | null;
    const type = r.presentation_type as string | null;
    if (productId == null || !type) continue;
    const existing = widgetLiveByProduct.get(productId) ?? {};
    existing[type] = !!r.is_live;
    widgetLiveByProduct.set(productId, existing);
  }

  const approvedAssessmentProductIds = new Set<number>();
  for (const r of approvedAssessmentRows as Record<string, unknown>[]) {
    const productId = r.health_brand_product_id as number | null;
    if (productId != null) approvedAssessmentProductIds.add(productId);
  }

  // For each brand, rank its eligible (published, non-discarded, has a URL)
  // products by live-signal tier and keep the best one — the PDP that best
  // demonstrates what's actually live, since different products on the same
  // brand can sit at different levels.
  const pdpTier = (badgeLive: boolean, reviewsLive: boolean, caiLive: boolean) =>
    badgeLive && reviewsLive && caiLive ? 3 : badgeLive && reviewsLive ? 2 : badgeLive || reviewsLive ? 1 : 0;

  const topPdpByBrand = new Map<number, { name: string; url: string; badgeLive: boolean; reviewsLive: boolean; caiLive: boolean }>();
  const pdpCountByBrand = new Map<number, number>();
  for (const r of pdpProductRows as Record<string, unknown>[]) {
    const brandId = r.health_brand_id as number | null;
    const productId = r.id as number | null;
    const url = r.product_page_url as string | null;
    if (brandId == null || productId == null || !url) continue;

    pdpCountByBrand.set(brandId, (pdpCountByBrand.get(brandId) ?? 0) + 1);

    const types = widgetLiveByProduct.get(productId) ?? {};
    const badgeLive = !!(types.quant || types.sticker);
    const reviewsLive = !!types.qual;
    const caiLive = !!(types.gpt || types.analysis || types.gpt_s) && approvedAssessmentProductIds.has(productId);

    const candidate = { name: (r.name as string | null) ?? "Unnamed product", url, badgeLive, reviewsLive, caiLive };
    const existing = topPdpByBrand.get(brandId);
    if (!existing || pdpTier(badgeLive, reviewsLive, caiLive) > pdpTier(existing.badgeLive, existing.reviewsLive, existing.caiLive)) {
      topPdpByBrand.set(brandId, candidate);
    }
  }

  const now = Date.now();

  function hubspotOwnerCheck(hubspotCompanyId: number | null) {
    return hubspotCompanyId != null ? hubspotOwnerChecksByCompanyId.get(hubspotCompanyId) : undefined;
  }

  function closeDateFor(hubspotCompanyId: number | null): string | null {
    return hubspotCompanyId != null ? closeDatesByCompanyId.get(hubspotCompanyId) ?? null : null;
  }

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
      // Lowest-priority fallback on all three: HubSpot's own value, read
      // straight from the CRM, only kicks in when Metabase has nothing —
      // Notion overrides and the onboarding portal still always win.
      // Normalized because these sources disagree on shape — Notion/Metabase
      // tend to hold our internal shortname ("maha") while HubSpot's Owners
      // API returns "firstName lastName" ("Maha Awaisi") — and filtering by
      // shortname needs one consistent form to match against.
      SE_OWNER: normalizeOwnerName(f.SE_OWNER ?? onboarding?.SE_OWNER ?? stg.SE_OWNER ?? hubspotOwnerCheck(stg.HUBSPOT_COMPANY_ID)?.seOwner ?? null),
      OPS_OWNER: normalizeOwnerName(f.OPS_OWNER ?? onboarding?.OPS_OWNER ?? stg.OPS_OWNER ?? hubspotOwnerCheck(stg.HUBSPOT_COMPANY_ID)?.opsOwner ?? null),
      ACCOUNT_MANAGER: normalizeOwnerName(f.ACCOUNT_MANAGER ?? onboarding?.ACCOUNT_MANAGER ?? stg.ACCOUNT_MANAGER ?? hubspotOwnerCheck(stg.HUBSPOT_COMPANY_ID)?.accountManager ?? null),
      BD_REP: f.BD_REP ?? onboarding?.BD_REP ?? null,
      BRAND_CREATED_AT: onboarding?.BRAND_CREATED_AT ?? stg.CREATED_AT,
      ANY_ADMIN_LAST_SIGNED_IN_AT: onboarding?.ANY_ADMIN_LAST_SIGNED_IN_AT ?? null,
      PRODUCTS_COUNT: productCountByBrand.get(brandId) ?? 0,
      PRODUCTS_APPROVED_COUNT: approvedProductCountByBrand.get(brandId) ?? 0,
      PRODUCT_SHARE_COUNTS: productShareCountsByBrand.get(brandId) ?? [],
      REVIEWS_REQUESTED: onboarding?.REVIEWS_REQUESTED ?? 0,
      HAS_REVIEWS_READY: onboarding?.HAS_REVIEWS_READY ?? false,
      CA_REQUESTED: onboarding?.CA_REQUESTED ?? 0,
      HAS_CA_READY: onboarding?.HAS_CA_READY ?? false,
      HAS_PAYMENT_METHOD: onboarding?.HAS_PAYMENT_METHOD ?? false,
      SUBMITTED_TO_MAB: onboarding?.SUBMITTED_TO_MAB ?? false,
      HUBSPOT_COMPANY_ID: stg.HUBSPOT_COMPANY_ID ?? null,
      COLLABORATOR_CODE: f.COLLABORATOR_CODE ?? stg.COLLABORATOR_CODE ?? null,
      KIND: f.KIND ?? stg.KIND ?? null,
      AB_TESTING: f.AB_TESTING === "true",
      AB_TESTING_NOTES: f.AB_TESTING_NOTES ?? null,
      PAYMENT_COMPLETED_AT: null,
      CLOSE_DATE: closeDateFor(stg.HUBSPOT_COMPANY_ID),
      HAS_PENDING_BOARD_REVIEW: pendingBoardReview.has(brandId),
      HAS_REJECTED_BY_BOARD: rejectedByBoard.has(brandId),
      HAS_APPROVED_PRODUCTS: approvedProductBrands.has(brandId),
      HAS_SHARE_THRESHOLD_MET: shareThresholdMet.has(brandId),
      WIDGET_TYPES: Object.keys(widgetStatusByBrand.get(brandId) ?? {}),
      WIDGET_STATUSES: widgetStatusByBrand.get(brandId) ?? {},
      CAI_IMPLEMENTATION_READY: null as "CAI" | "CAS" | null,
      PYLON_SENTIMENT: null as string | null,
      PYLON_LAST_COMMUNICATION_AT: null as string | null,
      PYLON_OPEN_ISSUES_90D: null as number | null,
      PYLON_ACCOUNT_ID: null as string | null,
      RECURLY_STATE: null as string | null,
      RECURLY_PLAN_NAME: null as string | null,
      RECURLY_AMOUNT: null as number | null,
      RECURLY_CURRENCY: null as string | null,
      RECURLY_CURRENT_PERIOD_STARTED_AT: null as string | null,
      RECURLY_CURRENT_PERIOD_ENDS_AT: null as string | null,
      RECURLY_CURRENT_TERM_ENDS_AT: null as string | null,
      RECURLY_AUTO_RENEW: null as boolean | null,
      RECURLY_BILLING_PORTAL_URL: null as string | null,
      TOP_PDP: topPdpByBrand.get(brandId) ?? null,
      PDP_COUNT: pdpCountByBrand.get(brandId) ?? 0,
      ON_REACHOUT_SHEET: false,
      REACHED_OUT: null as boolean | null,
      REACHED_OUT_SEND_LABEL: null as string | null,
      // Overlaid with the form-response sheet's value in app/page.tsx et al —
      // this manual override just means "added by hand," so it's OR'd with
      // (never replaced by) the sheet lookup rather than the sheet's usual
      // override-wins precedence, since removing/re-adding a form row
      // shouldn't be able to silently undo a manual add.
      ON_SE_SPRINT_SHEET: f.ON_SE_SPRINT_SHEET === "true",
      SE_SPRINT_SUBMITTED_AT: null as string | null,
      SE_SPRINT_MYSHOPIFY_URL: null as string | null,
      SE_SPRINT_HAS_SHARED_CODE: null as string | null,
      SE_SPRINT_COLLABORATOR_CODE: null as string | null,
      SE_SPRINT_MYSHOPIFY_URL_OVERRIDE: f.SE_SPRINT_MYSHOPIFY_URL_OVERRIDE || null,
      SE_SPRINT_DISMISSED: f.SE_SPRINT_DISMISSED === "true",
      ONBOARDING_CHANNEL: onboardingChannelByBrand.get(brandId) ?? null,
      REVIEWS_DELIVERED: reviewsDeliveredByBrand.get(brandId) ?? 0,
      BADGE_READY_DATE: readyDatesByBrand.get(brandId)?.badge ?? null,
      REVIEWS_READY_DATE: readyDatesByBrand.get(brandId)?.reviews ?? null,
      CAI_READY_DATE: readyDatesByBrand.get(brandId)?.cai ?? null,
      BADGE_IMPLEMENTED: implementedByBrand.get(brandId)?.badge ?? false,
      REVIEWS_IMPLEMENTED: implementedByBrand.get(brandId)?.reviews ?? false,
      CAI_IMPLEMENTED: implementedByBrand.get(brandId)?.cai ?? false,
      FOLLOWUP_SNOOZE_UNTIL: f.FOLLOWUP_SNOOZE_UNTIL || null,
      FOLLOWUPS_DISABLED: f.FOLLOWUPS_DISABLED === "true",
      WEEKLY_FOCUS_PINNED: f.WEEKLY_FOCUS_PINNED === "true",
      WEEKLY_FOCUS_DISMISSED_WEEK: f.WEEKLY_FOCUS_DISMISSED_WEEK || null,
      WEEKLY_FOCUS_DONE_WEEK: f.WEEKLY_FOCUS_DONE_WEEK || null,
    };

    // Churned = app-side discarded_at only (soft-deleted on health_brands).
    // HubSpot's churn_date was previously combined in here too, but its
    // churn_date is keyed off HUBSPOT_COMPANY_ID, and a brand's linked
    // company can go stale (e.g. pointing at an old churned deal after a
    // brand re-signs under a new HubSpot company record) — see the Mars Men
    // false-positive. discarded_at is the source of truth for whether the
    // brand itself is actually active.
    const churnedAt = appDiscardedAtByBrand.get(brandId) ?? null;

    const computedStatus = computePipelineStatus(
      brandWithExtra,
      brandHasLiveWidget.has(brandId),
      brandHasWidgetHistory.has(brandId),
      churnedAt != null
    );
    const pipelineStatus = override?.status ?? computedStatus;
    if (!pipelineStatus) return null; // excluded from board
    // Use the override's changedAt if set; otherwise use stage-appropriate data timestamps.
    // Falling back to BRAND_CREATED_AT is wrong — a brand can be months old but just entered a stage.
    let statusEnteredAt: number;
    if (override?.changedAt) {
      statusEnteredAt = new Date(override.changedAt).getTime();
    } else if (pipelineStatus === "churned") {
      // "Churned" since the earlier of discarded_at / HubSpot churn_date
      statusEnteredAt = churnedAt ? new Date(churnedAt).getTime() : now;
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

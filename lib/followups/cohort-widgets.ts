import { queryGrafanaPostgres } from "@/lib/metabase";

// Per-brand, per-widget readiness + live status for the three snippets the
// cohort follow-ups care about. Read straight from the app's Postgres via
// Grafana (same source/rules as detect.ts), so it stays accurate and doesn't
// depend on the Metabase pipeline.
//   Reviews  ready = a shared review exists; live = qual widget viewed & active
//   Badge    ready = a product crossed the provider threshold at >=100 stores;
//                    live = quant/sticker widget viewed & active
//   CAI      ready = an approved product_assessment exists (caiApproved);
//                    live = gpt/analysis/gpt_s widget viewed & active
export interface WidgetStatus {
  reviewsReady: boolean;
  reviewsLive: boolean;
  badgeReady: boolean;
  badgeLive: boolean;
  caiApproved: boolean;
  caiLive: boolean;
}

export async function detectCohortWidgetStatus(
  brandIds: number[]
): Promise<Map<number, WidgetStatus>> {
  const map = new Map<number, WidgetStatus>();
  if (brandIds.length === 0) return map;
  const ids = brandIds.filter((n) => Number.isInteger(n)).join(",");

  const rows = (await queryGrafanaPostgres(`
    with badge_ready as (
      select health_brand_id as bid from health_brand_products
      where discarded_at is null and store_presence_count >= 100 and date_passed_provider_threshold is not null
      group by 1
    ),
    reviews_ready as (
      select hbp.health_brand_id as bid from notes n
      join health_brand_products hbp on hbp.id = n.health_brand_product_id
      where n.share_with_brands and hbp.discarded_at is null group by 1
    ),
    cai_appr as (
      select hbp.health_brand_id as bid, bool_or(pa.approved) as ok from product_assessments pa
      join health_brand_products hbp on hbp.id = pa.health_brand_product_id
      where hbp.discarded_at is null group by 1
    ),
    live as (
      select health_brand_id as bid,
        bool_or(presentation_type in ('quant','sticker') and first_view_date is not null and last_view_date is null) as badge_live,
        bool_or(presentation_type = 'qual'               and first_view_date is not null and last_view_date is null) as reviews_live,
        bool_or(presentation_type in ('gpt','analysis','gpt_s') and first_view_date is not null and last_view_date is null) as cai_live
      from widgets where discarded_at is null group by 1
    )
    select hb.id as brand_id,
      (rr.bid is not null) as reviews_ready,
      (br.bid is not null) as badge_ready,
      coalesce(ca.ok,false) as cai_approved,
      coalesce(l.reviews_live,false) as reviews_live,
      coalesce(l.badge_live,false)   as badge_live,
      coalesce(l.cai_live,false)     as cai_live
    from health_brands hb
    left join reviews_ready rr on rr.bid = hb.id
    left join badge_ready   br on br.bid = hb.id
    left join cai_appr      ca on ca.bid = hb.id
    left join live          l  on l.bid  = hb.id
    where hb.id in (${ids})
  `)) as Record<string, unknown>[];

  for (const r of rows) {
    map.set(r.brand_id as number, {
      reviewsReady: !!r.reviews_ready,
      reviewsLive: !!r.reviews_live,
      badgeReady: !!r.badge_ready,
      badgeLive: !!r.badge_live,
      caiApproved: !!r.cai_approved,
      caiLive: !!r.cai_live,
    });
  }
  return map;
}

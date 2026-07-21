import { queryGrafanaPostgres } from "@/lib/metabase";

// The three code snippets we follow up on. Keys are stable; labels are the
// customer-facing words dropped into the "[variable]" slot of each template.
export type Snippet = "badge" | "reviews" | "ca";

export const SNIPPET_LABEL: Record<Snippet, string> = {
  badge: "Badge",
  reviews: "Reviews",
  ca: "Clinician Analysis",
};

export const SNIPPETS: Snippet[] = ["badge", "reviews", "ca"];

export interface SnippetStatus {
  ready: boolean; // the "sent" condition is met (see rules below)
  live: boolean; // brand is live on this snippet's widget type(s)
  readyDate: string | null; // warehouse timestamp the "ready" condition was first met (ISO), if known
}

export interface BrandSnippetStatus {
  brandId: number;
  brandName: string;
  snippets: Record<Snippet, SnippetStatus>;
}

// Per-brand, per-snippet "ready" (sent) + "live" status, straight from the
// FrontRow app's Postgres via Grafana. "Ready"/sent rules, confirmed with
// Naumaan (see the followups design memory):
//   Badge   → a product with store_presence_count >= 100 AND a provider-threshold
//             crossing date set. The threshold is moving to 100 going forward, so
//             this only fires for brands crossing from that point on (historical
//             brands crossed at ~50 and are intentionally excluded — but the
//             store_presence_count >= 100 guard already handles that).
//   Reviews → a review (notes row) with share_with_brands = true.
//   CA      → an approved product_assessment.
// "Live" mirrors lib/metabase.ts: a non-discarded widget row of the snippet's
// presentation type(s) with first_view_date set and last_view_date null.
export async function detectSnippetStatus(): Promise<BrandSnippetStatus[]> {
  const rows = (await queryGrafanaPostgres(`
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
      select hbp.health_brand_id as bid, min(pa.updated_at) as ready_at
      from product_assessments pa join health_brand_products hbp on hbp.id = pa.health_brand_product_id
      where pa.approved and hbp.discarded_at is null
      group by 1
    ),
    live as (
      select health_brand_id as bid,
        bool_or(presentation_type in ('quant','sticker') and first_view_date is not null and last_view_date is null) as badge_live,
        bool_or(presentation_type = 'qual'              and first_view_date is not null and last_view_date is null) as reviews_live,
        bool_or(presentation_type in ('analysis','gpt','gpt_s') and first_view_date is not null and last_view_date is null) as ca_live
      from widgets where discarded_at is null group by 1
    ),
    base as (select id as bid, name from health_brands where is_partner and discarded_at is null)
    select
      base.bid as brand_id,
      base.name as brand_name,
      (badge.bid is not null)   as badge_ready,
      (reviews.bid is not null) as reviews_ready,
      (ca.bid is not null)      as ca_ready,
      badge.ready_at   as badge_ready_at,
      reviews.ready_at as reviews_ready_at,
      ca.ready_at      as ca_ready_at,
      coalesce(l.badge_live,false)   as badge_live,
      coalesce(l.reviews_live,false) as reviews_live,
      coalesce(l.ca_live,false)      as ca_live
    from base
      left join badge   on badge.bid = base.bid
      left join reviews on reviews.bid = base.bid
      left join ca      on ca.bid = base.bid
      left join live l  on l.bid = base.bid
    where badge.bid is not null or reviews.bid is not null or ca.bid is not null
  `)) as Record<string, unknown>[];

  // Grafana's Postgres datasource returns timestamps as epoch ms.
  const toIso = (v: unknown): string | null => (typeof v === "number" ? new Date(v).toISOString() : null);

  return rows.map((r) => ({
    brandId: r.brand_id as number,
    brandName: (r.brand_name as string) ?? `Brand ${r.brand_id}`,
    snippets: {
      badge: { ready: !!r.badge_ready, live: !!r.badge_live, readyDate: toIso(r.badge_ready_at) },
      reviews: { ready: !!r.reviews_ready, live: !!r.reviews_live, readyDate: toIso(r.reviews_ready_at) },
      ca: { ready: !!r.ca_ready, live: !!r.ca_live, readyDate: toIso(r.ca_ready_at) },
    },
  }));
}

import { getBrands } from "@/lib/metabase";
import { getPylonAccountDataByHubspotId } from "@/lib/pylon-sentiment";
import AnalyticsView from "@/components/AnalyticsView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, pylonDataByHubspotId] = await Promise.all([
    getBrands(),
    getPylonAccountDataByHubspotId().catch((e) => { console.error("getPylonAccountDataByHubspotId failed:", e); return new Map(); }),
  ]);

  const enriched = brands.map((b) => {
    const pylon = b.HUBSPOT_COMPANY_ID != null ? pylonDataByHubspotId.get(String(b.HUBSPOT_COMPANY_ID)) : undefined;
    return { ...b, PYLON_SENTIMENT: pylon?.sentiment ?? null };
  });

  return <AnalyticsView initialBrands={enriched} />;
}

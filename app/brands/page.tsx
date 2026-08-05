import { getBrands } from "@/lib/metabase";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import { getReachouts, buildReachoutLookup } from "@/lib/reachouts-sheet";
import AllBrandsPage from "@/components/AllBrandsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, caiEntries, reachoutEntries] = await Promise.all([getBrands(), getCaiReadyBrands(), getReachouts()]);
  const caiLookup = buildCaiLookup(caiEntries);
  const reachoutLookup = buildReachoutLookup(reachoutEntries);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const enriched = brands.map((b) => {
    const reachout = reachoutLookup.get(normalize(b.BRAND_NAME));
    return {
      ...b,
      CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
      REACHED_OUT: reachout?.emailed ?? null,
      REACHED_OUT_SEND_LABEL: reachout?.sendLabel ?? null,
    };
  });
  return <AllBrandsPage initialBrands={enriched} />;
}

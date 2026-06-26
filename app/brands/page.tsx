import { getBrands } from "@/lib/metabase";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import AllBrandsPage from "@/components/AllBrandsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, caiEntries] = await Promise.all([getBrands(), getCaiReadyBrands()]);
  const caiLookup = buildCaiLookup(caiEntries);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const enriched = brands.map((b) => ({
    ...b,
    CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
  }));
  return <AllBrandsPage initialBrands={enriched} />;
}

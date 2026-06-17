import { getBrands } from "@/lib/metabase";
import AllBrandsPage from "@/components/AllBrandsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const brands = await getBrands();
  return <AllBrandsPage initialBrands={brands} />;
}

import { getBrands } from "@/lib/metabase";
import AllBrandsPage from "@/components/AllBrandsPage";

export const revalidate = 300;

export default async function Page() {
  const brands = await getBrands();
  return <AllBrandsPage initialBrands={brands} />;
}

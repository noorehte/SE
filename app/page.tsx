import { getBrands } from "@/lib/metabase";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const brands = await getBrands();
  return <Dashboard initialBrands={brands} />;
}

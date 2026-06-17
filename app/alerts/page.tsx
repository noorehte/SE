import { getBrands } from "@/lib/metabase";
import AlertsPage from "@/components/AlertsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const brands = await getBrands();
  return <AlertsPage initialBrands={brands} />;
}

import { getBrands } from "@/lib/metabase";
import AlertsPage from "@/components/AlertsPage";

export const revalidate = 300;

export default async function Page() {
  const brands = await getBrands();
  return <AlertsPage initialBrands={brands} />;
}

import { getBrands } from "@/lib/metabase";
import { getAllScheduled } from "@/lib/scheduled-calls";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [brands, scheduledCalls] = await Promise.all([
    getBrands(),
    Promise.resolve(getAllScheduled()),
  ]);
  return <Dashboard initialBrands={brands} initialScheduledCalls={scheduledCalls} />;
}

import { getBrands } from "@/lib/metabase";
import { getAllScheduled } from "@/lib/scheduled-calls";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [brands, scheduledCalls, caiEntries] = await Promise.all([
    getBrands(),
    Promise.resolve(getAllScheduled()),
    getCaiReadyBrands(),
  ]);

  const caiLookup = buildCaiLookup(caiEntries);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const enrichedBrands = brands.map((b) => ({
    ...b,
    CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
  }));

  return <Dashboard initialBrands={enrichedBrands} initialScheduledCalls={scheduledCalls} />;
}

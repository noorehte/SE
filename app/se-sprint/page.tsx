import { getBrands } from "@/lib/metabase";
import { getSeSprintEntries, buildSeSprintLookup } from "@/lib/se-sprint-sheet";
import SeSprintPage from "@/components/SeSprintPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, seSprintEntries] = await Promise.all([getBrands(), getSeSprintEntries()]);
  const seSprintLookup = buildSeSprintLookup(seSprintEntries);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const enriched = brands.map((b) => {
    const seSprint = seSprintLookup.get(normalize(b.BRAND_NAME));
    return {
      ...b,
      ON_SE_SPRINT_SHEET: b.ON_SE_SPRINT_SHEET || seSprint != null,
      SE_SPRINT_SUBMITTED_AT: seSprint?.timestamp ?? null,
      SE_SPRINT_MYSHOPIFY_URL: seSprint?.myshopifyUrl ?? null,
      SE_SPRINT_HAS_SHARED_CODE: seSprint?.hasSharedCode ?? null,
    };
  });
  return <SeSprintPage initialBrands={enriched} />;
}

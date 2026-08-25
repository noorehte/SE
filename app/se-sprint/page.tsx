import { getBrands } from "@/lib/metabase";
import { getSeSprintEntries, buildSeSprintLookup, SeSprintEntry } from "@/lib/se-sprint-sheet";
import SeSprintPage from "@/components/SeSprintPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, seSprintEntries] = await Promise.all([getBrands(), getSeSprintEntries()]);
  const seSprintLookup = buildSeSprintLookup(seSprintEntries);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  // The full form response (every question asked) is kept keyed by brand ID
  // here rather than flattened onto Brand — Brand only carries the handful
  // of summary fields other pages need for badges/filters; the rest of the
  // form is specific to this page's expanded row view.
  const entriesByBrandId: Record<number, SeSprintEntry> = {};
  const enriched = brands.map((b) => {
    const seSprint = seSprintLookup.get(normalize(b.BRAND_NAME));
    if (seSprint) entriesByBrandId[b.BRAND_ID] = seSprint;
    return {
      ...b,
      ON_SE_SPRINT_SHEET: b.ON_SE_SPRINT_SHEET || seSprint != null,
      SE_SPRINT_SUBMITTED_AT: seSprint?.timestamp ?? null,
      SE_SPRINT_MYSHOPIFY_URL: seSprint?.myshopifyUrl ?? null,
      SE_SPRINT_HAS_SHARED_CODE: seSprint?.hasSharedCode ?? null,
      SE_SPRINT_COLLABORATOR_CODE: seSprint?.collaboratorCode ?? null,
    };
  });
  return <SeSprintPage initialBrands={enriched} entriesByBrandId={entriesByBrandId} />;
}

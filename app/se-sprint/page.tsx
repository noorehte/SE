import { getBrands } from "@/lib/get-brands";
import { getSeSprintEntries, buildSeSprintLookup, SeSprintEntry } from "@/lib/se-sprint-sheet";
import { getPylonAccountDataByHubspotId } from "@/lib/pylon-sentiment";
import WeeklyFocusPage from "@/components/SeSprintPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, seSprintEntries, pylonDataByHubspotId] = await Promise.all([
    getBrands(),
    getSeSprintEntries(),
    getPylonAccountDataByHubspotId().catch((e) => { console.error("getPylonAccountDataByHubspotId failed:", e); return new Map(); }),
  ]);
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
    const pylon = b.HUBSPOT_COMPANY_ID != null ? pylonDataByHubspotId.get(String(b.HUBSPOT_COMPANY_ID)) : undefined;
    return {
      ...b,
      ON_SE_SPRINT_SHEET: !b.SE_SPRINT_DISMISSED && (b.ON_SE_SPRINT_SHEET || seSprint != null),
      SE_SPRINT_SUBMITTED_AT: seSprint?.timestamp ?? null,
      SE_SPRINT_MYSHOPIFY_URL: b.SE_SPRINT_MYSHOPIFY_URL_OVERRIDE ?? seSprint?.myshopifyUrl ?? null,
      SE_SPRINT_HAS_SHARED_CODE: seSprint?.hasSharedCode ?? null,
      SE_SPRINT_COLLABORATOR_CODE: seSprint?.collaboratorCode ?? null,
      PYLON_SENTIMENT: pylon?.sentiment ?? null,
      PYLON_LAST_COMMUNICATION_AT: pylon?.lastActivityAt ?? null,
      PYLON_OPEN_ISSUES_90D: pylon?.openIssues90d ?? null,
    };
  });
  return <WeeklyFocusPage initialBrands={enriched} entriesByBrandId={entriesByBrandId} />;
}

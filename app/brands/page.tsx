import { getBrands } from "@/lib/metabase";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import { getReachouts, buildReachoutLookup } from "@/lib/reachouts-sheet";
import { getSeSprintEntries, buildSeSprintLookup } from "@/lib/se-sprint-sheet";
import AllBrandsPage from "@/components/AllBrandsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [brands, caiEntries, reachoutEntries, seSprintEntries] = await Promise.all([getBrands(), getCaiReadyBrands(), getReachouts(), getSeSprintEntries()]);
  const caiLookup = buildCaiLookup(caiEntries);
  const reachoutLookup = buildReachoutLookup(reachoutEntries);
  const seSprintLookup = buildSeSprintLookup(seSprintEntries);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const enriched = brands.map((b) => {
    const reachout = reachoutLookup.get(normalize(b.BRAND_NAME));
    const seSprint = seSprintLookup.get(normalize(b.BRAND_NAME));
    return {
      ...b,
      CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
      ON_REACHOUT_SHEET: reachout != null,
      REACHED_OUT: reachout?.emailed ?? null,
      REACHED_OUT_SEND_LABEL: reachout?.sendLabel ?? null,
      ON_SE_SPRINT_SHEET: b.ON_SE_SPRINT_SHEET || seSprint != null,
      SE_SPRINT_SUBMITTED_AT: seSprint?.timestamp ?? null,
      SE_SPRINT_MYSHOPIFY_URL: seSprint?.myshopifyUrl ?? null,
      SE_SPRINT_HAS_SHARED_CODE: seSprint?.hasSharedCode ?? null,
      SE_SPRINT_COLLABORATOR_CODE: seSprint?.collaboratorCode ?? null,
    };
  });
  return <AllBrandsPage initialBrands={enriched} />;
}

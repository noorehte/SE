import { type Brand } from "@/lib/metabase";
import { getBrands } from "@/lib/get-brands";
import { buildTrackerRows } from "@/lib/followups/tracker";
import FollowupTracker from "@/components/FollowupTracker";

export const dynamic = "force-dynamic";

export default async function Page() {
  // The cohort is a static allowlist, so the board can render from cohort +
  // follow-up state alone. getBrands() only enriches live/disabled/snooze
  // status; if that heavy pipeline fails, degrade gracefully rather than 500.
  let brands: Brand[] = [];
  let liveDataOk = true;
  try {
    brands = await getBrands();
  } catch (e) {
    console.error("[followups] getBrands failed — rendering cohort without live enrichment:", e);
    liveDataOk = false;
  }
  const rows = await buildTrackerRows(brands);
  return <FollowupTracker rows={rows} liveDataOk={liveDataOk} />;
}

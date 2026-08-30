import { setOverride, clearOverride } from "@/lib/overrides";
import { PipelineStatus } from "@/lib/metabase";
import { invalidateBrandsCache } from "@/lib/get-brands";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { brandId, status } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  try {
    if (status === null) {
      await clearOverride(brandId);
    } else {
      await setOverride(brandId, status as PipelineStatus);
    }
  } catch (e) {
    // Previously an unhandled throw here (e.g. a Notion write failing because
    // a property the code expects doesn't exist on the live database) surfaced
    // as an empty-body 500 with no detail, and the client never checked the
    // response anyway — so a drag-and-drop status move could silently fail to
    // persist with zero indication to the user. Always return a real error body.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // So the next getBrands() call (e.g. clicking Refresh) reflects this move
  // immediately instead of waiting out the cache's TTL.
  await invalidateBrandsCache().catch(() => {});
  return NextResponse.json({ ok: true });
}

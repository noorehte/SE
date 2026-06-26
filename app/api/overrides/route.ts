import { setOverride, clearOverride } from "@/lib/overrides";
import { PipelineStatus } from "@/lib/metabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { brandId, status } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  if (status === null) {
    await clearOverride(brandId);
  } else {
    await setOverride(brandId, status as PipelineStatus);
  }

  return NextResponse.json({ ok: true });
}

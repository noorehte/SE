import { setFieldOverride } from "@/lib/overrides";
import { updateCompanyField } from "@/lib/hubspot";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { brandId, field, value, hubspotCompanyId } = await req.json();
  if (!brandId || !field) return NextResponse.json({ error: "brandId and field required" }, { status: 400 });

  // Save to Notion and write to HubSpot in parallel
  await Promise.all([
    setFieldOverride(brandId, field, value ?? ""),
    hubspotCompanyId ? updateCompanyField(hubspotCompanyId, field, value ?? "") : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}

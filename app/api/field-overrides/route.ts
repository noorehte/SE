import { setFieldOverride } from "@/lib/overrides";
import { updateCompanyField } from "@/lib/hubspot";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { brandId, field, value, hubspotCompanyId } = await req.json();
  if (!brandId || !field) return NextResponse.json({ error: "brandId and field required" }, { status: 400 });

  const errors: string[] = [];
  await Promise.all([
    setFieldOverride(brandId, field, value ?? "").catch((e) => { errors.push(`Notion: ${e.message}`); }),
    hubspotCompanyId
      ? updateCompanyField(hubspotCompanyId, field, value ?? "").catch((e) => { errors.push(`HubSpot: ${e.message}`); })
      : Promise.resolve(),
  ]);

  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 500 });
  return NextResponse.json({ ok: true });
}

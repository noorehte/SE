import { setFieldOverride } from "@/lib/overrides";
import { updateCompanyField } from "@/lib/hubspot";
import { invalidateBrandsCache } from "@/lib/get-brands";
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
  // So the next getBrands() call (e.g. clicking Refresh) reflects this write
  // immediately instead of waiting out the cache's TTL.
  await invalidateBrandsCache().catch(() => {});
  return NextResponse.json({ ok: true });
}

import { getBrands } from "@/lib/metabase";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [brands, caiEntries] = await Promise.all([getBrands(), getCaiReadyBrands()]);
    const caiLookup = buildCaiLookup(caiEntries);
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const enriched = brands.map((b) => ({
      ...b,
      CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
    }));
    return NextResponse.json(enriched);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
  }
}

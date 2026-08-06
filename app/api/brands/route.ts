import { getBrands } from "@/lib/metabase";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import { getReachouts, buildReachoutLookup } from "@/lib/reachouts-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [brands, caiEntries, reachoutEntries] = await Promise.all([getBrands(), getCaiReadyBrands(), getReachouts()]);
    const caiLookup = buildCaiLookup(caiEntries);
    const reachoutLookup = buildReachoutLookup(reachoutEntries);
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const enriched = brands.map((b) => {
      const reachout = reachoutLookup.get(normalize(b.BRAND_NAME));
      return {
        ...b,
        CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
        ON_REACHOUT_SHEET: reachout != null,
        REACHED_OUT: reachout?.emailed ?? null,
        REACHED_OUT_SEND_LABEL: reachout?.sendLabel ?? null,
      };
    });
    return NextResponse.json(enriched);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
  }
}

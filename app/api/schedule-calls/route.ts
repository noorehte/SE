import { NextRequest, NextResponse } from "next/server";
import { getBrands } from "@/lib/metabase";
import { scheduleCall } from "@/lib/calendar";
import { addToWebinarSheet } from "@/lib/webinar-sheet";
import { isScheduled, markScheduled, getAllScheduled } from "@/lib/scheduled-calls";

export const dynamic = "force-dynamic";

// strategic + vip → 1:1 call via Google Script
// everything else (mid_market, enterprise, null) → webinar sheet for Mohammad
const CALL_TIERS = new Set(["strategic", "vip"]);

// ─── Cron GET ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(getAllScheduled());
  }

  return runScheduling([]);
}

// ─── Manual POST ──────────────────────────────────────────────────────────────
// Body: { brandId: number }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const brandId: number | undefined = body.brandId;

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  return runScheduling([brandId]);
}

// ─── Core logic ───────────────────────────────────────────────────────────────
async function runScheduling(onlyBrandIds: number[]) {
  const brands = await getBrands();

  const candidates =
    onlyBrandIds.length > 0
      ? brands.filter((b) => onlyBrandIds.includes(b.BRAND_ID))
      : brands.filter(
          (b) => b.PIPELINE_STATUS === "just_signed" && !isScheduled(b.BRAND_ID)
        );

  const results: {
    brandId: number;
    brandName: string;
    action: "call" | "webinar_sheet";
    success: boolean;
    callDate?: string;
    error?: string;
  }[] = [];

  for (const brand of candidates) {
    const tier = brand.KIND?.toLowerCase() ?? null;
    const isCallTier = tier !== null && CALL_TIERS.has(tier);

    if (isCallTier) {
      // ── Schedule 1:1 call ────────────────────────────────────────────────
      if (!brand.SE_OWNER) {
        results.push({ brandId: brand.BRAND_ID, brandName: brand.BRAND_NAME, action: "call", success: false, error: "No SE owner assigned" });
        continue;
      }

      const result = await scheduleCall(brand.SE_OWNER, brand.BRAND_NAME);

      if (result.success) {
        markScheduled(brand.BRAND_ID, brand.BRAND_NAME, brand.SE_OWNER, result.scheduledDate ?? "");
      }

      results.push({
        brandId: brand.BRAND_ID,
        brandName: brand.BRAND_NAME,
        action: "call",
        success: result.success,
        callDate: result.scheduledDate,
        error: result.error,
      });
    } else {
      // ── Add to webinar sheet ─────────────────────────────────────────────
      const result = await addToWebinarSheet(
        brand.BRAND_NAME,
        brand.SE_OWNER ?? "Unassigned",
        brand.KIND
      );

      if (result.success) {
        markScheduled(brand.BRAND_ID, brand.BRAND_NAME, brand.SE_OWNER ?? "", `webinar_sheet:${new Date().toISOString()}`);
      }

      results.push({
        brandId: brand.BRAND_ID,
        brandName: brand.BRAND_NAME,
        action: "webinar_sheet",
        success: result.success,
        error: result.error,
      });
    }
  }

  return NextResponse.json({
    scheduled: results.filter((r) => r.success).length,
    total: results.length,
    results,
  });
}

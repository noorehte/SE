import { NextRequest, NextResponse } from "next/server";
import { getBrands } from "@/lib/metabase";
import { scheduleCall } from "@/lib/calendar";
import { isScheduled, markScheduled, getAllScheduled } from "@/lib/scheduled-calls";

export const dynamic = "force-dynamic";

const WEEKS_OUT = 4;

// ─── Cron GET ─────────────────────────────────────────────────────────────────
// Called daily by the Vercel cron job (GET /api/schedule-calls).
// Vercel automatically injects Authorization: Bearer <CRON_SECRET>.
// Without a valid secret it falls back to returning the schedule log (read-only).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(getAllScheduled());
  }

  return runScheduling([]);
}

// ─── Manual POST ──────────────────────────────────────────────────────────────
// Called from BrandDetailPanel's "Schedule Call" button.
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
    success: boolean;
    callDate?: string;
    error?: string;
  }[] = [];

  for (const brand of candidates) {
    if (!brand.SE_OWNER) {
      results.push({
        brandId: brand.BRAND_ID,
        brandName: brand.BRAND_NAME,
        success: false,
        error: "No SE owner assigned",
      });
      continue;
    }

    const signedAt = new Date(brand.BRAND_CREATED_AT);
    const callDate = new Date(signedAt);
    callDate.setDate(callDate.getDate() + WEEKS_OUT * 7);

    const result = await scheduleCall(brand.SE_OWNER, brand.BRAND_NAME, callDate);

    if (result.success) {
      markScheduled(brand.BRAND_ID, brand.BRAND_NAME, brand.SE_OWNER, callDate);
    }

    results.push({
      brandId: brand.BRAND_ID,
      brandName: brand.BRAND_NAME,
      success: result.success,
      callDate: callDate.toISOString(),
      error: result.error,
    });
  }

  return NextResponse.json({
    scheduled: results.filter((r) => r.success).length,
    total: results.length,
    results,
  });
}

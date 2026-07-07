import { NextRequest, NextResponse } from "next/server";
import { getBrands } from "@/lib/metabase";
import { scheduleCall } from "@/lib/calendar";
import { addToWebinarSheet } from "@/lib/webinar-sheet";
import { isScheduled, markScheduled, getAllScheduled } from "@/lib/scheduled-calls";
import { getCompanyContactEmails, isCompanyClosedWon } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

// strategic + vip → 1:1 call via Google Script
// everything else (mid_market, enterprise, null) → webinar sheet for Mohammad
const CALL_TIERS = new Set(["strategic", "vip"]);

// ─── Cron GET ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(await getAllScheduled().catch(() => ({})));
  }

  return runScheduling([]);
}

// ─── Manual POST ──────────────────────────────────────────────────────────────
// Body: { brandId: number, action?: "call" | "webinar" }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const brandId: number | undefined = body.brandId;
  const action: "call" | "webinar" | undefined = body.action;

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  return runScheduling([brandId], action, true);
}

// ─── Core logic ───────────────────────────────────────────────────────────────
async function runScheduling(onlyBrandIds: number[], forceAction?: "call" | "webinar", checkClosedWon = false) {
  const brands = await getBrands();

  const candidates =
    onlyBrandIds.length > 0
      ? brands.filter((b) => onlyBrandIds.includes(b.BRAND_ID))
      : await Promise.all(brands.map(async (b) => ({ brand: b, skip: b.PIPELINE_STATUS !== "products_approved_needs_call" || await isScheduled(b.BRAND_ID) }))).then(results => results.filter(r => !r.skip).map(r => r.brand));

  // Only check closed-won status on manual button press, not cron
  let wonCandidates = candidates;
  if (checkClosedWon) {
    const wonChecks = await Promise.all(
      candidates.map(async (b) => ({
        brand: b,
        isWon: b.HUBSPOT_COMPANY_ID ? await isCompanyClosedWon(b.HUBSPOT_COMPANY_ID) : true,
      }))
    );
    wonCandidates = wonChecks.filter((r) => r.isWon).map((r) => r.brand);
  }

  const results: {
    brandId: number;
    brandName: string;
    action: "call" | "webinar_sheet";
    success: boolean;
    callDate?: string;
    error?: string;
    authUrl?: string;
  }[] = [];

  for (const brand of wonCandidates) {
    const tier = brand.KIND?.toLowerCase() ?? null;
    const isCallTier = forceAction !== "webinar" && (forceAction === "call" || (tier !== null && CALL_TIERS.has(tier)));

    if (isCallTier) {
      // ── Schedule 1:1 call ────────────────────────────────────────────────
      if (!brand.SE_OWNER) {
        results.push({ brandId: brand.BRAND_ID, brandName: brand.BRAND_NAME, action: "call", success: false, error: "No SE owner assigned" });
        continue;
      }

      const contactEmails = brand.HUBSPOT_COMPANY_ID
        ? await getCompanyContactEmails(brand.HUBSPOT_COMPANY_ID)
        : [];
      const result = await scheduleCall(brand.SE_OWNER, brand.BRAND_NAME, contactEmails, tier);

      if (result.success) {
        await markScheduled(brand.BRAND_ID, brand.BRAND_NAME, brand.SE_OWNER, result.scheduledDate ?? "", "call").catch(() => {});
      }

      results.push({
        brandId: brand.BRAND_ID,
        brandName: brand.BRAND_NAME,
        action: "call",
        success: result.success,
        callDate: result.scheduledDate,
        error: result.error,
        authUrl: result.authUrl,
      });
    } else {
      // ── Add to webinar sheet ─────────────────────────────────────────────
      const result = await addToWebinarSheet(
        brand.BRAND_NAME,
        brand.SE_OWNER ?? "Unassigned",
        brand.KIND
      );

      if (result.success) {
        await markScheduled(brand.BRAND_ID, brand.BRAND_NAME, brand.SE_OWNER ?? "", new Date().toISOString(), "webinar_sheet").catch(() => {});
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

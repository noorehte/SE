import { NextRequest, NextResponse } from "next/server";
import { getBrands } from "@/lib/get-brands";
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

  // The daily cron only auto-schedules 1:1 calls (calendar event + draft email)
  // for strategic/VIP brands as soon as their products are approved. Other
  // tiers are intentionally left out of the automatic run — auto-adding them
  // to the webinar sheet was disabled earlier after it silently queued up a
  // large batch of brands at once. Those still go through the "Add to Webinar
  // List" button in the dashboard, by hand.
  return runScheduling([], undefined, false, CALL_TIERS);
}

// ─── Manual POST ──────────────────────────────────────────────────────────────
// Body: { brandId: number, action?: "call" | "webinar", scheduleAs?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const brandId: number | undefined = body.brandId;
  const action: "call" | "webinar" | undefined = body.action;
  // Whoever is clicking the button can schedule the call on their own calendar
  // instead of the brand's assigned SE_OWNER — e.g. Mohammad has oversight
  // across all accounts but isn't the SE on most of them.
  const scheduleAs: string | undefined = body.scheduleAs || undefined;

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  return runScheduling([brandId], action, true, undefined, scheduleAs);
}

// ─── Core logic ───────────────────────────────────────────────────────────────
async function runScheduling(
  onlyBrandIds: number[],
  forceAction?: "call" | "webinar",
  checkClosedWon = false,
  restrictToTiers?: Set<string>,
  scheduleAs?: string
) {
  const brands = await getBrands();

  let candidates =
    onlyBrandIds.length > 0
      ? brands.filter((b) => onlyBrandIds.includes(b.BRAND_ID))
      : await Promise.all(brands.map(async (b) => ({ brand: b, skip: b.PIPELINE_STATUS !== "products_approved_needs_call" || await isScheduled(b.BRAND_ID) }))).then(results => results.filter(r => !r.skip).map(r => r.brand));

  if (restrictToTiers) {
    candidates = candidates.filter((b) => {
      const tier = b.KIND?.toLowerCase() ?? null;
      return tier !== null && restrictToTiers.has(tier);
    });
  }

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
    draftWarning?: string;
  }[] = [];

  for (const brand of wonCandidates) {
    const tier = brand.KIND?.toLowerCase() ?? null;
    const isCallTier = forceAction !== "webinar" && (forceAction === "call" || (tier !== null && CALL_TIERS.has(tier)));

    if (isCallTier) {
      // ── Schedule 1:1 call ────────────────────────────────────────────────
      // scheduleAs (set on manual, single-brand requests only) overrides whose
      // calendar/Gmail the call goes on; otherwise falls back to the brand's
      // assigned SE_OWNER, same as before.
      const seForCall = scheduleAs ?? brand.SE_OWNER;
      if (!seForCall) {
        results.push({ brandId: brand.BRAND_ID, brandName: brand.BRAND_NAME, action: "call", success: false, error: "No SE owner assigned" });
        continue;
      }

      const contactEmails = brand.HUBSPOT_COMPANY_ID
        ? await getCompanyContactEmails(brand.HUBSPOT_COMPANY_ID)
        : [];
      const result = await scheduleCall(seForCall, brand.BRAND_NAME, contactEmails, tier);

      if (result.success) {
        await markScheduled(brand.BRAND_ID, brand.BRAND_NAME, seForCall, result.scheduledDate ?? "", "call").catch(() => {});
      }

      results.push({
        brandId: brand.BRAND_ID,
        brandName: brand.BRAND_NAME,
        action: "call",
        success: result.success,
        callDate: result.scheduledDate,
        error: result.error,
        authUrl: result.authUrl,
        draftWarning: result.draftWarning,
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

import { NextRequest, NextResponse } from "next/server";
import { runFollowups } from "@/lib/followups/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Cron GET ───────────────────────────────────────────────────────────────
// Vercel cron hits this each morning with `Authorization: Bearer $CRON_SECRET`.
// Authorized → run for real (create/append Pylon tickets). Unauthorized (or no
// secret configured) → return a safe dry-run preview, never mutating anything.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  // Primary: match the Bearer token Vercel attaches from CRON_SECRET. Trim both
  // sides — a stray newline/space in the env value otherwise breaks strict ===.
  const secretMatches = cronSecret ? auth.trim() === `Bearer ${cronSecret.trim()}` : false;
  // Fallback: genuine Vercel cron invocations carry this User-Agent. Vercel has a
  // known issue where the Authorization header sometimes isn't delivered at all
  // (github.com/vercel/vercel/issues/11303); this keeps the scheduled run working.
  // NOTE: User-Agent is spoofable — tighten this before enabling customer-facing sends.
  const isVercelCron = ua.includes("vercel-cron");
  const authorized = secretMatches || isVercelCron;
  const out = await runFollowups({ dryRun: !authorized });
  console.log("[followups] cron run", {
    authorized,
    secretMatches,
    isVercelCron,
    hasCronSecret: Boolean(cronSecret),
    hasAuthHeader: Boolean(req.headers.get("authorization")),
    ua,
    fired: out.fired.length,
    firedBrands: out.fired.map((f) => `${f.brandName}#${f.mark}`),
  });
  return NextResponse.json(authorized ? out : { note: "unauthorized — dry-run preview only", ...out });
}

// ─── Manual / testing POST ────────────────────────────────────────────────────
// Body (all optional):
//   dryRun            default true — compute only, no Pylon writes or state changes
//   brandIds          number[]     — limit to specific brands
//   seedReadyDaysAgo  number       — TEST AID: treat first-seen readyAt as N days
//                                    ago so a touch fires now (verify Pylon output)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    dryRun?: boolean;
    brandIds?: number[];
    seedReadyDaysAgo?: number;
  };
  const out = await runFollowups({
    dryRun: body.dryRun !== false, // default to dry-run for safety
    onlyBrandIds: body.brandIds,
    seedReadyDaysAgo: body.seedReadyDaysAgo,
  });
  return NextResponse.json(out);
}

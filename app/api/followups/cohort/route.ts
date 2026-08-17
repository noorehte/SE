import { NextRequest, NextResponse } from "next/server";
import { runCohortFollowups } from "@/lib/followups/cohort-engine";
import type { CohortMonth } from "@/lib/followups/cohort";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Months allowed to fire their FIRST (Day 10) bump, from env — e.g.
// COHORT_LAUNCH_MONTHS="may". Empty/unset ⇒ the cron only ADVANCES brands that
// are already in flight and never launches anyone. This is the single switch
// that arms a customer-facing launch.
function envLaunchMonths(): CohortMonth[] {
  return (process.env.COHORT_LAUNCH_MONTHS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is CohortMonth => s === "may" || s === "june" || s === "july");
}

// ─── Cron GET ───────────────────────────────────────────────────────────────
// Runs daily at the scheduled time (see vercel.json). Authorized (real Vercel
// cron) → real send; unauthorized → safe dry-run preview. Launch is gated by
// COHORT_LAUNCH_MONTHS, so nothing fires until that env var names a month.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  const secretMatches = cronSecret ? auth.trim() === `Bearer ${cronSecret.trim()}` : false;
  const isVercelCron = ua.includes("vercel-cron");
  const authorized = secretMatches || isVercelCron;

  const launchMonths = envLaunchMonths();
  const out = await runCohortFollowups({ dryRun: !authorized, launchMonths });
  console.log("[cohort-followups] cron run", {
    authorized,
    launchMonths,
    fired: out.fired.length,
    firedBrands: out.fired.map((f) => `${f.brandName}#${f.mark ?? "?"}`),
  });
  return NextResponse.json(authorized ? out : { note: "unauthorized — dry-run preview only", ...out });
}

// ─── Manual POST ──────────────────────────────────────────────────────────────
// For manual/testing runs. An UNAUTHORIZED caller can only ever dry-run — real
// sends require the CRON_SECRET bearer — so an open POST can't blast the cohort.
// Body (all optional): dryRun, launchMonths, brandIds.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    dryRun?: boolean;
    launchMonths?: CohortMonth[];
    brandIds?: number[];
  };
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const authorized = cronSecret ? auth.trim() === `Bearer ${cronSecret.trim()}` : false;

  const out = await runCohortFollowups({
    // Unauthorized callers are forced to dry-run; only an authorized caller can
    // opt into a real send with dryRun:false.
    dryRun: authorized ? body.dryRun !== false : true,
    launchMonths: body.launchMonths ?? [],
    onlyBrandIds: body.brandIds,
  });
  return NextResponse.json({ authorized, ...out });
}

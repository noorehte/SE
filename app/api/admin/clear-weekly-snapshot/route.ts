import { NextRequest, NextResponse } from "next/server";
import { clearWeeklySnapshot } from "@/lib/weekly-snapshot";
import { isoWeek } from "@/lib/weekly-focus";

export const dynamic = "force-dynamic";

// TEMPORARY one-off admin route — clears the current week's frozen "This
// Week" ranking so it rebuilds from the corrected scoring (the ticket-count
// signal was removed from lib/weekly-focus.ts after it turned out to be
// unreliable; without this, prod's already-frozen snapshot for the
// in-progress week would keep using the old, ticket-inflated ranking until
// next Monday). Delete this route once it's been called against prod.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = isoWeek(new Date());
  await clearWeeklySnapshot(week);
  return NextResponse.json({ ok: true, cleared: week });
}

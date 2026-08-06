import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/google-auth";
import { writeReachoutStatus } from "@/lib/reachouts-sheet";

export const dynamic = "force-dynamic";

// Writes to the email-reachouts Google Sheet always go through Lane's
// connected Google account — there's no login/session system in this app to
// attribute edits to whoever's actually clicking, and Lane is the one who
// needs edit access today. Add more names here (and to SE_EMAILS in
// lib/google-auth.ts) if others need this later.
const REACHOUTS_EDITOR = "lane";

export async function POST(req: NextRequest) {
  const { brandName, emailed } = await req.json();
  if (!brandName || typeof emailed !== "boolean") {
    return NextResponse.json({ error: "brandName (string) and emailed (boolean) required" }, { status: 400 });
  }

  const auth = await getAuthorizedClient(REACHOUTS_EDITOR);
  if (!auth) {
    return NextResponse.json(
      { error: `${REACHOUTS_EDITOR} hasn't connected their Google account yet`, authUrl: "/api/auth/google/login" },
      { status: 400 }
    );
  }

  const result = await writeReachoutStatus(auth, brandName, emailed);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

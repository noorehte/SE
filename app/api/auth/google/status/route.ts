import { NextResponse } from "next/server";
import { isConnected, SE_EMAILS } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// Returns { mohammad: true, noor: false, ... } so the dashboard can show which
// SEs still need to connect their Google account.
export async function GET() {
  const seKeys = Array.from(new Set(Object.values(SE_EMAILS)));
  const status: Record<string, boolean> = {};

  await Promise.all(
    seKeys.map(async (se) => {
      status[se] = await isConnected(se).catch(() => false);
    })
  );

  return NextResponse.json(status);
}

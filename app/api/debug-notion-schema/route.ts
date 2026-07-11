// Stray temporary diagnostic file — no longer used, sandbox couldn't delete it
// (same EPERM issue as other stray files this session). Safe to delete this
// whole app/api/debug-notion-schema/ folder manually whenever convenient.
// Neutered so it does nothing if ever picked up by a build.
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

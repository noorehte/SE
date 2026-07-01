import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const METABASE_URL = process.env.METABASE_URL!;
  const METABASE_API_KEY = process.env.METABASE_API_KEY!;

  const headers = { "X-API-Key": METABASE_API_KEY };

  const res = await fetch(`${METABASE_URL}/api/table/436/query_metadata`, { headers, cache: "no-store" });
  const data = await res.json();

  return NextResponse.json(
    (data.fields ?? []).map((f: { id: number; name: string; display_name: string; base_type: string }) => ({
      id: f.id,
      name: f.name,
      display_name: f.display_name,
      type: f.base_type,
    }))
  );
}

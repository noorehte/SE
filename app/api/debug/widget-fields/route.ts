import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const METABASE_URL = process.env.METABASE_URL!;
  const METABASE_API_KEY = process.env.METABASE_API_KEY!;

  const res = await fetch(`${METABASE_URL}/api/dataset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": METABASE_API_KEY },
    body: JSON.stringify({
      database: 67,
      type: "query",
      query: { "source-table": 464, limit: 3 },
    }),
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json({
    columns: data.data?.cols?.map((c: { name: string; id: number; display_name: string }) => ({
      name: c.name,
      id: c.id,
      display_name: c.display_name,
    })),
    sample: data.data?.rows?.slice(0, 3),
  });
}

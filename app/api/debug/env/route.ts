import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    METABASE_URL: process.env.METABASE_URL ? `${process.env.METABASE_URL.slice(0, 20)}...` : "MISSING",
    METABASE_API_KEY: process.env.METABASE_API_KEY ? "SET" : "MISSING",
    NOTION_TOKEN: process.env.NOTION_TOKEN ? "SET" : "MISSING",
    HUBSPOT_API_KEY: process.env.HUBSPOT_API_KEY ? "SET" : "MISSING",
  });
}

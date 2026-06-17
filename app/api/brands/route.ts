import { getBrands } from "@/lib/metabase";
import { NextResponse } from "next/server";

export const revalidate = 300;

export async function GET() {
  try {
    const brands = await getBrands();
    return NextResponse.json(brands);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
  }
}

import { getCompanyContactEmails } from "@/lib/hubspot";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const hubspotCompanyId = req.nextUrl.searchParams.get("hubspotCompanyId");
  if (!hubspotCompanyId) {
    return NextResponse.json({ emails: [] });
  }
  const emails = await getCompanyContactEmails(Number(hubspotCompanyId));
  return NextResponse.json({ emails });
}

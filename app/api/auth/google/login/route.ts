import { NextResponse } from "next/server";
import { getOAuthClient, OAUTH_SCOPES } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// Kicks off the Google consent screen. We don't take a "which SE" param here on
// purpose — the SE is determined from the verified Google account email in the
// callback (app/api/auth/google/callback/route.ts), not trusted client input.
export async function GET() {
  const client = getOAuthClient();

  const url = client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token
    prompt: "consent", // force a fresh consent screen every time, guaranteeing a refresh_token
    scope: OAUTH_SCOPES,
  });

  return NextResponse.redirect(url);
}

import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, saveTokens, SE_EMAILS } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(new URL(`/?googleAuth=error&reason=${errorParam}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL(`/?googleAuth=error&reason=missing_code`, req.url));
  }

  const client = getOAuthClient();

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Identify who just authorized us — we never trust a client-supplied SE name.
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoRes.ok) {
      return NextResponse.redirect(new URL(`/?googleAuth=error&reason=userinfo_failed`, req.url));
    }

    const userinfo = await userinfoRes.json();
    const email = String(userinfo.email ?? "").toLowerCase();
    const se = SE_EMAILS[email];

    if (!se) {
      return NextResponse.redirect(
        new URL(`/?googleAuth=error&reason=unrecognized_account&email=${encodeURIComponent(email)}`, req.url)
      );
    }

    await saveTokens(se, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      email,
    });

    return NextResponse.redirect(new URL(`/?googleAuth=success&se=${se}`, req.url));
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return NextResponse.redirect(new URL(`/?googleAuth=error&reason=exchange_failed`, req.url));
  }
}

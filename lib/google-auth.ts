// Shared Google OAuth client + token storage for SE calendar/Gmail access.
//
// Replaces the old per-SE Apps Script deployments (google-apps-script.js) with a
// real "Sign in with Google" flow. Each SE authorizes once via
// /api/auth/google/login; the resulting refresh token is stored in Vercel KV and
// used (and silently refreshed) for all future scheduling actions, including the
// daily cron — no repeated interactive login required.
//
// Setup required (see README / setup instructions provided separately):
//   - Google Cloud OAuth 2.0 Client (Web application) with Calendar + Gmail scopes
//   - Env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI
//   - A Vercel KV store linked to this project (provides KV_REST_API_URL / KV_REST_API_TOKEN)

import { google } from "googleapis";
import { kv } from "@vercel/kv";

// Allowlist of Google accounts permitted to connect, mapped to the SE key used
// throughout the app (brand.SE_OWNER values). Only emails on this list can ever
// have tokens stored — anyone else who completes the Google consent screen is
// rejected in the callback.
export const SE_EMAILS: Record<string, string> = {
  "mohammad@thefrontrowhealth.com": "mohammad",
  "noor@thefrontrowhealth.com": "noor",
  "naumaan@thefrontrowhealth.com": "naumaan",
  "maha@thefrontrowhealth.com": "maha",
};

export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
];

interface StoredTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  email?: string;
}

function kvKey(se: string): string {
  return `google_tokens:${se.toLowerCase()}`;
}

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI env vars"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function saveTokens(se: string, tokens: StoredTokens): Promise<void> {
  const existing = (await kv.get<StoredTokens>(kvKey(se))) ?? {};
  await kv.set(kvKey(se), {
    ...existing,
    ...tokens,
    // Google only sends a refresh_token on the very first consent (or when we
    // force prompt=consent, which we always do) — but guard against ever
    // clobbering a previously-stored one with an empty value.
    refresh_token: tokens.refresh_token ?? existing.refresh_token ?? null,
  });
}

export async function getStoredTokens(se: string): Promise<StoredTokens | null> {
  return (await kv.get<StoredTokens>(kvKey(se))) ?? null;
}

export async function isConnected(se: string): Promise<boolean> {
  const tokens = await getStoredTokens(se);
  return !!tokens?.refresh_token;
}

/**
 * Returns an authorized OAuth2 client for the given SE, or null if they
 * haven't connected their Google account yet. Automatically persists refreshed
 * access tokens back to KV so future calls (including the cron) stay authorized
 * without any interactive step.
 */
export async function getAuthorizedClient(se: string) {
  const tokens = await getStoredTokens(se);
  if (!tokens?.refresh_token) return null;

  const client = getOAuthClient();
  client.setCredentials({
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? undefined,
  });

  client.on("tokens", (newTokens) => {
    saveTokens(se, {
      access_token: newTokens.access_token ?? tokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: newTokens.expiry_date ?? tokens.expiry_date,
    }).catch((err) => {
      console.error(`Failed to persist refreshed Google tokens for ${se}:`, err);
    });
  });

  return client;
}

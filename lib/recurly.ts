// Recurly subscription data — Frontrow's own billing of brands (not to be
// confused with brands' end-customer purchases, which live in a separate
// concept within the same Recurly org). Every Recurly account's `company`
// field is a clean, human-typed brand name (confirmed against ~30 real
// accounts in August 2026 — always populated, and matches Brand.BRAND_NAME
// even on the ~25% of accounts whose `code` doesn't follow the newer
// "hb-{slug}-{BRAND_ID}" pattern), so accounts are matched to brands by
// normalized company name — the same normalize() approach already used for
// the CAI/reachouts/SE-Sprint sheet lookups — rather than trying to parse an
// id out of the account code.
//
// A brand can have more than one subscription over time (e.g. an old expired
// plan plus a new one). The one with the most recent
// current_period_started_at is treated as "the" subscription for display.
//
// The billing-portal link is built from the account's hosted_login_token —
// this is a live, passwordless auth token into the brand's own Recurly
// self-service portal (view invoices, update payment method), so treat it
// like a credential: fine for internal SE/AM use (viewing it here, or
// sending it directly to the brand), but never log it or expose it outside
// that context. It's on the /accounts endpoint, not embedded in
// /subscriptions' account summary, so this does a second paginated fetch.
//
// Listing all subscriptions/accounts takes ~5 paginated calls each (fewer,
// cheaper items than Pylon's accounts listing) — still slow enough to cache
// rather than run on every dashboard load. Mirrors lib/pylon-sentiment.ts:
// Vercel KV in prod, a gitignored local JSON file in dev.
import { createClient, type VercelKV } from "@vercel/kv";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const RECURLY_BASE = "https://v3.recurly.com";
const RECURLY_API_VERSION = "application/vnd.recurly.v2021-02-25";
const RECURLY_SUBDOMAIN = "frontrowmd"; // from GET /sites — Frontrow's one Recurly site
const CACHE_TTL_SECONDS = 10 * 60;
const CACHE_KEY = "recurly-subscription-by-brand-name";

function headers() {
  const key = process.env.RECURLY_API_KEY;
  if (!key) throw new Error("RECURLY_API_KEY is not set");
  return {
    Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    Accept: RECURLY_API_VERSION,
    // Node's fetch auto-injects an Accept-Language header Recurly's API
    // rejects outright (406, "The Accept-Language header is not valid.") —
    // override it explicitly to something Recurly accepts.
    "Accept-Language": "en-US",
  };
}

interface RecurlySubscription {
  state: string; // "active" | "future" | "expired" | "failed" | "paused" | "canceled" — treated as an open string since Recurly may add more
  account?: { company?: string | null };
  plan?: { code?: string; name?: string };
  currency?: string;
  unit_amount?: number;
  total?: number;
  current_period_started_at?: string;
  current_period_ends_at?: string;
  current_term_ends_at?: string;
  auto_renew?: boolean;
}

interface RecurlySubscriptionsPage {
  data?: RecurlySubscription[];
  has_more?: boolean;
  next?: string;
}

interface RecurlyAccount {
  company?: string | null;
  hosted_login_token?: string | null;
}

interface RecurlyAccountsPage {
  data?: RecurlyAccount[];
  has_more?: boolean;
  next?: string;
}

export interface RecurlySubscriptionData {
  state: string;
  planName: string | null;
  amount: number | null; // total (subtotal + tax), in `currency`
  currency: string | null;
  currentPeriodStartedAt: string | null;
  currentPeriodEndsAt: string | null;
  currentTermEndsAt: string | null;
  autoRenew: boolean | null;
  billingPortalUrl: string | null; // brand-facing self-service link — see file header re: sensitivity
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage<T>(url: string, attempt = 1): Promise<{ data?: T[]; has_more?: boolean; next?: string }> {
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (res.status === 429 && attempt <= 5) {
    await sleep(2000 * attempt);
    return fetchPage<T>(url, attempt + 1);
  }
  return (await res.json().catch(() => ({}))) as { data?: T[]; has_more?: boolean; next?: string };
}

/** lowercase, punctuation-stripped — same normalization used for the other sheet-based brand lookups in this app */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchSubscriptionsByBrandName(): Promise<Record<string, RecurlySubscriptionData>> {
  const result: Record<string, RecurlySubscriptionData> = {};
  let url = `${RECURLY_BASE}/subscriptions?limit=200`;
  for (let page = 0; page < 20; page++) {
    const data = await fetchPage<RecurlySubscription>(url);
    for (const sub of data.data ?? []) {
      const company = sub.account?.company;
      if (!company) continue;
      const key = normalize(company);
      if (!key) continue;

      const started = sub.current_period_started_at ?? "";
      const existing = result[key];
      if (existing && (existing.currentPeriodStartedAt ?? "") >= started) continue;

      result[key] = {
        state: sub.state,
        planName: sub.plan?.name ?? null,
        amount: sub.total ?? sub.unit_amount ?? null,
        currency: sub.currency ?? null,
        currentPeriodStartedAt: sub.current_period_started_at ?? null,
        currentPeriodEndsAt: sub.current_period_ends_at ?? null,
        currentTermEndsAt: sub.current_term_ends_at ?? null,
        autoRenew: sub.auto_renew ?? null,
        billingPortalUrl: existing?.billingPortalUrl ?? null,
      };
    }
    if (!data.has_more || !data.next) break;
    url = `${RECURLY_BASE}${data.next}`;
  }
  return result;
}

async function fetchPortalTokensByBrandName(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let url = `${RECURLY_BASE}/accounts?limit=200`;
  for (let page = 0; page < 20; page++) {
    const data = await fetchPage<RecurlyAccount>(url);
    for (const account of data.data ?? []) {
      const company = account.company;
      const token = account.hosted_login_token;
      if (!company || !token) continue;
      const key = normalize(company);
      if (key) result[key] = token;
    }
    if (!data.has_more || !data.next) break;
    url = `${RECURLY_BASE}${data.next}`;
  }
  return result;
}

async function fetchAllFromRecurly(): Promise<Record<string, RecurlySubscriptionData>> {
  const [subscriptions, portalTokens] = await Promise.all([
    fetchSubscriptionsByBrandName(),
    fetchPortalTokensByBrandName(),
  ]);
  for (const [key, sub] of Object.entries(subscriptions)) {
    const token = portalTokens[key];
    if (token) sub.billingPortalUrl = `https://${RECURLY_SUBDOMAIN}.recurly.com/account/${token}`;
  }
  return subscriptions;
}

// Mirror lib/followups/state.ts / lib/pylon-sentiment.ts: Vercel KV when
// configured, otherwise a gitignored local JSON file for local dev.
const useKv = () => Boolean(process.env.KV_REST_API_URL);
const DEV_CACHE_PATH = path.join(process.cwd(), ".dev-recurly-cache.json");

let _kv: VercelKV | null = null;
function kvClient(): VercelKV {
  if (!_kv) {
    _kv = createClient({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _kv;
}

interface CacheEntry {
  data: Record<string, RecurlySubscriptionData>;
  expiresAt: number;
}

async function readCache(): Promise<Record<string, RecurlySubscriptionData> | null> {
  if (useKv()) return (await kvClient().get<Record<string, RecurlySubscriptionData>>(CACHE_KEY)) ?? null;
  try {
    const entry = JSON.parse(await readFile(DEV_CACHE_PATH, "utf8")) as CacheEntry;
    return entry.expiresAt > Date.now() ? entry.data : null;
  } catch {
    return null;
  }
}

async function writeCache(data: Record<string, RecurlySubscriptionData>): Promise<void> {
  if (useKv()) {
    await kvClient().set(CACHE_KEY, data, { ex: CACHE_TTL_SECONDS });
  } else {
    await writeFile(DEV_CACHE_PATH, JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 }), "utf8");
  }
}

/** normalized brand name (see normalize() above) -> most-recent subscription */
export async function getRecurlySubscriptionsByBrandName(): Promise<Map<string, RecurlySubscriptionData>> {
  if (!process.env.RECURLY_API_KEY) return new Map();

  const cached = await readCache().catch(() => null);
  if (cached) return new Map(Object.entries(cached));

  const fresh = await fetchAllFromRecurly();
  await writeCache(fresh).catch((e) => console.error("recurly: failed to write cache:", e));
  return new Map(Object.entries(fresh));
}

export { normalize as normalizeRecurlyBrandName };

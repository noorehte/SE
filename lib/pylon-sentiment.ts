// Pylon account data surfaced on brand cards/detail panel: the "Sentiment"
// custom field (a badge) and latest_customer_activity_time (shown as "Last
// communication"). Pylon has no brand/HubSpot concept of its own — every
// account links back to HubSpot via crm_settings.details[source="hubspot"].id,
// which is the same HUBSPOT_COMPANY_ID already on every Brand
// (lib/metabase.ts), so that's how brands are matched here rather than the
// small hand-curated lib/followups/pylon-accounts.ts map (built for a
// different feature, and far from comprehensive).
//
// Sentiment is a per-org custom field, not a first-class Pylon field, so it's
// only present on accounts someone has actually set it on (~80% of accounts,
// per an ad-hoc check against the real API in August 2026). Known values seen
// in practice: "positive", "neutral", "frustrated", "high_risk_detractor",
// "advocate" — treated as an open string here in case Pylon's org config adds
// more later.
//
// A HubSpot company can have more than one linked Pylon account (~13 of ~1235
// as of the same check — duplicate/merged records in Pylon itself, not
// something fixable here). When that happens, the account with the most
// recent latest_customer_activity_time wins, since it's the one more likely
// to be actively used/up to date; an account with no activity timestamp never
// overwrites one that has it.
//
// Listing ~1200+ accounts takes ~13 paginated calls, which is too slow to run
// on every dashboard load — the result is cached (Vercel KV in prod, a
// gitignored local JSON file in dev, mirroring lib/followups/state.ts) for
// CACHE_TTL_SECONDS so most page loads hit the cache instead of Pylon.
import { createClient, type VercelKV } from "@vercel/kv";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const PYLON_BASE = "https://api.usepylon.com";
const CACHE_TTL_SECONDS = 10 * 60;
const CACHE_KEY = "pylon-account-data-by-hubspot-id";

function headers() {
  const key = process.env.PYLON_API_KEY;
  if (!key) throw new Error("PYLON_API_KEY is not set");
  return { Authorization: `Bearer ${key}` };
}

interface PylonAccount {
  id?: string;
  custom_fields?: Record<string, { value?: string }>;
  crm_settings?: { details?: { source?: string; id?: string }[] };
  latest_customer_activity_time?: string;
}

interface PylonAccountsPage {
  data?: PylonAccount[];
  pagination?: { cursor?: string; has_next_page?: boolean };
}

export interface PylonAccountData {
  accountId: string | null; // Pylon's own account id — for deep-linking to https://app.usepylon.com/accounts/{id}
  sentiment: string | null;
  lastActivityAt: string | null; // ISO timestamp, or null if Pylon has none on file
  openIssues90d: number | null; // Pylon's own "number_of_open_issues_last_90_days" custom field — null if unset
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAccountsPage(cursor: string | undefined, attempt = 1): Promise<PylonAccountsPage> {
  const url = `${PYLON_BASE}/accounts?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as PylonAccountsPage & { errors?: string[] };
  const rateLimited = Array.isArray(json.errors) && json.errors.some((e) => /rate limit/i.test(e));
  if (rateLimited && attempt <= 5) {
    await sleep(3000 * attempt);
    return fetchAccountsPage(cursor, attempt + 1);
  }
  return json;
}

async function fetchAllFromPylon(): Promise<Record<string, PylonAccountData>> {
  const result: Record<string, PylonAccountData> = {};
  let cursor: string | undefined;
  for (let page = 0; page < 30; page++) {
    const data = await fetchAccountsPage(cursor);
    for (const account of data.data ?? []) {
      const hubspotId = account.crm_settings?.details?.find((d) => d.source === "hubspot")?.id;
      if (!hubspotId) continue;

      const sentiment = account.custom_fields?.sentiment?.value ?? null;
      const lastActivityAt = account.latest_customer_activity_time || null;
      const openIssuesRaw = account.custom_fields?.number_of_open_issues_last_90_days?.value;
      const openIssues90d = openIssuesRaw != null && openIssuesRaw !== "" ? Number(openIssuesRaw) : null;

      const existing = result[hubspotId];
      if (!existing || (lastActivityAt && (!existing.lastActivityAt || lastActivityAt > existing.lastActivityAt))) {
        result[hubspotId] = {
          accountId: account.id ?? null,
          sentiment,
          lastActivityAt,
          openIssues90d: Number.isFinite(openIssues90d) ? openIssues90d : null,
        };
      }
    }
    if (!data.pagination?.has_next_page) break;
    cursor = data.pagination.cursor;
  }
  return result;
}

// Mirror lib/followups/state.ts: Vercel KV when configured, otherwise a
// gitignored local JSON file so this is exercisable locally without Redis.
const useKv = () => Boolean(process.env.KV_REST_API_URL);
const DEV_CACHE_PATH = path.join(process.cwd(), ".dev-pylon-account-data-cache.json");

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
  data: Record<string, PylonAccountData>;
  expiresAt: number; // epoch ms — only used by the file fallback; KV expires the key itself
}

async function readCache(): Promise<Record<string, PylonAccountData> | null> {
  if (useKv()) return (await kvClient().get<Record<string, PylonAccountData>>(CACHE_KEY)) ?? null;
  try {
    const entry = JSON.parse(await readFile(DEV_CACHE_PATH, "utf8")) as CacheEntry;
    return entry.expiresAt > Date.now() ? entry.data : null;
  } catch {
    return null;
  }
}

async function writeCache(data: Record<string, PylonAccountData>): Promise<void> {
  if (useKv()) {
    await kvClient().set(CACHE_KEY, data, { ex: CACHE_TTL_SECONDS });
  } else {
    await writeFile(DEV_CACHE_PATH, JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 }), "utf8");
  }
}

/** HubSpot company id (as a string, matching Brand.HUBSPOT_COMPANY_ID.toString()) -> Pylon account data */
export async function getPylonAccountDataByHubspotId(): Promise<Map<string, PylonAccountData>> {
  if (!process.env.PYLON_API_KEY) return new Map();

  const cached = await readCache().catch(() => null);
  if (cached) return new Map(Object.entries(cached));

  const fresh = await fetchAllFromPylon();
  await writeCache(fresh).catch((e) => console.error("pylon-sentiment: failed to write cache:", e));
  return new Map(Object.entries(fresh));
}

// Cached, server-only entry point for fetching brands — import getBrands
// from HERE in server code (pages, API routes), not from lib/metabase.ts.
// lib/metabase.ts is imported by client components for its types, so it must
// stay free of Node-only imports like fs/promises; this module is the one
// place that combines the raw fetch (lib/metabase.ts's fetchBrandsFromSources)
// with caching.
//
// fetchBrandsFromSources() aggregates ~14 external queries (Metabase,
// Grafana/Postgres, HubSpot, Notion) on every call — expensive enough that
// hitting it on every one of this app's 7 pages, plus every "Refresh" click,
// was the single biggest source of perceived slowness. Cached briefly
// (mirrors the KV/file-fallback pattern in lib/pylon-sentiment.ts) so
// navigating between pages within the TTL reuses one fetch instead of
// repeating the whole chain. Short TTL (not Pylon/Recurly's 10min) because
// brand data changes via drag-and-drop/override edits that the user expects
// "Refresh" to reflect — writes also explicitly invalidate this cache (see
// invalidateBrandsCache, called from the overrides/field-overrides API
// routes) so a save is never stale even within the window below.
import { createClient, type VercelKV } from "@vercel/kv";
import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import { fetchBrandsFromSources, type Brand } from "./metabase";

const BRANDS_CACHE_TTL_SECONDS = 60;
const BRANDS_CACHE_KEY = "se-pipeline-brands-cache";
const brandsCacheUsesKv = () => Boolean(process.env.KV_REST_API_URL);
const DEV_BRANDS_CACHE_PATH = path.join(process.cwd(), ".dev-brands-cache.json");

let _brandsKv: VercelKV | null = null;
function brandsKvClient(): VercelKV {
  if (!_brandsKv) {
    _brandsKv = createClient({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _brandsKv;
}

interface BrandsCacheEntry {
  data: Brand[];
  expiresAt: number; // epoch ms — only used by the file fallback; KV expires the key itself
}

async function readBrandsCache(): Promise<Brand[] | null> {
  if (brandsCacheUsesKv()) return (await brandsKvClient().get<Brand[]>(BRANDS_CACHE_KEY)) ?? null;
  try {
    const entry = JSON.parse(await readFile(DEV_BRANDS_CACHE_PATH, "utf8")) as BrandsCacheEntry;
    return entry.expiresAt > Date.now() ? entry.data : null;
  } catch {
    return null;
  }
}

async function writeBrandsCache(data: Brand[]): Promise<void> {
  if (brandsCacheUsesKv()) {
    await brandsKvClient().set(BRANDS_CACHE_KEY, data, { ex: BRANDS_CACHE_TTL_SECONDS });
  } else {
    await writeFile(DEV_BRANDS_CACHE_PATH, JSON.stringify({ data, expiresAt: Date.now() + BRANDS_CACHE_TTL_SECONDS * 1000 }), "utf8");
  }
}

export async function getBrands(): Promise<Brand[]> {
  const cached = await readBrandsCache().catch(() => null);
  if (cached) return cached;

  const fresh = await fetchBrandsFromSources();
  await writeBrandsCache(fresh).catch((e) => console.error("getBrands: failed to write cache:", e));
  return fresh;
}

// Called after a successful override write (pipeline status, field override)
// so the next getBrands() call is guaranteed fresh rather than waiting out
// the TTL — see app/api/overrides/route.ts and app/api/field-overrides/route.ts.
export async function invalidateBrandsCache(): Promise<void> {
  try {
    if (brandsCacheUsesKv()) {
      await brandsKvClient().del(BRANDS_CACHE_KEY);
    } else {
      await unlink(DEV_BRANDS_CACHE_PATH);
    }
  } catch {
    // no cache present — nothing to invalidate
  }
}

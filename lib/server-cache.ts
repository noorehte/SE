// Generic short-TTL cache for expensive server-only reads (Google Sheets via
// Apps Script, paginated Notion queries) — the same class of problem as
// lib/get-brands.ts: an external round-trip that's slow (often 1-3s for an
// Apps Script web app) and re-run on every page load with no caching at all.
// Mirrors the KV/file-fallback pattern used throughout this codebase (see
// lib/pylon-sentiment.ts, lib/recurly.ts, lib/get-brands.ts).
//
// This module is imported ONLY from server-only call sites (page.tsx files,
// API routes) — never from the -sheet.ts/scheduled-calls.ts modules
// themselves, since those are imported by client components for their types,
// and bundling fs/promises into them breaks the client build (see
// lib/get-brands.ts's comment for the concrete failure this avoids).
import { createClient, type VercelKV } from "@vercel/kv";
import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";

const serverCacheUsesKv = () => Boolean(process.env.KV_REST_API_URL);

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

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // epoch ms — only used by the file fallback; KV expires the key itself
}

/**
 * Runs `fetcher()` and caches its result for `ttlSeconds` under `key`
 * (Vercel KV in prod, a gitignored local JSON file in dev). A `fetcher`
 * failure is not cached — it propagates, same as an uncached call would.
 */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const devCachePath = path.join(process.cwd(), `.dev-cache-${key}.json`);

  const existing = await (async (): Promise<T | null> => {
    try {
      if (serverCacheUsesKv()) return (await kvClient().get<T>(key)) ?? null;
      const entry = JSON.parse(await readFile(devCachePath, "utf8")) as CacheEntry<T>;
      return entry.expiresAt > Date.now() ? entry.data : null;
    } catch {
      return null;
    }
  })();
  if (existing !== null) return existing;

  const fresh = await fetcher();

  try {
    if (serverCacheUsesKv()) {
      await kvClient().set(key, fresh, { ex: ttlSeconds });
    } else {
      await writeFile(devCachePath, JSON.stringify({ data: fresh, expiresAt: Date.now() + ttlSeconds * 1000 }), "utf8");
    }
  } catch (e) {
    console.error(`cached(${key}): failed to write cache:`, e);
  }

  return fresh;
}

/** Clears a `cached()` entry immediately, rather than waiting out its TTL — use after a write that should be reflected right away. */
export async function invalidateCache(key: string): Promise<void> {
  const devCachePath = path.join(process.cwd(), `.dev-cache-${key}.json`);
  try {
    if (serverCacheUsesKv()) {
      await kvClient().del(key);
    } else {
      await unlink(devCachePath);
    }
  } catch {
    // no cache present — nothing to invalidate
  }
}

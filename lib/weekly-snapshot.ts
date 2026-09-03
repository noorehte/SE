// Frozen per-week, per-SE ranking for the "This Week" board. Without this,
// the board recomputes weeklyFocusScore() live on every load — a brand
// picking up one more Pylon ticket mid-week would jump the queue, which is
// disorienting for an SE working top-to-bottom. Instead, the ranking for a
// given ISO week (see isoWeek() in lib/weekly-focus.ts) is computed once, on
// the first load of that week, and persisted here; every later load in the
// same week reads the frozen order. A brand that leaves the candidate pool
// (churns, gets dismissed) is filtered out at render time — the list shrinks,
// it doesn't get backfilled from the next-highest scorer.
//
// Permanent store, no TTL — unlike lib/get-brands.ts's cache, this IS the
// data, not a performance shortcut over it. Mirrors the KV/file-fallback
// pattern used throughout this codebase (see lib/followups/state.ts).
import { createClient, type VercelKV } from "@vercel/kv";
import { readFile, writeFile } from "fs/promises";
import path from "path";

export interface WeeklySnapshot {
  week: string; // ISO week, e.g. "2026-W35"
  bySe: Record<string, number[]>; // SE shortname -> brand IDs, in frozen rank order
}

const weeklySnapshotUsesKv = () => Boolean(process.env.KV_REST_API_URL);
const DEV_STORE_PATH = path.join(process.cwd(), ".dev-weekly-snapshot.json");
const kvKey = (week: string) => `weekly-focus-snapshot:${week}`;

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

async function fileRead(): Promise<Record<string, WeeklySnapshot>> {
  try {
    return JSON.parse(await readFile(DEV_STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function fileWrite(data: Record<string, WeeklySnapshot>): Promise<void> {
  await writeFile(DEV_STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function getWeeklySnapshot(week: string): Promise<WeeklySnapshot | null> {
  if (weeklySnapshotUsesKv()) return (await kvClient().get<WeeklySnapshot>(kvKey(week))) ?? null;
  return (await fileRead())[kvKey(week)] ?? null;
}

export async function setWeeklySnapshot(snapshot: WeeklySnapshot): Promise<void> {
  if (weeklySnapshotUsesKv()) {
    await kvClient().set(kvKey(snapshot.week), snapshot);
  } else {
    const store = await fileRead();
    store[kvKey(snapshot.week)] = snapshot;
    await fileWrite(store);
  }
}

// Clears a week's frozen ranking so it gets rebuilt from current scoring on
// the next load — use after a scoring-logic change that should apply
// retroactively to the in-progress week, not just future weeks. Not exposed
// in the UI; run manually (e.g. via a one-off script) when needed.
export async function clearWeeklySnapshot(week: string): Promise<void> {
  if (weeklySnapshotUsesKv()) {
    await kvClient().del(kvKey(week));
  } else {
    const store = await fileRead();
    delete store[kvKey(week)];
    await fileWrite(store);
  }
}

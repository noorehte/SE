import { createClient, type VercelKV } from "@vercel/kv";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { Snippet } from "./detect";

// One-time admission decision per snippet, made the first time the job sees it
// ready-and-not-live:
//   active    → within the 10-day window when first seen → runs the cadence
//   baselined → already ready > 10 days when first seen (pre-existing backlog) →
//               never generates touches. This is what prevents the ~670-brand
//               backlog from all firing at once; only recent + go-forward
//               readiness enters the sequence.
export interface SnippetState {
  readyAt: string; // ISO — the warehouse ready-date, used as the cadence anchor
  status: "active" | "baselined";
}

// Per-brand follow-up sequence state. This is the ONLY durable record of where
// each brand is in its cadence — Pylon can't be queried for issues older than
// 30 days, so we keep the issue id and touch history here.
export interface FollowupState {
  brandId: number;
  brandName: string;
  pylonIssueId?: string; // set once the first touch creates the ticket
  snippets: Partial<Record<Snippet, SnippetState>>; // admission decision per snippet
  touchesSent: number[]; // marks already fired/superseded, e.g. [10, 20]
  completed: boolean; // true once all active snippets went live, or the day-40 touch fired
  lastRunAt: string;
  // Cohort follow-up additions (see lib/followups/cohort.ts). Optional so the
  // legacy admission-window flow keeps working unchanged.
  firstBumpAt?: string; // ISO — when the Day-10 bump fired; the cohort cadence anchor
  repliedAt?: string;   // ISO — brand replied in the Pylon thread; stops the cadence
}

// Mirror lib/brand-signup/token-store.ts: use Vercel KV when configured,
// otherwise fall back to a gitignored local JSON file so the whole flow can be
// exercised locally without a Redis instance.
const useKv = () => Boolean(process.env.KV_REST_API_URL);
const DEV_STORE_PATH = path.join(process.cwd(), ".dev-followups.json");
const kvKey = (brandId: number) => `followup:${brandId}`;

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

async function fileRead(): Promise<Record<string, FollowupState>> {
  try {
    return JSON.parse(await readFile(DEV_STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function fileWrite(data: Record<string, FollowupState>): Promise<void> {
  await writeFile(DEV_STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function getState(brandId: number): Promise<FollowupState | null> {
  if (useKv()) return (await kvClient().get<FollowupState>(kvKey(brandId))) ?? null;
  return (await fileRead())[kvKey(brandId)] ?? null;
}

export async function setState(state: FollowupState): Promise<void> {
  if (useKv()) {
    await kvClient().set(kvKey(state.brandId), state);
  } else {
    const store = await fileRead();
    store[kvKey(state.brandId)] = state;
    await fileWrite(store);
  }
}

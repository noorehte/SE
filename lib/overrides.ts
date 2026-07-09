// Notion-based pipeline status overrides — no fs dependency, safe for Vercel
import { PipelineStatus } from "./metabase";

const DB_ID = "a2925a747bac4f26a591fa0fa9035380";
const BASE = "https://api.notion.com/v1";

async function notionRequest(path: string, method = "GET", body?: unknown) {
  // Read at request time — module-level access gets baked in as undefined for Sensitive vars
  const NOTION_TOKEN = process.env.NOTION_TOKEN!;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await r.json();
  if (data.object === "error") {
    throw new Error(`Notion error ${data.status}: ${data.message}`);
  }
  return data;
}

export interface OverrideEntry {
  status: PipelineStatus | null;
  changedAt: string | null;
  fields: Record<string, string>; // editable field overrides e.g. SE_OWNER, KIND
}

export async function getAllOverrides(): Promise<Record<string, OverrideEntry>> {
  const result: Record<string, OverrideEntry> = {};
  try {
    // Notion's query API caps each page at 100 results and needs an explicit
    // cursor loop to get the rest — this was missing, so once the overrides
    // database grew past 100 rows, any override past that point (most
    // recently touched brands tend to land there) was silently invisible on
    // read even though the write itself succeeded. "Collaborator Code Brand"
    // has no auto-detection path at all (it's override-only), so a dropped
    // override for it has nowhere else to fall but back to whatever the
    // brand's real data computes to — which is exactly the reported "doesn't
    // persist on refresh" symptom.
    let cursor: string | undefined;
    do {
      const data = await notionRequest(`/databases/${DB_ID}/query`, "POST", {
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      for (const page of data.results ?? []) {
        const brandId = page.properties["Brand ID"]?.title?.[0]?.plain_text?.trim();
        if (!brandId) continue;
        const status = page.properties["Status"]?.rich_text?.[0]?.plain_text?.trim() || null;
        const changedAt = page.properties["Status Changed At"]?.rich_text?.[0]?.plain_text?.trim() || null;
        const fieldsRaw = page.properties["Field Overrides"]?.rich_text?.[0]?.plain_text?.trim();
        let fields: Record<string, string> = {};
        if (fieldsRaw) {
          try { fields = JSON.parse(fieldsRaw); } catch { /* ignore malformed */ }
        }
        if (status || Object.keys(fields).length > 0) {
          result[brandId] = { status: status as PipelineStatus | null, changedAt, fields };
        }
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
  } catch {
    // return whatever was fetched so far — non-fatal
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreatePage(brandId: number): Promise<{ id: string; properties: any } | null> {
  const data = await notionRequest(`/databases/${DB_ID}/query`, "POST", {
    filter: { property: "Brand ID", title: { equals: String(brandId) } },
    page_size: 1,
  });
  if (data.results?.[0]) return data.results[0];
  // Create new page
  const created = await notionRequest("/pages", "POST", {
    parent: { database_id: DB_ID },
    properties: {
      "Brand ID": { title: [{ text: { content: String(brandId) } }] },
    },
  });
  return created ?? null;
}

export async function setOverride(brandId: number, status: PipelineStatus): Promise<void> {
  const now = new Date().toISOString();
  const data = await notionRequest(`/databases/${DB_ID}/query`, "POST", {
    filter: { property: "Brand ID", title: { equals: String(brandId) } },
    page_size: 1,
  });
  const existing = data.results?.[0];
  if (existing) {
    const currentStatus = existing.properties["Status"]?.rich_text?.[0]?.plain_text?.trim();
    const changedAt = currentStatus !== status ? now
      : (existing.properties["Status Changed At"]?.rich_text?.[0]?.plain_text?.trim() ?? now);
    await notionRequest(`/pages/${existing.id}`, "PATCH", {
      properties: {
        "Status": { rich_text: [{ text: { content: status } }] },
        "Status Changed At": { rich_text: [{ text: { content: changedAt } }] },
      },
    });
  } else {
    await notionRequest("/pages", "POST", {
      parent: { database_id: DB_ID },
      properties: {
        "Brand ID": { title: [{ text: { content: String(brandId) } }] },
        "Status": { rich_text: [{ text: { content: status } }] },
        "Status Changed At": { rich_text: [{ text: { content: now } }] },
      },
    });
  }
}

export async function setFieldOverride(brandId: number, field: string, value: string): Promise<void> {
  const page = await getOrCreatePage(brandId);
  if (!page) return;

  // Read existing field overrides and merge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (page.properties as any)["Field Overrides"]?.rich_text?.[0]?.plain_text?.trim();
  let fields: Record<string, string> = {};
  if (existing) {
    try { fields = JSON.parse(existing); } catch { /* ignore */ }
  }
  if (value) {
    fields[field] = value;
  } else {
    delete fields[field];
  }

  await notionRequest(`/pages/${page.id}`, "PATCH", {
    properties: {
      "Field Overrides": { rich_text: [{ text: { content: JSON.stringify(fields) } }] },
    },
  });
}

export async function clearOverride(brandId: number): Promise<void> {
  const data = await notionRequest(`/databases/${DB_ID}/query`, "POST", {
    filter: { property: "Brand ID", title: { equals: String(brandId) } },
    page_size: 1,
  });
  const existing = data.results?.[0];
  if (existing) {
    await notionRequest(`/pages/${existing.id}`, "PATCH", { archived: true });
  }
}

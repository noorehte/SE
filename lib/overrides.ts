// Notion-based pipeline status overrides — no fs dependency, safe for Vercel
import { PipelineStatus } from "./metabase";

const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const DB_ID = "a2925a747bac4f26a591fa0fa9035380";
const BASE = "https://api.notion.com/v1";

function notionRequest(path: string, method = "GET", body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  }).then((r) => r.json());
}

export async function getAllOverrides(): Promise<Record<string, PipelineStatus>> {
  const result: Record<string, PipelineStatus> = {};
  try {
    const data = await notionRequest(`/databases/${DB_ID}/query`, "POST", { page_size: 100 });
    for (const page of data.results ?? []) {
      const brandId = page.properties["Brand ID"]?.title?.[0]?.plain_text?.trim();
      const status = page.properties["Status"]?.rich_text?.[0]?.plain_text?.trim();
      if (brandId && status) result[brandId] = status as PipelineStatus;
    }
  } catch {
    // return empty on error — non-fatal
  }
  return result;
}

export async function setOverride(brandId: number, status: PipelineStatus): Promise<void> {
  const data = await notionRequest(`/databases/${DB_ID}/query`, "POST", {
    filter: { property: "Brand ID", title: { equals: String(brandId) } },
    page_size: 1,
  });
  const existing = data.results?.[0];
  if (existing) {
    await notionRequest(`/pages/${existing.id}`, "PATCH", {
      properties: { "Status": { rich_text: [{ text: { content: status } }] } },
    });
  } else {
    await notionRequest("/pages", "POST", {
      parent: { database_id: DB_ID },
      properties: {
        "Brand ID": { title: [{ text: { content: String(brandId) } }] },
        "Status": { rich_text: [{ text: { content: status } }] },
      },
    });
  }
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

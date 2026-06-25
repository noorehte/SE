const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const DB_ID = "7256f79f390a43f38e2ba2b878010854";
const BASE = "https://api.notion.com/v1";

export interface ScheduledCall {
  brandId: number;
  brandName: string;
  seOwner: string;
  scheduledAt: string;
  callDate: string;
  action?: "call" | "webinar_sheet";
}

async function notionRequest(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

export async function isScheduled(brandId: number): Promise<boolean> {
  const data = await notionRequest(`/databases/${DB_ID}/query`, "POST", {
    filter: { property: "Brand ID", number: { equals: brandId } },
    page_size: 1,
  });
  return (data.results?.length ?? 0) > 0;
}

export async function markScheduled(
  brandId: number,
  brandName: string,
  seOwner: string,
  callDate: string,
  action: "call" | "webinar_sheet" = "call"
): Promise<void> {
  // Avoid duplicates
  const already = await isScheduled(brandId);
  if (already) return;

  const isWebinar = action === "webinar_sheet";
  const parsedDate = isWebinar ? null : new Date(callDate);
  const validDate = parsedDate && !isNaN(parsedDate.getTime());

  await notionRequest("/pages", "POST", {
    parent: { database_id: DB_ID },
    properties: {
      "Brand Name": { title: [{ text: { content: brandName } }] },
      "Brand ID": { number: brandId },
      "SE Owner": { rich_text: [{ text: { content: seOwner } }] },
      "Scheduled At": { date: { start: new Date().toISOString().slice(0, 10) } },
      ...(validDate && { "Call Date": { date: { start: parsedDate!.toISOString().slice(0, 10) } } }),
      "Action": { select: { name: action } },
    },
  });
}

export async function getAllScheduled(): Promise<Record<string, ScheduledCall>> {
  const results: Record<string, ScheduledCall> = {};
  let cursor: string | undefined;

  do {
    const data: {
      results: Array<{
        properties: {
          "Brand ID": { number: number | null };
          "Brand Name": { title: Array<{ plain_text: string }> };
          "SE Owner": { rich_text: Array<{ plain_text: string }> };
          "Scheduled At": { date: { start: string } | null };
          "Call Date": { date: { start: string } | null };
          "Action": { select: { name: string } | null };
        };
      }>;
      has_more: boolean;
      next_cursor: string | null;
    } = await notionRequest(`/databases/${DB_ID}/query`, "POST", {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of data.results ?? []) {
      const brandId = page.properties["Brand ID"]?.number;
      if (!brandId) continue;
      results[String(brandId)] = {
        brandId,
        brandName: page.properties["Brand Name"]?.title?.[0]?.plain_text ?? "",
        seOwner: page.properties["SE Owner"]?.rich_text?.[0]?.plain_text ?? "",
        scheduledAt: page.properties["Scheduled At"]?.date?.start ?? "",
        callDate: page.properties["Call Date"]?.date?.start ?? "",
        action: (page.properties["Action"]?.select?.name ?? "call") as "call" | "webinar_sheet",
      };
    }

    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

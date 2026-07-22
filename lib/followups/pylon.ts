const PYLON_BASE = "https://api.usepylon.com";

// Internal testing config: tickets are created for / assigned to Naumaan, so
// nothing is ever customer-facing during the test. Overridable via env when we
// later switch to real per-brand requesters.
const ASSIGNEE_ID = process.env.PYLON_ASSIGNEE_ID || "6bb8eeb4-54e2-404f-9e5e-c6dac1a376c3";
const REQUESTER_EMAIL = process.env.PYLON_REQUESTER_EMAIL || "naumaan@thefrontrowhealth.com";
const REQUESTER_NAME = process.env.PYLON_REQUESTER_NAME || "Naumaan Hussain";

function headers() {
  const key = process.env.PYLON_API_KEY;
  if (!key) throw new Error("PYLON_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pylon rate-limits writes (~10/burst) with a plain "Rate limit exceeded!"
// error body. Retry with linear backoff before giving up.
async function pylonFetch(pathname: string, init: RequestInit, attempt = 1): Promise<Record<string, unknown>> {
  const res = await fetch(`${PYLON_BASE}${pathname}`, { ...init, headers: headers(), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const errs = json.errors as string[] | undefined;
  const rateLimited = Array.isArray(errs) && errs.some((e) => /rate limit/i.test(e));
  if (rateLimited && attempt <= 5) {
    await sleep(3000 * attempt);
    return pylonFetch(pathname, init, attempt + 1);
  }
  if (errs && errs.length) throw new Error(`Pylon ${pathname}: ${errs.join("; ")}`);
  return json;
}

function idOf(json: Record<string, unknown>): string {
  const data = json.data as Record<string, unknown> | undefined;
  return (data?.id as string) || (json.id as string) || "";
}

// Create the brand's "Implementation Bump" ticket, assigned to Naumaan and set
// to "on you" (waiting_on_you). Returns the issue id. Internal only — the
// requester is Naumaan, so nothing reaches the brand.
export async function createBumpIssue(subject: string, bodyHtml: string): Promise<string> {
  const created = await pylonFetch("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: subject,
      body_html: bodyHtml,
      requester_email: REQUESTER_EMAIL,
      requester_name: REQUESTER_NAME,
      assignee_id: ASSIGNEE_ID,
      tags: ["implementation-bump"],
    }),
  });
  const issueId = idOf(created);
  if (!issueId) throw new Error(`Pylon issue create returned no id: ${JSON.stringify(created)}`);
  // state isn't honored on create — PATCH it to "on you" afterwards.
  await pylonFetch(`/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "waiting_on_you" }),
  }).catch(() => {});
  return issueId;
}

// Append a follow-up touch as an internal note on the same ticket.
export async function appendNote(issueId: string, bodyHtml: string): Promise<string> {
  const note = await pylonFetch(`/issues/${issueId}/note`, {
    method: "POST",
    body: JSON.stringify({ body_html: bodyHtml }),
  });
  return idOf(note);
}

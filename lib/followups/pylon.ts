const PYLON_BASE = "https://api.usepylon.com";

// Internal testing config: tickets are created for / assigned to Naumaan, so
// nothing is ever customer-facing during the test. Overridable via env when we
// later switch to real per-brand requesters.
const ASSIGNEE_ID = process.env.PYLON_ASSIGNEE_ID || "6bb8eeb4-54e2-404f-9e5e-c6dac1a376c3";
const REQUESTER_EMAIL = process.env.PYLON_REQUESTER_EMAIL || "naumaan@thefrontrowhealth.com";
const REQUESTER_NAME = process.env.PYLON_REQUESTER_NAME || "Naumaan Hussain";

// ─── Customer-facing cohort sends ─────────────────────────────────────────────
// The reviews cohort emails real brand contacts (unlike the legacy internal
// bump above). Outbound is sent from the Customer Success identity, assigned to
// Andres, and left "waiting on customer". The From *display name* is the Pylon
// API token's name (set in Pylon settings, not via the API).
const COHORT_SENDER = process.env.PYLON_COHORT_SENDER || "customersuccess@thefrontrowhealth.com";
const COHORT_ASSIGNEE_ID = process.env.PYLON_COHORT_ASSIGNEE_ID || "8199ddd4-3f49-4f10-9dce-0efde8590a70"; // Andres Baeza
// The API token's own Pylon user id (from GET /me → data.user.id). Any
// non-private message NOT authored by this id is treated as an inbound reply
// that stops the cadence.
const COHORT_BOT_USER_ID = process.env.PYLON_BOT_USER_ID || "d9016ce9-776d-4664-a0d1-aeaa768992ca";

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

// ─── Customer-facing cohort helpers ───────────────────────────────────────────

// Create the brand's customer-facing bump issue (Day 10). recipients[0] is the
// primary "To"; the rest are CC'd. Sent from the Customer Success address,
// assigned to Andres, then PATCHed to "waiting on customer". Returns the id.
export async function createCustomerBumpIssue(
  subject: string,
  bodyHtml: string,
  recipients: string[],
  accountId?: string
): Promise<string> {
  if (recipients.length === 0) throw new Error("createCustomerBumpIssue: no recipients");
  const created = await pylonFetch("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: subject,
      body_html: bodyHtml,
      requester_email: recipients[0],
      // Pin the issue to the brand's Pylon account when known; otherwise Pylon
      // falls back to associating by the requester's email domain.
      ...(accountId ? { account_id: accountId } : {}),
      destination_metadata: {
        destination: "email",
        email: COHORT_SENDER,
        email_ccs: recipients.slice(1),
      },
      assignee_id: COHORT_ASSIGNEE_ID,
      tags: ["implementation-bump"],
    }),
  });
  const issueId = idOf(created);
  if (!issueId) throw new Error(`Pylon issue create returned no id: ${JSON.stringify(created)}`);
  await pylonFetch(`/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "waiting_on_customer" }),
  }).catch(() => {});
  return issueId;
}

interface PylonMessage {
  id: string;
  timestamp?: string;
  is_private?: boolean;
  author?: { user?: { id?: string } | null };
}

async function getMessages(issueId: string): Promise<PylonMessage[]> {
  const res = await pylonFetch(`/issues/${issueId}/messages`, { method: "GET" });
  return (res.data as PylonMessage[]) ?? [];
}

// Send the next bump (Day 20/30/40) as a customer-facing reply on the same
// thread. Replies to the latest message so it threads correctly, then re-sets
// the state to "waiting on customer". recipients[0] = To, rest = CC.
export async function sendCustomerReply(
  issueId: string,
  bodyHtml: string,
  recipients: string[]
): Promise<string> {
  const msgs = await getMessages(issueId);
  if (msgs.length === 0) throw new Error(`sendCustomerReply: no messages on issue ${issueId}`);
  const latest = msgs.reduce((a, b) => ((b.timestamp ?? "") > (a.timestamp ?? "") ? b : a));
  const reply = await pylonFetch(`/issues/${issueId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      message_id: latest.id,
      body_html: bodyHtml,
      email_info: { to_emails: [recipients[0]], cc_emails: recipients.slice(1) },
    }),
  });
  await pylonFetch(`/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "waiting_on_customer" }),
  }).catch(() => {});
  return idOf(reply);
}

// Earliest inbound reply on the thread (any non-private message not authored by
// our automation bot), or null if none. A reply stops the cadence entirely.
export async function getReplyAt(issueId: string): Promise<string | null> {
  const msgs = await getMessages(issueId);
  const replies = msgs
    .filter((m) => m.is_private === false && (m.author?.user?.id ?? null) !== COHORT_BOT_USER_ID)
    .map((m) => m.timestamp)
    .filter((t): t is string => !!t)
    .sort();
  return replies[0] ?? null;
}

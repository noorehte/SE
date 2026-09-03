"use client";

import { useMemo, useState } from "react";
import { Brand } from "@/lib/metabase";
import { SeSprintEntry } from "@/lib/se-sprint-sheet";
import { weeklyFocusReasons, isoWeek, resolveWeeklyLane, WeeklyFocusReason } from "@/lib/weekly-focus";
import { WeeklySnapshot } from "@/lib/weekly-snapshot";
import { ALL_COLUMNS, SE_OWNERS } from "./Dashboard";
import Sidebar from "./Sidebar";
import { EditableText } from "./BrandDetailPanel";
import { Rocket, X, ExternalLink, Trash2, Pin, PinOff, Check, RotateCcw } from "lucide-react";

// Whether we actually have the code in hand — the form's own "have you
// shared it?" Yes/No/Unsure answer is self-reported and can't be trusted on
// its own (a brand can say "Yes" and still leave the code field blank, e.g.
// if they shared it a different way). An SE-verified COLLABORATOR_CODE
// takes priority over what the brand typed into the form themselves.
function collaboratorCode(brand: Brand): string | null {
  return brand.COLLABORATOR_CODE ?? brand.SE_SPRINT_COLLABORATOR_CODE ?? null;
}

// Brands type their myshopify URL in free text (with or without a scheme,
// with or without a trailing slash/path) — pull out just the store's
// {handle}.myshopify.com host and link straight to its Shopify admin login,
// rather than the storefront, since that's what an SE actually needs to get
// into the store (collaborator access still has to come through separately;
// this just gets you to the right login page).
function shopifyAdminUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return null;
  }
  if (!/\.myshopify\.com$/i.test(host)) return null;
  return `https://${host}/admin`;
}

function pylonAccountUrl(brand: Brand): string | null {
  return brand.PYLON_ACCOUNT_ID ? `https://app.usepylon.com/accounts/${brand.PYLON_ACCOUNT_ID}` : null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "0.875rem", color: "#fff", whiteSpace: "pre-wrap" }}>{value?.trim() || "—"}</div>
    </div>
  );
}

function ReasonBadges({ reasons }: { reasons: WeeklyFocusReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r.key} className="px-1.5 py-0.5 rounded text-xs font-semibold"
          style={{ background: r.color + "22", color: r.color, fontSize: "0.68rem" }}>
          {r.label}
        </span>
      ))}
    </div>
  );
}

interface NextStep {
  label: string;
  href?: string;
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

// One concrete, per-brand next step for each reason a brand is on the
// board — answers "what is THIS brand specifically waiting on," not a
// category label shared by every brand in the same pipeline status. Two
// brands both "code_snippets_available" read differently here depending on
// whether the collaborator code is actually in hand (waiting on the SE to
// build) or still missing (waiting on the brand to share it) — that's the
// real fork an SE needs to see, not just "Awaiting implementation" on both.
// Shared by the card's one-line blurb and the detail panel's full list, so
// they never drift.
function getNextSteps(brand: Brand): NextStep[] {
  const steps: NextStep[] = [];
  const pylonUrl = pylonAccountUrl(brand);
  const isFrustrated = brand.PYLON_SENTIMENT === "high_risk_detractor" || brand.PYLON_SENTIMENT === "frustrated";
  const code = collaboratorCode(brand);

  if (isFrustrated) {
    const label = brand.PYLON_LAST_COMMUNICATION_AT
      ? `No contact in ${daysAgo(brand.PYLON_LAST_COMMUNICATION_AT)}d — check in`
      : "No Pylon activity on file — reach out";
    steps.push({ label, href: pylonUrl ?? undefined });
  }
  if (brand.ON_SE_SPRINT_SHEET) {
    const label = code
      ? `Collab code on file (${code}) — start building`
      : brand.SE_SPRINT_HAS_SHARED_CODE && brand.SE_SPRINT_HAS_SHARED_CODE !== "No"
        ? "Brand says code shared — verify and confirm"
        : "Get collaborator code from brand";
    steps.push({ label });
  }

  switch (brand.PIPELINE_STATUS) {
    case "not_started":
      steps.push({ label: "No products submitted yet — brand needs to add products" });
      break;
    case "pending_review":
      steps.push({ label: `${brand.PRODUCTS_COUNT} product(s) awaiting board review` });
      break;
    case "products_approved_needs_call":
      steps.push({ label: `${brand.PRODUCTS_APPROVED_COUNT} product(s) approved — book onboarding call` });
      break;
    case "code_snippets_available":
      // Only add if the collab-request branch above didn't already cover the
      // same code-status question for this brand.
      if (!brand.ON_SE_SPRINT_SHEET) {
        steps.push({
          label: code
            ? `Code on file (${code}) — build the theme`
            : "Waiting on brand for collaborator code",
        });
      }
      break;
    case "was_live":
      steps.push({ label: `Went inactive ${brand.DAYS_IN_STATUS}d ago — find out why and re-activate` });
      break;
    default:
      break;
  }
  return steps;
}

function NextSteps({ brand }: { brand: Brand }) {
  const steps = getNextSteps(brand);
  if (steps.length === 0) return null;

  return (
    <div className="mt-1">
      {steps.map((s, i) => (
        s.href ? (
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 py-1.5 hover:opacity-80"
            style={{ fontSize: "0.85rem", color: "#72a4bf" }}>
            {s.label} <ExternalLink size={12} />
          </a>
        ) : (
          <div key={i} className="py-1.5" style={{ fontSize: "0.85rem", color: "#fff" }}>{s.label}</div>
        )
      ))}
    </div>
  );
}

// Shows what THIS form submission actually said — hosting/page builder/
// headless/theme/notes/etc. — rather than the brand's general pipeline
// status, SE/AM/Ops, or widget history (that's what BrandDetailPanel is
// for, and it's not what an SE needs when working through this queue).
function SprintRequestPanel({ brand, entry, currentWeek, onClose, onDismiss, onTogglePin, onToggleDone, onRemoveCollabRequest, onBrandUpdate }: {
  brand: Brand;
  entry: SeSprintEntry | undefined;
  currentWeek: string;
  onClose: () => void;
  onDismiss: () => void;
  onTogglePin: () => void;
  onToggleDone: () => void;
  onRemoveCollabRequest: () => void;
  onBrandUpdate: (brandId: number, updates: Partial<Brand>) => void;
}) {
  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
  const reasons = weeklyFocusReasons(brand);
  const isDone = brand.WEEKLY_FOCUS_DONE_WEEK === currentWeek;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        className="h-full overflow-y-auto p-6"
        style={{ width: "420px", background: "#0d1b26", borderLeft: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>
            {brand.BRAND_NAME}
          </div>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.4)" }} className="hover:opacity-70"><X size={18} /></button>
        </div>
        <div className="mt-2 mb-3"><ReasonBadges reasons={reasons} /></div>

        <div className="mt-1" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Next steps
        </div>
        <NextSteps brand={brand} />

        <div className="flex items-center gap-3 mt-4 mb-1 flex-wrap">
          <a href={adminUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#72a4bf" }} className="flex items-center gap-1 hover:opacity-80">
            Open in Admin <ExternalLink size={11} />
          </a>
          <button
            onClick={onToggleDone}
            style={{ fontSize: "0.75rem", color: isDone ? "#4caf82" : "rgba(255,255,255,0.5)" }}
            className="flex items-center gap-1 hover:opacity-80">
            {isDone ? <><RotateCcw size={11} /> Move back to to-do</> : <><Check size={11} /> Mark handled this week</>}
          </button>
          <button
            onClick={onTogglePin}
            style={{ fontSize: "0.75rem", color: brand.WEEKLY_FOCUS_PINNED ? "#e9a84c" : "rgba(255,255,255,0.5)" }}
            className="flex items-center gap-1 hover:opacity-80">
            {brand.WEEKLY_FOCUS_PINNED ? <><PinOff size={11} /> Unpin</> : <><Pin size={11} /> Pin this week</>}
          </button>
          <button
            onClick={() => { onDismiss(); onClose(); }}
            style={{ fontSize: "0.75rem", color: "#e05c5c" }}
            className="flex items-center gap-1 hover:opacity-80">
            <Trash2 size={11} /> Dismiss for this week
          </button>
        </div>
        {brand.ON_SE_SPRINT_SHEET && (
          <button
            onClick={() => { onRemoveCollabRequest(); onClose(); }}
            style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}
            className="mt-1 hover:opacity-80">
            Remove collab request entirely
          </button>
        )}

        {brand.ON_SE_SPRINT_SHEET && (
          <>
            <div className="mt-4" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Implementation request
            </div>

            {!entry && (
              <div className="mt-3" style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>
                Added manually — no form submission on file for this brand.
              </div>
            )}
            {entry && (
              <div className="mt-1">
                <Field label="Submitted" value={entry.timestamp} />
                <Field label="Submitted by" value={entry.email} />
                <Field label="Already tried implementing widgets themselves?" value={entry.alreadyTriedWidgets} />
                <Field label="Website hosted on" value={entry.hostedOn} />
                <Field label="Page builder" value={entry.pageBuilder} />
                <Field label="Headless setup?" value={entry.isHeadless} />
                <Field label="Theme to duplicate" value={entry.themeToClone} />
                <Field label="Needs widgets on a non-default product template?" value={entry.extraProductTemplate} />
                <Field label="Wants a homepage badge?" value={entry.wantsHomepageBadge} />
                <Field label="Notes for the SE" value={entry.notes} />
                {entry.hasSharedCode && (
                  <Field label="Brand says code already shared?" value={entry.hasSharedCode} />
                )}
              </div>
            )}

            <div className="mt-4" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              SE tracking
            </div>
            <div className="mt-1">
              <EditableText
                brandId={brand.BRAND_ID}
                field="SE_SPRINT_MYSHOPIFY_URL_OVERRIDE"
                label="myshopify domain"
                value={brand.SE_SPRINT_MYSHOPIFY_URL}
                onSaved={(_, v) => onBrandUpdate(brand.BRAND_ID, { SE_SPRINT_MYSHOPIFY_URL: v, SE_SPRINT_MYSHOPIFY_URL_OVERRIDE: v })}
              />
              {shopifyAdminUrl(brand.SE_SPRINT_MYSHOPIFY_URL) && (
                <div className="py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <a href={shopifyAdminUrl(brand.SE_SPRINT_MYSHOPIFY_URL)!} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: "0.8rem", color: "#72a4bf" }} className="flex items-center justify-end gap-1 hover:opacity-80">
                    Open Shopify admin <ExternalLink size={11} />
                  </a>
                </div>
              )}
              <EditableText
                brandId={brand.BRAND_ID}
                field="COLLABORATOR_CODE"
                label="Collaborator code"
                value={brand.COLLABORATOR_CODE}
                hubspotCompanyId={brand.HUBSPOT_COMPANY_ID}
                onSaved={(_, v) => onBrandUpdate(brand.BRAND_ID, { COLLABORATOR_CODE: v })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FocusCard({ brand, done, onClick, onTogglePin, onToggleDone, onDismiss }: {
  brand: Brand;
  done: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onToggleDone: () => void;
  onDismiss: () => void;
}) {
  const col = ALL_COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
  const reasons = weeklyFocusReasons(brand);
  const code = collaboratorCode(brand);
  // Highest-priority next step only, one line — the panel shows the full
  // list; the card is for scanning the whole lane without opening anything.
  const topStep = getNextSteps(brand)[0];
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div
      onClick={onClick}
      className="cursor-pointer hover:opacity-95"
      style={{
        flex: "0 0 200px",
        background: done ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${done ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.1)"}`,
        borderLeft: `3px solid ${done ? "rgba(76,175,130,0.5)" : (reasons[0]?.color ?? col?.accent ?? "#72a4bf")}`,
        borderRadius: "10px",
        padding: "12px",
        opacity: done ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {brand.WEEKLY_FOCUS_PINNED && <Pin size={12} style={{ color: "#e9a84c", flexShrink: 0 }} />}
        {done && <Check size={12} style={{ color: "#4caf82", flexShrink: 0 }} />}
        <span style={{
          fontFamily: "Librebaskerville, Arial, sans-serif", fontWeight: 700, fontSize: "0.92rem", color: "#fff",
          textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {brand.BRAND_NAME}
        </span>
      </div>

      {!done && (
        <div className="mb-2.5"><ReasonBadges reasons={reasons} /></div>
      )}

      {!done && topStep && (
        <div className="mb-2.5" style={{
          fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={topStep.label}>
          {topStep.label}
        </div>
      )}

      <div className="flex items-center justify-between" style={{ fontSize: "0.75rem" }}>
        <span className="px-1.5 py-0.5 rounded-full" style={{ background: (col?.accent ?? "#333") + "22", color: col?.accent ?? "#fff", fontSize: "0.68rem" }}>
          {col?.label ?? brand.PIPELINE_STATUS}
        </span>
        <div className="flex gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
          <button onClick={stop(onTogglePin)} title={brand.WEEKLY_FOCUS_PINNED ? "Unpin" : "Pin this week"}
            className="hover:opacity-100" style={{ color: brand.WEEKLY_FOCUS_PINNED ? "#e9a84c" : "inherit" }}>
            {brand.WEEKLY_FOCUS_PINNED ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button onClick={stop(onToggleDone)} title={done ? "Move back to to-do" : "Mark handled"}
            className="hover:opacity-100" style={{ color: done ? "#4caf82" : "inherit" }}>
            {done ? <RotateCcw size={13} /> : <Check size={13} />}
          </button>
          <button onClick={stop(onDismiss)} title="Dismiss for this week" className="hover:opacity-100 hover:text-red-400">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {code && (
        <div className="mt-2" style={{ fontSize: "0.75rem", color: "#4caf82", fontFamily: "monospace" }}>{code}</div>
      )}
    </div>
  );
}

export default function SeSprintPage({ initialBrands, entriesByBrandId, snapshot }: {
  initialBrands: Brand[];
  entriesByBrandId: Record<number, SeSprintEntry>;
  snapshot: WeeklySnapshot;
}) {
  const [brands, setBrands] = useState(initialBrands);
  const [seFilter, setSeFilter] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const currentWeek = useMemo(() => isoWeek(new Date()), []);

  const brandsById = useMemo(() => new Map(brands.map((b) => [b.BRAND_ID, b])), [brands]);

  // Scoped to the real SE roster (not every distinct SE_OWNER value in the
  // data) — a brand can carry a HubSpot owner's raw full name as a fallback
  // (see normalizeOwnerName in lib/metabase.ts) when it has no assigned SE
  // shortname, and those aren't SEs we want a weekly lane for.
  const seOptions = SE_OWNERS;

  // Frozen order (see lib/weekly-snapshot.ts) resolved against live brand
  // data — churned/dismissed brands drop out, a brand pinned mid-week that
  // missed the snapshot gets appended. Split into to-do / done so progress
  // through the week is visible instead of the list just staying static.
  function laneFor(se: string): { todo: Brand[]; done: Brand[] } {
    const resolved = resolveWeeklyLane(brandsById, snapshot.bySe[se] ?? [], se, currentWeek);
    const todo = resolved.filter((b) => b.WEEKLY_FOCUS_DONE_WEEK !== currentWeek);
    const done = resolved.filter((b) => b.WEEKLY_FOCUS_DONE_WEEK === currentWeek);
    return { todo, done };
  }

  const lanes = (seFilter === "all" ? seOptions : [seFilter]).map((se) => ({ se, ...laneFor(se) }));
  const totalShown = lanes.reduce((sum, l) => sum + l.todo.length + l.done.length, 0);
  const totalTodo = lanes.reduce((sum, l) => sum + l.todo.length, 0);

  async function saveFieldOverride(brandId: number, field: string, value: string) {
    const res = await fetch("/api/field-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, field, value }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.errors?.join("; ") ?? "Save failed");
  }

  // Dismissal is scoped to the current ISO week (see lib/weekly-focus.ts) —
  // it clears itself once a new week starts rather than hiding a brand
  // forever, since "not this week" isn't the same claim as "never again."
  async function dismissForWeek(brandId: number) {
    updateBrand(brandId, { WEEKLY_FOCUS_DISMISSED_WEEK: currentWeek, WEEKLY_FOCUS_PINNED: false });
    try {
      await saveFieldOverride(brandId, "WEEKLY_FOCUS_DISMISSED_WEEK", currentWeek);
      if (brands.find((b) => b.BRAND_ID === brandId)?.WEEKLY_FOCUS_PINNED) {
        await saveFieldOverride(brandId, "WEEKLY_FOCUS_PINNED", "");
      }
    } catch (e) {
      updateBrand(brandId, { WEEKLY_FOCUS_DISMISSED_WEEK: null });
      alert(`Couldn't dismiss brand: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function togglePin(brandId: number) {
    const next = !brands.find((b) => b.BRAND_ID === brandId)?.WEEKLY_FOCUS_PINNED;
    updateBrand(brandId, { WEEKLY_FOCUS_PINNED: next });
    try {
      await saveFieldOverride(brandId, "WEEKLY_FOCUS_PINNED", next ? "true" : "");
    } catch (e) {
      updateBrand(brandId, { WEEKLY_FOCUS_PINNED: !next });
      alert(`Couldn't save pin: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Doesn't remove the brand from the board — it moves to the lane's "Done"
  // section so an SE (or anyone glancing at the board) can see real progress
  // through the week, not just a static list that looks the same all week.
  async function toggleDone(brandId: number) {
    const isDone = brands.find((b) => b.BRAND_ID === brandId)?.WEEKLY_FOCUS_DONE_WEEK === currentWeek;
    const next = isDone ? null : currentWeek;
    updateBrand(brandId, { WEEKLY_FOCUS_DONE_WEEK: next });
    try {
      await saveFieldOverride(brandId, "WEEKLY_FOCUS_DONE_WEEK", next ?? "");
    } catch (e) {
      updateBrand(brandId, { WEEKLY_FOCUS_DONE_WEEK: isDone ? currentWeek : null });
      alert(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Distinct from dismissForWeek: this removes the brand from the collab-
  // request queue entirely (SE_SPRINT_DISMISSED), same as the old SE Sprint
  // page's "Remove" button — used when a request was handled or added by
  // mistake, not just "skip it this week."
  async function removeCollabRequest(brandId: number) {
    updateBrand(brandId, { ON_SE_SPRINT_SHEET: false });
    try {
      await saveFieldOverride(brandId, "SE_SPRINT_DISMISSED", "true");
    } catch (e) {
      updateBrand(brandId, { ON_SE_SPRINT_SHEET: true });
      alert(`Couldn't remove collab request: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function updateBrand(brandId: number, updates: Partial<Brand>) {
    setBrands((prev) => prev.map((b) => (b.BRAND_ID === brandId ? { ...b, ...updates } : b)));
    setSelectedBrand((prev) => prev && prev.BRAND_ID === brandId ? { ...prev, ...updates } : prev);
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="se-sprint" />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 flex-shrink-0 flex items-start justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>This Week</h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
              Week {currentWeek} — {totalTodo} to do, {totalShown - totalTodo} handled
            </p>
          </div>
          <select
            value={seFilter}
            onChange={(e) => setSeFilter(e.target.value)}
            className="text-sm rounded-lg px-3 py-2 mt-1"
            style={{ background: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", fontSize: "0.875rem" }}
          >
            <option value="all">All SEs</option>
            {seOptions.map((se) => <option key={se} value={se}>{se}</option>)}
          </select>
        </div>

        {/* Lanes */}
        <div className="flex-1 overflow-auto p-8">
          {lanes.length === 0 ? (
            <div className="text-center py-20" style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.95rem" }}>
              No brands need focus this week.
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {lanes.map(({ se, todo, done }) => (
                <div key={se}>
                  <div className="flex items-center gap-2 mb-3">
                    <Rocket size={16} style={{ color: "#72a4bf" }} />
                    <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", textTransform: "capitalize" }}>{se}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                      {todo.length} to do
                    </span>
                    {done.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(76,175,130,0.15)", color: "#4caf82" }}>
                        {done.length} handled
                      </span>
                    )}
                  </div>
                  {todo.length === 0 && done.length === 0 ? (
                    <div className="rounded-xl py-6 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>
                      Nothing needs focus here this week.
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {[...todo, ...done].map((brand) => (
                        <FocusCard
                          key={brand.BRAND_ID}
                          brand={brand}
                          done={brand.WEEKLY_FOCUS_DONE_WEEK === currentWeek}
                          onClick={() => setSelectedBrand(brand)}
                          onTogglePin={() => togglePin(brand.BRAND_ID)}
                          onToggleDone={() => toggleDone(brand.BRAND_ID)}
                          onDismiss={() => dismissForWeek(brand.BRAND_ID)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedBrand && (
        <SprintRequestPanel
          brand={selectedBrand}
          entry={entriesByBrandId[selectedBrand.BRAND_ID]}
          currentWeek={currentWeek}
          onClose={() => setSelectedBrand(null)}
          onDismiss={() => dismissForWeek(selectedBrand.BRAND_ID)}
          onTogglePin={() => togglePin(selectedBrand.BRAND_ID)}
          onToggleDone={() => toggleDone(selectedBrand.BRAND_ID)}
          onRemoveCollabRequest={() => removeCollabRequest(selectedBrand.BRAND_ID)}
          onBrandUpdate={updateBrand}
        />
      )}
    </div>
  );
}

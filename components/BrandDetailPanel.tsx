"use client";

import { useState, useEffect } from "react";
import { Brand, WIDGET_TYPE_LABELS, WidgetTypeStatus, isBrandStuck } from "@/lib/metabase";
import { ALL_COLUMNS, ScheduledCall } from "./Dashboard";
import { sentimentStyle, recurlyStateStyle } from "./BrandCard";
import { SE_INFO } from "@/lib/se-info";
import { X, ExternalLink, CalendarPlus, Copy, Check, Pencil } from "lucide-react";

const OWNER_INITIALS: Record<string, string> = {
  maha: "MH", noor: "NR", naumaan: "NM",
  mohammad: "MO", kean: "KN", jean: "JN", zeke: "ZK", andres: "AB",
};
const OWNER_OPTIONS = ["maha", "noor", "naumaan", "mohammad", "kean", "jean", "zeke", "andres"];
// Only SEs with a Google-connected calendar can have a call scheduled on their
// behalf — this is deliberately narrower than OWNER_OPTIONS above.
const SCHEDULABLE_SES = Object.keys(SE_INFO);
const SEGMENT_OPTIONS = ["vip", "strategic", "enterprise", "mid_market"];
const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP", strategic: "Strategic", enterprise: "Enterprise", mid_market: "Mid-Market",
};
// The 5 widget types we track go-live status for, in display order:
// CAI, Analysis, Testimonials, Banner, Embedded.
const TRACKED_WIDGET_TYPES = ["gpt", "analysis", "qual", "sticker", "quant"];

function WidgetStatusRow({ type, status }: { type: string; status: WidgetTypeStatus | undefined }) {
  const label = WIDGET_TYPE_LABELS[type] ?? type;
  let display: React.ReactNode;
  let color: string;
  if (!status?.wentLiveAt) {
    display = "Not live";
    color = "rgba(255,255,255,0.3)";
  } else {
    const wentLive = new Date(status.wentLiveAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    if (status.isLive) {
      display = `Live since ${wentLive}`;
      color = "#4caf82";
    } else {
      display = `Went live ${wentLive} (inactive)`;
      color = "#e0a95c";
    }
  }
  return (
    <div className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <span style={{ fontSize: "0.8rem", color, textAlign: "right" }}>{display}</span>
    </div>
  );
}

function initials(name: string | null) {
  if (!name) return "—";
  return OWNER_INITIALS[name.toLowerCase()] ?? name.slice(0, 2).toUpperCase();
}

function Avatar({ name, title }: { name: string | null; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: "#1e3a4f", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
        {initials(name)}
      </span>
      <div>
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
        <div style={{ fontSize: "0.875rem", color: "#fff" }}>{name ?? "Unassigned"}</div>
      </div>
    </div>
  );
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "0.875rem", color: "#fff", textAlign: "right" }}>{value}</span>
    </div>
  );
}

type ScheduleState = "idle" | "loading" | "success" | "error";
type ScheduleAction = "call" | "webinar";

async function saveFieldOverride(brandId: number, field: string, value: string, hubspotCompanyId?: number | null): Promise<string | null> {
  try {
    const res = await fetch("/api/field-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, field, value, hubspotCompanyId }),
    });
    const data = await res.json();
    if (!data.ok) return data.errors?.join("; ") ?? "Save failed";
    return null;
  } catch (e) {
    return String(e);
  }
}

function EditableOwner({
  brandId, field, label, value, hubspotCompanyId, onSaved,
}: { brandId: number; field: string; label: string; value: string | null; hubspotCompanyId?: number | null; onSaved?: (field: string, value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSelect(v: string) {
    setSaving(true);
    setSaveError(null);
    setCurrent(v);
    setEditing(false);
    const err = await saveFieldOverride(brandId, field, v, hubspotCompanyId);
    if (err) { setSaveError(err); } else { onSaved?.(field, v); }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: "#1e3a4f", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
        {initials(current)}
      </span>
      <div className="flex-1">
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        {editing ? (
          <select
            autoFocus
            value={current ?? ""}
            onChange={(e) => handleSelect(e.target.value)}
            onBlur={() => setEditing(false)}
            style={{
              background: "#0d1e2d", color: "#fff", border: "1px solid rgba(114,164,191,0.4)",
              borderRadius: "6px", padding: "2px 6px", fontSize: "0.875rem", width: "100%",
            }}>
            <option value="">Unassigned</option>
            {OWNER_OPTIONS.map((o) => (
              <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: "0.875rem", color: current ? "#fff" : "rgba(255,255,255,0.3)" }}>
              {current ?? "Unassigned"}
            </span>
            {saving ? (
              <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)" }}>saving…</span>
            ) : saveError ? (
              <span title={saveError} style={{ fontSize: "0.7rem", color: "#e05c5c", cursor: "help" }}>✗ not saved</span>
            ) : (
              <button onClick={() => setEditing(true)} style={{ color: "rgba(255,255,255,0.25)" }} className="hover:opacity-70">
                <Pencil size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditableSelect({
  brandId, field, label, value, options, optionLabels, hubspotCompanyId, onSaved,
}: { brandId: number; field: string; label: string; value: string | null; options: string[]; optionLabels: Record<string, string>; hubspotCompanyId?: number | null; onSaved?: (field: string, value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSelect(v: string) {
    setSaving(true);
    setSaveError(null);
    setCurrent(v || null);
    setEditing(false);
    const err = await saveFieldOverride(brandId, field, v, hubspotCompanyId);
    if (err) { setSaveError(err); } else { onSaved?.(field, v); }
    setSaving(false);
  }

  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
      {editing ? (
        <select
          autoFocus
          value={current ?? ""}
          onChange={(e) => handleSelect(e.target.value)}
          onBlur={() => setEditing(false)}
          style={{
            background: "#0d1e2d", color: "#fff", border: "1px solid rgba(114,164,191,0.4)",
            borderRadius: "6px", padding: "2px 6px", fontSize: "0.875rem",
          }}>
          <option value="">Not set</option>
          {options.map((o) => (
            <option key={o} value={o}>{optionLabels[o] ?? o}</option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: "0.875rem", color: current ? "#fff" : "rgba(255,255,255,0.3)", textAlign: "right" }}>
            {current ? (optionLabels[current] ?? current) : "Not set"}
          </span>
          {saving ? (
            <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)" }}>saving…</span>
          ) : saveError ? (
            <span title={saveError} style={{ fontSize: "0.7rem", color: "#e05c5c", cursor: "help" }}>✗ not saved</span>
          ) : (
            <button onClick={() => setEditing(true)} style={{ color: "rgba(255,255,255,0.25)" }} className="hover:opacity-70">
              <Pencil size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function EditableText({
  brandId, field, label, value, hubspotCompanyId, onSaved,
}: { brandId: number; field: string; label: string; value: string | null; hubspotCompanyId?: number | null; onSaved?: (field: string, value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setEditing(false);
    const err = await saveFieldOverride(brandId, field, current, hubspotCompanyId);
    if (err) { setSaveError(err); } else { onSaved?.(field, current); }
    setSaving(false);
  }

  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
      {editing ? (
        <input
          autoFocus
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          style={{
            background: "#0d1e2d", color: "#fff", border: "1px solid rgba(114,164,191,0.4)",
            borderRadius: "6px", padding: "2px 8px", fontSize: "0.875rem", width: "160px",
          }}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: "0.875rem", color: current ? "#fff" : "rgba(255,255,255,0.3)", textAlign: "right" }}>
            {current || "Not set"}
          </span>
          {saving ? (
            <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)" }}>saving…</span>
          ) : saveError ? (
            <span title={saveError} style={{ fontSize: "0.7rem", color: "#e05c5c", cursor: "help" }}>✗ not saved</span>
          ) : (
            <button onClick={() => setEditing(true)} style={{ color: "rgba(255,255,255,0.25)" }} className="hover:opacity-70">
              <Pencil size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Follow-up controls: a scheduled one-off date (brand said "not ready until X")
// and a hard disable switch. Both persist as field overrides (Notion only — no
// hubspotCompanyId passed, so nothing is written to HubSpot).
function SeSprintControl({ brand, onBrandUpdate }: {
  brand: Brand;
  onBrandUpdate?: (brandId: number, updates: Partial<Brand>) => void;
}) {
  const [onSprint, setOnSprint] = useState(brand.ON_SE_SPRINT_SHEET);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fromForm = brand.SE_SPRINT_SUBMITTED_AT != null;

  async function toggle() {
    const next = !onSprint;
    setOnSprint(next); setBusy(true); setErr(null);
    const e = await saveFieldOverride(brand.BRAND_ID, "ON_SE_SPRINT_SHEET", next ? "true" : "");
    if (e) { setErr(e); setOnSprint(!next); } else { onBrandUpdate?.(brand.BRAND_ID, { ON_SE_SPRINT_SHEET: next }); }
    setBusy(false);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div style={{ fontSize: "0.8rem", color: "#fff" }}>{onSprint ? "On SE Sprint queue" : "Not on SE Sprint queue"}</div>
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>
          {fromForm ? `Submitted the request form (${brand.SE_SPRINT_SUBMITTED_AT})` : "Added manually"}
        </div>
        {err && <div style={{ fontSize: "0.7rem", color: "#e05c5c", marginTop: "2px" }}>{err}</div>}
      </div>
      <button
        onClick={toggle}
        disabled={busy || (onSprint && fromForm)}
        title={onSprint && fromForm ? "This brand submitted the request form — remove it from the sheet to take it off the queue" : undefined}
        className="px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40"
        style={{
          background: onSprint ? "rgba(224,92,92,0.12)" : "rgba(233,168,76,0.12)",
          color: onSprint ? "#e05c5c" : "#e9a84c",
          fontSize: "0.8rem", border: "none", cursor: busy || (onSprint && fromForm) ? "default" : "pointer", flexShrink: 0,
        }}>
        {onSprint ? "Remove from queue" : "Add to queue"}
      </button>
    </div>
  );
}

function FollowupControls({ brand, onBrandUpdate }: {
  brand: Brand;
  onBrandUpdate?: (brandId: number, updates: Partial<Brand>) => void;
}) {
  const [disabled, setDisabled] = useState(brand.FOLLOWUPS_DISABLED);
  const [snoozeDate, setSnoozeDate] = useState(brand.FOLLOWUP_SNOOZE_UNTIL ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggleDisabled() {
    const next = !disabled;
    setDisabled(next); setBusy(true); setErr(null);
    const e = await saveFieldOverride(brand.BRAND_ID, "FOLLOWUPS_DISABLED", next ? "true" : "");
    if (e) { setErr(e); setDisabled(!next); } else { onBrandUpdate?.(brand.BRAND_ID, { FOLLOWUPS_DISABLED: next }); }
    setBusy(false);
  }

  async function saveDate(v: string) {
    setSnoozeDate(v); setBusy(true); setErr(null);
    const e = await saveFieldOverride(brand.BRAND_ID, "FOLLOWUP_SNOOZE_UNTIL", v);
    if (e) { setErr(e); } else { onBrandUpdate?.(brand.BRAND_ID, { FOLLOWUP_SNOOZE_UNTIL: v || null }); }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div style={{ fontSize: "0.8rem", color: "#fff" }}>Follow-ups</div>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>
            {disabled ? "Disabled — this brand won't be contacted" : "Automated 10/20/30/40-day cadence active"}
          </div>
        </div>
        <button
          onClick={toggleDisabled}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
          style={{
            background: disabled ? "rgba(76,175,130,0.12)" : "rgba(224,92,92,0.12)",
            color: disabled ? "#4caf82" : "#e05c5c",
            fontSize: "0.8rem", border: "none", cursor: busy ? "default" : "pointer", flexShrink: 0,
          }}>
          {disabled ? "Enable follow-ups" : "Disable follow-ups"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div style={{ fontSize: "0.8rem", color: "#fff" }}>Scheduled follow-up</div>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>
            One agnostic check-in on this date (e.g. brand said &ldquo;not ready yet&rdquo;), then no more.
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="date"
            value={snoozeDate}
            disabled={disabled || busy}
            onChange={(e) => saveDate(e.target.value)}
            style={{
              background: "#0d1e2d", color: "#fff", border: "1px solid rgba(114,164,191,0.4)",
              borderRadius: "6px", padding: "3px 6px", fontSize: "0.8rem", opacity: disabled ? 0.4 : 1,
              colorScheme: "dark",
            }} />
          {snoozeDate && !disabled && (
            <button onClick={() => saveDate("")} title="Clear" style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer" }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {err && <div style={{ fontSize: "0.72rem", color: "#e05c5c" }}>Couldn&apos;t save: {err}</div>}
    </div>
  );
}

export default function BrandDetailPanel({ brand, scheduledCall, onClose, onBrandUpdate }: {
  brand: Brand;
  scheduledCall: ScheduledCall | null;
  onClose: () => void;
  onBrandUpdate?: (brandId: number, updates: Partial<Brand>) => void;
}) {
  const [scheduleState, setScheduleState] = useState<ScheduleState>("idle");
  const [scheduleAction, setScheduleAction] = useState<ScheduleAction | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleAuthUrl, setScheduleAuthUrl] = useState<string | null>(null);
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  // Whoever clicks "Schedule 1:1 Call" can put it on their own calendar instead
  // of the brand's assigned SE — defaults to the assigned SE when they're
  // schedulable, otherwise the first option.
  const [scheduleAs, setScheduleAs] = useState<string>(
    brand.SE_OWNER && SCHEDULABLE_SES.includes(brand.SE_OWNER.toLowerCase())
      ? brand.SE_OWNER.toLowerCase()
      : SCHEDULABLE_SES[0]
  );

  useEffect(() => {
    if (!brand.HUBSPOT_COMPANY_ID) return;
    fetch(`/api/hubspot-contacts?hubspotCompanyId=${brand.HUBSPOT_COMPANY_ID}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.emails ?? []));
  }, [brand.HUBSPOT_COMPANY_ID]);

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  }

  async function handleSchedule(action: ScheduleAction) {
    setScheduleState("loading");
    setScheduleAction(action);
    setScheduleError(null);
    setScheduleAuthUrl(null);
    setScheduleWarning(null);
    try {
      const res = await fetch("/api/schedule-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brand.BRAND_ID,
          action,
          ...(action === "call" ? { scheduleAs } : {}),
        }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.success) {
        setScheduleState("success");
        setScheduleWarning(result?.draftWarning ?? null);
      } else {
        setScheduleState("error");
        setScheduleError(result?.error ?? "Unknown error");
        setScheduleAuthUrl(result?.authUrl ?? null);
      }
    } catch (err) {
      setScheduleState("error");
      setScheduleError(String(err));
    }
  }

  const col = ALL_COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
  const hubspotUrl = brand.HUBSPOT_COMPANY_ID
    ? `https://app-na2.hubspot.com/contacts/46815331/record/0-2/${brand.HUBSPOT_COMPANY_ID}`
    : null;
  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
  const isStuck = isBrandStuck(brand);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 overflow-y-auto flex flex-col"
        style={{ width: "420px", background: "#0d1e2d", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-start justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <h2 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>
              {brand.BRAND_NAME}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: (col?.accent ?? "#333") + "22", color: col?.accent ?? "#fff" }}>
                {col?.label ?? brand.PIPELINE_STATUS}
              </span>
              {isStuck && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "#e05c5c22", color: "#e05c5c" }}>
                  Stuck {brand.DAYS_IN_STATUS}d
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "rgba(255,255,255,0.4)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 flex-1">
          {/* Team */}
          <div className="mb-6">
            <div className="mb-3" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Team</div>
            <div className="flex flex-col gap-3">
              <EditableOwner brandId={brand.BRAND_ID} field="SE_OWNER" label="SE Owner" value={brand.SE_OWNER} hubspotCompanyId={brand.HUBSPOT_COMPANY_ID} onSaved={(f, v) => onBrandUpdate?.(brand.BRAND_ID, { SE_OWNER: v })} />
              <EditableOwner brandId={brand.BRAND_ID} field="ACCOUNT_MANAGER" label="Account Manager" value={brand.ACCOUNT_MANAGER} hubspotCompanyId={brand.HUBSPOT_COMPANY_ID} onSaved={(f, v) => onBrandUpdate?.(brand.BRAND_ID, { ACCOUNT_MANAGER: v })} />
              <EditableOwner brandId={brand.BRAND_ID} field="OPS_OWNER" label="Ops Owner" value={brand.OPS_OWNER} hubspotCompanyId={brand.HUBSPOT_COMPANY_ID} onSaved={(f, v) => onBrandUpdate?.(brand.BRAND_ID, { OPS_OWNER: v })} />
              <EditableOwner brandId={brand.BRAND_ID} field="BD_REP" label="BD Rep" value={brand.BD_REP} onSaved={(f, v) => onBrandUpdate?.(brand.BRAND_ID, { BD_REP: v })} />
            </div>
          </div>

          {/* Contacts */}
          {brand.HUBSPOT_COMPANY_ID && (
            <div className="mb-6">
              <div className="mb-3" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Contacts</div>
              {contacts.length === 0 ? (
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.25)" }}>Loading…</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {contacts.map((email) => (
                    <div key={email} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <span style={{ fontSize: "0.85rem", color: "#fff" }}>{email}</span>
                      <button onClick={() => copyEmail(email)} className="hover:opacity-70 flex-shrink-0"
                        style={{ color: copiedEmail === email ? "#4caf82" : "rgba(255,255,255,0.3)" }}>
                        {copiedEmail === email ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pipeline */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Pipeline</div>
            <EditableSelect
              brandId={brand.BRAND_ID} field="KIND" label="Segment"
              value={brand.KIND} options={SEGMENT_OPTIONS} optionLabels={SEGMENT_LABELS}
              hubspotCompanyId={brand.HUBSPOT_COMPANY_ID}
              onSaved={(f, v) => onBrandUpdate?.(brand.BRAND_ID, { KIND: v })}
            />
            <Row label="Days in status" value={<span style={{ color: isStuck ? "#e05c5c" : "#fff" }}>{brand.DAYS_IN_STATUS}d</span>} />
            <Row label="Created" value={new Date(brand.BRAND_CREATED_AT).toLocaleDateString()} />
            <Row label="Last sign-in" value={brand.ANY_ADMIN_LAST_SIGNED_IN_AT ? new Date(brand.ANY_ADMIN_LAST_SIGNED_IN_AT).toLocaleDateString() : "Never"} />
            {brand.PYLON_SENTIMENT && (
              <Row label="Pylon sentiment" value={
                <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
                  style={{ background: sentimentStyle(brand.PYLON_SENTIMENT).color + "26", color: sentimentStyle(brand.PYLON_SENTIMENT).color }}>
                  {sentimentStyle(brand.PYLON_SENTIMENT).label}
                </span>
              } />
            )}
            {brand.PYLON_LAST_COMMUNICATION_AT && (
              <Row label="Last communication" value={
                `${new Date(brand.PYLON_LAST_COMMUNICATION_AT).toLocaleDateString()} (${daysAgo(brand.PYLON_LAST_COMMUNICATION_AT)}d ago)`
              } />
            )}
          </div>

          {/* Billing — the brand's most recent Recurly subscription. Absent
              entirely if no Recurly account matched by brand name. */}
          {brand.RECURLY_STATE && (
            <div className="mb-6">
              <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Billing</div>
              <Row label="Status" value={
                <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
                  style={{ background: recurlyStateStyle(brand.RECURLY_STATE).color + "26", color: recurlyStateStyle(brand.RECURLY_STATE).color }}>
                  {recurlyStateStyle(brand.RECURLY_STATE).label}
                </span>
              } />
              {brand.RECURLY_PLAN_NAME && <Row label="Plan" value={brand.RECURLY_PLAN_NAME} />}
              {brand.RECURLY_AMOUNT != null && (
                <Row label="Amount" value={`${brand.RECURLY_CURRENCY ?? "USD"} ${brand.RECURLY_AMOUNT.toLocaleString()}`} />
              )}
              {brand.RECURLY_CURRENT_PERIOD_ENDS_AT && (
                <Row label="Current period ends" value={new Date(brand.RECURLY_CURRENT_PERIOD_ENDS_AT).toLocaleDateString()} />
              )}
              {brand.RECURLY_CURRENT_TERM_ENDS_AT && (
                <Row label="Term ends" value={new Date(brand.RECURLY_CURRENT_TERM_ENDS_AT).toLocaleDateString()} />
              )}
              {brand.RECURLY_AUTO_RENEW != null && (
                <Row label="Auto-renew" value={brand.RECURLY_AUTO_RENEW ? "Yes" : "No"} />
              )}
              {brand.RECURLY_BILLING_PORTAL_URL && (
                <Row label="Billing portal" value={
                  <a href={brand.RECURLY_BILLING_PORTAL_URL} target="_blank" rel="noopener noreferrer"
                    style={{ color: "#72a4bf" }} className="flex items-center gap-1 hover:opacity-80" title="Brand's self-service billing portal — sensitive, internal use only">
                    Open <ExternalLink size={11} />
                  </a>
                } />
              )}
            </div>
          )}

          {/* Products */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Products</div>
            <Row label="Total products" value={brand.PRODUCTS_COUNT} />
            <Row label="Reviews requested" value={brand.REVIEWS_REQUESTED} />
            <Row label="Reviews ready" value={brand.HAS_REVIEWS_READY ? "Yes" : "No"} />
            <Row label="Pending board review" value={brand.HAS_PENDING_BOARD_REVIEW ? "Yes" : "No"} />
            <Row label="Rejected by board" value={brand.HAS_REJECTED_BY_BOARD ? "Yes" : "No"} />
          </div>

          {/* Clinician Analysis */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Clinician Analysis</div>
            <Row label="CA requested" value={brand.CA_REQUESTED} />
            <Row label="CA ready" value={brand.HAS_CA_READY ? "Yes" : "No"} />
          </div>

          {/* Implementation */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Implementation</div>

            {brand.WIDGET_TYPES.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {brand.WIDGET_TYPES.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-full text-xs"
                    style={{ background: "rgba(114,164,191,0.12)", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.2)" }}>
                    {WIDGET_TYPE_LABELS[t] ?? t}
                  </span>
                ))}
              </div>
            )}

            {brand.CAI_IMPLEMENTATION_READY && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
                style={{
                  background: brand.CAI_IMPLEMENTATION_READY === "CAI" ? "rgba(76,175,130,0.1)" : "rgba(139,127,232,0.1)",
                  border: `1px solid ${brand.CAI_IMPLEMENTATION_READY === "CAI" ? "rgba(76,175,130,0.25)" : "rgba(139,127,232,0.25)"}`,
                }}>
                <span style={{ fontSize: "1rem" }}>✓</span>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, color: brand.CAI_IMPLEMENTATION_READY === "CAI" ? "#4caf82" : "#8b7fe8" }}>
                    Ready for {brand.CAI_IMPLEMENTATION_READY === "CAI" ? "Clinician AI" : "CAS"} Implementation
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)" }}>Per Customer Success Tracker</div>
                </div>
              </div>
            )}

            <Row
              label="Impl. call"
              value={
                scheduledCall
                  ? <span style={{ color: "#4caf82" }}>
                      {scheduledCall.action === "webinar_sheet"
                        ? "✓ On webinar list"
                        : scheduledCall.callDate
                          ? `✓ ${new Date(scheduledCall.callDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                          : "✓ Scheduled"}
                    </span>
                  : <span style={{ color: "rgba(255,255,255,0.3)" }}>Not scheduled</span>
              }
            />
            <Row label="Share threshold met" value={brand.HAS_SHARE_THRESHOLD_MET ? "Yes" : "No"} />
            <EditableText brandId={brand.BRAND_ID} field="COLLABORATOR_CODE" label="Collaborator code" value={brand.COLLABORATOR_CODE} hubspotCompanyId={brand.HUBSPOT_COMPANY_ID} onSaved={(f, v) => onBrandUpdate?.(brand.BRAND_ID, { COLLABORATOR_CODE: v })} />
          </div>

          {/* SE Sprint queue — brands land here via the "Request for Assisted
              Implementation" form (see lib/se-sprint-sheet.ts) or by being
              added manually. Only a manual add can be removed here — a real
              form submission keeps showing up on next sync regardless. */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>SE Sprint</div>
            <SeSprintControl brand={brand} onBrandUpdate={onBrandUpdate} />
          </div>

          {/* Widget Status — per-type go-live tracking */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Widget Status</div>
            {TRACKED_WIDGET_TYPES.map((type) => (
              <WidgetStatusRow key={type} type={type} status={brand.WIDGET_STATUSES?.[type]} />
            ))}
          </div>

          {/* Follow-ups — automated snippet-implementation cadence controls */}
          <div className="mb-6">
            <div className="mb-3" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Follow-ups</div>
            <FollowupControls brand={brand} onBrandUpdate={onBrandUpdate} />
          </div>

          {/* Links */}
          <div>
            <div className="mb-3" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Links</div>
            <div className="flex flex-col gap-2">
              <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                style={{ background: "rgba(114,164,191,0.1)", color: "#72a4bf", fontSize: "0.875rem" }}>
                <ExternalLink size={14} /> Admin Portal
              </a>
              {hubspotUrl && (
                <a href={hubspotUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: "rgba(249,115,22,0.1)", color: "#f97316", fontSize: "0.875rem" }}>
                  <ExternalLink size={14} /> HubSpot
                </a>
              )}
              {brand.PIPELINE_STATUS === "products_approved_needs_call" && (
                scheduleState === "success" ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: "0.875rem" }}>
                      <CalendarPlus size={14} />
                      {scheduleAction === "call" ? "Call scheduled ✓" : "Added to webinar list ✓"}
                    </div>
                    {scheduleWarning && (
                      <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(233,168,76,0.12)", color: "#e9a84c", fontSize: "0.8rem" }}>
                        {scheduleWarning}
                      </div>
                    )}
                  </div>
                ) : scheduleState === "error" ? (
                  <div className="flex flex-col gap-2">
                    <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(224,92,92,0.1)", color: "#e05c5c", fontSize: "0.8rem" }}>
                      Failed: {scheduleError ?? "Unknown error"}
                    </div>
                    {scheduleAuthUrl && (
                      <a
                        href={scheduleAuthUrl}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                        style={{ background: "rgba(114,164,191,0.1)", color: "#72a4bf", fontSize: "0.875rem" }}
                      >
                        <ExternalLink size={14} /> Connect Google Account
                      </a>
                    )}
                    <button
                      onClick={() => { setScheduleState("idle"); setScheduleError(null); setScheduleAuthUrl(null); setScheduleWarning(null); }}
                      className="text-left"
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", cursor: "pointer", padding: "2px 0" }}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>Schedule as</span>
                      <select
                        value={scheduleAs}
                        onChange={(e) => setScheduleAs(e.target.value)}
                        style={{
                          background: "#0d1e2d", color: "#fff", border: "1px solid rgba(114,164,191,0.4)",
                          borderRadius: "6px", padding: "2px 6px", fontSize: "0.8rem", flex: 1,
                        }}>
                        {SCHEDULABLE_SES.map((se) => (
                          <option key={se} value={se}>{SE_INFO[se].displayName}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => handleSchedule("call")}
                      disabled={scheduleState === "loading"}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity text-left"
                      style={{ background: "rgba(114,164,191,0.1)", color: "#72a4bf", fontSize: "0.875rem", opacity: scheduleState === "loading" && scheduleAction === "call" ? 0.6 : 1, border: "none", cursor: "pointer", width: "100%" }}>
                      <CalendarPlus size={14} />
                      {scheduleState === "loading" && scheduleAction === "call" ? "Scheduling…" : `Schedule 1:1 Call (as ${SE_INFO[scheduleAs].displayName})`}
                    </button>
                    <button
                      onClick={() => handleSchedule("webinar")}
                      disabled={scheduleState === "loading"}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity text-left"
                      style={{ background: "rgba(139,127,232,0.1)", color: "#8b7fe8", fontSize: "0.875rem", opacity: scheduleState === "loading" && scheduleAction === "webinar" ? 0.6 : 1, border: "none", cursor: "pointer", width: "100%" }}>
                      <CalendarPlus size={14} />
                      {scheduleState === "loading" && scheduleAction === "webinar" ? "Adding…" : "Add to Webinar List"}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

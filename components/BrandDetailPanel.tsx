"use client";

import { useState, useEffect } from "react";
import { Brand, WIDGET_TYPE_LABELS } from "@/lib/metabase";
import { COLUMNS, ScheduledCall } from "./Dashboard";
import { X, ExternalLink, CalendarPlus, Copy, Check, Pencil } from "lucide-react";

const OWNER_INITIALS: Record<string, string> = {
  maha: "MH", noor: "NR", naumaan: "NM",
  mohammad: "MO", kean: "KN", jean: "JN", zeke: "ZK",
};
const OWNER_OPTIONS = ["maha", "noor", "naumaan", "mohammad", "kean", "jean", "zeke"];
const SEGMENT_OPTIONS = ["vip", "strategic", "enterprise", "mid_market"];
const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP", strategic: "Strategic", enterprise: "Enterprise", mid_market: "Mid-Market",
};

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

async function saveFieldOverride(brandId: number, field: string, value: string, hubspotCompanyId?: number | null) {
  await fetch("/api/field-overrides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, field, value, hubspotCompanyId }),
  });
}

function EditableOwner({
  brandId, field, label, value, hubspotCompanyId, onSaved,
}: { brandId: number; field: string; label: string; value: string | null; hubspotCompanyId?: number | null; onSaved?: (field: string, value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);

  async function handleSelect(v: string) {
    setSaving(true);
    setCurrent(v);
    setEditing(false);
    await saveFieldOverride(brandId, field, v, hubspotCompanyId);
    onSaved?.(field, v);
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
            {!saving && (
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

  async function handleSelect(v: string) {
    setSaving(true);
    setCurrent(v || null);
    setEditing(false);
    await saveFieldOverride(brandId, field, v, hubspotCompanyId);
    onSaved?.(field, v);
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
          {!saving && (
            <button onClick={() => setEditing(true)} style={{ color: "rgba(255,255,255,0.25)" }} className="hover:opacity-70">
              <Pencil size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditableText({
  brandId, field, label, value, hubspotCompanyId, onSaved,
}: { brandId: number; field: string; label: string; value: string | null; hubspotCompanyId?: number | null; onSaved?: (field: string, value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setEditing(false);
    await saveFieldOverride(brandId, field, current, hubspotCompanyId);
    onSaved?.(field, current);
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
          {!saving && (
            <button onClick={() => setEditing(true)} style={{ color: "rgba(255,255,255,0.25)" }} className="hover:opacity-70">
              <Pencil size={11} />
            </button>
          )}
        </div>
      )}
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
  const [contacts, setContacts] = useState<string[]>([]);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

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
    try {
      const res = await fetch("/api/schedule-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.BRAND_ID, action }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.success) {
        setScheduleState("success");
      } else {
        setScheduleState("error");
        setScheduleError(result?.error ?? "Unknown error");
      }
    } catch (err) {
      setScheduleState("error");
      setScheduleError(String(err));
    }
  }

  const col = COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
  const hubspotUrl = brand.HUBSPOT_COMPANY_ID
    ? `https://app.hubspot.com/contacts/21791298/company/${brand.HUBSPOT_COMPANY_ID}`
    : null;
  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
  const isStuck = brand.DAYS_IN_STATUS > 7;

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
          </div>

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
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: "0.875rem" }}>
                    <CalendarPlus size={14} />
                    {scheduleAction === "call" ? "Call scheduled ✓" : "Added to webinar list ✓"}
                  </div>
                ) : scheduleState === "error" ? (
                  <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(224,92,92,0.1)", color: "#e05c5c", fontSize: "0.8rem" }}>
                    Failed: {scheduleError ?? "check Apps Script deployment"}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleSchedule("call")}
                      disabled={scheduleState === "loading"}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity text-left"
                      style={{ background: "rgba(114,164,191,0.1)", color: "#72a4bf", fontSize: "0.875rem", opacity: scheduleState === "loading" && scheduleAction === "call" ? 0.6 : 1, border: "none", cursor: "pointer", width: "100%" }}>
                      <CalendarPlus size={14} />
                      {scheduleState === "loading" && scheduleAction === "call" ? "Scheduling…" : "Schedule 1:1 Call"}
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

"use client";

import { useMemo, useState } from "react";
import { Brand } from "@/lib/metabase";
import { SeSprintEntry } from "@/lib/se-sprint-sheet";
import { weeklyFocusScore, weeklyFocusReasons, isWeeklyFocusVisible, isoWeek, WeeklyFocusReason } from "@/lib/weekly-focus";
import { ALL_COLUMNS } from "./Dashboard";
import Sidebar from "./Sidebar";
import { EditableText } from "./BrandDetailPanel";
import { Rocket, X, ExternalLink, Trash2, Pin, PinOff } from "lucide-react";

const LANE_SIZE = 20;

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

// Shows what THIS form submission actually said — hosting/page builder/
// headless/theme/notes/etc. — rather than the brand's general pipeline
// status, SE/AM/Ops, or widget history (that's what BrandDetailPanel is
// for, and it's not what an SE needs when working through this queue).
function SprintRequestPanel({ brand, entry, onClose, onDismiss, onTogglePin, onRemoveCollabRequest, onBrandUpdate }: {
  brand: Brand;
  entry: SeSprintEntry | undefined;
  onClose: () => void;
  onDismiss: () => void;
  onTogglePin: () => void;
  onRemoveCollabRequest: () => void;
  onBrandUpdate: (brandId: number, updates: Partial<Brand>) => void;
}) {
  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
  const reasons = weeklyFocusReasons(brand);

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
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <a href={adminUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#72a4bf" }} className="flex items-center gap-1 hover:opacity-80">
            Open in Admin <ExternalLink size={11} />
          </a>
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

export default function SeSprintPage({ initialBrands, entriesByBrandId }: { initialBrands: Brand[]; entriesByBrandId: Record<number, SeSprintEntry> }) {
  const [brands, setBrands] = useState(initialBrands);
  const [seFilter, setSeFilter] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const currentWeek = useMemo(() => isoWeek(new Date()), []);

  const visible = useMemo(
    () => brands.filter((b) => isWeeklyFocusVisible(b, currentWeek)),
    [brands, currentWeek]
  );

  const seOptions = Array.from(new Set(visible.map((b) => b.SE_OWNER).filter((se): se is string => !!se))).sort();

  // Highest-scoring brands first within each SE's lane, capped at LANE_SIZE —
  // a pin always keeps a brand visible regardless of rank, so pinned brands
  // beyond the cap are appended rather than dropped.
  function laneFor(se: string): Brand[] {
    const owned = visible.filter((b) => b.SE_OWNER === se);
    const ranked = [...owned].sort((a, b) => weeklyFocusScore(b) - weeklyFocusScore(a));
    const top = ranked.slice(0, LANE_SIZE);
    const pinnedBeyondCap = ranked.slice(LANE_SIZE).filter((b) => b.WEEKLY_FOCUS_PINNED);
    return [...top, ...pinnedBeyondCap];
  }

  const lanes = (seFilter === "all" ? seOptions : [seFilter]).map((se) => ({ se, brands: laneFor(se) }));
  const totalShown = lanes.reduce((sum, l) => sum + l.brands.length, 0);

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
              Week {currentWeek} — top {LANE_SIZE} per SE, ranked by frustration, ticket volume, collab requests, and days stuck — {totalShown} shown
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
              {lanes.map(({ se, brands: laneBrands }) => (
                <div key={se}>
                  <div className="flex items-center gap-2 mb-3">
                    <Rocket size={16} style={{ color: "#72a4bf" }} />
                    <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", textTransform: "capitalize" }}>{se}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                      {laneBrands.length}
                    </span>
                  </div>
                  {laneBrands.length === 0 ? (
                    <div className="rounded-xl py-6 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>
                      Nothing needs focus here this week.
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <table className="w-full">
                        <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                          <tr>
                            {["Brand", "Status", "Why", "Sentiment", "Collab code", ""].map((h) => (
                              <th key={h} className="text-left px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {laneBrands.map((brand) => {
                            const col = ALL_COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
                            const code = collaboratorCode(brand);
                            const reasons = weeklyFocusReasons(brand);
                            return (
                              <tr key={brand.BRAND_ID} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                                onClick={() => setSelectedBrand(brand)}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                                <td className="px-4 py-3" style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                                  <div className="flex items-center gap-1.5">
                                    {brand.WEEKLY_FOCUS_PINNED && <Pin size={12} style={{ color: "#e9a84c" }} />}
                                    {brand.BRAND_NAME}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: (col?.accent ?? "#333") + "22", color: col?.accent ?? "#fff" }}>
                                    {col?.label ?? brand.PIPELINE_STATUS}
                                  </span>
                                </td>
                                <td className="px-4 py-3"><ReasonBadges reasons={reasons} /></td>
                                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.PYLON_SENTIMENT ?? "—"}</td>
                                <td className="px-4 py-3">
                                  {code ? (
                                    <span style={{ fontSize: "0.8rem", color: "#4caf82", fontFamily: "monospace" }}>{code}</span>
                                  ) : brand.ON_SE_SPRINT_SHEET ? (
                                    <span style={{ fontSize: "0.8rem", color: "#e9a84c", fontWeight: 600 }}>Not on file</span>
                                  ) : (
                                    <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.2)" }}>—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-3">
                                    <button
                                      onClick={() => togglePin(brand.BRAND_ID)}
                                      title={brand.WEEKLY_FOCUS_PINNED ? "Unpin" : "Pin this week"}
                                      style={{ color: brand.WEEKLY_FOCUS_PINNED ? "#e9a84c" : "rgba(255,255,255,0.3)" }}
                                      className="hover:opacity-100">
                                      {brand.WEEKLY_FOCUS_PINNED ? <PinOff size={14} /> : <Pin size={14} />}
                                    </button>
                                    <button
                                      onClick={() => dismissForWeek(brand.BRAND_ID)}
                                      title="Dismiss for this week"
                                      style={{ color: "rgba(255,255,255,0.3)" }}
                                      className="hover:opacity-100 hover:text-red-400">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
          onClose={() => setSelectedBrand(null)}
          onDismiss={() => dismissForWeek(selectedBrand.BRAND_ID)}
          onTogglePin={() => togglePin(selectedBrand.BRAND_ID)}
          onRemoveCollabRequest={() => removeCollabRequest(selectedBrand.BRAND_ID)}
          onBrandUpdate={updateBrand}
        />
      )}
    </div>
  );
}

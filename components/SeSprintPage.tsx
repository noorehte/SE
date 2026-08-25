"use client";

import { useState } from "react";
import { Brand } from "@/lib/metabase";
import { SeSprintEntry } from "@/lib/se-sprint-sheet";
import { ALL_COLUMNS } from "./Dashboard";
import Sidebar from "./Sidebar";
import { Rocket, X, ExternalLink } from "lucide-react";

// A brand is in the SE Sprint queue once it's submitted the "Request for
// Assisted FrontrowMD Implementation" form — regardless of whether it's
// already shared its Shopify Collaborator Code (that's tracked separately,
// see codeProvided below) or what pipeline stage it's otherwise in.
function sprintBrands(brands: Brand[]): Brand[] {
  return brands
    .filter((b) => b.ON_SE_SPRINT_SHEET)
    .sort((a, b) => (b.SE_SPRINT_SUBMITTED_AT ?? "").localeCompare(a.SE_SPRINT_SUBMITTED_AT ?? ""));
}

// Whether we actually have the code in hand — the form's own "have you
// shared it?" Yes/No/Unsure answer is self-reported and can't be trusted on
// its own (a brand can say "Yes" and still leave the code field blank, e.g.
// if they shared it a different way). An SE-verified COLLABORATOR_CODE
// takes priority over what the brand typed into the form themselves.
function collaboratorCode(brand: Brand): string | null {
  return brand.COLLABORATOR_CODE ?? brand.SE_SPRINT_COLLABORATOR_CODE ?? null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "0.875rem", color: "#fff", whiteSpace: "pre-wrap" }}>{value?.trim() || "—"}</div>
    </div>
  );
}

// Shows what THIS form submission actually said — hosting/page builder/
// headless/theme/notes/etc. — rather than the brand's general pipeline
// status, SE/AM/Ops, or widget history (that's what BrandDetailPanel is
// for, and it's not what an SE needs when working through this queue).
function SprintRequestPanel({ brand, entry, onClose }: { brand: Brand; entry: SeSprintEntry | undefined; onClose: () => void }) {
  const code = collaboratorCode(brand);
  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;

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
        <a href={adminUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#72a4bf" }} className="flex items-center gap-1 hover:opacity-80">
          Open in Admin <ExternalLink size={11} />
        </a>

        <div className="mt-4" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Implementation request
        </div>

        {!entry ? (
          <div className="mt-3" style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>
            Added manually — no form submission on file for this brand.
          </div>
        ) : (
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
            <Field label="myshopify URL" value={entry.myshopifyUrl} />
            <Field label="Notes for the SE" value={entry.notes} />
            <div className="py-3">
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Collaborator code</div>
              {code ? (
                <div style={{ fontSize: "0.875rem", color: "#4caf82", fontFamily: "monospace" }}>{code}</div>
              ) : (
                <div style={{ fontSize: "0.875rem", color: "#e9a84c" }}>
                  Not on file{entry.hasSharedCode?.toLowerCase() === "yes" ? " — brand says they've already shared it elsewhere" : ""}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SeSprintPage({ initialBrands, entriesByBrandId }: { initialBrands: Brand[]; entriesByBrandId: Record<number, SeSprintEntry> }) {
  const [brands] = useState(initialBrands);
  const [codeFilter, setCodeFilter] = useState<"all" | "pending">("all");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const queue = sprintBrands(brands);
  const pending = queue.filter((b) => !collaboratorCode(b));
  const filtered = codeFilter === "pending" ? pending : queue;

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="se-sprint" />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>SE Sprint</h1>
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            Brands requesting assisted implementation — {queue.length} total
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {([
            { key: "all" as const, label: "Total requests", value: queue.length, color: "#72a4bf" },
            { key: "pending" as const, label: "Collaborator code not on file", value: pending.length, color: "#e9a84c" },
          ]).map((cfg) => {
            const isActive = codeFilter === cfg.key;
            return (
              <button key={cfg.key} onClick={() => setCodeFilter(isActive && cfg.key === "pending" ? "all" : cfg.key)}
                className="rounded-xl px-5 py-4 text-left transition-all"
                style={{
                  background: isActive ? cfg.color + "22" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isActive ? cfg.color + "66" : "rgba(255,255,255,0.08)"}`,
                }}>
                <div className="flex items-center gap-2 mb-2" style={{ color: cfg.color }}>
                  <Rocket size={16} />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{cfg.label}</span>
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: cfg.color, lineHeight: 1 }}>{cfg.value}</div>
              </button>
            );
          })}
        </div>

        {/* Queue */}
        <div className="flex-1 overflow-auto p-8">
          {filtered.length === 0 ? (
            <div className="text-center py-20" style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.95rem" }}>
              No SE Sprint requests{codeFilter === "pending" ? " missing a collaborator code" : ""}.
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <table className="w-full">
                <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <tr>
                    {["Brand", "Status", "SE", "Submitted", "Collaborator code", "myshopify URL"].map((h) => (
                      <th key={h} className="text-left px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((brand) => {
                    const col = ALL_COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
                    const code = collaboratorCode(brand);
                    return (
                      <tr key={brand.BRAND_ID} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                        onClick={() => setSelectedBrand(brand)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <td className="px-4 py-3" style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                          {brand.BRAND_NAME}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: (col?.accent ?? "#333") + "22", color: col?.accent ?? "#fff" }}>
                            {col?.label ?? brand.PIPELINE_STATUS}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.SE_OWNER ?? "—"}</td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>{brand.SE_SPRINT_SUBMITTED_AT ?? "—"}</td>
                        <td className="px-4 py-3">
                          {code ? (
                            <span style={{ fontSize: "0.8rem", color: "#4caf82", fontFamily: "monospace" }}>{code}</span>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "#e9a84c", fontWeight: 600 }}>Not on file</span>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>
                          {brand.SE_SPRINT_MYSHOPIFY_URL ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedBrand && (
        <SprintRequestPanel
          brand={selectedBrand}
          entry={entriesByBrandId[selectedBrand.BRAND_ID]}
          onClose={() => setSelectedBrand(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Brand } from "@/lib/metabase";
import { recurlyStateStyle } from "./BrandCard";
import Sidebar from "./Sidebar";
import BrandDetailPanel from "./BrandDetailPanel";
import { CreditCard } from "lucide-react";

// Every state actually seen in practice, in a sensible triage order — states
// that need SE/AM attention first.
const STATE_ORDER = ["failed", "paused", "expired", "future", "active", "canceled"];

function billedBrands(brands: Brand[]): Brand[] {
  return brands
    .filter((b) => b.RECURLY_STATE)
    .sort((a, b) => (b.RECURLY_CURRENT_PERIOD_STARTED_AT ?? "").localeCompare(a.RECURLY_CURRENT_PERIOD_STARTED_AT ?? ""));
}

export default function BillingPage({ initialBrands }: { initialBrands: Brand[] }) {
  const [brands] = useState(initialBrands);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  const billed = billedBrands(brands);
  const filtered = stateFilter === "all" ? billed : billed.filter((b) => b.RECURLY_STATE === stateFilter);

  const stateCounts = STATE_ORDER.map((state) => ({
    state,
    count: billed.filter((b) => b.RECURLY_STATE === state).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="billing" />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>Billing</h1>
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            Recurly subscription status — {filtered.length} of {billed.length} shown
          </p>
        </div>

        {/* Stat cards — one per state actually present */}
        <div className="grid gap-4 px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", gridTemplateColumns: `repeat(${Math.min(stateCounts.length + 1, 6)}, minmax(0, 1fr))` }}>
          {([{ state: "all", count: billed.length, color: "#72a4bf" }, ...stateCounts.map((s) => ({ ...s, color: recurlyStateStyle(s.state).color }))]).map((cfg) => {
            const isActive = stateFilter === cfg.state;
            const label = cfg.state === "all" ? "Total" : recurlyStateStyle(cfg.state).label;
            return (
              <button key={cfg.state} onClick={() => setStateFilter(isActive && cfg.state !== "all" ? "all" : cfg.state)}
                className="rounded-xl px-5 py-4 text-left transition-all"
                style={{
                  background: isActive ? cfg.color + "22" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isActive ? cfg.color + "66" : "rgba(255,255,255,0.08)"}`,
                }}>
                <div className="flex items-center gap-2 mb-2" style={{ color: cfg.color }}>
                  <CreditCard size={16} />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{label}</span>
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: cfg.color, lineHeight: 1 }}>{cfg.count}</div>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-8">
          {filtered.length === 0 ? (
            <div className="text-center py-20" style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.95rem" }}>
              No brands match the current filter.
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <table className="w-full">
                <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <tr>
                    {["Brand", "SE", "Status", "Plan", "Amount", "Current period ends", "Term ends", "Auto-renew"].map((h) => (
                      <th key={h} className="text-left px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((brand) => {
                    const style = recurlyStateStyle(brand.RECURLY_STATE!);
                    return (
                      <tr key={brand.BRAND_ID} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                        onClick={() => setSelectedBrand(brand)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <td className="px-4 py-3" style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                          {brand.BRAND_NAME}
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.SE_OWNER ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: style.color + "22", color: style.color }}>
                            {style.label}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85rem" }}>{brand.RECURLY_PLAN_NAME ?? "—"}</td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85rem" }}>
                          {brand.RECURLY_AMOUNT != null ? `${brand.RECURLY_CURRENCY ?? "USD"} ${brand.RECURLY_AMOUNT.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>
                          {brand.RECURLY_CURRENT_PERIOD_ENDS_AT ? new Date(brand.RECURLY_CURRENT_PERIOD_ENDS_AT).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>
                          {brand.RECURLY_CURRENT_TERM_ENDS_AT ? new Date(brand.RECURLY_CURRENT_TERM_ENDS_AT).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85rem" }}>
                          {brand.RECURLY_AUTO_RENEW == null ? "—" : brand.RECURLY_AUTO_RENEW ? "Yes" : "No"}
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
        <BrandDetailPanel
          brand={selectedBrand}
          scheduledCall={null}
          onClose={() => setSelectedBrand(null)}
          onBrandUpdate={() => {}}
        />
      )}
    </div>
  );
}

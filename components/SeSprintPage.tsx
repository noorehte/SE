"use client";

import { useState } from "react";
import { Brand } from "@/lib/metabase";
import { ALL_COLUMNS } from "./Dashboard";
import Sidebar from "./Sidebar";
import { Rocket } from "lucide-react";

// A brand is in the SE Sprint queue once it's submitted the "Request for
// Assisted FrontrowMD Implementation" form — regardless of whether it's
// already shared its Shopify Collaborator Code (that's tracked separately,
// see SE_SPRINT_HAS_SHARED_CODE) or what pipeline stage it's otherwise in.
function sprintBrands(brands: Brand[]): Brand[] {
  return brands
    .filter((b) => b.ON_SE_SPRINT_SHEET)
    .sort((a, b) => (b.SE_SPRINT_SUBMITTED_AT ?? "").localeCompare(a.SE_SPRINT_SUBMITTED_AT ?? ""));
}

export default function SeSprintPage({ initialBrands }: { initialBrands: Brand[] }) {
  const [codeFilter, setCodeFilter] = useState<"all" | "pending">("all");
  const queue = sprintBrands(initialBrands);
  const pending = queue.filter((b) => b.SE_SPRINT_HAS_SHARED_CODE?.toLowerCase() !== "yes");
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
            { key: "pending" as const, label: "Collaborator code not yet shared", value: pending.length, color: "#e9a84c" },
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
              No SE Sprint requests{codeFilter === "pending" ? " pending a collaborator code" : ""}.
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
                    const hasSharedCode = brand.SE_SPRINT_HAS_SHARED_CODE?.toLowerCase() === "yes";
                    return (
                      <tr key={brand.BRAND_ID} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
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
                          <span style={{ fontSize: "0.8rem", color: hasSharedCode ? "#4caf82" : "#e9a84c", fontWeight: 600 }}>
                            {brand.SE_SPRINT_HAS_SHARED_CODE ?? "—"}
                          </span>
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
    </div>
  );
}

"use client";

import { useState } from "react";
import { Brand, isBrandStuck } from "@/lib/metabase";
import { ALL_COLUMNS } from "./Dashboard";
import Sidebar from "./Sidebar";
import { AlertCircle, UserX, Package } from "lucide-react";

type AlertType = "stuck" | "no_se" | "no_products";

interface Alert {
  type: AlertType;
  brand: Brand;
  message: string;
}

const ALERT_CONFIGS: { type: AlertType; label: string; description: string; color: string; icon: React.ReactNode }[] = [
  { type: "stuck",       label: "Stuck >7 days",   description: "No status change in over a week", color: "#e05c5c", icon: <AlertCircle size={16} /> },
  { type: "no_se",       label: "No SE assigned",   description: "Brand has no SE owner",          color: "#e9a84c", icon: <UserX size={16} /> },
  { type: "no_products", label: "No products",      description: "Brand has 0 products added",     color: "#8b7fe8", icon: <Package size={16} /> },
];

function buildAlerts(brands: Brand[]): Alert[] {
  const alerts: Alert[] = [];
  for (const brand of brands) {
    // Churned brands are done, not stuck — being 0-SE / 0-products / long
    // "in status" is just what churn looks like, not something to act on.
    if (brand.PIPELINE_STATUS === "churned") continue;
    // isBrandStuck also excludes "live" — a brand that's been live for months
    // isn't stuck, it's succeeding.
    if (isBrandStuck(brand))          alerts.push({ type: "stuck",       brand, message: `${brand.DAYS_IN_STATUS} days in "${ALL_COLUMNS.find(c => c.id === brand.PIPELINE_STATUS)?.label ?? brand.PIPELINE_STATUS}"` });
    if (!brand.SE_OWNER)               alerts.push({ type: "no_se",       brand, message: "No SE owner assigned" });
    if (brand.PRODUCTS_COUNT === 0)    alerts.push({ type: "no_products", brand, message: "0 products in portal" });
  }
  return alerts;
}

export default function AlertsPage({ initialBrands }: { initialBrands: Brand[] }) {
  const [filter, setFilter] = useState<AlertType | "all">("all");
  const alerts = buildAlerts(initialBrands);
  const filtered = filter === "all" ? alerts : alerts.filter(a => a.type === filter);

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="alerts" />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>Alerts</h1>
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>{filtered.length} active alerts</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {ALERT_CONFIGS.map((cfg) => {
            const count = alerts.filter(a => a.type === cfg.type).length;
            const isActive = filter === cfg.type;
            return (
              <button key={cfg.type} onClick={() => setFilter(isActive ? "all" : cfg.type)}
                className="rounded-xl px-5 py-4 text-left transition-all"
                style={{
                  background: isActive ? cfg.color + "22" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isActive ? cfg.color + "66" : "rgba(255,255,255,0.08)"}`,
                }}>
                <div className="flex items-center gap-2 mb-2" style={{ color: cfg.color }}>
                  {cfg.icon}
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{cfg.label}</span>
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: count > 0 ? cfg.color : "rgba(255,255,255,0.3)", lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", marginTop: "4px" }}>{cfg.description}</div>
              </button>
            );
          })}
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-auto p-8">
          {filtered.length === 0 ? (
            <div className="text-center py-20" style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.95rem" }}>
              No alerts — all good!
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <table className="w-full">
                <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <tr>
                    {["Alert", "Brand", "Status", "SE", "Detail", "Links"].map(h => (
                      <th key={h} className="text-left px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((alert, i) => {
                    const cfg = ALERT_CONFIGS.find(c => c.type === alert.type)!;
                    const col = ALL_COLUMNS.find(c => c.id === alert.brand.PIPELINE_STATUS);
                    const hubspotUrl = alert.brand.HUBSPOT_COMPANY_ID ? `https://app-na2.hubspot.com/contacts/46815331/record/0-2/${alert.brand.HUBSPOT_COMPANY_ID}` : null;
                    const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${alert.brand.BRAND_ID}`;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2" style={{ color: cfg.color, fontSize: "0.8rem", fontWeight: 600 }}>
                            {cfg.icon} {cfg.label}
                          </div>
                        </td>
                        <td className="px-4 py-3" style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                          {alert.brand.BRAND_NAME}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: (col?.accent ?? "#8a96a3") + "22", color: col?.accent ?? "#fff" }}>
                            {col?.label ?? alert.brand.PIPELINE_STATUS}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{alert.brand.SE_OWNER ?? "—"}</td>
                        <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>{alert.message}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            {hubspotUrl && <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#f97316", fontSize: "0.8rem" }} className="hover:opacity-70">HS</a>}
                            <a href={adminUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#72a4bf", fontSize: "0.8rem" }} className="hover:opacity-70">Admin</a>
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
      </div>
    </div>
  );
}

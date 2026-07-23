"use client";

import { useState } from "react";
import { Brand, PipelineStatus, WIDGET_TYPE_LABELS, isBrandStuck } from "@/lib/metabase";
import { ALL_COLUMNS } from "./Dashboard";
import Sidebar from "./Sidebar";
import { Search } from "lucide-react";

const SE_OWNERS = ["maha", "noor", "naumaan"];

export default function AllBrandsPage({ initialBrands }: { initialBrands: Brand[] }) {
  const [brands] = useState(initialBrands);
  const [search, setSearch] = useState("");
  const [seFilter, setSeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [widgetFilter, setWidgetFilter] = useState("all");
  const [sortKey, setSortKey] = useState<keyof Brand>("BRAND_NAME");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = brands
    .filter((b) => b.BRAND_NAME.toLowerCase().includes(search.toLowerCase()))
    .filter((b) => seFilter === "all" || b.SE_OWNER === seFilter)
    .filter((b) => statusFilter === "all" || b.PIPELINE_STATUS === statusFilter)
    .filter((b) => widgetFilter === "all" || b.WIDGET_TYPES.includes(widgetFilter));

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    return (sortDir === "asc" ? 1 : -1) * (av < bv ? -1 : av > bv ? 1 : 0);
  });

  function toggleSort(key: keyof Brand) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function Th({ label, field }: { label: string; field: keyof Brand }) {
    return (
      <th className="text-left px-4 py-3 cursor-pointer select-none hover:opacity-80" onClick={() => toggleSort(field)}
        style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}{sortKey === field ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="brands" />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>All brands</h1>
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>{sorted.length} brands</p>
        </div>

        {/* Filters */}
        <div className="px-8 py-4 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 max-w-xs" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <Search size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brands..."
              className="bg-transparent outline-none flex-1" style={{ color: "#fff", fontSize: "0.875rem" }} />
          </div>
          <select value={seFilter} onChange={(e) => setSeFilter(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
            <option value="all">All SEs</option>
            {SE_OWNERS.map((se) => <option key={se} value={se}>{se}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
            <option value="all">All statuses</option>
            {ALL_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={widgetFilter} onChange={(e) => setWidgetFilter(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
            <option value="all">All widgets</option>
            {Object.entries(WIDGET_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-8">
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full">
              <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <tr>
                  <Th label="Brand" field="BRAND_NAME" />
                  <Th label="Status" field="PIPELINE_STATUS" />
                  <Th label="SE" field="SE_OWNER" />
                  <Th label="AM" field="ACCOUNT_MANAGER" />
                  <Th label="Ops" field="OPS_OWNER" />
                  <Th label="Days" field="DAYS_IN_STATUS" />
                  <Th label="Products" field="PRODUCTS_COUNT" />
                  <Th label="Churned" field="PIPELINE_STATUS" />
                  <th className="px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Links</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((brand) => {
                  const isStuck = isBrandStuck(brand);
                  const col = ALL_COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
                  const hubspotUrl = brand.HUBSPOT_COMPANY_ID ? `https://app-na2.hubspot.com/contacts/46815331/record/0-2/${brand.HUBSPOT_COMPANY_ID}` : null;
                  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
                  return (
                    <tr key={brand.BRAND_ID} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td className="px-4 py-3" style={{ borderLeft: `3px solid ${isStuck ? "#e05c5c" : (col?.accent ?? "transparent")}`, fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                        {brand.BRAND_NAME}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: (col?.accent ?? "#333") + "22", color: col?.accent ?? "#fff" }}>
                          {col?.label ?? brand.PIPELINE_STATUS}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.SE_OWNER ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.ACCOUNT_MANAGER ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.OPS_OWNER ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: isStuck ? "#e05c5c" : "rgba(255,255,255,0.4)", fontSize: "0.875rem" }}>{brand.DAYS_IN_STATUS}d</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{brand.PRODUCTS_COUNT}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>
                        {brand.PIPELINE_STATUS === "churned" ? new Date(brand.STATUS_ENTERED_AT).toLocaleDateString() : "—"}
                      </td>
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
        </div>
      </div>
    </div>
  );
}

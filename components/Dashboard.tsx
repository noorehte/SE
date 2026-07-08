"use client";

import { useState, useRef } from "react";
import { Brand, PipelineStatus, WIDGET_TYPE_LABELS } from "@/lib/metabase";
import BrandCard from "./BrandCard";
import BrandDetailPanel from "./BrandDetailPanel";
import { LayoutGrid, List, RefreshCw, Search } from "lucide-react";
import Sidebar from "./Sidebar";
import GoogleConnectStatus from "./GoogleConnectStatus";

export interface ScheduledCall {
  brandId: number;
  brandName: string;
  seOwner: string;
  scheduledAt: string;
  callDate: string;
  action?: "call" | "webinar_sheet";
}

// The 5 actionable pipeline stages shown by default — brands that haven't
// started (no products yet) or are stuck in board review aren't part of the
// SE's day-to-day workflow, so they're hidden unless "View all" is on.
export const COLUMNS: { id: PipelineStatus; label: string; accent: string }[] = [
  { id: "products_approved_needs_call", label: "Products Approved — Book Onboarding Call", accent: "#72a4bf" },
  { id: "code_snippets_available",      label: "Code Snippets Available",                  accent: "#8b7fe8" },
  { id: "collaborator_code_brand",      label: "Collaborator Code Brand",                  accent: "#e9a84c" },
  { id: "live",                         label: "Live",                                      accent: "#4caf82" },
  { id: "was_live",                     label: "Was Live — Needs Attention",               accent: "#e05c5c" },
];

// Every status a brand can have, including the two "not yet actionable"
// ones that getBrands() used to silently drop from the dashboard entirely.
// Used for status labels/colors everywhere and for the Kanban board when
// "View all" is toggled on.
export const ALL_COLUMNS: { id: PipelineStatus; label: string; accent: string }[] = [
  { id: "not_started",                  label: "Not Started — No Products Yet",            accent: "#5a6b78" },
  { id: "pending_review",               label: "Pending Board Review",                     accent: "#b08bd6" },
  ...COLUMNS,
];

const SE_OWNERS = ["maha", "noor", "naumaan"];

export default function Dashboard({ initialBrands, initialScheduledCalls }: { initialBrands: Brand[]; initialScheduledCalls: Record<string, ScheduledCall> }) {
  const [brands, setBrands] = useState(initialBrands);
  const [scheduledCalls] = useState(initialScheduledCalls);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [seFilter, setSeFilter] = useState<string>("all");
  const [columnFilter, setColumnFilter] = useState<PipelineStatus | null>(null);
  const [statFilter, setStatFilter] = useState<"all" | "in_progress" | "stuck" | "live">("all");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(false);
  const [widgetTypeFilter, setWidgetTypeFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // When on, the Kanban board adds the "Not Started" / "Pending Board Review"
  // columns and the stat cards/table include those brands too — otherwise
  // brands with no actionable status are hidden from the default view.
  const [viewAll, setViewAll] = useState(false);

  const searched = search.trim()
    ? brands.filter((b) => b.BRAND_NAME.toLowerCase().includes(search.trim().toLowerCase()))
    : brands;

  const seFiltered = seFilter === "all" ? searched : searched.filter((b) => b.SE_OWNER === seFilter);

  const statFiltered = statFilter === "all" ? seFiltered
    : statFilter === "in_progress" ? seFiltered.filter(b => !["live", "was_live"].includes(b.PIPELINE_STATUS))
    : statFilter === "stuck" ? seFiltered.filter(b => b.DAYS_IN_STATUS > 7)
    : seFiltered.filter(b => b.PIPELINE_STATUS === "live");

  const widgetFiltered = widgetTypeFilter
    ? statFiltered.filter(b => b.WIDGET_TYPES.includes(widgetTypeFilter))
    : statFiltered;

  // Outside of "View all", keep the board scoped to the 5 actionable statuses
  // even though getBrands() now returns every partnered brand.
  const activeColumns = viewAll ? ALL_COLUMNS : COLUMNS;
  const filtered = viewAll
    ? widgetFiltered
    : widgetFiltered.filter((b) => COLUMNS.some((c) => c.id === b.PIPELINE_STATUS));

  const visibleBrands = columnFilter ? filtered.filter((b) => b.PIPELINE_STATUS === columnFilter) : filtered;
  const stuck = seFiltered.filter((b) => b.DAYS_IN_STATUS > 7).length;
  const live = seFiltered.filter((b) => b.PIPELINE_STATUS === "live").length;

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      setBrands(data);
    } finally {
      setLoading(false);
    }
  }

  async function moveBrand(brandId: number, newStatus: PipelineStatus) {
    setBrands((prev) =>
      prev.map((b) => (b.BRAND_ID === brandId ? { ...b, PIPELINE_STATUS: newStatus } : b))
    );
    await fetch("/api/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, status: newStatus }),
    });
  }

  function toggleColumnFilter(id: PipelineStatus) {
    setColumnFilter((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="pipeline" />

      {/* Main */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="px-8 py-5 flex items-start justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>SE pipeline</h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>Brand portal checklist → automated status movement</p>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap justify-end">
            <GoogleConnectStatus />
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <Search size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brands…"
                className="bg-transparent outline-none"
                style={{ color: "#fff", fontSize: "0.875rem", width: "160px" }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ color: "rgba(255,255,255,0.35)" }} className="hover:opacity-70">✕</button>
              )}
            </div>
            <button
              onClick={() => setViewAll((v) => !v)}
              className="text-sm px-3 py-2 rounded-lg flex items-center gap-1.5"
              title={viewAll ? "Showing every brand, any status" : "Only showing the 5 actionable pipeline stages"}
              style={{
                background: viewAll ? "rgba(114,164,191,0.2)" : "rgba(255,255,255,0.07)",
                color: viewAll ? "#72a4bf" : "rgba(255,255,255,0.6)",
                border: `1px solid ${viewAll ? "rgba(114,164,191,0.4)" : "rgba(255,255,255,0.12)"}`,
              }}>
              View all
            </button>
            {(columnFilter || statFilter !== "all" || widgetTypeFilter || search) && (
              <button onClick={() => { setColumnFilter(null); setStatFilter("all"); setWidgetTypeFilter(null); setSearch(""); }}
                className="text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{ background: "rgba(114,164,191,0.12)", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
                ✕ Clear filter
              </button>
            )}
            <select
              value={seFilter}
              onChange={(e) => setSeFilter(e.target.value)}
              className="text-sm rounded-lg px-3 py-2"
              style={{ background: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", fontSize: "0.875rem" }}
            >
              <option value="all">All SEs</option>
              {SE_OWNERS.map((se) => <option key={se} value={se}>{se}</option>)}
            </select>
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
              <button onClick={() => setView("kanban")} className="px-3 py-2 flex items-center gap-1.5 text-sm transition-colors"
                style={{ background: view === "kanban" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: view === "kanban" ? "#fff" : "rgba(255,255,255,0.4)" }}>
                <LayoutGrid size={14} /> Kanban
              </button>
              <button onClick={() => setView("table")} className="px-3 py-2 flex items-center gap-1.5 text-sm transition-colors"
                style={{ background: view === "table" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: view === "table" ? "#fff" : "rgba(255,255,255,0.4)" }}>
                <List size={14} /> Table
              </button>
            </div>
            <button onClick={refresh} disabled={loading} className="p-2 rounded-lg disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {([
            { label: "Total brands", key: "all" as const, value: seFiltered.length, color: "#fff" },
            { label: "In progress", key: "in_progress" as const, value: seFiltered.filter(b => !["live","was_live"].includes(b.PIPELINE_STATUS)).length, color: "#72a4bf" },
            { label: "Stuck >7d", key: "stuck" as const, value: seFiltered.filter(b => b.DAYS_IN_STATUS > 7).length, color: "#e05c5c" },
            { label: "Live", key: "live" as const, value: seFiltered.filter(b => b.PIPELINE_STATUS === "live").length, color: "#4caf82" },
          ]).map((stat) => {
            const isActive = statFilter === stat.key;
            return (
              <button key={stat.label} onClick={() => { setStatFilter(stat.key); setColumnFilter(null); }}
                className="rounded-xl px-5 py-4 text-left transition-all hover:opacity-90"
                style={{
                  background: isActive ? stat.color + "18" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isActive ? stat.color + "55" : "rgba(255,255,255,0.08)"}`,
                  cursor: "pointer",
                }}>
                <div style={{ fontSize: "0.8rem", color: isActive ? stat.color : "rgba(255,255,255,0.4)", marginBottom: "6px" }}>{stat.label}</div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              </button>
            );
          })}
        </div>

        {/* Widget type filter chips */}
        {Object.entries(WIDGET_TYPE_LABELS).some(([key]) =>
          seFiltered.some(b => b.WIDGET_TYPES.includes(key))
        ) && (
          <div className="px-8 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", marginRight: "4px" }}>Widget</span>
            <button
              onClick={() => setWidgetTypeFilter(null)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: widgetTypeFilter === null ? "rgba(114,164,191,0.25)" : "rgba(255,255,255,0.07)",
                color: widgetTypeFilter === null ? "#72a4bf" : "rgba(255,255,255,0.5)",
                border: `1px solid ${widgetTypeFilter === null ? "rgba(114,164,191,0.5)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              All <span style={{ opacity: 0.6 }}>{seFiltered.length}</span>
            </button>
            {Object.entries(WIDGET_TYPE_LABELS).map(([key, label]) => {
              const count = seFiltered.filter(b => b.WIDGET_TYPES.includes(key)).length;
              if (count === 0) return null;
              const isActive = widgetTypeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setWidgetTypeFilter(isActive ? null : key)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: isActive ? "rgba(114,164,191,0.25)" : "rgba(255,255,255,0.07)",
                    color: isActive ? "#72a4bf" : "rgba(255,255,255,0.5)",
                    border: `1px solid ${isActive ? "rgba(114,164,191,0.5)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  {label} <span style={{ opacity: 0.6 }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-8">
          {view === "kanban" ? (
            <KanbanView
              brands={filtered}
              columns={activeColumns}
              columnFilter={columnFilter}
              scheduledCalls={scheduledCalls}
              onMove={moveBrand}
              onCardClick={setSelectedBrand}
              onHeaderClick={toggleColumnFilter}
            />
          ) : (
            <TableView brands={visibleBrands} columns={activeColumns} scheduledCalls={scheduledCalls} onMove={moveBrand} onRowClick={setSelectedBrand} />
          )}
        </div>

        {/* Footer legend */}
        <div className="px-8 py-3 flex items-center gap-6 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#e05c5c" }} /> Stuck &gt;7 days
          </div>
          {SE_OWNERS.map((se) => (
            <div key={se} className="flex items-center gap-2" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#72a4bf", color: "#0d1b26" }}>
                {se.slice(0, 2).toUpperCase()}
              </span>
              {se.charAt(0).toUpperCase() + se.slice(1)}
            </div>
          ))}
          <span className="ml-auto" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.25)" }}>Last updated just now</span>
        </div>
      </div>

      {/* Brand detail panel */}
      {selectedBrand && (
        <BrandDetailPanel
          brand={selectedBrand}
          scheduledCall={scheduledCalls[String(selectedBrand.BRAND_ID)] ?? null}
          onClose={() => setSelectedBrand(null)}
          onBrandUpdate={(brandId, updates) => {
            setBrands((prev) => prev.map((b) => b.BRAND_ID === brandId ? { ...b, ...updates } : b));
            setSelectedBrand((prev) => prev && prev.BRAND_ID === brandId ? { ...prev, ...updates } : prev);
          }}
        />
      )}
    </div>
  );
}

function KanbanView({
  brands,
  columns,
  columnFilter,
  scheduledCalls,
  onMove,
  onCardClick,
  onHeaderClick,
}: {
  brands: Brand[];
  columns: { id: PipelineStatus; label: string; accent: string }[];
  columnFilter: PipelineStatus | null;
  scheduledCalls: Record<string, ScheduledCall>;
  onMove: (brandId: number, status: PipelineStatus) => void;
  onCardClick: (brand: Brand) => void;
  onHeaderClick: (id: PipelineStatus) => void;
}) {
  const dragBrandId = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<PipelineStatus | null>(null);

  const visibleColumns = columnFilter ? columns.filter((c) => c.id === columnFilter) : columns;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {visibleColumns.map((col) => {
        const colBrands = brands.filter((b) => b.PIPELINE_STATUS === col.id);
        const totalCount = brands.filter((b) => b.PIPELINE_STATUS === col.id).length;
        const isOver = dragOver === col.id;
        const isFiltered = columnFilter === col.id;

        return (
          <div key={col.id} className="flex-shrink-0" style={{ width: columnFilter ? "100%" : "220px", maxWidth: columnFilter ? "560px" : "220px" }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              if (dragBrandId.current !== null) {
                onMove(dragBrandId.current, col.id);
                dragBrandId.current = null;
              }
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: col.accent }} />
              <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>{col.label}</span>
              <button
                onClick={() => onHeaderClick(col.id)}
                className="ml-auto px-2 py-0.5 rounded-full transition-colors"
                title={isFiltered ? "Show all columns" : "Filter to this column"}
                style={{
                  fontSize: "0.8rem",
                  background: isFiltered ? col.accent + "33" : "rgba(255,255,255,0.08)",
                  color: isFiltered ? col.accent : "rgba(255,255,255,0.5)",
                  border: isFiltered ? `1px solid ${col.accent}55` : "1px solid transparent",
                  cursor: "pointer",
                }}>
                {totalCount}
              </button>
            </div>
            <div className="flex flex-col gap-3 min-h-20 rounded-xl p-2 transition-all"
              style={{ background: isOver ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${isOver ? col.accent + "66" : "rgba(255,255,255,0.06)"}` }}>
              {colBrands.map((brand) => (
                <div key={brand.BRAND_ID}
                  draggable
                  onDragStart={() => { dragBrandId.current = brand.BRAND_ID; }}
                  onClick={() => onCardClick(brand)}
                  className="cursor-pointer active:cursor-grabbing"
                  style={{ cursor: "grab" }}>
                  <BrandCard brand={brand} accent={col.accent} scheduledCall={scheduledCalls[String(brand.BRAND_ID)] ?? null} />
                </div>
              ))}
              {colBrands.length === 0 && (
                <div className="text-center py-8" style={{ color: "rgba(255,255,255,0.15)", fontSize: "0.8rem" }}>Drop here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableView({
  brands,
  columns,
  scheduledCalls,
  onMove,
  onRowClick,
}: {
  brands: Brand[];
  columns: { id: PipelineStatus; label: string; accent: string }[];
  scheduledCalls: Record<string, ScheduledCall>;
  onMove: (brandId: number, status: PipelineStatus) => void;
  onRowClick: (brand: Brand) => void;
}) {
  const [sortKey, setSortKey] = useState<keyof Brand>("BRAND_NAME");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: keyof Brand) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sorted = [...brands].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    return (sortDir === "asc" ? 1 : -1) * (av < bv ? -1 : av > bv ? 1 : 0);
  });

  function Th({ label, field }: { label: string; field: keyof Brand }) {
    return (
      <th className="text-left px-4 py-3 cursor-pointer select-none hover:opacity-80" onClick={() => toggleSort(field)}
        style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}{sortKey === field ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <table className="w-full">
        <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <tr><Th label="Brand" field="BRAND_NAME" /><Th label="Status" field="PIPELINE_STATUS" /><Th label="SE" field="SE_OWNER" /><Th label="AM" field="ACCOUNT_MANAGER" /><Th label="Ops" field="OPS_OWNER" /><Th label="Days" field="DAYS_IN_STATUS" /><th className="px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Call</th><th className="px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Links</th></tr>
        </thead>
        <tbody>
          {sorted.map((brand) => {
            const hubspotUrl = brand.HUBSPOT_COMPANY_ID ? `https://app.hubspot.com/contacts/21791298/company/${brand.HUBSPOT_COMPANY_ID}` : null;
            const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
            const isStuck = brand.DAYS_IN_STATUS > 7;
            const col = columns.find((c) => c.id === brand.PIPELINE_STATUS);
            return (
              <tr key={brand.BRAND_ID} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                onClick={() => onRowClick(brand)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <td className="px-4 py-3" style={{ color: "#fff", borderLeft: `3px solid ${isStuck ? "#e05c5c" : (col?.accent ?? "transparent")}`, fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600 }}>{brand.BRAND_NAME}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <select value={brand.PIPELINE_STATUS} onChange={(e) => onMove(brand.BRAND_ID, e.target.value as PipelineStatus)}
                    className="rounded-full border-0 cursor-pointer px-2 py-0.5"
                    style={{ background: (col?.accent ?? "#333") + "22", color: col?.accent ?? "#fff", fontSize: "0.8rem" }}>
                    {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.SE_OWNER ?? "—"}</td>
                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.ACCOUNT_MANAGER ?? "—"}</td>
                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.OPS_OWNER ?? "—"}</td>
                <td className="px-4 py-3 font-semibold" style={{ color: isStuck ? "#e05c5c" : "rgba(255,255,255,0.4)", fontSize: "0.875rem" }}>{brand.DAYS_IN_STATUS}d</td>
                <td className="px-4 py-3">
                  {scheduledCalls[String(brand.BRAND_ID)] ? (() => {
                    const sc = scheduledCalls[String(brand.BRAND_ID)];
                    return (
                      <span style={{ fontSize: "0.8rem", color: "#4caf82" }}>
                        {sc.action === "webinar_sheet"
                          ? "✓ Webinar"
                          : sc.callDate
                            ? `✓ ${new Date(sc.callDate).toLocaleDateString()}`
                            : "✓ Scheduled"}
                      </span>
                    );
                  })() : (
                    <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.2)" }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
  );
}

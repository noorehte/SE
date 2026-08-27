"use client";

import { useState } from "react";
import { Brand, PipelineStatus, WIDGET_TYPE_LABELS, isBrandStuck } from "@/lib/metabase";
import { ALL_COLUMNS } from "./Dashboard";
import { SENTIMENT_STYLES } from "./BrandCard";
import Sidebar from "./Sidebar";
import { Download, Search } from "lucide-react";

const SE_OWNERS = ["maha", "noor", "naumaan", "andres"];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Mirrors the 4 states the in-app "Reached Out" filter dropdown offers
// (see FILTER_CONFIG.REACHED_OUT below) — writing plain Y/N/blank here would
// collapse "to be sent" and "not on sheet" into the same blank cell, so
// Excel's own AutoFilter dropdown on this column couldn't tell them apart.
function reachedOutLabel(b: Brand): string {
  if (!b.ON_REACHOUT_SHEET) return "Not on sheet";
  if (b.REACHED_OUT == null) return "To be sent";
  return b.REACHED_OUT ? "Y" : "N";
}

function exportBrandsCsv(brands: Brand[]) {
  const statusLabel = (status: PipelineStatus) => ALL_COLUMNS.find((c) => c.id === status)?.label ?? status;
  const header = [
    "Brand", "Status", "SE", "AM", "Ops", "Segment",
    "Onboarded via Brand Portal", "Brand Portal Access", "Sign On Date",
    "Days in Status", "Products Approved", "Products Total", "Reviews Delivered",
    "Badge Ready Date", "Reviews Ready Date", "CAI Ready Date",
    "Badge Imp (Y/N)", "Reviews Imp (Y/N)", "CAI Imp (Y/N)",
    "On Reachout Sheet (Y/N)", "Reached Out (Y/N)", "Reached Out Send Date",
    "Pylon Sentiment", "Churned",
  ];
  const rows = brands.map((b) => [
    csvCell(b.BRAND_NAME),
    csvCell(statusLabel(b.PIPELINE_STATUS)),
    csvCell(b.SE_OWNER ?? ""),
    csvCell(b.ACCOUNT_MANAGER ?? ""),
    csvCell(b.OPS_OWNER ?? ""),
    csvCell(b.KIND ?? ""),
    b.ONBOARDING_CHANNEL === "in_app" ? "Y" : "N",
    b.ONBOARDING_CHANNEL === "in_app" ? "Y" : "N",
    csvCell(new Date(b.BRAND_CREATED_AT).toLocaleDateString()),
    String(b.DAYS_IN_STATUS),
    String(b.PRODUCTS_APPROVED_COUNT),
    String(b.PRODUCTS_COUNT),
    String(b.REVIEWS_DELIVERED),
    csvCell(b.BADGE_READY_DATE ? new Date(b.BADGE_READY_DATE).toLocaleDateString() : ""),
    csvCell(b.REVIEWS_READY_DATE ? new Date(b.REVIEWS_READY_DATE).toLocaleDateString() : ""),
    csvCell(b.CAI_READY_DATE ? new Date(b.CAI_READY_DATE).toLocaleDateString() : ""),
    b.BADGE_IMPLEMENTED ? "Y" : "N",
    b.REVIEWS_IMPLEMENTED ? "Y" : "N",
    b.CAI_IMPLEMENTED ? "Y" : "N",
    b.ON_REACHOUT_SHEET ? "Y" : "N",
    csvCell(reachedOutLabel(b)),
    csvCell(b.REACHED_OUT_SEND_LABEL ?? ""),
    csvCell(b.PYLON_SENTIMENT ?? ""),
    csvCell(b.PIPELINE_STATUS === "churned" ? new Date(b.STATUS_ENTERED_AT).toLocaleDateString() : ""),
  ]);
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `table-view-brands-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// One entry per filterable table column. "text" does a case-insensitive
// substring match; "min" parses the filter value as a number and keeps rows
// whose field is >= it; "select" is an exact match against a fixed option list.
type ColumnFilterConfig =
  | { kind: "text"; field: keyof Brand }
  | { kind: "min"; field: keyof Brand }
  | { kind: "select"; field: keyof Brand; options: { value: string; label: string }[] };

// Named combined-status presets that don't map to a single column — each is a
// predicate over the whole brand rather than one field, so they live outside
// FILTER_CONFIG/columnFilters and get their own toolbar dropdown.
type QuickFilter = { value: string; label: string; test: (b: Brand) => boolean };
const QUICK_FILTERS: QuickFilter[] = [
  {
    value: "reviews_ready_not_implemented_not_reached_out",
    label: "Reviews ready, not implemented, not reached out",
    test: (b) => b.REVIEWS_READY_DATE != null && !b.REVIEWS_IMPLEMENTED && b.REACHED_OUT !== true,
  },
];

export default function AllBrandsPage({
  initialBrands,
  title = "Table view",
  activeNavKey = "brands",
}: {
  initialBrands: Brand[];
  title?: string;
  activeNavKey?: string;
}) {
  const [brands, setBrands] = useState(initialBrands);
  const [search, setSearch] = useState("");
  const [seFilter, setSeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [widgetFilter, setWidgetFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState("all");
  const [sortKey, setSortKey] = useState<keyof Brand>("BRAND_NAME");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const activeQuickFilter = QUICK_FILTERS.find((f) => f.value === quickFilter);

  const filtered = brands
    .filter((b) => b.BRAND_NAME.toLowerCase().includes(search.toLowerCase()))
    .filter((b) => seFilter === "all" || b.SE_OWNER === seFilter)
    .filter((b) => statusFilter === "all" || b.PIPELINE_STATUS === statusFilter)
    .filter((b) => widgetFilter === "all" || b.WIDGET_TYPES.includes(widgetFilter))
    .filter((b) => !activeQuickFilter || activeQuickFilter.test(b));

  // Distinct string values actually present in the data — Account Manager,
  // Ops, and Segment aren't drawn from a fixed roster the way SE nominally is.
  function distinctStringOptions(field: "ACCOUNT_MANAGER" | "OPS_OWNER" | "KIND") {
    const names = Array.from(new Set(brands.map((b) => b[field]).filter((n): n is string => !!n))).sort();
    return names.map((n) => ({ value: n, label: n }));
  }

  const FILTER_CONFIG: Record<string, ColumnFilterConfig> = {
    BRAND_NAME: { kind: "text", field: "BRAND_NAME" },
    PIPELINE_STATUS: { kind: "select", field: "PIPELINE_STATUS", options: ALL_COLUMNS.map((c) => ({ value: c.id, label: c.label })) },
    // Restricted to the 3 real SEs — SE_OWNER can fall back to HubSpot's native
    // "Company owner" field (see lib/hubspot.ts), which isn't scoped to SEs and
    // can hold names like account execs. The dropdown shouldn't offer those.
    SE_OWNER: { kind: "select", field: "SE_OWNER", options: SE_OWNERS.map((se) => ({ value: se, label: se })) },
    ACCOUNT_MANAGER: { kind: "select", field: "ACCOUNT_MANAGER", options: distinctStringOptions("ACCOUNT_MANAGER") },
    OPS_OWNER: { kind: "select", field: "OPS_OWNER", options: distinctStringOptions("OPS_OWNER") },
    KIND: { kind: "select", field: "KIND", options: distinctStringOptions("KIND") },
    ONBOARDING_CHANNEL: { kind: "select", field: "ONBOARDING_CHANNEL", options: [{ value: "in_app", label: "Portal" }, { value: "external", label: "External" }] },
    DAYS_IN_STATUS: { kind: "min", field: "DAYS_IN_STATUS" },
    PRODUCTS_APPROVED_COUNT: { kind: "min", field: "PRODUCTS_APPROVED_COUNT" },
    REVIEWS_DELIVERED: { kind: "min", field: "REVIEWS_DELIVERED" },
    BADGE_IMPLEMENTED: { kind: "select", field: "BADGE_IMPLEMENTED", options: [{ value: "true", label: "Y" }, { value: "false", label: "N" }] },
    REVIEWS_IMPLEMENTED: { kind: "select", field: "REVIEWS_IMPLEMENTED", options: [{ value: "true", label: "Y" }, { value: "false", label: "N" }] },
    CAI_IMPLEMENTED: { kind: "select", field: "CAI_IMPLEMENTED", options: [{ value: "true", label: "Y" }, { value: "false", label: "N" }] },
    PYLON_SENTIMENT: { kind: "select", field: "PYLON_SENTIMENT", options: Object.entries(SENTIMENT_STYLES).map(([value, s]) => ({ value, label: s.label })) },
    REACHED_OUT: {
      kind: "select",
      field: "REACHED_OUT",
      options: [
        { value: "true", label: "Y" },
        { value: "false", label: "N" },
        { value: "to_be_sent", label: "To be sent" },
        { value: "not_listed", label: "Not on sheet" },
      ],
    },
  };

  function matchesColumnFilters(brand: Brand): boolean {
    return Object.entries(columnFilters).every(([key, value]) => {
      if (!value) return true;
      const config = FILTER_CONFIG[key];
      if (!config) return true;
      const raw = brand[config.field];
      if (config.kind === "text") {
        return String(raw ?? "").toLowerCase().includes(value.toLowerCase());
      }
      if (config.kind === "select") {
        // "not_listed" isn't a value of REACHED_OUT itself (that's boolean|null,
        // and null also covers "listed but blank") — it means the brand never
        // appeared on the reachouts sheet at all, tracked separately.
        if (key === "REACHED_OUT" && value === "not_listed") {
          return !brand.ON_REACHOUT_SHEET;
        }
        if (key === "REACHED_OUT" && value === "to_be_sent") {
          return brand.ON_REACHOUT_SHEET && brand.REACHED_OUT == null;
        }
        return String(raw) === value;
      }
      const num = Number(value);
      if (Number.isNaN(num)) return true;
      return Number(raw ?? 0) >= num;
    });
  }

  const columnFiltered = filtered.filter(matchesColumnFilters);

  const sorted = [...columnFiltered].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    return (sortDir === "asc" ? 1 : -1) * (av < bv ? -1 : av > bv ? 1 : 0);
  });

  function toggleSort(key: keyof Brand) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  async function moveBrand(brandId: number, newStatus: PipelineStatus) {
    const prevStatus = brands.find((b) => b.BRAND_ID === brandId)?.PIPELINE_STATUS;
    setBrands((prev) =>
      prev.map((b) => (b.BRAND_ID === brandId ? { ...b, PIPELINE_STATUS: newStatus } : b))
    );
    try {
      const res = await fetch("/api/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
    } catch (e) {
      // The optimistic move above was never persisted — roll it back so the
      // table reflects reality instead of quietly reverting on next refresh
      // with no explanation.
      if (prevStatus) {
        setBrands((prev) =>
          prev.map((b) => (b.BRAND_ID === brandId ? { ...b, PIPELINE_STATUS: prevStatus } : b))
        );
      }
      alert(`Couldn't save status change: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function setReachedOut(brandName: string, emailed: boolean) {
    const prev = brands.find((b) => b.BRAND_NAME === brandName)?.REACHED_OUT ?? null;
    setBrands((prevBrands) =>
      prevBrands.map((b) => (b.BRAND_NAME === brandName ? { ...b, REACHED_OUT: emailed } : b))
    );
    try {
      const res = await fetch("/api/reachouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, emailed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
    } catch (e) {
      // Roll back — the optimistic update above was never actually written
      // to the sheet, so the table shouldn't keep showing it as changed.
      setBrands((prevBrands) =>
        prevBrands.map((b) => (b.BRAND_NAME === brandName ? { ...b, REACHED_OUT: prev } : b))
      );
      alert(`Couldn't save to the reachouts sheet: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function Th({ label, field }: { label: string; field: keyof Brand }) {
    return (
      <th className="text-left px-4 py-3 cursor-pointer select-none hover:opacity-80" onClick={() => toggleSort(field)}
        style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}{sortKey === field ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  function FilterCell({ column }: { column: string }) {
    const config = FILTER_CONFIG[column];
    if (!config) return <td className="px-4 pb-2" />;
    const value = columnFilters[column] ?? "";
    const set = (v: string) => setColumnFilters((prev) => ({ ...prev, [column]: v }));
    const inputStyle = {
      width: "100%",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "6px",
      padding: "3px 6px",
      fontSize: "0.75rem",
      color: "#fff",
    };
    return (
      <td className="px-4 pb-2">
        {config.kind === "select" ? (
          <select value={value} onChange={(e) => set(e.target.value)} style={inputStyle}>
            <option value="">All</option>
            {config.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            value={value}
            onChange={(e) => set(e.target.value)}
            placeholder={config.kind === "min" ? "min…" : "filter…"}
            style={inputStyle}
          />
        )}
      </td>
    );
  }

  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v);

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active={activeNavKey} />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>{title}</h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>{sorted.length} of {brands.length} brands</p>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveColumnFilters && (
              <button onClick={() => setColumnFilters({})}
                className="text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{ background: "rgba(114,164,191,0.12)", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
                ✕ Clear column filters
              </button>
            )}
            <button
              onClick={() => exportBrandsCsv(sorted)}
              title="Export the rows currently shown to CSV"
              className="text-sm px-3 py-2 rounded-lg flex items-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <Download size={14} /> Export
            </button>
          </div>
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
          <select value={quickFilter} onChange={(e) => setQuickFilter(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
            <option value="all">Quick filters</option>
            {QUICK_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-8">
          <div className="rounded-xl overflow-x-auto" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full" style={{ minWidth: "max-content" }}>
              <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <tr>
                  <Th label="Brand" field="BRAND_NAME" />
                  <Th label="Status" field="PIPELINE_STATUS" />
                  <Th label="SE" field="SE_OWNER" />
                  <Th label="AM" field="ACCOUNT_MANAGER" />
                  <Th label="Ops" field="OPS_OWNER" />
                  <Th label="Segment" field="KIND" />
                  <Th label="Portal" field="ONBOARDING_CHANNEL" />
                  <Th label="Sign On Date" field="BRAND_CREATED_AT" />
                  <Th label="Days" field="DAYS_IN_STATUS" />
                  <Th label="Products Approved" field="PRODUCTS_APPROVED_COUNT" />
                  <Th label="Reviews Delivered" field="REVIEWS_DELIVERED" />
                  <Th label="Badge Ready" field="BADGE_READY_DATE" />
                  <Th label="Reviews Ready" field="REVIEWS_READY_DATE" />
                  <Th label="CAI Ready" field="CAI_READY_DATE" />
                  <Th label="Badge Imp" field="BADGE_IMPLEMENTED" />
                  <Th label="Reviews Imp" field="REVIEWS_IMPLEMENTED" />
                  <Th label="CAI Imp" field="CAI_IMPLEMENTED" />
                  <Th label="Reached Out" field="REACHED_OUT" />
                  <Th label="Sentiment" field="PYLON_SENTIMENT" />
                  <Th label="Churned" field="PIPELINE_STATUS" />
                  <th className="px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Links</th>
                </tr>
                <tr>
                  <FilterCell column="BRAND_NAME" />
                  <FilterCell column="PIPELINE_STATUS" />
                  <FilterCell column="SE_OWNER" />
                  <FilterCell column="ACCOUNT_MANAGER" />
                  <FilterCell column="OPS_OWNER" />
                  <FilterCell column="KIND" />
                  <FilterCell column="ONBOARDING_CHANNEL" />
                  <td className="px-4 pb-2" />
                  <FilterCell column="DAYS_IN_STATUS" />
                  <FilterCell column="PRODUCTS_APPROVED_COUNT" />
                  <FilterCell column="REVIEWS_DELIVERED" />
                  <td className="px-4 pb-2" />
                  <td className="px-4 pb-2" />
                  <td className="px-4 pb-2" />
                  <FilterCell column="BADGE_IMPLEMENTED" />
                  <FilterCell column="REVIEWS_IMPLEMENTED" />
                  <FilterCell column="CAI_IMPLEMENTED" />
                  <FilterCell column="REACHED_OUT" />
                  <FilterCell column="PYLON_SENTIMENT" />
                  <td className="px-4 pb-2" />
                  <td className="px-4 pb-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((brand) => {
                  const isStuck = isBrandStuck(brand);
                  const col = ALL_COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
                  const hubspotUrl = brand.HUBSPOT_COMPANY_ID ? `https://app-na2.hubspot.com/contacts/46815331/record/0-2/${brand.HUBSPOT_COMPANY_ID}` : null;
                  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
                  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
                  return (
                    <tr key={brand.BRAND_ID} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td className="px-4 py-3" style={{ borderLeft: `3px solid ${isStuck ? "#e05c5c" : (col?.accent ?? "transparent")}`, fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                        {brand.BRAND_NAME}
                      </td>
                      <td className="px-4 py-3">
                        <select value={brand.PIPELINE_STATUS} onChange={(e) => moveBrand(brand.BRAND_ID, e.target.value as PipelineStatus)}
                          className="rounded-full border-0 cursor-pointer px-2 py-0.5"
                          style={{ background: (col?.accent ?? "#8a96a3") + "22", color: col?.accent ?? "#fff", fontSize: "0.8rem" }}>
                          {ALL_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.SE_OWNER ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.ACCOUNT_MANAGER ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.OPS_OWNER ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.KIND ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>
                        {brand.ONBOARDING_CHANNEL === "in_app" ? "Portal" : brand.ONBOARDING_CHANNEL === "external" ? "External" : "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{fmtDate(brand.BRAND_CREATED_AT)}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: isStuck ? "#e05c5c" : "rgba(255,255,255,0.4)", fontSize: "0.875rem" }}>{brand.DAYS_IN_STATUS}d</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{brand.PRODUCTS_APPROVED_COUNT} / {brand.PRODUCTS_COUNT}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{brand.REVIEWS_DELIVERED}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{fmtDate(brand.BADGE_READY_DATE)}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{fmtDate(brand.REVIEWS_READY_DATE)}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{fmtDate(brand.CAI_READY_DATE)}</td>
                      <td className="px-4 py-3" style={{ color: brand.BADGE_IMPLEMENTED ? "#4caf82" : "rgba(255,255,255,0.3)", fontSize: "0.875rem" }}>{brand.BADGE_IMPLEMENTED ? "Y" : "N"}</td>
                      <td className="px-4 py-3" style={{ color: brand.REVIEWS_IMPLEMENTED ? "#4caf82" : "rgba(255,255,255,0.3)", fontSize: "0.875rem" }}>{brand.REVIEWS_IMPLEMENTED ? "Y" : "N"}</td>
                      <td className="px-4 py-3" style={{ color: brand.CAI_IMPLEMENTED ? "#4caf82" : "rgba(255,255,255,0.3)", fontSize: "0.875rem" }}>{brand.CAI_IMPLEMENTED ? "Y" : "N"}</td>
                      <td className="px-4 py-3">
                        {!brand.ON_REACHOUT_SHEET ? (
                          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.875rem" }}>Not on sheet</span>
                        ) : (
                          <select
                            value={brand.REACHED_OUT == null ? "unset" : brand.REACHED_OUT ? "true" : "false"}
                            onChange={(e) => setReachedOut(brand.BRAND_NAME, e.target.value === "true")}
                            className="rounded-full border-0 cursor-pointer px-2 py-0.5"
                            style={{
                              background: (brand.REACHED_OUT ? "#4caf82" : brand.REACHED_OUT === false ? "rgba(255,255,255,0.3)" : "#e9a84c") + "22",
                              color: brand.REACHED_OUT ? "#4caf82" : brand.REACHED_OUT === false ? "rgba(255,255,255,0.6)" : "#e9a84c",
                              fontSize: "0.8rem",
                            }}
                          >
                            <option value="unset" disabled>{`To be sent${brand.REACHED_OUT_SEND_LABEL ? ` (${brand.REACHED_OUT_SEND_LABEL})` : ""}`}</option>
                            <option value="true">{`Y${brand.REACHED_OUT_SEND_LABEL ? ` (${brand.REACHED_OUT_SEND_LABEL})` : ""}`}</option>
                            <option value="false">{`N${brand.REACHED_OUT_SEND_LABEL ? ` (${brand.REACHED_OUT_SEND_LABEL})` : ""}`}</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {brand.PYLON_SENTIMENT ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{
                              background: (SENTIMENT_STYLES[brand.PYLON_SENTIMENT]?.color ?? "#8a8a8a") + "22",
                              color: SENTIMENT_STYLES[brand.PYLON_SENTIMENT]?.color ?? "#8a8a8a",
                            }}>
                            {SENTIMENT_STYLES[brand.PYLON_SENTIMENT]?.label ?? brand.PYLON_SENTIMENT}
                          </span>
                        ) : (
                          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.875rem" }}>—</span>
                        )}
                      </td>
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

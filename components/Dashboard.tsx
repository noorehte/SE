"use client";

import { useState, useRef, Fragment } from "react";
import { Brand, PipelineStatus, WIDGET_TYPE_LABELS, isBrandStuck } from "@/lib/metabase";
import { BadgeStatus, ExecStatus, getBadgeStatus, getExecStatus, getExecStatusDetail, getRegressedParts, getReadyDate, EXEC_STATUS_ORDER, EXEC_STATUS_STYLES, EXEC_STATUS_DISPLAY_ORDER } from "@/lib/liveStatus";
import BrandCard, { SEGMENT_STYLES, AbTestingToggle } from "./BrandCard";
import BrandDetailPanel from "./BrandDetailPanel";
import ExecOverview from "./ExecOverview";
import { Download, LayoutGrid, List, RefreshCw, Search, Columns3, ArrowDownWideNarrow, ArrowUpNarrowWide, Briefcase, Gauge } from "lucide-react";
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
// Used for status labels/colors everywhere (detail panel, alerts, All Brands
// page) — kept as the full superset so those pages can still label/color a
// churned brand correctly.
export const ALL_COLUMNS: { id: PipelineStatus; label: string; accent: string }[] = [
  { id: "not_started",                  label: "Not Started — No Products Yet",            accent: "#5a6b78" },
  { id: "pending_review",               label: "Pending Board Review",                     accent: "#b08bd6" },
  ...COLUMNS,
  // Soft-deleted on health_brands (discarded_at set) — takes priority over
  // every other status, so a churned brand never shows as e.g. "Live" or
  // "Code Snippets Available" just because other data hasn't caught up.
  { id: "churned",                      label: "Churned",                                  accent: "#7a7a7a" },
];

// What "View all" on the Dashboard actually shows: every signed-on brand,
// including the two pre-approval stages (so you can see how many are coming
// down the pipe) — but never Churned, which isn't useful in a "what's
// coming / what's active" board and would otherwise sit alongside Live with
// no way to filter it back out.
export const SIGNED_ON_COLUMNS = ALL_COLUMNS.filter((c) => c.id !== "churned");

// A Kanban column id can be a real PIPELINE_STATUS, or this VIP-board-only
// virtual column — dropping a card here just sets the AB_TESTING flag rather
// than changing the brand's real status, so it lands back in the right
// column once removed. See Brand.AB_TESTING in lib/metabase.ts.
export type KanbanColumnId = PipelineStatus | "ab_testing";
const AB_TESTING_COLUMN: { id: KanbanColumnId; label: string; accent: string } = {
  id: "ab_testing", label: "A/B Testing", accent: "#e879a8",
};

const SE_OWNERS = ["maha", "noor", "naumaan"];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Mirrors the columns shown in TableView, plus the ready dates (not in the
// table itself, but the most commonly requested export field).
function exportBrandsCsv(brands: Brand[], columns: { id: PipelineStatus; label: string }[]) {
  const statusLabel = (status: PipelineStatus) => columns.find((c) => c.id === status)?.label ?? status;
  const header = ["Brand", "Status", "SE", "AM", "Ops", "Portal", "Reviews Delivered", "Days in Status", "Segment"];
  const rows = brands.map((b) => [
    csvCell(b.BRAND_NAME),
    csvCell(statusLabel(b.PIPELINE_STATUS)),
    csvCell(b.SE_OWNER ?? ""),
    csvCell(b.ACCOUNT_MANAGER ?? ""),
    csvCell(b.OPS_OWNER ?? ""),
    csvCell(b.ONBOARDING_CHANNEL === "in_app" ? "Portal" : b.ONBOARDING_CHANNEL === "external" ? "External" : ""),
    String(b.REVIEWS_DELIVERED),
    String(b.DAYS_IN_STATUS),
    csvCell(b.KIND ?? ""),
  ]);
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `se-pipeline-brands-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Mirrors the columns shown in ExecOverviewView exactly (Brand, Status,
// A/B Testing, Ready Date, Close Date, Last Call) — those helpers
// (EXEC_STATUS_STYLES, getExecStatus, etc.) are defined further down this
// file but that's fine, this only runs on click, well after module init.
function exportExecOverviewCsv(brands: Brand[], scheduledCalls: Record<string, ScheduledCall>) {
  const header = ["Brand", "Status", "A/B Testing", "Ready Date", "Close Date", "Last Call"];
  const rows = brands.map((b) => {
    const execStatusKey = getExecStatus(b);
    const execStatus = EXEC_STATUS_STYLES[execStatusKey];
    const readyDate = getReadyDate(b);
    const sc = scheduledCalls[String(b.BRAND_ID)];
    const lastCallLabel = !sc
      ? "None scheduled"
      : sc.action === "webinar_sheet"
        ? "On webinar list"
        : sc.callDate
          ? new Date(sc.callDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
          : "Scheduled";
    return [
      csvCell(b.BRAND_NAME),
      // Blank for "not ready" brands, same as the on-screen dash — nothing
      // actionable yet, so no status text at all rather than a hollow label.
      csvCell(execStatusKey === "not_ready" ? "" : `${execStatus.label} — ${getExecStatusDetail(b)}`),
      csvCell(b.AB_TESTING ? (b.AB_TESTING_NOTES ? `On — ${b.AB_TESTING_NOTES}` : "On") : "Off"),
      csvCell(readyDate ? new Date(readyDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not yet"),
      csvCell(b.CLOSE_DATE ? new Date(b.CLOSE_DATE).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"),
      csvCell(lastCallLabel),
    ];
  });
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `se-pipeline-exec-overview-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Segment options for the filter dropdown — same keys BrandCard uses to badge
// each card, so "Strategic" here means exactly what the colored chip means.
const SEGMENTS = Object.keys(SEGMENT_STYLES);

// A brand "needs outreach" if it's sitting in a status where the next step is
// literally an SE call (a fresh onboarding call, or a re-engagement call for
// a brand that went inactive) and nothing's on the books for them yet.
const OUTREACH_STATUSES: PipelineStatus[] = ["products_approved_needs_call", "was_live"];
function needsOutreach(brand: Brand, scheduledCalls: Record<string, ScheduledCall>): boolean {
  return OUTREACH_STATUSES.includes(brand.PIPELINE_STATUS) && !scheduledCalls[String(brand.BRAND_ID)];
}

export default function Dashboard({
  initialBrands,
  initialScheduledCalls,
  title = "SE pipeline",
  subtitle = "Brand portal checklist → automated status movement",
  activeNavKey = "pipeline",
  refetchSegment,
  showAbTestingColumn = false,
  showWidgetStatusView = false,
  showExecOverview = false,
  hideKanbanTable = false,
}: {
  initialBrands: Brand[];
  initialScheduledCalls: Record<string, ScheduledCall>;
  title?: string;
  subtitle?: string;
  activeNavKey?: string;
  refetchSegment?: string;
  showAbTestingColumn?: boolean;
  showWidgetStatusView?: boolean;
  showExecOverview?: boolean;
  // VIP-only: hides the Kanban/Table views and shows the leadership "Exec
  // Overview" dashboard (see components/ExecOverview.tsx) as the default
  // view instead — Kanban/Table stay untouched on the Pipeline ("/") and
  // Table view ("/brands") pages, which never pass this prop.
  hideKanbanTable?: boolean;
}) {
  const [brands, setBrands] = useState(initialBrands);
  const [scheduledCalls] = useState(initialScheduledCalls);
  const [view, setView] = useState<"kanban" | "table" | "widgets" | "exec" | "leadership">(hideKanbanTable ? "leadership" : "kanban");
  const [seFilter, setSeFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [columnFilter, setColumnFilter] = useState<KanbanColumnId | null>(null);
  const [statFilter, setStatFilter] = useState<"all" | "in_progress" | "stuck" | "live" | "needs_outreach">("all");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(false);
  const [widgetTypeFilter, setWidgetTypeFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Filters brands to ones whose current status was entered within [dateFrom, dateTo]
  // (inclusive, either end optional) — added because "Live" / "Was Live" got a lot
  // bigger once widget status started reflecting real per-widget data instead of a
  // 30-day rolling view-count window, and the raw column got too long to scan.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // When on, the Kanban board adds the "Not Started" / "Pending Board Review"
  // columns and the stat cards/table include those brands too — otherwise
  // brands with no actionable status are hidden from the default view.
  const [viewAll, setViewAll] = useState(false);

  // The search/SE/segment/stat/widget/date filter chain below runs over
  // every brand, churned included, so that the Kanban board's Churned column
  // (see kanbanBrands below) narrows down with the rest of the board instead
  // of always showing every churned brand regardless of active filters.
  // Churned is then excluded (see segmentFiltered below) for the stat cards
  // and table — it's not part of "how many are signed on / coming down the
  // pipe," and mixing it into Total brands would make that count misleading.
  const searched = search.trim()
    ? brands.filter((b) => b.BRAND_NAME.toLowerCase().includes(search.trim().toLowerCase()))
    : brands;

  const seFiltered = seFilter === "all" ? searched : searched.filter((b) => b.SE_OWNER === seFilter);

  const segmentMatched = segmentFilter === "all"
    ? seFiltered
    : seFiltered.filter((b) => b.KIND?.toLowerCase() === segmentFilter);
  // Stat cards/table stay churn-free; the Kanban board's Churned column
  // (kanbanBrands below) uses segmentMatched directly, before this split.
  const segmentFiltered = segmentMatched.filter((b) => b.PIPELINE_STATUS !== "churned");

  const statFiltered = statFilter === "all" ? segmentFiltered
    : statFilter === "in_progress" ? segmentFiltered.filter(b => !["live", "was_live"].includes(b.PIPELINE_STATUS))
    : statFilter === "stuck" ? segmentFiltered.filter(isBrandStuck)
    : statFilter === "needs_outreach" ? segmentFiltered.filter(b => needsOutreach(b, scheduledCalls))
    : segmentFiltered.filter(b => b.PIPELINE_STATUS === "live");

  const widgetFiltered = widgetTypeFilter
    ? statFiltered.filter(b => b.WIDGET_TYPES.includes(widgetTypeFilter))
    : statFiltered;

  // Date range is compared against STATUS_ENTERED_AT — i.e. "Live since" /
  // "Was live since" / whichever date the brand entered its current column —
  // not brand creation date, so it lines up with what's shown on each card.
  const dateFiltered = (dateFrom || dateTo)
    ? widgetFiltered.filter((b) => {
        const entered = b.STATUS_ENTERED_AT.slice(0, 10); // yyyy-mm-dd
        if (dateFrom && entered < dateFrom) return false;
        if (dateTo && entered > dateTo) return false;
        return true;
      })
    : widgetFiltered;

  // Outside of "View all", keep the board scoped to the 5 actionable statuses
  // even though getBrands() now returns every partnered brand. "View all"
  // widens that to every signed-on brand (including the two pre-approval
  // stages, so you can see how many are coming). Churned is excluded here too
  // (dateFiltered is already churn-free, via segmentFiltered above).
  const activeColumns = viewAll ? SIGNED_ON_COLUMNS : COLUMNS;
  const filtered = viewAll
    ? dateFiltered
    : dateFiltered.filter((b) => COLUMNS.some((c) => c.id === b.PIPELINE_STATUS));

  // The Kanban board always shows a Churned column alongside the other
  // (non-churned) columns, regardless of View all — unlike the stat cards
  // and table, which stay churn-free so "Total brands" etc. aren't skewed.
  // Built off segmentMatched (search/SE/segment applied, churned brands
  // still included) rather than `filtered`, since stat/widget/date filters
  // don't apply meaningfully to a brand that's no longer active.
  const churnedColumn = ALL_COLUMNS.find((c) => c.id === "churned")!;
  // A/B Testing sits right after Collaborator Code Brand rather than at the
  // end — found by id rather than a fixed index, since activeColumns' shape
  // changes between the 5-column default and "View all"'s wider set.
  const kanbanColumns = (() => {
    if (!showAbTestingColumn) return [...activeColumns, churnedColumn];
    const collabIdx = activeColumns.findIndex((c) => c.id === "collaborator_code_brand");
    const insertAt = collabIdx === -1 ? activeColumns.length : collabIdx + 1;
    return [...activeColumns.slice(0, insertAt), AB_TESTING_COLUMN, ...activeColumns.slice(insertAt), churnedColumn];
  })();
  const churnedBrands = segmentMatched.filter((b) => b.PIPELINE_STATUS === "churned");
  const kanbanBrands = [...filtered, ...churnedBrands];

  const visibleBrands = columnFilter
    ? filtered.filter((b) => columnFilter === "ab_testing" ? b.AB_TESTING : b.PIPELINE_STATUS === columnFilter)
    : filtered;
  const stuck = segmentFiltered.filter(isBrandStuck).length;
  const live = segmentFiltered.filter((b) => b.PIPELINE_STATUS === "live").length;

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      setBrands(refetchSegment ? data.filter((b: Brand) => b.KIND?.toLowerCase() === refetchSegment) : data);
    } finally {
      setLoading(false);
    }
  }

  async function moveBrand(brandId: number, newStatus: KanbanColumnId) {
    const prevBrand = brands.find((b) => b.BRAND_ID === brandId);
    if (!prevBrand) return;
    const prevStatus = prevBrand.PIPELINE_STATUS;
    const wasAbTesting = prevBrand.AB_TESTING;

    // Dropping on "A/B Testing" only sets the flag — the brand's real
    // PIPELINE_STATUS is left untouched so it lands back in the right real
    // column once removed from A/B Testing.
    if (newStatus === "ab_testing") {
      setBrands((prev) => prev.map((b) => (b.BRAND_ID === brandId ? { ...b, AB_TESTING: true } : b)));
      try {
        const res = await fetch("/api/field-overrides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId, field: "AB_TESTING", value: "true" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new Error(data.errors?.join("; ") ?? "Save failed");
      } catch (e) {
        setBrands((prev) => prev.map((b) => (b.BRAND_ID === brandId ? { ...b, AB_TESTING: wasAbTesting } : b)));
        alert(`Couldn't save A/B Testing move: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }

    // Dropping on a real status column clears A/B Testing (if set) alongside
    // the normal status change, so the card doesn't stay hidden from the
    // column it was just dropped on (see KanbanView's AB_TESTING exclusion).
    setBrands((prev) =>
      prev.map((b) => (b.BRAND_ID === brandId ? { ...b, PIPELINE_STATUS: newStatus, AB_TESTING: false } : b))
    );
    try {
      const calls = [
        fetch("/api/overrides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId, status: newStatus }),
        }),
      ];
      if (wasAbTesting) {
        calls.push(fetch("/api/field-overrides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId, field: "AB_TESTING", value: "" }),
        }));
      }
      const results = await Promise.all(calls);
      for (const res of results) {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? body.errors?.join("; ") ?? `Save failed (${res.status})`);
        }
      }
    } catch (e) {
      // The optimistic move above was never persisted — roll it back so the
      // board reflects reality instead of quietly reverting on next refresh
      // with no explanation.
      setBrands((prev) =>
        prev.map((b) => (b.BRAND_ID === brandId ? { ...b, PIPELINE_STATUS: prevStatus, AB_TESTING: wasAbTesting } : b))
      );
      alert(`Couldn't save status change: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function toggleColumnFilter(id: KanbanColumnId) {
    setColumnFilter((prev) => (prev === id ? null : id));
  }

  // Explicit on/off control for AB_TESTING (separate from the Kanban column drag).
  async function toggleAbTesting(brandId: number, newValue: boolean) {
    const brand = brands.find((b) => b.BRAND_ID === brandId);
    if (!brand) return;
    setBrands((prev) => prev.map((b) => (b.BRAND_ID === brandId ? { ...b, AB_TESTING: newValue } : b)));
    try {
      const res = await fetch("/api/field-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, field: "AB_TESTING", value: newValue ? "true" : "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.errors?.join("; ") ?? `Save failed (${res.status})`);
    } catch (e) {
      setBrands((prev) => prev.map((b) => (b.BRAND_ID === brandId ? { ...b, AB_TESTING: brand.AB_TESTING } : b)));
      alert(`Couldn't save A/B Testing toggle: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active={activeNavKey} />

      {/* Main */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="px-8 py-5 flex items-start justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{title}</h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>{subtitle}</p>
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
              title={viewAll ? "Showing every signed-on brand, including pre-approval stages (Churned hidden)" : "Only showing the 5 actionable pipeline stages"}
              style={{
                background: viewAll ? "rgba(114,164,191,0.2)" : "rgba(255,255,255,0.07)",
                color: viewAll ? "#72a4bf" : "rgba(255,255,255,0.6)",
                border: `1px solid ${viewAll ? "rgba(114,164,191,0.4)" : "rgba(255,255,255,0.12)"}`,
              }}>
              View all
            </button>
            <div className="flex items-center gap-1.5 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Status entered</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent outline-none"
                style={{ color: dateFrom ? "#fff" : "rgba(255,255,255,0.4)", fontSize: "0.8rem", colorScheme: "dark" }}
              />
              <span style={{ color: "rgba(255,255,255,0.3)" }}>–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent outline-none"
                style={{ color: dateTo ? "#fff" : "rgba(255,255,255,0.4)", fontSize: "0.8rem", colorScheme: "dark" }}
              />
            </div>
            {(columnFilter || statFilter !== "all" || widgetTypeFilter || search || dateFrom || dateTo || segmentFilter !== "all") && (
              <button onClick={() => { setColumnFilter(null); setStatFilter("all"); setWidgetTypeFilter(null); setSearch(""); setDateFrom(""); setDateTo(""); setSegmentFilter("all"); }}
                className="text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{ background: "rgba(114,164,191,0.12)", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
                ✕ Clear filter
              </button>
            )}
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="text-sm rounded-lg px-3 py-2"
              style={{ background: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", fontSize: "0.875rem" }}
            >
              <option value="all">All Segments</option>
              {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_STYLES[s].label}</option>)}
            </select>
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
              {hideKanbanTable ? (
                <button onClick={() => setView("leadership")} className="px-3 py-2 flex items-center gap-1.5 text-sm transition-colors"
                  style={{ background: view === "leadership" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: view === "leadership" ? "#fff" : "rgba(255,255,255,0.4)" }}>
                  <Gauge size={14} /> Exec Overview
                </button>
              ) : (
                <>
                  <button onClick={() => setView("kanban")} className="px-3 py-2 flex items-center gap-1.5 text-sm transition-colors"
                    style={{ background: view === "kanban" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: view === "kanban" ? "#fff" : "rgba(255,255,255,0.4)" }}>
                    <LayoutGrid size={14} /> Kanban
                  </button>
                  <button onClick={() => setView("table")} className="px-3 py-2 flex items-center gap-1.5 text-sm transition-colors"
                    style={{ background: view === "table" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: view === "table" ? "#fff" : "rgba(255,255,255,0.4)" }}>
                    <List size={14} /> Table
                  </button>
                </>
              )}
              {showWidgetStatusView && (
                <button onClick={() => setView("widgets")} className="px-3 py-2 flex items-center gap-1.5 text-sm transition-colors"
                  style={{ background: view === "widgets" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: view === "widgets" ? "#fff" : "rgba(255,255,255,0.4)" }}>
                  <Columns3 size={14} /> Widget Status
                </button>
              )}
              {showExecOverview && (
                <button onClick={() => setView("exec")} className="px-3 py-2 flex items-center gap-1.5 text-sm transition-colors"
                  style={{ background: view === "exec" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: view === "exec" ? "#fff" : "rgba(255,255,255,0.4)" }}>
                  <Briefcase size={14} /> {hideKanbanTable ? "SE Overview" : "Exec Overview"}
                </button>
              )}
            </div>
            <button onClick={refresh} disabled={loading} className="p-2 rounded-lg disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => exportBrandsCsv(visibleBrands, activeColumns)}
              title="Export the brands currently shown to CSV"
              className="text-sm px-3 py-2 rounded-lg flex items-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <Download size={14} /> Export
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-5 gap-4 px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {([
            { label: "Total brands", key: "all" as const, value: segmentFiltered.length, color: "#fff" },
            { label: "In progress", key: "in_progress" as const, value: segmentFiltered.filter(b => !["live","was_live"].includes(b.PIPELINE_STATUS)).length, color: "#72a4bf" },
            { label: "Needs outreach", key: "needs_outreach" as const, value: segmentFiltered.filter(b => needsOutreach(b, scheduledCalls)).length, color: "#e9a84c" },
            { label: "Stuck >7d", key: "stuck" as const, value: segmentFiltered.filter(isBrandStuck).length, color: "#e05c5c" },
            { label: "Live", key: "live" as const, value: segmentFiltered.filter(b => b.PIPELINE_STATUS === "live").length, color: "#4caf82" },
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
          segmentFiltered.some(b => b.WIDGET_TYPES.includes(key))
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
              All <span style={{ opacity: 0.6 }}>{segmentFiltered.length}</span>
            </button>
            {Object.entries(WIDGET_TYPE_LABELS).map(([key, label]) => {
              const count = segmentFiltered.filter(b => b.WIDGET_TYPES.includes(key)).length;
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
              brands={kanbanBrands}
              columns={kanbanColumns}
              columnFilter={columnFilter}
              scheduledCalls={scheduledCalls}
              onMove={moveBrand}
              onCardClick={setSelectedBrand}
              onHeaderClick={toggleColumnFilter}
              onToggleAbTesting={toggleAbTesting}
            />
          ) : view === "table" ? (
            <TableView brands={visibleBrands} columns={activeColumns} scheduledCalls={scheduledCalls} onMove={moveBrand} onRowClick={setSelectedBrand} />
          ) : view === "widgets" ? (
            <WidgetStatusView brands={segmentFiltered} onCardClick={setSelectedBrand} />
          ) : view === "leadership" ? (
            <ExecOverview brands={segmentFiltered} onSelectBrand={setSelectedBrand} />
          ) : (
            <ExecOverviewView brands={segmentFiltered} scheduledCalls={scheduledCalls} onRowClick={setSelectedBrand} onToggleAbTesting={toggleAbTesting} />
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
  onToggleAbTesting,
}: {
  brands: Brand[];
  columns: { id: KanbanColumnId; label: string; accent: string }[];
  columnFilter: KanbanColumnId | null;
  scheduledCalls: Record<string, ScheduledCall>;
  onMove: (brandId: number, status: KanbanColumnId) => void;
  onCardClick: (brand: Brand) => void;
  onHeaderClick: (id: KanbanColumnId) => void;
  onToggleAbTesting: (brandId: number, newValue: boolean) => void;
}) {
  const dragBrandId = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<KanbanColumnId | null>(null);
  // Per-column sort direction over DAYS_IN_STATUS — defaults to "desc" (longest
  // in status first, i.e. most overdue), but any column can be flipped to
  // "asc" (most recently entered first) independently of the others.
  const [sortDir, setSortDir] = useState<Partial<Record<KanbanColumnId, "asc" | "desc">>>({});

  function toggleSortDir(colId: KanbanColumnId) {
    setSortDir((prev) => ({ ...prev, [colId]: (prev[colId] ?? "desc") === "desc" ? "asc" : "desc" }));
  }

  const visibleColumns = columnFilter ? columns.filter((c) => c.id === columnFilter) : columns;
  // Only the VIP board's columns include "ab_testing" — use that as the
  // signal for whether cards should offer the A/B Testing notes toggle at all.
  const showAbTesting = columns.some((c) => c.id === "ab_testing");

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {visibleColumns.map((col) => {
        // Defaults to longest-in-status first — surfaces the brands most
        // overdue for attention (e.g. "was live" the longest) at the top of
        // each column, instead of whatever order the underlying query
        // happened to return. Flippable per-column via the sort button below.
        // A brand with AB_TESTING set is pulled out of its real status column
        // and shown only under "A/B Testing" (see moveBrand) — it lands back
        // here once that flag clears.
        const dir = sortDir[col.id] ?? "desc";
        const colBrands = (col.id === "ab_testing"
          ? brands.filter((b) => b.AB_TESTING)
          : brands.filter((b) => b.PIPELINE_STATUS === col.id && !b.AB_TESTING)
        ).sort((a, b) => (dir === "desc" ? b.DAYS_IN_STATUS - a.DAYS_IN_STATUS : a.DAYS_IN_STATUS - b.DAYS_IN_STATUS));
        const totalCount = colBrands.length;
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
                onClick={() => toggleSortDir(col.id)}
                className="ml-auto p-1 rounded-md hover:opacity-80 transition-opacity"
                title={dir === "desc" ? "Sorted: longest in status first — click for most recent first" : "Sorted: most recent first — click for longest in status first"}
                style={{ color: "rgba(255,255,255,0.35)" }}>
                {dir === "desc" ? <ArrowDownWideNarrow size={13} /> : <ArrowUpNarrowWide size={13} />}
              </button>
              <button
                onClick={() => onHeaderClick(col.id)}
                className="px-2 py-0.5 rounded-full transition-colors"
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
                  <BrandCard brand={brand} accent={col.accent} scheduledCall={scheduledCalls[String(brand.BRAND_ID)] ?? null} showAbTesting={showAbTesting} onToggleAbTesting={onToggleAbTesting} />
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

// One entry per filterable table column. "text" does a case-insensitive
// substring match; "min" parses the filter value as a number and keeps rows
// whose field is >= it; "select" is an exact match against a fixed option list.
type ColumnFilterConfig =
  | { kind: "text"; field: keyof Brand }
  | { kind: "min"; field: keyof Brand }
  | { kind: "select"; field: keyof Brand; options: { value: string; label: string }[] };

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
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  function toggleSort(key: keyof Brand) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const FILTER_CONFIG: Record<string, ColumnFilterConfig> = {
    BRAND_NAME: { kind: "text", field: "BRAND_NAME" },
    PIPELINE_STATUS: { kind: "select", field: "PIPELINE_STATUS", options: columns.map((c) => ({ value: c.id, label: c.label })) },
    SE_OWNER: { kind: "text", field: "SE_OWNER" },
    ACCOUNT_MANAGER: { kind: "text", field: "ACCOUNT_MANAGER" },
    OPS_OWNER: { kind: "text", field: "OPS_OWNER" },
    ONBOARDING_CHANNEL: { kind: "select", field: "ONBOARDING_CHANNEL", options: [{ value: "in_app", label: "Portal" }, { value: "external", label: "External" }] },
    REVIEWS_DELIVERED: { kind: "min", field: "REVIEWS_DELIVERED" },
    DAYS_IN_STATUS: { kind: "min", field: "DAYS_IN_STATUS" },
  };

  function matchesFilters(brand: Brand): boolean {
    return Object.entries(columnFilters).every(([key, value]) => {
      if (!value) return true;
      const config = FILTER_CONFIG[key];
      if (!config) return true;
      const raw = brand[config.field];
      if (config.kind === "text") {
        return String(raw ?? "").toLowerCase().includes(value.toLowerCase());
      }
      if (config.kind === "select") {
        return raw === value;
      }
      // "min"
      const num = Number(value);
      if (Number.isNaN(num)) return true;
      return Number(raw ?? 0) >= num;
    });
  }

  const filtered = brands.filter(matchesFilters);

  const sorted = [...filtered].sort((a, b) => {
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
      <td className="px-4 pb-2" onClick={(e) => e.stopPropagation()}>
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

  const hasActiveFilters = Object.values(columnFilters).some((v) => v);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>
          {sorted.length} of {brands.length} brands
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={() => setColumnFilters({})}
              className="text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5"
              style={{ background: "rgba(114,164,191,0.12)", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
              ✕ Clear column filters
            </button>
          )}
          <button
            onClick={() => exportBrandsCsv(sorted, columns)}
            title="Export the rows currently shown in this table to CSV"
            className="text-sm px-3 py-2 rounded-lg flex items-center gap-1.5"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <table className="w-full">
        <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <tr><Th label="Brand" field="BRAND_NAME" /><Th label="Status" field="PIPELINE_STATUS" /><Th label="SE" field="SE_OWNER" /><Th label="AM" field="ACCOUNT_MANAGER" /><Th label="Ops" field="OPS_OWNER" /><Th label="Portal" field="ONBOARDING_CHANNEL" /><Th label="Reviews" field="REVIEWS_DELIVERED" /><Th label="Days" field="DAYS_IN_STATUS" /><th className="px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Call</th><th className="px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Links</th></tr>
          <tr>
            <FilterCell column="BRAND_NAME" />
            <FilterCell column="PIPELINE_STATUS" />
            <FilterCell column="SE_OWNER" />
            <FilterCell column="ACCOUNT_MANAGER" />
            <FilterCell column="OPS_OWNER" />
            <FilterCell column="ONBOARDING_CHANNEL" />
            <FilterCell column="REVIEWS_DELIVERED" />
            <FilterCell column="DAYS_IN_STATUS" />
            <td className="px-4 pb-2" />
            <td className="px-4 pb-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((brand) => {
            const hubspotUrl = brand.HUBSPOT_COMPANY_ID ? `https://app-na2.hubspot.com/contacts/46815331/record/0-2/${brand.HUBSPOT_COMPANY_ID}` : null;
            const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;
            const isStuck = isBrandStuck(brand);
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
                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.ONBOARDING_CHANNEL === "in_app" ? "Portal" : brand.ONBOARDING_CHANNEL === "external" ? "External" : "—"}</td>
                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>{brand.REVIEWS_DELIVERED}</td>
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
    </div>
  );
}

const BADGE_STATUS_COLUMNS: { id: BadgeStatus; label: string; accent: string }[] = [
  { id: "not_live", label: "Not Live",          accent: "#5a6b78" },
  { id: "ready",    label: "Ready to go live",  accent: "#e9a84c" },
  { id: "live",     label: "Live",              accent: "#4caf82" },
  { id: "was_live", label: "Was Live",          accent: "#e05c5c" },
];

// Widget type keys per badge — Reviews/CAI mirror the same grouping metabase.ts
// uses for REVIEWS_IMPLEMENTED/CAI_IMPLEMENTED. "Clinicians Choice" combines
// quant (Embedded) + sticker (Banner) into one board — showTypeTag surfaces
// which of the two is actually live/was live per brand in that board's cards,
// since either alone counts but which one can still matter operationally.
// readyDate pulls the matching *_READY_DATE field already on Brand — same
// field the exec Ready Date column and follow-up automation use — so "ready
// to go live" here means exactly what it means everywhere else in the app.
const BADGE_GROUPS: { key: string; label: string; types: string[]; showTypeTag?: boolean; readyDate: (b: Brand) => string | null }[] = [
  { key: "reviews",           label: "Reviews",           types: ["qual"], readyDate: (b) => b.REVIEWS_READY_DATE },
  { key: "cai",               label: "CAI",               types: ["gpt", "analysis", "gpt_s"], readyDate: (b) => b.CAI_READY_DATE },
  { key: "clinicians_choice", label: "Clinicians Choice", types: ["quant", "sticker"], showTypeTag: true, readyDate: (b) => b.BADGE_READY_DATE },
];

// Which specific type(s) within a multi-type group are driving a "live" or
// "was_live" status — e.g. a Clinicians Choice card might be live via
// "sticker", "quant", or both.
function getLiveTypeTag(brand: Brand, types: string[], status: BadgeStatus): string | null {
  if (status !== "live" && status !== "was_live") return null;
  const statuses = brand.WIDGET_STATUSES;
  const matching = types.filter((t) =>
    status === "live" ? statuses?.[t]?.isLive : (statuses?.[t]?.wentLiveAt && !statuses?.[t]?.isLive)
  );
  return matching.length ? matching.join(", ") : null;
}

// Read-only by design — unlike PIPELINE_STATUS, a widget's live/was-live/not-live
// state is derived entirely from real Grafana view data, so there's nothing for
// an SE to drag between columns here.
function WidgetStatusView({ brands, onCardClick }: { brands: Brand[]; onCardClick: (brand: Brand) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {BADGE_GROUPS.map((group) => {
        const columns = BADGE_STATUS_COLUMNS.map((col) => ({
          ...col,
          brands: brands
            .filter((b) => getBadgeStatus(b, group.types, group.readyDate(b)) === col.id)
            .sort((a, b) => a.BRAND_NAME.localeCompare(b.BRAND_NAME)),
        }));

        return (
          <div key={group.key} className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>
              {group.label}
            </div>
            <div className="grid grid-cols-4 gap-4">
              {columns.map((col) => (
                <div key={col.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.accent }} />
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>{col.label}</span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>{col.brands.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg p-2 min-h-20 max-h-[420px] overflow-y-auto"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {col.brands.map((b) => {
                      const typeTag = group.showTypeTag ? getLiveTypeTag(b, group.types, col.id) : null;
                      return (
                        <button key={b.BRAND_ID} onClick={() => onCardClick(b)}
                          className="text-left px-2.5 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
                          style={{ background: "rgba(255,255,255,0.05)", borderLeft: `2px solid ${col.accent}`, fontSize: "0.8rem", color: "#fff" }}>
                          {b.BRAND_NAME}
                          {typeTag && (
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem" }}> ({typeTag})</span>
                          )}
                        </button>
                      );
                    })}
                    {col.brands.length === 0 && (
                      <div className="text-center py-4" style={{ color: "rgba(255,255,255,0.15)", fontSize: "0.75rem" }}>None</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Sub-orders Partial rows: 1 for "everything pending is just ready and
// waiting to be flipped on" (an SE can act on this in five minutes), 0 for
// "at least one piece doesn't even have a ready date yet" (still pending on
// our end — e.g. reviews not yet collected/processed, not something the
// brand itself is blocking) — so the latter always sinks toward the bottom
// of the Partial group instead of being interleaved with the more
// actionable rows.
function getPartialPriority(brand: Brand): number {
  const badgeStatus = getBadgeStatus(brand, ["quant", "sticker"], brand.BADGE_READY_DATE);
  const reviewsStatus = getBadgeStatus(brand, ["qual"], brand.REVIEWS_READY_DATE);
  const caiExpected = brand.CAI_READY_DATE != null;
  const caiStatus = caiExpected ? getBadgeStatus(brand, ["gpt", "analysis", "gpt_s"], brand.CAI_READY_DATE) : null;
  const pending = [badgeStatus, reviewsStatus, ...(caiStatus ? [caiStatus] : [])].filter((s) => s !== "live");
  return pending.some((s) => s === "not_live") ? 0 : 1;
}

// Which pending piece(s) don't even have a ready date yet — named directly
// (e.g. "Reviews") rather than a vague "waiting on the brand," since a
// missing ready date is almost always work still pending on our side.
function getPartialNotReadyParts(brand: Brand): string[] {
  const badgeStatus = getBadgeStatus(brand, ["quant", "sticker"], brand.BADGE_READY_DATE);
  const reviewsStatus = getBadgeStatus(brand, ["qual"], brand.REVIEWS_READY_DATE);
  const caiExpected = brand.CAI_READY_DATE != null;
  const caiStatus = caiExpected ? getBadgeStatus(brand, ["gpt", "analysis", "gpt_s"], brand.CAI_READY_DATE) : null;
  const parts: { name: string; status: BadgeStatus }[] = [
    { name: "Badge", status: badgeStatus },
    { name: "Reviews", status: reviewsStatus },
    ...(caiStatus ? [{ name: "CAI/CAS", status: caiStatus }] : []),
  ];
  return parts.filter((p) => p.status === "not_live").map((p) => p.name);
}

// The visible label for a row's sub-group within Partial / Needs Attention —
// null for every other tier, since only these two get sub-grouped.
function getSubGroupLabel(status: ExecStatus, brand: Brand): string | null {
  if (status === "partial") {
    if (getPartialPriority(brand) === 1) return "Everything ready — not fully live yet";
    const notReady = getPartialNotReadyParts(brand);
    return notReady.length ? `${notReady.join(" + ")} not ready yet` : "Not ready yet";
  }
  if (status === "needs_attention") return getRegressedParts(brand).length >= 2 ? "2+ things down" : "1 thing down";
  return null;
}

// Same live-combo phrasing as getExecStatusDetail, but for a single product's
// TOP_PDP signals rather than the brand-level rollup.
function getPdpDetail(pdp: { badgeLive: boolean; reviewsLive: boolean; caiLive: boolean }): string {
  if (pdp.badgeLive && pdp.reviewsLive && pdp.caiLive) return "Badge + Reviews + CAI";
  if (pdp.badgeLive && pdp.reviewsLive) return "Badge + Reviews";
  if (pdp.badgeLive) return "Badge only";
  if (pdp.reviewsLive) return "Reviews only";
  return "Not live yet";
}

type ExecSortKey = "brand" | "status" | "ready" | "closeDate" | "lastCall";

// Nulls (nothing scheduled / not yet ready) always sort to the end, regardless
// of direction — an empty date isn't meaningfully "earliest."
function compareNullableDates(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Read-only, high-level snapshot for leadership: is each VIP brand ready to
// go live, are they A/B testing, and when did we last have a call — one row
// per brand rather than three separate widget boards to cross-reference.
function ExecOverviewView({
  brands, scheduledCalls, onRowClick, onToggleAbTesting,
}: {
  brands: Brand[];
  scheduledCalls: Record<string, ScheduledCall>;
  onRowClick: (brand: Brand) => void;
  onToggleAbTesting: (brandId: number, newValue: boolean) => void;
}) {
  // Defaults to Status descending (Live L3 first, Not Live last) — any
  // column can still be sorted, same pattern as the Kanban's per-column
  // sort toggle.
  const [sortKey, setSortKey] = useState<ExecSortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Clicking a row expands a quick horizontal summary in place rather than
  // opening the full slide-over panel — "View full details" inside it still
  // opens that same panel (onRowClick) for deep editing.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // "all" hides Not Ready by default — nothing's actionable there, so it'd
  // otherwise clutter a leadership-facing view with brands nobody can do
  // anything about yet. Picking the Not Ready chip explicitly still surfaces
  // them, same pattern as the widget-type filter chips elsewhere.
  const [statusFilter, setStatusFilter] = useState<ExecStatus | "all">("all");

  function toggleSort(key: ExecSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const statusCounts: Record<ExecStatus, number> = { live_2: 0, live_1: 0, needs_attention: 0, partial: 0, not_live: 0, not_ready: 0 };
  for (const b of brands) statusCounts[getExecStatus(b)]++;

  const filtered = brands.filter((b) => {
    const status = getExecStatus(b);
    return statusFilter === "all" ? status !== "not_ready" : status === statusFilter;
  });

  const compare = (a: Brand, b: Brand): number => {
    switch (sortKey) {
      case "brand": return a.BRAND_NAME.localeCompare(b.BRAND_NAME);
      case "status": {
        const statusA = getExecStatus(a);
        const statusB = getExecStatus(b);
        const diff = EXEC_STATUS_ORDER[statusA] - EXEC_STATUS_ORDER[statusB];
        if (diff !== 0) return diff;
        // Same tier — for Partial specifically, sub-sort so "just needs a
        // flip" rows rank ahead of "still waiting on the brand" rows.
        if (statusA === "partial") return getPartialPriority(a) - getPartialPriority(b);
        // For Needs Attention, sub-sort by how many pieces are currently
        // down — a brand closer to total collapse (2+ things dark) is more
        // urgent than one where only a single piece dropped, so it ranks
        // ahead within the group.
        if (statusA === "needs_attention") return getRegressedParts(a).length - getRegressedParts(b).length;
        return 0;
      }
      case "ready": return compareNullableDates(getReadyDate(a), getReadyDate(b));
      case "closeDate": return compareNullableDates(a.CLOSE_DATE, b.CLOSE_DATE);
      case "lastCall": return compareNullableDates(scheduledCalls[String(a.BRAND_ID)]?.callDate ?? null, scheduledCalls[String(b.BRAND_ID)]?.callDate ?? null);
    }
  };
  const sorted = [...filtered].sort((a, b) => (sortDir === "asc" ? 1 : -1) * compare(a, b));

  function Th({ label, sortKeyValue }: { label: string; sortKeyValue: ExecSortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <th className="text-left px-4 py-3 cursor-pointer select-none hover:opacity-80" onClick={() => toggleSort(sortKeyValue)}
        style={{ color: active ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  return (
    <div className="flex gap-4 items-start">
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>{sorted.length} brands</div>
        <button
          onClick={() => exportExecOverviewCsv(sorted, scheduledCalls)}
          title="Export the exec overview rows currently shown to CSV"
          className="text-sm px-3 py-2 rounded-lg flex items-center gap-1.5"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <Download size={14} /> Export
        </button>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setStatusFilter("all")}
          className="px-3 py-1 rounded-full text-xs font-medium transition-all"
          style={{
            background: statusFilter === "all" ? "rgba(114,164,191,0.25)" : "rgba(255,255,255,0.07)",
            color: statusFilter === "all" ? "#72a4bf" : "rgba(255,255,255,0.5)",
            border: `1px solid ${statusFilter === "all" ? "rgba(114,164,191,0.5)" : "rgba(255,255,255,0.1)"}`,
          }}
        >
          All <span style={{ opacity: 0.6 }}>{brands.length - statusCounts.not_ready}</span>
        </button>
        {EXEC_STATUS_DISPLAY_ORDER.map((key) => {
          const style = EXEC_STATUS_STYLES[key];
          const count = statusCounts[key];
          const isActive = statusFilter === key;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(isActive ? "all" : key)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: isActive ? style.color + "25" : "rgba(255,255,255,0.07)",
                color: key === "not_ready" ? "rgba(255,255,255,0.5)" : style.color,
                border: `1px solid ${isActive ? style.color + "55" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {style.label} <span style={{ opacity: 0.6 }}>{count}</span>
            </button>
          );
        })}
      </div>
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <table className="w-full">
        <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <tr>
            <Th label="Brand" sortKeyValue="brand" />
            <Th label="Status" sortKeyValue="status" />
            <th className="text-left px-4 py-3" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>A/B Testing</th>
            <Th label="Ready Date" sortKeyValue="ready" />
            <Th label="Close Date" sortKeyValue="closeDate" />
            <Th label="Last Call" sortKeyValue="lastCall" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((brand, index) => {
            const execStatusKey = getExecStatus(brand);
            const execStatus = EXEC_STATUS_STYLES[execStatusKey];
            const readyDate = getReadyDate(brand);
            const sc = scheduledCalls[String(brand.BRAND_ID)];
            const lastCallLabel = !sc
              ? "None scheduled"
              : sc.action === "webinar_sheet"
                ? "On webinar list"
                : sc.callDate
                  ? new Date(sc.callDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : "Scheduled";

            const isExpanded = expandedId === brand.BRAND_ID;
            const regressedParts = execStatusKey === "needs_attention" ? getRegressedParts(brand) : [];
            const hubspotUrl = brand.HUBSPOT_COMPANY_ID ? `https://app-na2.hubspot.com/contacts/46815331/record/0-2/${brand.HUBSPOT_COMPANY_ID}` : null;
            const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;

            // Visible sub-group label within Partial / Needs Attention — only
            // shown when sorted by Status, since that's the only ordering
            // where rows sharing a label actually end up adjacent. A labeled
            // divider (not just a silent reorder) so it's clear *why* the
            // rows are grouped this way.
            const groupLabel = sortKey === "status" ? getSubGroupLabel(execStatusKey, brand) : null;
            const prevBrand = index > 0 ? sorted[index - 1] : null;
            const prevGroupLabel = prevBrand && sortKey === "status" ? getSubGroupLabel(getExecStatus(prevBrand), prevBrand) : null;
            const showGroupHeader = groupLabel !== null && groupLabel !== prevGroupLabel;

            return (
              <Fragment key={brand.BRAND_ID}>
              {showGroupHeader && (
                <tr>
                  <td colSpan={6} className="px-4 pt-4 pb-1" style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {groupLabel}
                  </td>
                </tr>
              )}
              <tr style={{ borderBottom: isExpanded ? "none" : "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: isExpanded ? "rgba(255,255,255,0.03)" : "" }}
                onClick={() => setExpandedId((prev) => (prev === brand.BRAND_ID ? null : brand.BRAND_ID))}
                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = ""; }}>
                <td className="px-4 py-3" style={{ color: "#fff", fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.9rem", fontWeight: 600 }}>
                  {brand.BRAND_NAME}
                </td>
                <td className="px-4 py-3">
                  {execStatusKey === "not_ready" ? (
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.8rem" }}>—</span>
                  ) : (
                    <>
                      <span className="px-2 py-0.5 rounded-full" style={{ background: execStatus.color + "22", color: execStatus.color, fontSize: "0.8rem", fontWeight: 600 }}>
                        {execStatus.label}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", marginLeft: "6px" }}>— {getExecStatusDetail(brand)}</span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <AbTestingToggle value={brand.AB_TESTING} onToggle={(v) => onToggleAbTesting(brand.BRAND_ID, v)} />
                    {brand.AB_TESTING && brand.AB_TESTING_NOTES && (
                      <span title={brand.AB_TESTING_NOTES} style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}>
                        {brand.AB_TESTING_NOTES.slice(0, 30)}{brand.AB_TESTING_NOTES.length > 30 ? "…" : ""}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: readyDate ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>
                  {readyDate ? new Date(readyDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not yet"}
                </td>
                <td className="px-4 py-3" style={{ color: brand.CLOSE_DATE ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>
                  {brand.CLOSE_DATE ? new Date(brand.CLOSE_DATE).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </td>
                <td className="px-4 py-3" style={{ color: sc ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>
                  {lastCallLabel}
                </td>
              </tr>
              {isExpanded && (
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.03)" }}>
                  <td colSpan={6} className="px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                        {regressedParts.length > 0 && (
                          <div>
                            <div style={{ fontSize: "0.7rem", color: "#e05c5c", textTransform: "uppercase" }}>Previously Live</div>
                            <div style={{ fontSize: "0.85rem", color: "#fff" }}>
                              {regressedParts.map((p, i) => (
                                <span key={p.name}>
                                  {i > 0 && ", "}
                                  {p.name} <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>
                                    (last live {p.lastLiveDate ? new Date(p.lastLiveDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "unknown"})
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Segment</div>
                          <div style={{ fontSize: "0.85rem", color: "#fff" }}>{brand.KIND ?? "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Ready Date</div>
                          <div style={{ fontSize: "0.85rem", color: readyDate ? "#fff" : "rgba(255,255,255,0.3)" }}>
                            {readyDate ? new Date(readyDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not yet"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>PDP</div>
                          {brand.TOP_PDP ? (
                            <div style={{ fontSize: "0.85rem" }}>
                              <a href={brand.TOP_PDP.url} target="_blank" rel="noopener noreferrer"
                                style={{ color: "#72a4bf" }} onClick={(e) => e.stopPropagation()}>
                                {brand.TOP_PDP.name}
                              </a>
                              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>
                                {" "}— {getPdpDetail(brand.TOP_PDP)}{brand.PDP_COUNT > 1 ? ` (1 of ${brand.PDP_COUNT})` : ""}
                              </span>
                            </div>
                          ) : (
                            <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.3)" }}>No published PDP</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {hubspotUrl && <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#f97316", fontSize: "0.8rem" }} onClick={(e) => e.stopPropagation()}>HubSpot</a>}
                        <a href={adminUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#72a4bf", fontSize: "0.8rem" }} onClick={(e) => e.stopPropagation()}>Admin</a>
                        <button onClick={(e) => { e.stopPropagation(); onRowClick(brand); }}
                          className="px-3 py-1.5 rounded-lg"
                          style={{ background: "rgba(114,164,191,0.15)", color: "#72a4bf", fontSize: "0.8rem", fontWeight: 600 }}>
                          View full details →
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
    <ExecStatusGuide />
    </div>
  );
}

// Short, static reference for what each Exec Overview status pill means —
// pulled out as its own component so the definitions live next to the view
// itself instead of only in code comments.
const EXEC_STATUS_GUIDE: { key: ExecStatus; description: string }[] = [
  { key: "live_2", description: "Badge, Reviews, and CAI/CAS are all live." },
  { key: "live_1", description: "Badge + Reviews live — CAI/CAS was never expected for this brand." },
  { key: "needs_attention", description: "Badge, Reviews, or CAI/CAS is previously live — it worked before and has since broken. Check the dropdown for what dropped and when." },
  { key: "partial", description: "Everything is ready, just not fully live yet — either Badge or Reviews is live and the other isn't, or Badge + Reviews are live but CAI/CAS hasn't caught up. If a piece doesn't even have a ready date yet (usually Reviews or CAI/CAS), that's called out separately." },
  { key: "not_live", description: "None of the badges have ever gone live — though Badge + Reviews are both fully ready and just waiting to be flipped on." },
  { key: "not_ready", description: "Badge or Reviews isn't ready yet — nothing for an SE to act on." },
];

function ExecStatusGuide() {
  return (
    <div className="rounded-xl p-4 flex-shrink-0" style={{ width: "230px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
        Status guide
      </div>
      <div className="flex flex-col gap-3">
        {EXEC_STATUS_GUIDE.map(({ key, description }) => {
          const style = EXEC_STATUS_STYLES[key];
          return (
            <div key={key}>
              {key === "not_ready" ? (
                <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.8rem" }}>— {style.label}</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full" style={{ background: style.color + "22", color: style.color, fontSize: "0.8rem", fontWeight: 600 }}>
                  {style.label}
                </span>
              )}
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", marginTop: "4px", lineHeight: 1.4 }}>
                {description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

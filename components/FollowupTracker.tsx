"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import type { Lane, TrackerRow } from "@/lib/followups/tracker";
import type { CohortMonth } from "@/lib/followups/cohort";

// Board column order + labels. Day 10→40 are the cadence stages; live / replied
// / scheduled / disabled are the pulled-out states (see lib/followups/tracker.ts).
const LANES: { id: Lane; label: string; hint: string }[] = [
  { id: "queued", label: "Queued", hint: "No bump sent yet" },
  { id: "day10", label: "Day 10 sent", hint: "First bump out" },
  { id: "day20", label: "Day 20 sent", hint: "" },
  { id: "day30", label: "Day 30 sent", hint: "" },
  { id: "day40", label: "Day 40 · done", hint: "Final bump sent" },
  { id: "live", label: "Live", hint: "Reviews went live" },
  { id: "replied", label: "Replied · action", hint: "Brand replied in Pylon" },
  { id: "scheduled", label: "Scheduled", hint: "Follow-up date set" },
  { id: "disabled", label: "Disabled", hint: "Follow-ups off" },
];

const MONTHS: { id: CohortMonth | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "may", label: "May" },
  { id: "june", label: "June" },
  { id: "july", label: "July" },
];

// Dates are plain calendar days (e.g. "2026-07-01") parsed as UTC midnight —
// format in UTC so a negative-offset local tz doesn't shift them back a day.
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : "";

function daysUntil(iso: string): number {
  return Math.round((Date.parse(iso) - Date.now()) / 86400000);
}

function Chip({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: "0.68rem", padding: "2px 7px", borderRadius: "6px", background: bg, color, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function Card({ row }: { row: TrackerRow }) {
  const dueDays = row.nextDueAt ? daysUntil(row.nextDueAt) : null;
  return (
    <div
      style={{
        background: row.disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderLeft: row.caiReady && !row.caiLive ? "3px solid #eab24c" : "1px solid rgba(255,255,255,0.09)",
        borderRadius: "10px",
        padding: "10px 11px",
        opacity: row.disabled ? 0.7 : 1,
      }}
    >
      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff" }}>{row.name}</div>
      <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.4)", margin: "2px 0 7px" }}>
        #{row.id} · {row.month} · sent {fmtDate(row.reviewsSentDate)}
      </div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
        {!row.reviewsLive && <Chip label="Reviews" bg="rgba(114,164,191,0.18)" color="#9fc7dc" />}
        {row.reviewsLive && <Chip label="Reviews live" bg="rgba(93,202,165,0.16)" color="#7fd4b6" />}
        {row.caiReady && !row.caiLive && <Chip label="CAI" bg="rgba(234,178,76,0.16)" color="#eab24c" />}
        {row.caiReady && row.caiLive && <Chip label="CAI live" bg="rgba(93,202,165,0.16)" color="#7fd4b6" />}
      </div>
      {row.lane === "scheduled" && row.snoozeUntil && (
        <div style={{ fontSize: "0.7rem", color: "#e9a84c", marginTop: "7px" }}>
          Follow up {fmtDate(row.snoozeUntil)}
        </div>
      )}
      {row.lane === "replied" && row.repliedAt && (
        <div style={{ fontSize: "0.7rem", color: "#e0a0a0", marginTop: "7px" }}>
          Replied {fmtDate(row.repliedAt)}
        </div>
      )}
      {(row.lane === "day10" || row.lane === "day20" || row.lane === "day30") && dueDays != null && (
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", marginTop: "7px" }}>
          Next bump {dueDays <= 0 ? "due now" : `in ${dueDays}d`}
        </div>
      )}
    </div>
  );
}

export default function FollowupTracker({ rows, liveDataOk = true }: { rows: TrackerRow[]; liveDataOk?: boolean }) {
  const [month, setMonth] = useState<CohortMonth | "all">("all");

  const visible = month === "all" ? rows : rows.filter((r) => r.month === month);

  const byLane = (lane: Lane) => {
    const list = visible.filter((r) => r.lane === lane);
    // Scheduled lane is ordered by the upcoming follow-up date.
    if (lane === "scheduled") {
      return list.sort((a, b) => (a.snoozeUntil ?? "").localeCompare(b.snoozeUntil ?? ""));
    }
    return list.sort((a, b) => a.reviewsSentDate.localeCompare(b.reviewsSentDate));
  };

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="followups" />
      <div className="flex flex-col flex-1 overflow-hidden">
        <div
          className="px-8 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div>
            <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>
              Follow-up tracker
            </h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
              {visible.length} brands · reviews sent, not live · 10 / 20 / 30 / 40-day bumps
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              {MONTHS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMonth(m.id)}
                  className="text-sm px-3 py-1.5 rounded-lg"
                  style={{
                    background: month === m.id ? "rgba(114,164,191,0.16)" : "transparent",
                    color: month === m.id ? "#9fc7dc" : "rgba(255,255,255,0.45)",
                    border: month === m.id ? "1px solid rgba(114,164,191,0.35)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>
              <span style={{ display: "inline-block", width: "9px", height: "9px", borderRadius: "2px", background: "#eab24c", marginRight: "5px" }} />
              + CAI ready
            </span>
          </div>
        </div>

        {!liveDataOk && (
          <div
            className="mx-8 mt-4 px-4 py-2 rounded-lg"
            style={{ background: "rgba(233,168,76,0.12)", border: "1px solid rgba(233,168,76,0.3)", color: "#e9a84c", fontSize: "0.78rem" }}
          >
            Live brand data is unavailable right now — showing the cohort from its saved list and follow-up state. Live / Disabled / Scheduled columns may be understated until it reconnects.
          </div>
        )}

        <div className="flex-1 overflow-auto px-8 py-6">
          <div style={{ display: "flex", gap: "12px", minWidth: "1280px" }}>
            {LANES.map((lane) => {
              const cards = byLane(lane.id);
              return (
                <div key={lane.id} style={{ flex: 1, minWidth: "148px" }}>
                  <div style={{ padding: "0 4px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{lane.label}</div>
                      {lane.hint && <div style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.28)", marginTop: "1px" }}>{lane.hint}</div>}
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)" }}>{cards.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {cards.map((row) => <Card key={row.id} row={row} />)}
                    {cards.length === 0 && (
                      <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.2)", padding: "6px 4px" }}>—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

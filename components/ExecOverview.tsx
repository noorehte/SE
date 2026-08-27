"use client";

import { useState } from "react";
import { Brand } from "@/lib/metabase";
import { ExecStatus, EXEC_STATUS_STYLES, EXEC_STATUS_DISPLAY_ORDER, getExecStatus, getExecStatusDetail } from "@/lib/liveStatus";
import { buildSignupsByMonth } from "@/lib/execOverview";
import { Sentiment, SENTIMENT_STYLES, SENTIMENT_ORDER, isKnownSentiment } from "@/lib/sentiment";
import { ChevronDown, ChevronUp, Smile, FlaskConical } from "lucide-react";

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

// Leadership-facing content only — no Sidebar, no BrandDetailPanel, no own
// brands/selectedBrand state. Embedded as a tab inside Dashboard.tsx (VIP
// page), which already owns brand state and renders BrandDetailPanel once
// for every view; onSelectBrand just wires into that.
export default function ExecOverview({
  brands,
  onSelectBrand,
}: {
  brands: Brand[];
  onSelectBrand: (brand: Brand) => void;
}) {
  const [expandedBucket, setExpandedBucket] = useState<ExecStatus | null>(null);
  const [expandedSentiment, setExpandedSentiment] = useState<Sentiment | null>(null);
  const [abTestingOpen, setAbTestingOpen] = useState(false);
  const [vipPerMonthOpen, setVipPerMonthOpen] = useState(false);

  const total = brands.length;
  const statusCounts: Record<ExecStatus, number> = { partial: 0, live_1: 0, live_2: 0, needs_attention: 0, not_live: 0, not_ready: 0 };
  const statusBrands: Record<ExecStatus, Brand[]> = { partial: [], live_1: [], live_2: [], needs_attention: [], not_live: [], not_ready: [] };
  for (const b of brands) {
    const status = getExecStatus(b);
    statusCounts[status]++;
    statusBrands[status].push(b);
  }
  const onTrackCount = statusCounts.partial + statusCounts.live_1 + statusCounts.live_2;
  // Not Ready brands haven't started yet — excluding them from the denominator
  // means the headline reflects "of brands that have actually begun," not
  // penalized by brands still in early onboarding.
  const eligibleTotal = total - statusCounts.not_ready;
  const onTrackPct = eligibleTotal ? Math.round((onTrackCount / eligibleTotal) * 100) : 0;
  const needsAttentionPct = eligibleTotal ? Math.round((statusCounts.needs_attention / eligibleTotal) * 100) : 0;
  const notLivePct = eligibleTotal ? Math.round((statusCounts.not_live / eligibleTotal) * 100) : 0;

  const signupsByMonth = buildSignupsByMonth(brands, 10);
  const maxSignups = Math.max(1, ...signupsByMonth.map((m) => m.count));

  const sentimentCounts: Record<Sentiment, number> = { advocate: 0, positive: 0, neutral: 0, frustrated: 0, high_risk_detractor: 0 };
  const sentimentBrands: Record<Sentiment, Brand[]> = { advocate: [], positive: [], neutral: [], frustrated: [], high_risk_detractor: [] };
  for (const b of brands) {
    if (isKnownSentiment(b.PYLON_SENTIMENT)) {
      sentimentCounts[b.PYLON_SENTIMENT]++;
      sentimentBrands[b.PYLON_SENTIMENT].push(b);
    }
  }
  const sentimentTotal = SENTIMENT_ORDER.reduce((sum, key) => sum + sentimentCounts[key], 0);

  const abTestingBrands = brands.filter((b) => b.AB_TESTING).sort((a, b) => a.BRAND_NAME.localeCompare(b.BRAND_NAME));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-10" style={{ maxWidth: "1180px" }}>
        {/* Top row: the 3 headline percentages */}
        <div className="flex gap-12">
          <div className="flex flex-col gap-1">
            <div style={{ fontSize: "4rem", fontWeight: 800, lineHeight: 1, color: "#fff" }}>{onTrackPct}%</div>
            <div style={SECTION_LABEL_STYLE}>On Track</div>
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
              {onTrackCount} of {eligibleTotal}
              {statusCounts.not_ready > 0 && ` — ${statusCounts.not_ready} not yet ready to start excluded`}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div style={{ fontSize: "4rem", fontWeight: 800, lineHeight: 1, color: "#e05c5c" }}>{needsAttentionPct}%</div>
            <div style={SECTION_LABEL_STYLE}>Needs Attention</div>
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{statusCounts.needs_attention} of {eligibleTotal}</div>
          </div>
          <div className="flex flex-col gap-1">
            <div style={{ fontSize: "4rem", fontWeight: 800, lineHeight: 1, color: "#5a6b78" }}>{notLivePct}%</div>
            <div style={SECTION_LABEL_STYLE}>Not Live</div>
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{statusCounts.not_live} of {eligibleTotal}</div>
          </div>
        </div>

        {/* Second row: Live Status, full width */}
        <div className="flex flex-col gap-4">
          <div style={SECTION_LABEL_STYLE}>Live Status</div>

          <div className="flex gap-1" style={{ height: "16px" }}>
            {EXEC_STATUS_DISPLAY_ORDER.map((key) => {
              const count = statusCounts[key];
              if (count === 0) return null;
              const style = EXEC_STATUS_STYLES[key];
              return (
                <div key={key} title={`${style.label}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: style.color, borderRadius: "3px" }} />
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {EXEC_STATUS_DISPLAY_ORDER.map((key) => {
              const count = statusCounts[key];
              if (count === 0) return null;
              const style = EXEC_STATUS_STYLES[key];
              const isExpanded = expandedBucket === key;
              return (
                <button
                  key={key}
                  onClick={() => setExpandedBucket((prev) => (prev === key ? null : key))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: isExpanded ? style.color + "25" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${isExpanded ? style.color + "55" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: style.color }} />
                  <span style={{ fontSize: "0.8rem", color: style.color, fontWeight: 600 }}>{style.label}</span>
                  <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>{count}</span>
                  {isExpanded ? <ChevronUp size={13} style={{ color: "rgba(255,255,255,0.4)" }} /> : <ChevronDown size={13} style={{ color: "rgba(255,255,255,0.4)" }} />}
                </button>
              );
            })}
          </div>
        </div>

        {expandedBucket && (
          <div className="rounded-xl p-3 flex flex-col gap-1 -mt-6" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {statusBrands[expandedBucket].length === 0 ? (
              <div className="text-center py-4" style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.8rem" }}>None</div>
            ) : (
              [...statusBrands[expandedBucket]].sort((a, b) => a.BRAND_NAME.localeCompare(b.BRAND_NAME)).map((b) => (
                <button
                  key={b.BRAND_ID}
                  onClick={() => onSelectBrand(b)}
                  className="flex items-center justify-between text-left px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: "rgba(255,255,255,0.04)", border: "none" }}
                >
                  <span style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>{b.BRAND_NAME}</span>
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>{getExecStatusDetail(b)}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Sentiment — Pylon Account sentiment, independent of Live Status, filterable like Live Status above */}
        {sentimentTotal > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Smile size={15} style={{ color: "rgba(255,255,255,0.4)" }} />
              <div style={SECTION_LABEL_STYLE}>Sentiment</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {SENTIMENT_ORDER.map((key) => {
                const count = sentimentCounts[key];
                if (count === 0) return null;
                const style = SENTIMENT_STYLES[key];
                const isExpanded = expandedSentiment === key;
                return (
                  <button
                    key={key}
                    onClick={() => setExpandedSentiment((prev) => (prev === key ? null : key))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
                    style={{
                      background: isExpanded ? style.color + "25" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${isExpanded ? style.color + "55" : "rgba(255,255,255,0.1)"}`,
                    }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: style.color }} />
                    <span style={{ fontSize: "0.8rem", color: style.color, fontWeight: 600 }}>{style.label}</span>
                    <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>{count}</span>
                    {isExpanded ? <ChevronUp size={13} style={{ color: "rgba(255,255,255,0.4)" }} /> : <ChevronDown size={13} style={{ color: "rgba(255,255,255,0.4)" }} />}
                  </button>
                );
              })}
            </div>

            {expandedSentiment && (
              <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {[...sentimentBrands[expandedSentiment]].sort((a, b) => a.BRAND_NAME.localeCompare(b.BRAND_NAME)).map((b) => (
                  <button
                    key={b.BRAND_ID}
                    onClick={() => onSelectBrand(b)}
                    className="flex items-center justify-between text-left px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                    style={{ background: "rgba(255,255,255,0.04)", border: "none" }}
                  >
                    <span style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>{b.BRAND_NAME}</span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>{EXEC_STATUS_STYLES[getExecStatus(b)].label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* A/B Testing — brands with the AB_TESTING flag on, pulled out of the normal pipeline view */}
        {abTestingBrands.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <FlaskConical size={15} style={{ color: "rgba(255,255,255,0.4)" }} />
              <div style={SECTION_LABEL_STYLE}>A/B Testing</div>
            </div>

            <div>
              <button
                onClick={() => setAbTestingOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: abTestingOpen ? "#e879a825" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${abTestingOpen ? "#e879a855" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#e879a8" }} />
                <span style={{ fontSize: "0.8rem", color: "#e879a8", fontWeight: 600 }}>A/B Testing</span>
                <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>{abTestingBrands.length}</span>
                {abTestingOpen ? <ChevronUp size={13} style={{ color: "rgba(255,255,255,0.4)" }} /> : <ChevronDown size={13} style={{ color: "rgba(255,255,255,0.4)" }} />}
              </button>
            </div>

            {abTestingOpen && (
              <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {abTestingBrands.map((b) => (
                  <button
                    key={b.BRAND_ID}
                    onClick={() => onSelectBrand(b)}
                    className="flex items-center justify-between text-left px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                    style={{ background: "rgba(255,255,255,0.04)", border: "none" }}
                  >
                    <span style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>{b.BRAND_NAME}</span>
                    <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>
                      {b.AB_TESTING_NOTES ? (b.AB_TESTING_NOTES.length > 60 ? `${b.AB_TESTING_NOTES.slice(0, 60)}…` : b.AB_TESTING_NOTES) : "No notes"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* VIP Brands per Month — toggle, expands to the full page width (not capped at 1180px like the sections above) */}
      {signupsByMonth.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div style={SECTION_LABEL_STYLE}>VIP Brands per Month</div>
          </div>

          <div>
            <button
              onClick={() => setVipPerMonthOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
              style={{
                background: vipPerMonthOpen ? "#72a4bf25" : "rgba(255,255,255,0.05)",
                border: `1px solid ${vipPerMonthOpen ? "#72a4bf55" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#72a4bf" }} />
              <span style={{ fontSize: "0.8rem", color: "#72a4bf", fontWeight: 600 }}>VIP Brands per Month</span>
              {vipPerMonthOpen ? <ChevronUp size={13} style={{ color: "rgba(255,255,255,0.4)" }} /> : <ChevronDown size={13} style={{ color: "rgba(255,255,255,0.4)" }} />}
            </button>
          </div>

          {vipPerMonthOpen && (
            <div className="flex items-end gap-6" style={{ height: "160px" }}>
              {signupsByMonth.map((m) => (
                <div key={m.month} className="flex flex-col items-center gap-2 h-full justify-end flex-1" title={`${m.label}: ${m.count}`}>
                  <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>{m.count}</span>
                  <div style={{ width: "100%", maxWidth: "64px", height: `${Math.max(4, (m.count / maxSignups) * 120)}px`, background: "#72a4bf", borderRadius: "4px 4px 0 0" }} />
                  <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

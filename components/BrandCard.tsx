"use client";

import { useState } from "react";
import { Brand, PipelineStatus, WIDGET_TYPE_LABELS, isBrandStuck } from "@/lib/metabase";
import { ExternalLink, CalendarCheck } from "lucide-react";
import { ScheduledCall } from "./Dashboard";

const SHARE_COUNTS_COLLAPSED_LIMIT = 3;

const BLOCKING_ITEMS: Record<PipelineStatus, string | null> = {
  not_started: "Add products",
  pending_review: "Awaiting board review",
  products_approved_needs_call: "Book onboarding call",
  code_snippets_available: "Awaiting implementation",
  collaborator_code_brand: "SE implementing",
  live: null,
  was_live: "Re-activation needed",
  churned: null,
};

export const SEGMENT_STYLES: Record<string, { label: string; color: string }> = {
  vip:         { label: "VIP",         color: "#a78bfa" },
  strategic:   { label: "Strategic",   color: "#34d399" },
  enterprise:  { label: "Enterprise",  color: "#60a5fa" },
  mid_market:  { label: "Mid-Market",  color: "#fbbf24" },
};

const OWNER_INITIALS: Record<string, string> = {
  maha: "MH", noor: "NR", naumaan: "NM",
  mohammad: "MO", kean: "KN", jean: "JN", zeke: "ZK",
};

function initials(name: string | null) {
  if (!name) return "—";
  const known = OWNER_INITIALS[name.toLowerCase()];
  if (known) return known;
  // Falls through here for a real full name (e.g. "Noor Ehtesham") — happens
  // when SE/AM/Ops comes from HubSpot's own data as a fallback rather than
  // one of our internal shortnames above. Use first-letter-of-first-name +
  // first-letter-of-last-name instead of just slicing the raw string.
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function BrandCard({ brand, accent, scheduledCall, onToggleSeSprint }: { brand: Brand; accent: string; scheduledCall: ScheduledCall | null; onToggleSeSprint?: (brandId: number, next: boolean) => void }) {
  const [shareCountsExpanded, setShareCountsExpanded] = useState(false);
  const isStuck = isBrandStuck(brand);
  const blockingItem = BLOCKING_ITEMS[brand.PIPELINE_STATUS];
  const sortedShareCounts = [...brand.PRODUCT_SHARE_COUNTS].sort((a, b) => b.count - a.count);
  const hiddenShareCount = sortedShareCounts.length - SHARE_COUNTS_COLLAPSED_LIMIT;
  const visibleShareCounts = shareCountsExpanded ? sortedShareCounts : sortedShareCounts.slice(0, SHARE_COUNTS_COLLAPSED_LIMIT);
  const hubspotUrl = brand.HUBSPOT_COMPANY_ID
    ? `https://app-na2.hubspot.com/contacts/46815331/record/0-2/${brand.HUBSPOT_COMPANY_ID}`
    : null;
  const adminUrl = `https://app.thefrontrowhealth.com/admin/health_brands/${brand.BRAND_ID}`;

  return (
    <div className="rounded-xl p-4 transition-all hover:scale-[1.01]" style={{
      background: "rgba(255,255,255,0.06)",
      border: `1px solid ${isStuck ? "#e05c5c55" : "rgba(255,255,255,0.1)"}`,
      borderLeft: `3px solid ${isStuck ? "#e05c5c" : accent}`,
    }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <span style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
            {brand.BRAND_NAME}
          </span>
          {brand.KIND && SEGMENT_STYLES[brand.KIND.toLowerCase()] && (
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium" style={{
              background: SEGMENT_STYLES[brand.KIND.toLowerCase()].color + "22",
              color: SEGMENT_STYLES[brand.KIND.toLowerCase()].color,
              fontSize: "0.7rem",
              display: "block",
              width: "fit-content",
            }}>
              {SEGMENT_STYLES[brand.KIND.toLowerCase()].label}
            </span>
          )}
        </div>
        <div className="flex gap-2 shrink-0 mt-0.5">
          {hubspotUrl && (
            <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" title="HubSpot" style={{ color: "#f97316", opacity: 0.7 }} className="hover:opacity-100">
              <ExternalLink size={13} />
            </a>
          )}
          <a href={adminUrl} target="_blank" rel="noopener noreferrer" title="Admin" style={{ color: "rgba(255,255,255,0.35)" }} className="hover:opacity-100">
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {[brand.SE_OWNER, brand.ACCOUNT_MANAGER, brand.OPS_OWNER].map((name, i) => (
            <span key={i} title={name ?? "unassigned"}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: "#1e3a4f", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
              {initials(name)}
            </span>
          ))}
        </div>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: isStuck ? "#e05c5c" : "rgba(255,255,255,0.35)" }}>
          {brand.DAYS_IN_STATUS}d
        </span>
      </div>

      {sortedShareCounts.length > 0 && (
        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
          {visibleShareCounts.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ flexShrink: 0 }}>{p.count.toLocaleString()} shares</span>
            </div>
          ))}
          {hiddenShareCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShareCountsExpanded((v) => !v); }}
              style={{ color: "rgba(114,164,191,0.8)", marginTop: "2px", cursor: "pointer" }}
            >
              {shareCountsExpanded ? "Show less" : `+${hiddenShareCount} more`}
            </button>
          )}
        </div>
      )}

      {/* Widget type chips */}
      {brand.WIDGET_TYPES.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {brand.WIDGET_TYPES.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: "rgba(114,164,191,0.12)", color: "rgba(114,164,191,0.8)", fontSize: "0.68rem" }}>
              {WIDGET_TYPE_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}

      {/* CAI / CAS ready badge */}
      {brand.CAI_IMPLEMENTATION_READY && (
        <div className="mt-1.5">
          <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
            style={{
              background: brand.CAI_IMPLEMENTATION_READY === "CAI" ? "rgba(76,175,130,0.15)" : "rgba(139,127,232,0.15)",
              color: brand.CAI_IMPLEMENTATION_READY === "CAI" ? "#4caf82" : "#8b7fe8",
              fontSize: "0.68rem",
            }}>
            ✓ {brand.CAI_IMPLEMENTATION_READY} Ready
          </span>
        </div>
      )}

      {/* SE Sprint queue badge/toggle — brands land here either via the
          "Request for Assisted Implementation" form or by being added by
          hand. Once on, it's shown as a plain badge (not a button) since
          clicking it off here would only clear a manual add, never a real
          form submission, which would be a confusing thing to expose as a
          toggle right on the card. */}
      {brand.ON_SE_SPRINT_SHEET ? (
        <div className="mt-1.5">
          <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: "rgba(233,168,76,0.15)", color: "#e9a84c", fontSize: "0.68rem" }}>
            🚀 SE Sprint
          </span>
        </div>
      ) : onToggleSeSprint ? (
        <div className="mt-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSeSprint(brand.BRAND_ID, true); }}
            title="Add to SE Sprint queue"
            className="px-1.5 py-0.5 rounded text-xs font-semibold hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontSize: "0.68rem" }}>
            + SE Sprint
          </button>
        </div>
      ) : null}

      {scheduledCall && (
        <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: "0.75rem", color: "#4caf82" }}>
          <CalendarCheck size={11} />
          {scheduledCall.action === "webinar_sheet"
            ? "On webinar list"
            : scheduledCall.callDate
              ? `Call ${new Date(scheduledCall.callDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : "Call scheduled"}
        </div>
      )}
      {!scheduledCall && !brand.WIDGET_TYPES.length && !brand.CAI_IMPLEMENTATION_READY && blockingItem && (
        <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
          {blockingItem}
        </div>
      )}
    </div>
  );
}

"use client";

import { Brand, PipelineStatus, WIDGET_TYPE_LABELS } from "@/lib/metabase";
import { ExternalLink, CalendarCheck } from "lucide-react";
import { ScheduledCall } from "./Dashboard";

const BLOCKING_ITEMS: Record<PipelineStatus, string | null> = {
  just_signed: "Awaiting MAB product review",
  pending_mab_review: "Products pending board review",
  products_rejected: "Products rejected by board",
  code_snippets_available: "Awaiting go-live",
  live: null,
  was_live: "Re-activation needed",
};

const SEGMENT_STYLES: Record<string, { label: string; color: string }> = {
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
  return OWNER_INITIALS[name.toLowerCase()] ?? name.slice(0, 2).toUpperCase();
}

export default function BrandCard({ brand, accent, scheduledCall }: { brand: Brand; accent: string; scheduledCall: ScheduledCall | null }) {
  const isStuck = brand.DAYS_IN_STATUS > 7;
  const blockingItem = BLOCKING_ITEMS[brand.PIPELINE_STATUS];
  const hubspotUrl = brand.HUBSPOT_COMPANY_ID
    ? `https://app.hubspot.com/contacts/21791298/company/${brand.HUBSPOT_COMPANY_ID}`
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

      {scheduledCall && (
        <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: "0.75rem", color: "#4caf82" }}>
          <CalendarCheck size={11} />
          Call {new Date(scheduledCall.callDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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

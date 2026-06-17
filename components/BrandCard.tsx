"use client";

import { Brand, PipelineStatus } from "@/lib/metabase";
import { ExternalLink } from "lucide-react";

const BLOCKING_ITEMS: Record<PipelineStatus, string | null> = {
  waiting_on_brand_setup: "Complete onboarding tasks",
  onboarding_tasks_complete: "Awaiting code snippet threshold",
  code_snippets_available: "Awaiting go-live",
  live: null,
  was_live: "Re-activation needed",
};

const OWNER_INITIALS: Record<string, string> = {
  maha: "MH", noor: "NR", naumaan: "NM",
  mohammad: "MO", kean: "KN", jean: "JN", zeke: "ZK",
};

function initials(name: string | null) {
  if (!name) return "—";
  return OWNER_INITIALS[name.toLowerCase()] ?? name.slice(0, 2).toUpperCase();
}

export default function BrandCard({ brand, accent }: { brand: Brand; accent: string }) {
  const isStuck = brand.DAYS_IN_STATUS > 7;
  const blockingItem = BLOCKING_ITEMS[brand.PIPELINE_STATUS];
  const hubspotUrl = brand.HUBSPOT_COMPANY_ID
    ? `https://app.hubspot.com/contacts/21791298/company/${brand.HUBSPOT_COMPANY_ID}`
    : null;
  const adminUrl = `https://frontrowmd.com/admin/health_brands/${brand.BRAND_ID}`;

  return (
    <div className="rounded-xl p-4" style={{
      background: "rgba(255,255,255,0.06)",
      border: `1px solid ${isStuck ? "#e05c5c55" : "rgba(255,255,255,0.1)"}`,
      borderLeft: `3px solid ${isStuck ? "#e05c5c" : accent}`,
    }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
          {brand.BRAND_NAME}
        </span>
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

      {blockingItem && (
        <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
          {blockingItem}
        </div>
      )}
    </div>
  );
}

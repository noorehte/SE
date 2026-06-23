"use client";

import { useState } from "react";
import { Brand } from "@/lib/metabase";
import { COLUMNS } from "./Dashboard";
import { X, ExternalLink, CalendarPlus } from "lucide-react";

const OWNER_INITIALS: Record<string, string> = {
  maha: "MH", noor: "NR", naumaan: "NM",
  mohammad: "MO", kean: "KN", jean: "JN", zeke: "ZK",
};

function initials(name: string | null) {
  if (!name) return "—";
  return OWNER_INITIALS[name.toLowerCase()] ?? name.slice(0, 2).toUpperCase();
}

function Avatar({ name, title }: { name: string | null; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: "#1e3a4f", color: "#72a4bf", border: "1px solid rgba(114,164,191,0.3)" }}>
        {initials(name)}
      </span>
      <div>
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
        <div style={{ fontSize: "0.875rem", color: "#fff" }}>{name ?? "Unassigned"}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "0.875rem", color: "#fff", textAlign: "right" }}>{value}</span>
    </div>
  );
}

type ScheduleState = "idle" | "loading" | "success" | "error";

export default function BrandDetailPanel({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const [scheduleState, setScheduleState] = useState<ScheduleState>("idle");
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  async function handleScheduleCall() {
    setScheduleState("loading");
    setScheduleError(null);
    try {
      const res = await fetch("/api/schedule-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.BRAND_ID }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.success) {
        setScheduleState("success");
      } else {
        setScheduleState("error");
        setScheduleError(result?.error ?? "Unknown error");
      }
    } catch (err) {
      setScheduleState("error");
      setScheduleError(String(err));
    }
  }

  const col = COLUMNS.find((c) => c.id === brand.PIPELINE_STATUS);
  const hubspotUrl = brand.HUBSPOT_COMPANY_ID
    ? `https://app.hubspot.com/contacts/21791298/company/${brand.HUBSPOT_COMPANY_ID}`
    : null;
  const adminUrl = `https://frontrowmd.com/admin/health_brands/${brand.BRAND_ID}`;
  const isStuck = brand.DAYS_IN_STATUS > 7;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 overflow-y-auto flex flex-col"
        style={{ width: "420px", background: "#0d1e2d", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-start justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <h2 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>
              {brand.BRAND_NAME}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: (col?.accent ?? "#333") + "22", color: col?.accent ?? "#fff" }}>
                {col?.label ?? brand.PIPELINE_STATUS}
              </span>
              {isStuck && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "#e05c5c22", color: "#e05c5c" }}>
                  Stuck {brand.DAYS_IN_STATUS}d
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "rgba(255,255,255,0.4)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 flex-1">
          {/* Team */}
          <div className="mb-6">
            <div className="mb-3" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Team</div>
            <div className="flex flex-col gap-3">
              <Avatar name={brand.SE_OWNER} title="SE Owner" />
              <Avatar name={brand.ACCOUNT_MANAGER} title="Account Manager" />
              <Avatar name={brand.OPS_OWNER} title="Ops Owner" />
              {brand.BD_REP && <Avatar name={brand.BD_REP} title="BD Rep" />}
            </div>
          </div>

          {/* Pipeline */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Pipeline</div>
            <Row label="Days in status" value={<span style={{ color: isStuck ? "#e05c5c" : "#fff" }}>{brand.DAYS_IN_STATUS}d</span>} />
            <Row label="Created" value={new Date(brand.BRAND_CREATED_AT).toLocaleDateString()} />
            <Row label="Last sign-in" value={brand.ANY_ADMIN_LAST_SIGNED_IN_AT ? new Date(brand.ANY_ADMIN_LAST_SIGNED_IN_AT).toLocaleDateString() : "Never"} />
          </div>

          {/* Products */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Products</div>
            <Row label="Total products" value={brand.PRODUCTS_COUNT} />
            <Row label="Reviews requested" value={brand.REVIEWS_REQUESTED} />
            <Row label="Reviews ready" value={brand.HAS_REVIEWS_READY ? "Yes" : "No"} />
            <Row label="Pending board review" value={brand.HAS_PENDING_BOARD_REVIEW ? "Yes" : "No"} />
            <Row label="Rejected by board" value={brand.HAS_REJECTED_BY_BOARD ? "Yes" : "No"} />
          </div>

          {/* Clinician Analysis */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Clinician Analysis</div>
            <Row label="CA requested" value={brand.CA_REQUESTED} />
            <Row label="CA ready" value={brand.HAS_CA_READY ? "Yes" : "No"} />
          </div>

          {/* Implementation */}
          <div className="mb-6">
            <div className="mb-2" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Implementation</div>
            <Row label="Share threshold met" value={brand.SUBMITTED_TO_MAB ? "Yes" : "No"} />
            <Row label="Collaborator code" value={brand.COLLABORATOR_CODE ?? "Not set"} />
          </div>

          {/* Links */}
          <div>
            <div className="mb-3" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Links</div>
            <div className="flex flex-col gap-2">
              <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                style={{ background: "rgba(114,164,191,0.1)", color: "#72a4bf", fontSize: "0.875rem" }}>
                <ExternalLink size={14} /> Admin Portal
              </a>
              {hubspotUrl && (
                <a href={hubspotUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: "rgba(249,115,22,0.1)", color: "#f97316", fontSize: "0.875rem" }}>
                  <ExternalLink size={14} /> HubSpot
                </a>
              )}
              {(brand.PIPELINE_STATUS === "just_signed" || brand.PIPELINE_STATUS === "pending_mab_review") && (
                <button
                  onClick={handleScheduleCall}
                  disabled={scheduleState === "loading" || scheduleState === "success"}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity text-left"
                  style={{
                    background: scheduleState === "success" ? "rgba(34,197,94,0.1)" : "rgba(114,164,191,0.1)",
                    color: scheduleState === "success" ? "#22c55e" : scheduleState === "error" ? "#e05c5c" : "#72a4bf",
                    fontSize: "0.875rem",
                    opacity: scheduleState === "loading" ? 0.6 : 1,
                    cursor: scheduleState === "success" ? "default" : "pointer",
                    width: "100%",
                    border: "none",
                  }}>
                  <CalendarPlus size={14} />
                  {scheduleState === "idle" && "Schedule Brand Call"}
                  {scheduleState === "loading" && "Scheduling…"}
                  {scheduleState === "success" && "Call scheduled ✓"}
                  {scheduleState === "error" && `Failed: ${scheduleError}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

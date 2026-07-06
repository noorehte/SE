"use client";

import { useEffect, useState } from "react";

const SE_LABELS: Record<string, string> = {
  mohammad: "Mohammad",
  noor: "Noor",
  naumaan: "Naumaan",
  maha: "Maha",
};

// Small status pill showing which SEs have connected their Google account for
// call scheduling (Calendar + Gmail draft creation). Anyone not connected yet
// gets a one-click link into the OAuth flow (/api/auth/google/login).
export default function GoogleConnectStatus() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/google/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  const disconnected = Object.entries(status).filter(([, connected]) => !connected);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm px-3 py-2 rounded-lg flex items-center gap-1.5"
        style={{
          background: disconnected.length > 0 ? "rgba(224,92,92,0.1)" : "rgba(76,175,130,0.1)",
          color: disconnected.length > 0 ? "#e05c5c" : "#4caf82",
          border: `1px solid ${disconnected.length > 0 ? "rgba(224,92,92,0.3)" : "rgba(76,175,130,0.3)"}`,
        }}
      >
        {disconnected.length > 0 ? `${disconnected.length} SE${disconnected.length > 1 ? "s" : ""} not connected` : "All SEs connected"}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 z-20 rounded-lg p-3 flex flex-col gap-2"
          style={{ background: "#0d1e2d", border: "1px solid rgba(255,255,255,0.12)", minWidth: "220px" }}
        >
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Google account (Calendar + Gmail)
          </div>
          {Object.entries(status).map(([se, connected]) => (
            <div key={se} className="flex items-center justify-between gap-3">
              <span style={{ fontSize: "0.85rem", color: "#fff" }}>{SE_LABELS[se] ?? se}</span>
              {connected ? (
                <span style={{ fontSize: "0.8rem", color: "#4caf82" }}>Connected ✓</span>
              ) : (
                <a href="/api/auth/google/login" style={{ fontSize: "0.8rem", color: "#72a4bf" }}>
                  Connect
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

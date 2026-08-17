"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, AlertCircle, BarChart2, Send } from "lucide-react";

const NAV = [
  { label: "Pipeline",    href: "/",        icon: <LayoutGrid size={15} />, key: "pipeline" },
  { label: "Table view",  href: "/brands",  icon: <Users size={15} />,      key: "brands" },
  { label: "Follow-ups",  href: "/followups", icon: <Send size={15} />,     key: "followups" },
  { label: "Alerts",      href: "/alerts",  icon: <AlertCircle size={15} />, key: "alerts" },
  { label: "Analytics",   href: "/analytics", icon: <BarChart2 size={15} />, key: "analytics" },
];

export default function Sidebar({ active, alertCount }: { active?: string; alertCount?: number }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (active) return active === NAV.find(n => n.href === href)?.key;
    return pathname === href;
  }

  return (
    <div className="flex flex-col w-52 flex-shrink-0" style={{ background: "#0a1520", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <Link href="/">
          <div style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>frontrowMD</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>SE dashboard</div>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
        {NAV.map((item) => (
          <Link key={item.key} href={item.href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors"
            style={{
              background: isActive(item.href) ? "rgba(255,255,255,0.1)" : "transparent",
              color: isActive(item.href) ? "#fff" : "rgba(255,255,255,0.45)",
              fontSize: "0.875rem",
              textDecoration: "none",
            }}>
            {item.icon}
            {item.label}
            {item.key === "alerts" && alertCount ? (
              <span className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#e05c5c", color: "#fff", fontSize: "0.7rem", fontWeight: 700 }}>{alertCount}</span>
            ) : null}
          </Link>
        ))}

        <div className="mt-4 px-3" style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Coming soon</div>
        {["Settings", "Help center"].map((label) => (
          <div key={label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.875rem" }}>
            <span className="w-3.5 h-3.5 rounded border flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.15)" }} />
            {label}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#72a4bf", color: "#0d1b26" }}>NE</div>
        <div>
          <div style={{ fontSize: "0.8rem", color: "#fff", fontWeight: 500 }}>Noor E.</div>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>Solutions Eng.</div>
        </div>
      </div>
    </div>
  );
}

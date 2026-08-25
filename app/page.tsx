import { getBrands } from "@/lib/metabase";
import { getAllScheduled } from "@/lib/scheduled-calls";
import { getCaiReadyBrands, buildCaiLookup } from "@/lib/cai-sheet";
import { getReachouts, buildReachoutLookup } from "@/lib/reachouts-sheet";
import { getSeSprintEntries, buildSeSprintLookup } from "@/lib/se-sprint-sheet";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const [brands, scheduledCalls, caiEntries, reachoutEntries, seSprintEntries] = await Promise.all([
      getBrands(),
      getAllScheduled().catch((e) => { console.error("getAllScheduled failed:", e); return {} as Record<string, never>; }),
      getCaiReadyBrands(),
      getReachouts(),
      getSeSprintEntries(),
    ]);

    const caiLookup = buildCaiLookup(caiEntries);
    const reachoutLookup = buildReachoutLookup(reachoutEntries);
    const seSprintLookup = buildSeSprintLookup(seSprintEntries);
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    const enrichedBrands = brands.map((b) => {
      const reachout = reachoutLookup.get(normalize(b.BRAND_NAME));
      const seSprint = seSprintLookup.get(normalize(b.BRAND_NAME));
      return {
        ...b,
        CAI_IMPLEMENTATION_READY: caiLookup.get(normalize(b.BRAND_NAME)) ?? null,
        ON_REACHOUT_SHEET: reachout != null,
        REACHED_OUT: reachout?.emailed ?? null,
        REACHED_OUT_SEND_LABEL: reachout?.sendLabel ?? null,
        ON_SE_SPRINT_SHEET: !b.SE_SPRINT_DISMISSED && (b.ON_SE_SPRINT_SHEET || seSprint != null),
        SE_SPRINT_SUBMITTED_AT: seSprint?.timestamp ?? null,
        SE_SPRINT_MYSHOPIFY_URL: seSprint?.myshopifyUrl ?? null,
        SE_SPRINT_HAS_SHARED_CODE: seSprint?.hasSharedCode ?? null,
        SE_SPRINT_COLLABORATOR_CODE: seSprint?.collaboratorCode ?? null,
      };
    });

    return <Dashboard initialBrands={enrichedBrands} initialScheduledCalls={scheduledCalls} />;
  } catch (e) {
    console.error("Home page error:", e);
    const envCheck = {
      METABASE_URL: process.env.METABASE_URL ? `${process.env.METABASE_URL.slice(0, 15)}...` : "MISSING",
      METABASE_API_KEY: process.env.METABASE_API_KEY ? "SET" : "MISSING",
      NOTION_TOKEN: process.env.NOTION_TOKEN ? "SET" : "MISSING",
      GRAFANA_URL: process.env.GRAFANA_URL ? `${process.env.GRAFANA_URL.slice(0, 15)}...` : "MISSING",
      GRAFANA_API_KEY: process.env.GRAFANA_API_KEY ? "SET" : "MISSING",
      GRAFANA_WIDGETS_DATASOURCE_UID: process.env.GRAFANA_WIDGETS_DATASOURCE_UID ? "SET" : "MISSING",
      HUBSPOT_API_KEY: process.env.HUBSPOT_API_KEY ? "SET" : "MISSING",
    };
    return (
      <div style={{ background: "#0d1b26", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#e05c5c", fontFamily: "monospace", fontSize: "0.9rem", maxWidth: "600px", padding: "2rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "1rem" }}>Server error — details below:</div>
          <pre style={{ color: "rgba(255,255,255,0.6)", whiteSpace: "pre-wrap" }}>{String(e)}</pre>
          <div style={{ marginTop: "1.5rem", color: "#e9a84c", fontWeight: 700 }}>Env vars at runtime:</div>
          <pre style={{ color: "rgba(255,255,255,0.5)", marginTop: "0.5rem" }}>{JSON.stringify(envCheck, null, 2)}</pre>
          {e instanceof Error && e.stack && (
            <pre style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.75rem", marginTop: "1rem", whiteSpace: "pre-wrap" }}>{e.stack}</pre>
          )}
        </div>
      </div>
    );
  }
}

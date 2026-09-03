"use client";

import { useState } from "react";
import { Brand } from "@/lib/metabase";
import { SEGMENT_STYLES, SENTIMENT_STYLES, NO_SEGMENT } from "./BrandCard";
import MultiSelectDropdown from "./MultiSelectDropdown";
import ExecOverview from "./ExecOverview";
import BrandDetailPanel from "./BrandDetailPanel";
import Sidebar from "./Sidebar";

const SEGMENTS = Object.keys(SEGMENT_STYLES);
const SENTIMENTS = Object.keys(SENTIMENT_STYLES);

export default function AnalyticsView({ initialBrands }: { initialBrands: Brand[] }) {
  const [brands] = useState(initialBrands);
  const [segmentFilter, setSegmentFilter] = useState<string[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  const segmentMatched = segmentFilter.length === 0
    ? brands
    : brands.filter((b) => segmentFilter.includes(b.KIND?.toLowerCase() || NO_SEGMENT));

  const filtered = sentimentFilter.length === 0
    ? segmentMatched
    : segmentMatched.filter((b) => sentimentFilter.includes(b.PYLON_SENTIMENT ?? ""));

  return (
    <div className="flex min-h-screen" style={{ background: "#0d1b26", color: "#fff" }}>
      <Sidebar active="analytics" />
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-8 py-5 flex-shrink-0 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h1 style={{ fontFamily: "Librebaskerville, Arial, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>Analytics</h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
              Live status levels across all segments — {filtered.length} of {brands.length} shown
            </p>
          </div>
          <div className="flex items-center gap-3">
            <MultiSelectDropdown
              label="Segments"
              options={[...SEGMENTS.map((s) => ({ value: s, label: SEGMENT_STYLES[s].label })), { value: NO_SEGMENT, label: "No Segment" }]}
              selected={segmentFilter}
              onChange={setSegmentFilter}
            />
            <MultiSelectDropdown
              label="Sentiment"
              options={SENTIMENTS.map((s) => ({ value: s, label: SENTIMENT_STYLES[s].label }))}
              selected={sentimentFilter}
              onChange={setSentimentFilter}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-8 flex flex-col gap-10">
          <ExecOverview brands={filtered} onSelectBrand={setSelectedBrand} detailedLevels showAbTesting={false} />
        </div>
      </div>

      {selectedBrand && (
        <BrandDetailPanel
          brand={selectedBrand}
          scheduledCall={null}
          onClose={() => setSelectedBrand(null)}
          onBrandUpdate={() => {}}
        />
      )}
    </div>
  );
}

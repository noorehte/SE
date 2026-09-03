"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

// Checkbox-list dropdown used for filters like Segments/Sentiment — empty
// `selected` means "all" (the callers' convention), so there's no separate
// "All X" option inside the list itself.
export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const buttonLabel = selected.length === 0
    ? `All ${label}`
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? label
      : `${selected.length} ${label}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5"
        style={{
          background: selected.length ? "rgba(114,164,191,0.15)" : "rgba(255,255,255,0.07)",
          color: selected.length ? "#72a4bf" : "#fff",
          border: `1px solid ${selected.length ? "rgba(114,164,191,0.4)" : "rgba(255,255,255,0.12)"}`,
          fontSize: "0.875rem",
        }}
      >
        {buttonLabel} <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 rounded-lg py-1.5 flex flex-col"
          style={{ background: "#16232e", border: "1px solid rgba(255,255,255,0.12)", minWidth: "180px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
        >
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer"
                style={{ color: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            );
          })}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="text-left px-3 py-1.5 text-sm"
              style={{ color: "#72a4bf", borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "4px" }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

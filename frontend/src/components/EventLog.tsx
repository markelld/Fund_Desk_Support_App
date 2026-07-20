import { useState } from "react";
import type { SystemEvent } from "../types";

const CATEGORIES = ["All", "Risk", "Venue", "Session", "Auth"];

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch {
    return ts;
  }
}

function severityBar(sev: string): string {
  if (sev === "error")   return "bg-danger";
  if (sev === "warning") return "bg-warn";
  return "bg-[#cfd4da]";
}

interface EventLogProps {
  events: SystemEvent[];
}

export default function EventLog({ events }: EventLogProps) {
  const [activeFilter, setActiveFilter] = useState("All");

  const filtered = activeFilter === "All"
    ? events
    : events.filter((e) => e.category.toLowerCase() === activeFilter.toLowerCase());

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-1.5 mb-[11px]">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`font-mono text-[10px] px-[9px] py-1 border rounded cursor-pointer transition-colors ${
              activeFilter === cat
                ? "border-slate text-slate bg-slate-bg font-semibold"
                : "border-line text-muted bg-panel hover:border-dim"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Event rows */}
      <div>
        {filtered.length === 0 && (
          <p className="text-xs text-dim py-4 text-center">No events for this filter.</p>
        )}
        {filtered.map((ev) => (
          <div
            key={ev.id}
            className="flex gap-2.5 py-[9px] border-b border-line-2 last:border-0 text-[12.5px] items-start"
          >
            <div className={`w-[3px] self-stretch rounded-sm flex-shrink-0 ${severityBar(ev.severity)}`} />
            <div className="flex-1 text-ink">
              <div className="font-mono text-[9.5px] text-dim uppercase tracking-[0.08em] mb-[1px]">
                {ev.category}
              </div>
              {ev.message}
            </div>
            <div className="font-mono text-[10.5px] text-dim whitespace-nowrap">
              {fmtTime(ev.timestamp)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

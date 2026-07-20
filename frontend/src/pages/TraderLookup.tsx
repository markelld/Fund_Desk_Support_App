import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import TopBar from "../components/TopBar";
import StatusPill from "../components/StatusPill";
import type { TraderListItem } from "../types";

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(abs);
  return n < 0 ? `−${str}` : `+${str}`;
}

function UtilBadge({ pct }: { pct: number }) {
  const isHigh = pct >= 90;
  const isMed  = pct >= 70 && pct < 90;
  return (
    <span
      className={`font-mono text-sm ${
        isHigh ? "text-danger font-bold" : isMed ? "text-warn font-semibold" : ""
      }`}
    >
      {pct.toFixed(0)}%
    </span>
  );
}

export default function TraderLookup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deskFilter = searchParams.get("desk") ?? "";
  const [query, setQuery] = useState(deskFilter);
  const [traders, setTraders] = useState<TraderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function doSearch(q: string) {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const results = q.trim()
        ? await api.searchTraders(q.trim())
        : await api.listTraders();
      setTraders(results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  // Load traders on mount — pre-filter by desk if coming from overview
  useEffect(() => {
    doSearch(deskFilter);
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") doSearch(query);
  }

  const flagged = (t: TraderListItem) =>
    t.risk_state === "restricted" || t.risk_state === "halted";

  return (
    <div className="min-h-screen bg-bg">
      {/* Screen */}
      <div className="max-w-[1180px] mx-auto my-8 px-5">
        <div className="text-[10.5px] font-mono text-dim uppercase tracking-[0.12em] mb-2">
          / traders
        </div>
        <div className="border border-line rounded-lg overflow-hidden bg-panel shadow-[0_1px_2px_rgba(20,24,31,.04),0_8px_28px_rgba(20,24,31,.06)]">
          <TopBar crumbs={[{ label: "overview", to: "/" }, { label: "lookup" }]} />

          <div className="p-5 bg-sunken">
            {/* Search bar */}
            <div className="flex gap-2.5 mb-4">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by trader, ID, desk, or email…"
                className="flex-1 bg-panel border border-line rounded-md px-[13px] py-[10px] text-[13px] font-mono text-[#14181f] placeholder:text-dim outline-none focus:border-slate transition-colors"
              />
              <button
                onClick={() => doSearch(query)}
                className="bg-slate text-white border-0 rounded-md px-5 font-semibold text-[13px] cursor-pointer hover:bg-[#334d6e] transition-colors"
              >
                Search
              </button>
            </div>

            {/* Results table */}
            <div className="bg-panel border border-line rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Trader", "Trader ID", "Desk", "Risk state", "Margin util.", "Realized P&L", "Session"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left font-mono text-[10px] uppercase tracking-[0.1em] text-dim font-medium px-[13px] py-[10px] border-b border-line bg-sunken"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={7} className="px-[13px] py-8 text-center text-sm text-muted">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loading && error && (
                    <tr>
                      <td colSpan={7} className="px-[13px] py-8 text-center text-sm text-danger">
                        {error}
                      </td>
                    </tr>
                  )}
                  {!loading && !error && hasSearched && traders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-[13px] py-8 text-center text-sm text-muted">
                        No traders found.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    !error &&
                    traders.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => navigate(`/traders/${t.id}`)}
                        className={`cursor-pointer transition-colors ${
                          flagged(t)
                            ? "bg-danger-bg hover:bg-[#fbe9e7]"
                            : "hover:bg-sunken"
                        }`}
                      >
                        <td className="px-[13px] py-[11px] border-b border-line-2">
                          <strong className="font-semibold text-[13px]">
                            {t.display_name}
                          </strong>
                          <div className="font-mono text-[11.5px] text-muted">{t.desk}</div>
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-[11.5px] text-muted">
                          {t.id}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm">
                          {t.desk}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2">
                          <StatusPill status={t.risk_state} />
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2">
                          <UtilBadge pct={t.margin_utilization} />
                        </td>
                        <td
                          className={`px-[13px] py-[11px] border-b border-line-2 font-mono text-sm font-semibold ${
                            t.realized_pnl < 0 ? "text-danger" : "text-success"
                          }`}
                        >
                          {fmt(t.realized_pnl)}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2">
                          <StatusPill status={t.session_status} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

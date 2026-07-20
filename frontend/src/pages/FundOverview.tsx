import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { AlertItem, DeskSummary, Overview } from "../types";

// ── helpers ────────────────────────────────────────────────────────────────

function fmtUSD(n: number, showSign = false): string {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    notation: abs >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: abs >= 1_000_000 ? 1 : 0,
  }).format(abs);
  if (!showSign) return n < 0 ? `−${s}` : s;
  return n < 0 ? `−${s}` : `+${s}`;
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return ts; }
}

function utilColor(pct: number): string {
  if (pct >= 90) return "text-danger font-bold";
  if (pct >= 70) return "text-warn font-semibold";
  return "";
}

function utilBarColor(pct: number): string {
  if (pct >= 90) return "bg-gradient-to-r from-[#d99a3d] to-danger";
  if (pct >= 70) return "bg-warn";
  return "bg-slate";
}

// ── About modal ────────────────────────────────────────────────────────────

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14181f]/40"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-line rounded-lg shadow-xl max-w-md w-full mx-5 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-mono font-semibold text-[13px] text-ink">
              DESK<span className="text-slate">·</span>SUPPORT
            </div>
            <div className="font-mono text-[10px] text-dim uppercase tracking-[0.1em] mt-0.5">
              Portfolio project · synthetic data only
            </div>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-dim hover:text-ink transition-colors px-2 py-1"
          >
            ✕
          </button>
        </div>

        <p className="text-[13.5px] text-ink leading-relaxed mb-4">
          An internal ops tool for a futures trading desk — built by a futures trader.
          Surfaces margin utilization, position limits, order lifecycle with per-hop
          latency, and plain-language reject diagnostics in a single view.
        </p>

        <div className="border-t border-line pt-4 space-y-2">
          <Row label="Stack" value="FastAPI · SQLAlchemy · React · TypeScript · Tailwind" />
          <Row label="Data" value="~50 synthetic traders, ~600 orders — no live connections" />
          <Row label="DB" value="SQLite, reseeded on each deploy with coherent mock data" />
        </div>

        <div className="border-t border-line pt-4 mt-4 flex gap-3">
          <a
            href="https://github.com/markelldehaney/trader-support-console"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-slate hover:underline"
          >
            GitHub →
          </a>
          <span className="text-dim font-mono text-[11px]">·</span>
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-slate hover:underline"
          >
            API docs →
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-[12.5px]">
      <span className="font-mono text-[10px] text-dim uppercase tracking-[0.08em] w-12 flex-shrink-0 mt-0.5">
        {label}
      </span>
      <span className="text-muted">{value}</span>
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "danger" | "warn" | "success";
}) {
  const valColor =
    highlight === "danger" ? "text-danger" :
    highlight === "warn"   ? "text-warn"   :
    highlight === "success"? "text-success" :
    "text-ink";

  return (
    <div className="bg-panel border border-line rounded-lg px-5 py-4 flex flex-col gap-1">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim">{label}</div>
      <div className={`font-mono text-[22px] font-semibold leading-none ${valColor}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function DeskRow({ desk, onClick }: { desk: DeskSummary; onClick: () => void }) {
  const hasAlerts = desk.restricted_count > 0 || desk.flagged_count > 0;
  const pct = desk.avg_margin_utilization;

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-colors group ${
        desk.restricted_count > 0 ? "bg-danger-bg hover:bg-[#fbe9e7]" : "hover:bg-sunken"
      }`}
    >
      {/* Desk name — nowrap prevents EQ-IDX from splitting */}
      <td className="px-[13px] py-[11px] border-b border-line-2 whitespace-nowrap">
        <span className="font-mono font-semibold text-sm text-ink">{desk.desk_group}</span>
      </td>
      <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm">
        <span className={desk.live_count < desk.trader_count ? "text-warn" : "text-success"}>
          {desk.live_count}
        </span>
        <span className="text-dim"> / {desk.trader_count}</span>
      </td>
      {/* Margin bar scaled 0–100% with 80% threshold marker */}
      <td className="px-[13px] py-[11px] border-b border-line-2">
        <div className="flex items-center gap-2">
          <div className="relative w-20 h-1.5 bg-[#eceef1] rounded-full flex-shrink-0">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${utilBarColor(pct)}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
            {/* 80% alert threshold marker */}
            <div
              className="absolute top-[-2px] bottom-[-2px] w-px bg-danger opacity-30"
              style={{ left: "80%" }}
              title="Alert threshold: 80%"
            />
          </div>
          <span className={`font-mono text-sm ${utilColor(pct)}`}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </td>
      <td className="px-[13px] py-[11px] border-b border-line-2">
        {hasAlerts ? (
          <div className="flex gap-1.5 flex-wrap">
            {desk.restricted_count > 0 && (
              <span className="font-mono text-[10px] px-[7px] py-[3px] rounded-[3px] uppercase font-semibold border bg-danger-bg text-danger border-danger-border">
                {desk.restricted_count} restricted
              </span>
            )}
            {desk.flagged_count > 0 && (
              <span className="font-mono text-[10px] px-[7px] py-[3px] rounded-[3px] uppercase font-semibold border bg-warn-bg text-warn border-warn-border">
                {desk.flagged_count} flagged
              </span>
            )}
            {desk.halted_count > 0 && (
              <span className="font-mono text-[10px] px-[7px] py-[3px] rounded-[3px] uppercase font-semibold border bg-[#f2f4f6] text-muted border-line">
                {desk.halted_count} halted
              </span>
            )}
          </div>
        ) : (
          <span className="font-mono text-[10px] px-[7px] py-[3px] rounded-[3px] uppercase font-semibold border bg-success-bg text-success border-success-border">
            Clear
          </span>
        )}
      </td>
      <td
        className={`px-[13px] py-[11px] border-b border-line-2 font-mono text-sm font-semibold ${
          desk.total_realized_pnl < 0 ? "text-danger" : "text-success"
        }`}
      >
        {fmtUSD(desk.total_realized_pnl, true)}
      </td>
    </tr>
  );
}

function AlertRow({ alert, onClick }: { alert: AlertItem; onClick: () => void }) {
  const barColor =
    alert.severity === "error" ? "bg-danger" :
    alert.severity === "warning" ? "bg-warn" : "bg-[#cfd4da]";

  return (
    <div
      onClick={onClick}
      className="flex gap-2.5 py-[9px] border-b border-line-2 last:border-0 text-[12.5px] items-start cursor-pointer hover:bg-sunken transition-colors rounded"
    >
      <div className={`w-[3px] self-stretch rounded-sm flex-shrink-0 ${barColor}`} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[9.5px] text-dim uppercase tracking-[0.08em] mb-[1px]">
          {alert.category} · {alert.desk}
        </div>
        <div className="text-ink truncate">{alert.message}</div>
        <button
          className="font-mono text-[10.5px] text-slate hover:underline mt-0.5"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          {alert.trader_name}
        </button>
      </div>
      <div className="font-mono text-[10.5px] text-dim whitespace-nowrap">
        {fmtTime(alert.timestamp)}
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────

export default function FundOverview() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    api.getOverview()
      .then(setOverview)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    );
  }
  if (error || !overview) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-danger text-sm">
        {error ?? "Failed to load overview"}
      </div>
    );
  }

  const { firm, desks, recent_alerts } = overview;
  const alertCount = firm.restricted_count + firm.flagged_count + firm.halted_count;

  return (
    <div className="min-h-screen bg-bg">
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      <div className="max-w-[1180px] mx-auto my-8 px-5">
        <div className="text-[10.5px] font-mono text-dim uppercase tracking-[0.12em] mb-2">
          / overview
        </div>
        <div className="border border-line rounded-lg overflow-hidden bg-panel shadow-[0_1px_2px_rgba(20,24,31,.04),0_8px_28px_rgba(20,24,31,.06)]">

          {/* TopBar with About link injected alongside user badge */}
          <div className="flex items-center gap-3.5 px-[18px] py-[11px] border-b border-line bg-panel">
            <span className="font-mono font-semibold text-[12.5px] tracking-[0.03em] text-ink">
              DESK<span className="text-slate">·</span>SUPPORT
            </span>
            <span className="font-mono text-[11.5px] text-dim">/ overview</span>
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShowAbout(true)}
                className="font-mono text-[11px] text-dim hover:text-slate transition-colors"
              >
                About this project
              </button>
              <span className="text-dim font-mono text-[11px]">·</span>
              <span className="text-xs text-dim">tech-support@firm</span>
            </div>
          </div>

          <div className="p-5 bg-sunken space-y-3.5">

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="Total traders"
                value={String(firm.total_traders)}
                sub={`${firm.live_count} live`}
              />
              <StatCard
                label="Live sessions"
                value={String(firm.live_count)}
                sub={`${firm.total_traders - firm.live_count} offline`}
                highlight={firm.live_count < firm.total_traders * 0.7 ? "warn" : undefined}
              />
              <StatCard
                label="Risk alerts"
                value={String(alertCount)}
                sub={`${firm.restricted_count} restricted · ${firm.flagged_count} flagged`}
                highlight={alertCount > 0 ? (firm.restricted_count > 0 ? "danger" : "warn") : "success"}
              />
              <StatCard
                label="Firm margin util."
                value={`${firm.firm_margin_utilization.toFixed(0)}%`}
                sub="across all desks"
                highlight={
                  firm.firm_margin_utilization >= 80 ? "danger" :
                  firm.firm_margin_utilization >= 60 ? "warn" : undefined
                }
              />
              <StatCard
                label="Total realized P&L"
                value={fmtUSD(firm.total_realized_pnl, true)}
                highlight={firm.total_realized_pnl >= 0 ? "success" : "danger"}
              />
              <div
                onClick={() => navigate("/traders")}
                className="bg-slate text-white border border-slate rounded-lg px-5 py-4 flex flex-col gap-1 cursor-pointer hover:bg-[#334d6e] transition-colors"
              >
                <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] opacity-70">
                  Support
                </div>
                <div className="font-mono text-[22px] font-semibold leading-none">Lookup</div>
                <div className="text-xs opacity-70 mt-0.5">Search traders →</div>
              </div>
            </div>

            {/* 2-column grid */}
            <div className="grid grid-cols-[1.4fr_1fr] gap-3.5 max-[860px]:grid-cols-1">

              {/* Desk breakdown */}
              <div className="bg-panel border border-line rounded-lg overflow-hidden">
                <div className="px-[15px] pt-[15px] pb-3">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.11em] text-dim font-semibold">
                    Desk breakdown
                  </h3>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Desk", "Traders live", "Avg margin", "Risk flags", "Realized P&L"].map((h) => (
                        <th
                          key={h}
                          className="text-left font-mono text-[10px] uppercase tracking-[0.1em] text-dim font-medium px-[13px] py-[10px] border-b border-line bg-sunken whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {desks.map((desk) => (
                      <DeskRow
                        key={desk.desk_group}
                        desk={desk}
                        onClick={() => navigate(`/traders?desk=${desk.desk_group}`)}
                      />
                    ))}
                  </tbody>
                </table>
                {/* Row tint legend */}
                <div className="px-[13px] py-2.5 border-t border-line-2 flex gap-3">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-dim">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-danger-bg border border-danger-border" />
                    Row highlight = desk has restricted traders
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-dim">
                    <span className="inline-block w-px h-2.5 bg-danger opacity-40" />
                    Bar marker = 80% alert threshold
                  </span>
                </div>
              </div>

              {/* Recent alerts */}
              <div className="bg-panel border border-line rounded-lg p-4">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.11em] text-dim font-semibold mb-3.5">
                  Recent alerts — all desks
                </h3>
                {recent_alerts.length === 0 ? (
                  <p className="text-xs text-dim text-center py-6">No recent alerts.</p>
                ) : (
                  <div>
                    {recent_alerts.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        onClick={() => navigate(`/traders/${alert.trader_id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

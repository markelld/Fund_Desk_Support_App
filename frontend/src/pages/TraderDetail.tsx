import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import TopBar from "../components/TopBar";
import StatusPill from "../components/StatusPill";
import MarginGauge from "../components/MarginGauge";
import PositionLimitsTable from "../components/PositionLimitsTable";
import EventLog from "../components/EventLog";
import type { Order, SystemEvent, TraderDetail } from "../types";

function fmtUSD(n: number): string {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(abs);
  return n < 0 ? `−${s}` : `+${s}`;
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return ts; }
}

const ORDER_FILTERS = ["All", "filled", "rejected", "cancelled", "partially_filled"];

export default function TraderDetailPage() {
  const { traderId } = useParams<{ traderId: string }>();
  const navigate = useNavigate();

  const [trader, setTrader] = useState<TraderDetail | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState("All");

  useEffect(() => {
    if (!traderId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getTrader(traderId),
      api.getTraderOrders(traderId),
      api.getTraderEvents(traderId),
    ])
      .then(([t, o, e]) => {
        setTrader(t);
        setOrders(o);
        setEvents(e);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [traderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    );
  }

  if (error || !trader) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-danger text-sm">
        {error ?? "Trader not found"}
      </div>
    );
  }

  const filteredOrders = orderFilter === "All"
    ? orders
    : orders.filter((o) => o.status === orderFilter);

  const aggregateCurrent = trader.position_limits.reduce((s, l) => s + l.current_qty, 0);
  const mainPct = trader.margin_limit > 0
    ? (trader.margin_used / trader.margin_limit) * 100
    : 0;
  const maintPct = trader.margin_used > 0
    ? (trader.maintenance_margin / trader.margin_limit) * 100
    : 0;

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[1180px] mx-auto my-8 px-5">
        <div className="text-[10.5px] font-mono text-dim uppercase tracking-[0.12em] mb-2">
          / traders / {trader.id}
        </div>
        <div className="border border-line rounded-lg overflow-hidden bg-panel shadow-[0_1px_2px_rgba(20,24,31,.04),0_8px_28px_rgba(20,24,31,.06)]">
          <TopBar
            crumbs={[
              { label: "overview", to: "/" },
              { label: "lookup", to: "/traders" },
              { label: trader.id },
            ]}
          />

          <div className="p-5 bg-sunken space-y-3.5">
            {/* Summary card */}
            <div className="flex flex-wrap gap-6 items-center bg-panel border border-line rounded-lg px-[18px] py-[15px]">
              <div>
                <div className="text-[17px] font-semibold tracking-[-0.01em]">
                  {trader.display_name}
                </div>
                <div className="font-mono text-[11.5px] text-muted mt-0.5">
                  {trader.id} · Desk {trader.desk}
                </div>
              </div>
              <KV label="Risk state">
                <StatusPill status={trader.risk_state} />
              </KV>
              <KV label="Session">
                <StatusPill status={trader.session_status} />
              </KV>
              <KV label="Realized P&L">
                <span
                  className={`font-mono text-[13px] font-semibold ${
                    trader.realized_pnl < 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {fmtUSD(trader.realized_pnl)}
                </span>
              </KV>
              <KV label="Unrealized">
                <span
                  className={`font-mono text-[13px] font-semibold ${
                    trader.unrealized_pnl < 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {fmtUSD(trader.unrealized_pnl)}
                </span>
              </KV>
              <KV label="Permissioned">
                <span className="font-mono text-xs">
                  {trader.permissioned_symbols.join(" · ")}
                </span>
              </KV>
            </div>

            {/* 2-column grid */}
            <div className="grid grid-cols-[1.35fr_1fr] gap-3.5 max-[860px]:grid-cols-1">
              {/* Left: margin + position limits */}
              <div className="bg-panel border border-line rounded-lg p-4">
                <SectionLabel>Margin &amp; buying power</SectionLabel>
                <MarginGauge
                  label="Margin utilization"
                  used={trader.margin_used}
                  limit={trader.margin_limit}
                  pct={mainPct}
                />
                <MarginGauge
                  label="Maintenance margin"
                  used={trader.maintenance_margin}
                  limit={trader.margin_limit}
                  pct={maintPct}
                  footLeft={`Initial margin · ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(trader.margin_used)}`}
                  footRight={`Excess · ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(trader.margin_used - trader.maintenance_margin)}`}
                  isSecondary
                />

                <div className="mt-[18px] pt-[14px] border-t border-line">
                  <SectionLabel>Position limits</SectionLabel>
                  <PositionLimitsTable
                    limits={trader.position_limits}
                    aggregateCurrent={aggregateCurrent}
                    aggregateLimit={trader.aggregate_position_limit}
                  />
                </div>
              </div>

              {/* Right: system events */}
              <div className="bg-panel border border-line rounded-lg p-4">
                <SectionLabel>Risk &amp; system events</SectionLabel>
                <EventLog events={events} />
              </div>
            </div>

            {/* Full-width orders table */}
            <div className="bg-panel border border-line rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-[15px] pt-[15px] pb-3">
                <SectionLabel>Recent orders</SectionLabel>
                <div className="flex gap-1.5">
                  {ORDER_FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setOrderFilter(f)}
                      className={`font-mono text-[10px] px-[9px] py-1 border rounded cursor-pointer transition-colors ${
                        orderFilter === f
                          ? "border-slate text-slate bg-slate-bg font-semibold"
                          : "border-line text-muted bg-panel hover:border-dim"
                      }`}
                    >
                      {f === "All" ? f : f.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Order", "Symbol", "Side", "Type", "Qty", "Venue", "Status", "Reason", "Submitted"].map(
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
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-[13px] py-6 text-center text-sm text-muted">
                        No orders found.
                      </td>
                    </tr>
                  )}
                  {filteredOrders.map((o) => {
                    const isReject = o.status === "rejected";
                    return (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className={`cursor-pointer transition-colors ${
                          isReject
                            ? "bg-danger-bg hover:bg-[#fbe9e7]"
                            : "hover:bg-sunken"
                        }`}
                      >
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-[11.5px] text-muted">
                          {o.id}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm">
                          {o.symbol}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm">
                          {o.side.toUpperCase()}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm">
                          {o.order_type.toUpperCase()}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm">
                          {o.qty}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm">
                          {o.venue}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2">
                          <StatusPill
                            status={o.status}
                            label={o.status === "partially_filled" ? "Partial" : undefined}
                          />
                        </td>
                        <td
                          className={`px-[13px] py-[11px] border-b border-line-2 font-mono text-sm ${
                            o.reject_reason ? "text-danger" : "text-dim"
                          }`}
                        >
                          {o.reject_reason ?? "—"}
                        </td>
                        <td className="px-[13px] py-[11px] border-b border-line-2 font-mono text-sm text-muted">
                          {fmtTime(o.submitted_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] uppercase tracking-[0.11em] text-dim font-semibold mb-3.5">
      {children}
    </h3>
  );
}

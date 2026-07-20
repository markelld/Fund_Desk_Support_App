import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import TopBar from "../components/TopBar";
import StatusPill from "../components/StatusPill";
import type { Diagnosis, OrderWithEvents, OrderEvent } from "../types";

// The full canonical lifecycle stages in order
const LIFECYCLE = [
  "received",
  "pre_trade_risk",
  "margin_check",
  "routed_to_venue",
  "exchange_ack",
  "fill",
];

const TERMINAL = new Set(["fill", "partial_fill", "reject", "cancel"]);

function fmtTime(ts: string): string {
  try {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }) +
      "." +
      String(d.getMilliseconds()).padStart(3, "0")
    );
  } catch { return ts; }
}

function fmtShortTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return ts; }
}

function dotClass(ev: OrderEvent | undefined, isNotReached: boolean): string {
  if (isNotReached) return "border-[#d3d8de] bg-panel";
  if (!ev) return "border-[#d3d8de] bg-panel";
  if (ev.event_type === "reject" || ev.event_type === "cancel")
    return "bg-danger border-danger";
  if (ev.latency_ms > 500) return "border-warn bg-panel";
  return "border-success bg-panel";
}

function latClass(ms: number): string {
  return ms > 500 ? "text-warn font-semibold" : "text-dim";
}

interface TimelineStep {
  name: string;
  event?: OrderEvent;
  isNotReached: boolean;
  isTerminal: boolean;
}

function buildTimeline(events: OrderEvent[]): TimelineStep[] {
  const byType: Record<string, OrderEvent> = {};
  for (const e of events) byType[e.event_type] = e;

  const terminalEvent = events.find((e) => TERMINAL.has(e.event_type));
  const terminalIdx = terminalEvent
    ? events.findIndex((e) => e.id === terminalEvent.id)
    : -1;

  // Figure out which lifecycle steps are covered up to (but not including) terminal
  const mainEvents = terminalIdx >= 0 ? events.slice(0, terminalIdx) : events;
  const coveredMain = new Set(mainEvents.map((e) => e.event_type));

  const steps: TimelineStep[] = [];

  // Walk lifecycle steps in order
  let reachedTerminal = false;
  for (const step of LIFECYCLE) {
    if (reachedTerminal) {
      steps.push({ name: step, isNotReached: true, isTerminal: false });
      continue;
    }
    if (coveredMain.has(step)) {
      steps.push({ name: step, event: byType[step], isNotReached: false, isTerminal: false });
    } else {
      // Not reached
      steps.push({ name: step, isNotReached: true, isTerminal: false });
      reachedTerminal = true;
    }
  }

  // Insert terminal event (reject/cancel/fill/partial_fill) after the last covered step
  if (terminalEvent) {
    const insertAt = mainEvents.length; // position after the last main event
    steps.splice(insertAt, 0, {
      name: terminalEvent.event_type,
      event: terminalEvent,
      isNotReached: false,
      isTerminal: true,
    });
  }

  return steps;
}

function verdictStyles(verdict: string): { box: string; label: string; labelText: string } {
  if (verdict === "platform_fault" || verdict === "risk_system") {
    return {
      box: "border-danger-border bg-danger-bg",
      label: "text-danger",
      labelText: verdict === "platform_fault" ? "Platform fault" : "Diagnosis",
    };
  }
  if (verdict === "slow_fill") {
    return {
      box: "border-warn-border bg-warn-bg",
      label: "text-warn",
      labelText: "Latency notice",
    };
  }
  return {
    box: "border-success-border bg-success-bg",
    label: "text-success",
    labelText: "Diagnosis",
  };
}

export default function OrderLifecycle() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderWithEvents | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    Promise.all([api.getOrder(orderId), api.getDiagnosis(orderId)])
      .then(([o, d]) => { setOrder(o); setDiagnosis(d); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    );
  }
  if (error || !order || !diagnosis) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-danger text-sm">
        {error ?? "Order not found"}
      </div>
    );
  }

  const timeline = buildTimeline(order.events);
  const totalLatency = order.events.reduce((s, e) => s + e.latency_ms, 0);
  const dv = verdictStyles(diagnosis.verdict);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[1180px] mx-auto my-8 px-5">
        <div className="text-[10.5px] font-mono text-dim uppercase tracking-[0.12em] mb-2">
          / orders / {order.id}
        </div>
        <div className="border border-line rounded-lg overflow-hidden bg-panel shadow-[0_1px_2px_rgba(20,24,31,.04),0_8px_28px_rgba(20,24,31,.06)]">
          <TopBar
            crumbs={[
              { label: "overview", to: "/" },
              { label: "lookup", to: "/traders" },
              { label: order.trader_id, to: `/traders/${order.trader_id}` },
              { label: order.id },
            ]}
          />

          <div className="p-5 bg-sunken space-y-3.5">
            {/* Diagnosis box */}
            <div className={`border rounded-lg px-4 py-3.5 ${dv.box}`}>
              <div
                className={`font-mono text-[9.5px] uppercase tracking-[0.12em] font-bold mb-1.5 ${dv.label}`}
              >
                {dv.labelText}
              </div>
              <p className="text-[13.5px] leading-[1.55] text-[#14181f]">
                {diagnosis.summary}
              </p>
              {diagnosis.detail && (
                <p className="text-muted text-[12.5px] mt-1.5">{diagnosis.detail}</p>
              )}
            </div>

            {/* 2-column grid */}
            <div className="grid grid-cols-[1.35fr_1fr] gap-3.5 max-[860px]:grid-cols-1">
              {/* Left: timeline */}
              <div className="bg-panel border border-line rounded-lg p-4">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.11em] text-dim font-semibold mb-4">
                  Lifecycle — {order.id}
                </h3>
                <div className="relative pl-6">
                  {/* vertical line */}
                  <div className="absolute left-[6px] top-[6px] bottom-[6px] w-px bg-line" />

                  {timeline.map((step, i) => (
                    <div
                      key={`${step.name}-${i}`}
                      className={`relative pb-[18px] last:pb-0 ${step.isNotReached ? "opacity-40" : ""}`}
                    >
                      {/* dot */}
                      <div
                        className={`absolute left-[-23px] top-[3px] w-2.5 h-2.5 rounded-full border-2 ${dotClass(step.event, step.isNotReached)}`}
                      />

                      <div className="flex items-center gap-2.5">
                        <span
                          className={`font-mono text-[12.5px] font-semibold ${
                            step.event?.event_type === "reject" ||
                            step.event?.event_type === "cancel"
                              ? "text-danger"
                              : step.isNotReached
                              ? "text-dim"
                              : "text-ink"
                          }`}
                        >
                          {step.name}
                        </span>
                        {step.event && !step.isNotReached && (
                          <span
                            className={`font-mono text-[10.5px] ${
                              step.event.latency_ms > 500 ? latClass(step.event.latency_ms) : "text-dim"
                            }`}
                          >
                            +{step.event.latency_ms}ms
                            {step.event.latency_ms > 500 && " · slow"}
                          </span>
                        )}
                      </div>

                      {step.event && !step.isNotReached && (
                        <>
                          <div
                            className={`text-[12.5px] mt-0.5 ${
                              step.event.event_type === "reject" || step.event.event_type === "cancel"
                                ? "text-danger"
                                : "text-muted"
                            }`}
                          >
                            {step.event.detail}
                          </div>
                          <div className="font-mono text-[10px] text-dim mt-0.5">
                            {fmtTime(step.event.timestamp)}
                          </div>
                        </>
                      )}
                      {step.isNotReached && (
                        <div className="text-[12.5px] text-muted mt-0.5">Not reached</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: order meta + position snapshot + correlated events */}
              <div className="space-y-3.5">
                {/* Order details */}
                <div className="bg-panel border border-line rounded-lg p-4">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.11em] text-dim font-semibold mb-3.5">
                    Order
                  </h3>
                  <table className="w-full border-collapse">
                    <tbody>
                      {[
                        ["Symbol",        <span className="font-mono text-sm">{order.symbol}</span>],
                        ["Side / Qty",    <span className="font-mono text-sm">{order.side.toUpperCase()} · {order.qty} contracts</span>],
                        ["Type",          <span className="font-mono text-sm">{order.order_type.toUpperCase()}</span>],
                        ["Venue",         <span className="font-mono text-sm">{order.venue}</span>],
                        ["Status",        <StatusPill status={order.status} />],
                        ...(order.reject_reason
                          ? [["Reject reason", <span className="font-mono text-sm text-danger">{order.reject_reason}</span>]]
                          : []),
                        ["Total latency", <span className="font-mono text-sm">{totalLatency}ms</span>],
                        ["Submitted",     <span className="font-mono text-sm">{fmtShortTime(order.submitted_at)}</span>],
                        ["Trader",
                          <Link
                            to={`/traders/${order.trader_id}`}
                            className="font-mono text-sm text-slate hover:underline"
                          >
                            {order.trader_id}
                          </Link>,
                        ],
                      ].map(([label, value], i) => (
                        <tr key={i}>
                          <td className="py-[7px] pr-3 border-b border-line-2 text-muted text-sm whitespace-nowrap">
                            {label}
                          </td>
                          <td className="py-[7px] border-b border-line-2">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Correlated events */}
                {diagnosis.correlated_events.length > 0 && (
                  <div className="bg-panel border border-line rounded-lg p-4">
                    <div className="font-mono text-[9.5px] text-dim uppercase tracking-[0.1em] mb-2">
                      Correlated events
                    </div>
                    {diagnosis.correlated_events.map((ev) => {
                      const barColor =
                        ev.severity === "error"
                          ? "bg-danger"
                          : ev.severity === "warning"
                          ? "bg-warn"
                          : "bg-[#cfd4da]";
                      return (
                        <div
                          key={ev.id}
                          className="flex gap-2.5 items-start py-[7px] border-b border-line-2 last:border-0"
                        >
                          <div className={`w-[3px] self-stretch rounded-sm flex-shrink-0 ${barColor}`} />
                          <div className="flex-1 text-[12.5px] text-ink">
                            {ev.message}
                            <div className="font-mono text-[9.5px] text-dim uppercase tracking-[0.08em] mt-0.5">
                              {fmtShortTime(ev.timestamp)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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

import type { PositionLimit } from "../types";

interface PositionLimitsTableProps {
  limits: PositionLimit[];
  aggregateCurrent: number;
  aggregateLimit: number;
}

function LimitRow({
  symbol, current, limit, isAggregate = false,
}: {
  symbol: string;
  current: number;
  limit: number;
  isAggregate?: boolean;
}) {
  const pct = limit > 0 ? (current / limit) * 100 : 0;
  const isBreached = current >= limit;
  const isHigh = pct >= 80 && !isBreached;

  const barColor = isBreached
    ? "bg-danger"
    : isHigh
    ? "bg-gradient-to-r from-[#d99a3d] to-danger"
    : "bg-success";

  return (
    <tr>
      <td className={`py-[7px] pr-3 border-b border-line-2 last:border-0 font-mono font-semibold text-sm ${isAggregate ? "text-muted" : ""}`}>
        {symbol}
      </td>
      <td className="py-[7px] pr-3 border-b border-line-2">
        <div className="w-24 h-1.5 bg-[#eceef1] rounded-full relative overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </td>
      <td
        className={`py-[7px] border-b border-line-2 font-mono text-[11.5px] text-right whitespace-nowrap ${
          isBreached ? "text-danger font-bold" : ""
        }`}
      >
        {current} / {limit}
      </td>
    </tr>
  );
}

export default function PositionLimitsTable({
  limits, aggregateCurrent, aggregateLimit,
}: PositionLimitsTableProps) {
  return (
    <table className="w-full border-collapse mt-0.5">
      <tbody>
        {limits.map((l) => (
          <LimitRow
            key={l.symbol}
            symbol={l.symbol}
            current={l.current_qty}
            limit={l.limit_qty}
          />
        ))}
        <LimitRow
          symbol="Aggregate"
          current={aggregateCurrent}
          limit={aggregateLimit}
          isAggregate
        />
      </tbody>
    </table>
  );
}

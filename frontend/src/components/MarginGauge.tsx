function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

interface MarginGaugeProps {
  label: string;
  used: number;
  limit: number;
  pct: number;
  footLeft?: string;
  footRight?: string;
  isSecondary?: boolean;
}

export default function MarginGauge({
  label, used, limit, pct, footLeft, footRight, isSecondary = false,
}: MarginGaugeProps) {
  const isHigh = pct >= 90;
  const isMed  = pct >= 70 && pct < 90;

  const fillClass = isHigh
    ? "bg-gradient-to-r from-[#d99a3d] to-danger"
    : isMed
    ? "bg-warn"
    : isSecondary
    ? "bg-warn"
    : "bg-slate";

  const valClass = isHigh
    ? "text-danger font-bold"
    : isMed
    ? "text-warn font-semibold"
    : "text-ink font-semibold";

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs text-muted">{label}</span>
        <span className={`font-mono text-xs ${valClass}`}>
          {isSecondary
            ? `${fmt(used)} required`
            : `${fmt(used)} / ${fmt(limit)} · ${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="relative h-2 bg-[#eceef1] rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${fillClass}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {isHigh && !isSecondary && (
          <div
            className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-danger"
            style={{ left: "100%" }}
          />
        )}
      </div>
      <div className="flex justify-between mt-1 font-mono text-[10px] text-dim">
        <span>{footLeft ?? `Buying power remaining · ${fmt(limit - used)}`}</span>
        <span className={isHigh && !isSecondary ? "text-danger font-bold" : ""}>
          {footRight ?? `LIMIT · ${fmt(limit)}`}
        </span>
      </div>
    </div>
  );
}

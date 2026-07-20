const STYLES: Record<string, string> = {
  active:           "bg-success-bg text-success border-success-border",
  live:             "bg-success-bg text-success border-success-border",
  filled:           "bg-success-bg text-success border-success-border",
  restricted:       "bg-danger-bg text-danger border-danger-border",
  rejected:         "bg-danger-bg text-danger border-danger-border",
  flagged:          "bg-warn-bg text-warn border-warn-border",
  partially_filled: "bg-warn-bg text-warn border-warn-border",
  partial:          "bg-warn-bg text-warn border-warn-border",
  halted:           "bg-[#f2f4f6] text-muted border-line",
  offline:          "bg-[#f2f4f6] text-muted border-line",
  cancelled:        "bg-[#f2f4f6] text-muted border-line",
  submitted:        "bg-slate-bg text-slate border-slate-border",
  routed:           "bg-slate-bg text-slate border-slate-border",
};

interface StatusPillProps {
  status: string;
  label?: string;
}

export default function StatusPill({ status, label }: StatusPillProps) {
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const style = STYLES[key] ?? "bg-[#f2f4f6] text-muted border-line";
  return (
    <span
      className={`inline-block font-mono text-[10px] px-[7px] py-[3px] rounded-[3px] tracking-[0.04em] uppercase font-semibold border ${style}`}
    >
      {label ?? status}
    </span>
  );
}

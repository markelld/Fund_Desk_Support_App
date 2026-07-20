import { Link } from "react-router-dom";

interface Crumb {
  label: string;
  to?: string;
}

interface TopBarProps {
  crumbs?: Crumb[];
}

export default function TopBar({ crumbs = [] }: TopBarProps) {
  return (
    <div className="flex items-center gap-3.5 px-[18px] py-[11px] border-b border-line bg-panel">
      <Link to="/" className="font-mono font-semibold text-[12.5px] tracking-[0.03em] text-ink">
        DESK<span className="text-slate">·</span>SUPPORT
      </Link>

      {crumbs.map((crumb, i) => (
        <span key={i} className="font-mono text-[11.5px] text-dim">
          {crumb.to ? (
            <>
              /{" "}
              <Link to={crumb.to} className="text-slate hover:underline">
                {crumb.label}
              </Link>
            </>
          ) : (
            `/ ${crumb.label}`
          )}
        </span>
      ))}

      <span className="ml-auto text-xs text-dim">tech-support@firm</span>
    </div>
  );
}

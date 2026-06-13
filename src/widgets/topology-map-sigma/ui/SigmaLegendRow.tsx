export interface SigmaLegendRowProps {
  color: string;
  label: string;
  description?: string;
  compact?: boolean;
  /** 계층 위계 표기 (예: "1계층" / "별도") — 같은 행 우측에 작은 태그로. */
  tier?: string;
}

export function SigmaLegendRow({
  color,
  label,
  description,
  compact = false,
  tier,
}: SigmaLegendRowProps) {
  if (compact) {
    const title = description ? `${label} · ${description}` : label;
    return (
      <div
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 rounded-md border border-[color:rgba(255,255,255,0.045)] bg-[color:rgba(255,255,255,0.018)] px-2 py-1 text-left"
        title={title}
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 truncate text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
          {label}
        </span>
        {tier ? (
          <span className="col-start-2 min-w-0 truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
            {tier}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5 text-left">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] leading-4 text-[color:var(--color-text-secondary)]">
          {label}
        </span>
        {description ? (
          <span className="block text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
            {description}
          </span>
        ) : null}
      </span>
      {tier ? (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
          {tier}
        </span>
      ) : null}
    </div>
  );
}

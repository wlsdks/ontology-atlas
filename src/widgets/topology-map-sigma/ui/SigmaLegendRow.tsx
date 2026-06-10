export interface SigmaLegendRowProps {
  color: string;
  label: string;
  description?: string;
  /** 계층 위계 표기 (예: "1계층" / "별도") — 같은 행 우측에 작은 태그로. */
  tier?: string;
}

export function SigmaLegendRow({ color, label, description, tier }: SigmaLegendRowProps) {
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

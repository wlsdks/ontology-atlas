export interface SigmaLegendRowProps {
  color: string;
  label: string;
  description?: string;
}

export function SigmaLegendRow({ color, label, description }: SigmaLegendRowProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-0.5 text-left">
      <span
        aria-hidden="true"
        className="h-3.5 w-7 shrink-0 rounded-full border shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_14px_rgba(255,255,255,0.06)]"
        style={{ backgroundColor: color, borderColor: color }}
      />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-[var(--font-weight-signature)] leading-4 text-[color:var(--color-text-primary)]">
          {label}
        </span>
        {description ? (
          <span className="block truncate text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

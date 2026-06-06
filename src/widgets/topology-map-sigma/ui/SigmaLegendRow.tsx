export interface SigmaLegendRowProps {
  color: string;
  label: string;
  description?: string;
}

export function SigmaLegendRow({ color, label, description }: SigmaLegendRowProps) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-md px-1.5 py-1 text-left">
      <span
        aria-hidden="true"
        className="mt-0.5 h-5 w-10 shrink-0 rounded-full border shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_18px_rgba(255,255,255,0.08)]"
        style={{ backgroundColor: color, borderColor: color }}
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-[var(--font-weight-signature)] leading-4 text-[color:var(--color-text-primary)]">
          {label}
        </span>
        {description ? (
          <span className="block text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

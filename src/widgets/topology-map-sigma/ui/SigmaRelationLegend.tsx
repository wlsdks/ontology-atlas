interface SigmaRelationLegendLabels {
  title: string;
  strong: string;
  supported: string;
  weak: string;
  review: string;
}

const RELATION_LEGEND_ROWS = [
  {
    key: 'strong',
    strokeToken: '--topology-relation-stroke-strong',
    widthToken: '--topology-relation-stroke-strong-width',
  },
  {
    key: 'supported',
    strokeToken: '--topology-relation-stroke-supported',
    widthToken: '--topology-relation-stroke-supported-width',
  },
  {
    key: 'weak',
    strokeToken: '--topology-relation-stroke-weak',
    widthToken: '--topology-relation-stroke-weak-width',
  },
  {
    key: 'review',
    strokeToken: '--topology-relation-stroke-review',
    widthToken: '--topology-relation-stroke-review-width',
  },
] as const;

export function SigmaRelationLegend({ labels }: { labels: SigmaRelationLegendLabels }) {
  return (
    <div
      data-testid="topology-relation-legend"
      data-relation-legend-contract="map-utility-explains-edge-semantics"
      data-relation-legend-attention-role="utility"
      data-relation-legend-density="compact"
      className="topology-ui-scale pointer-events-none absolute bottom-[calc(1.5rem+183px+0.75rem)] right-4 z-10 hidden w-[220px] overflow-hidden rounded-lg border border-[color:var(--topology-minimap-border)] bg-[color:var(--topology-minimap-surface)] shadow-[var(--topology-minimap-shadow)] md:right-6 md:flex md:flex-col xl:right-8"
    >
      <div className="border-b border-[color:var(--color-border-soft)] bg-[color:var(--topology-minimap-header-surface)] px-2.5 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {labels.title}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-2.5 py-2">
        {RELATION_LEGEND_ROWS.map((row) => (
          <div
            key={row.key}
            data-relation-legend-row={row.key}
            data-relation-stroke-token={row.strokeToken}
            data-relation-stroke-width-token={row.widthToken}
            className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-1"
          >
            <svg
              aria-hidden="true"
              className="h-3 w-8 overflow-visible"
              viewBox="0 0 32 12"
            >
              <path
                d="M2 6 C10 2 20 10 30 6"
                fill="none"
                stroke={`var(${row.strokeToken})`}
                strokeLinecap="round"
                strokeWidth={`var(${row.widthToken})`}
              />
            </svg>
            <span className="min-w-0 truncate text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
              {labels[row.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

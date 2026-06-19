interface SigmaRelationLegendLabels {
  title: string;
  strong: string;
  strongShort: string;
  supported: string;
  supportedShort: string;
  weak: string;
  weakShort: string;
  review: string;
  reviewShort: string;
}

const RELATION_LEGEND_ROWS = [
  {
    key: 'strong',
    shortKey: 'strongShort',
    strokeToken: '--topology-relation-stroke-strong',
    widthToken: '--topology-relation-stroke-strong-width',
  },
  {
    key: 'supported',
    shortKey: 'supportedShort',
    strokeToken: '--topology-relation-stroke-supported',
    widthToken: '--topology-relation-stroke-supported-width',
  },
  {
    key: 'weak',
    shortKey: 'weakShort',
    strokeToken: '--topology-relation-stroke-weak',
    widthToken: '--topology-relation-stroke-weak-width',
  },
  {
    key: 'review',
    shortKey: 'reviewShort',
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
      data-relation-legend-layout="single-row-strip"
      data-relation-legend-typography="readable-utility-labels"
      className="topology-ui-scale pointer-events-none absolute bottom-[calc(1.5rem+183px+0.75rem)] right-4 z-10 hidden w-[300px] items-center gap-2.5 overflow-hidden rounded-lg border border-[color:var(--topology-minimap-border)] bg-[color:var(--topology-minimap-surface)] px-2.5 py-1.5 shadow-[var(--topology-minimap-shadow)] md:right-6 md:flex xl:right-8"
    >
      <span className="shrink-0 text-[10px] font-medium leading-none tracking-normal text-[color:var(--color-text-quaternary)]">
        {labels.title}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {RELATION_LEGEND_ROWS.map((row) => (
          <div
            key={row.key}
            data-relation-legend-row={row.key}
            data-relation-stroke-token={row.strokeToken}
            data-relation-stroke-width-token={row.widthToken}
            title={labels[row.key]}
            aria-label={labels[row.key]}
            className="flex min-w-0 shrink-0 items-center gap-1"
          >
            <svg
              aria-hidden="true"
              className="h-3 w-6 overflow-visible"
              viewBox="0 0 24 12"
            >
              <path
                d="M2 6 C8 2 16 10 22 6"
                fill="none"
                stroke={`var(${row.strokeToken})`}
                strokeLinecap="round"
                strokeWidth={`var(${row.widthToken})`}
              />
            </svg>
            <span className="text-[10px] font-medium leading-none tracking-normal text-[color:var(--color-text-tertiary)]">
              {labels[row.shortKey]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

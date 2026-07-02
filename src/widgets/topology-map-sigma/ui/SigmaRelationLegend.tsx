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
      data-relation-legend-width-token="--topology-relation-legend-width"
      data-relation-legend-max-width-token="--topology-relation-legend-max-width"
      data-relation-legend-inset-token="--topology-relation-legend-inset"
      data-relation-legend-bottom-token="--topology-relation-legend-bottom"
      data-relation-legend-minimap-gap-token="--topology-relation-legend-minimap-gap"
      data-relation-legend-surface-token="--topology-relation-legend-surface"
      data-relation-legend-border-token="--topology-relation-legend-border"
      data-relation-legend-shadow-token="--topology-relation-legend-shadow"
      className="topology-ui-scale pointer-events-none absolute bottom-[var(--topology-relation-legend-bottom)] right-[var(--topology-relation-legend-inset)] z-10 hidden w-[var(--topology-relation-legend-width)] max-w-[var(--topology-relation-legend-max-width)] items-center gap-2 overflow-hidden rounded-lg border border-[color:var(--topology-relation-legend-border)] bg-[color:var(--topology-relation-legend-surface)] px-2.5 py-1.5 shadow-[var(--topology-relation-legend-shadow)] md:flex"
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

import { BrandWaitingMark } from './brand-waiting-mark';

export interface MapEntryLoadingVisualProps {
  title: string;
  description: string;
  /** Product description for static HTML and crawlers. On screen, the loader is the protagonist. */
  headline?: string;
  lede?: string;
}

/** Map cold boot keeps one centered status and a native waiting character. */
export function MapEntryLoadingVisual({
  title,
  description,
  headline,
  lede,
}: MapEntryLoadingVisualProps) {
  return (
    <main
      id="main"
      tabIndex={-1}
      data-route-loading="true"
      data-testid="map-entry-fallback"
      className="flex h-full min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      {headline || lede ? (
        <div className="sr-only">
          {headline ? <h1>{headline}</h1> : null}
          {lede ? <p>{lede}</p> : null}
        </div>
      ) : null}
      <MapEntryLoadingScene title={title} description={description} />
    </main>
  );
}

export function MapEntryLoadingScene({ title, description }: Pick<MapEntryLoadingVisualProps, "title" | "description">) {
  return (
      <div
        role="status"
        aria-live="polite"
          data-map-loading-layout="centered"
        className="flex max-w-md flex-col items-center text-center"
      >
        <div className="map-wait-scene relative grid h-48 w-80 max-w-full place-items-center" aria-hidden="true">
          <span className="map-wait-orbit absolute size-40 rounded-full border-2 border-transparent border-t-[color:var(--color-indigo-accent)]" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 192" fill="none">
            <g stroke="var(--color-border-strong)" strokeWidth="1">
              <path d="M62 50 160 96 262 48M46 142 160 96 274 144M62 50 46 142M262 48 274 144" />
              <circle cx="160" cy="96" r="64" strokeDasharray="2 8" />
            </g>
            <g className="map-wait-signal" stroke="var(--color-indigo-line-a32)" strokeWidth="2">
              <path d="M62 50 160 96 274 144" />
            </g>
            {[[62,50],[262,48],[46,142],[274,144]].map(([x,y]) => (
              <g key={x} className="map-wait-point">
                <rect x={x-15} y={y-10} width="30" height="20" rx="6" fill="var(--color-panel)" stroke="var(--color-border-strong)" />
                <path d={`M${x-6} ${y}h12`} stroke="var(--color-text-quaternary)" />
              </g>
            ))}
          </svg>
          <div className="relative grid size-20 place-items-center rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
            <BrandWaitingMark active initialVisibility="visible" />
          </div>
        </div>
        <p className="mt-5 text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {title}
        </p>
        <p className="mt-2 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {description}
        </p>
      </div>
  );
}

'use client';

import { WaitStage } from '../status/wait-stage';

export interface MapEntryLoadingVisualProps {
  title: string;
  description: string;
  /** For static HTML and crawlers; on screen the loader leads. */
  headline?: string;
  lede?: string;
}

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
      className="relative flex h-full min-h-full flex-1 bg-[color:var(--color-canvas)]"
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
  return <WaitStage mark="orbit" title={title} detail={description} data-map-loading-layout="centered" />;
}

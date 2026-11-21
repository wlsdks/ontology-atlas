'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { MAIN, RULER, SEAM_LEFT, trackLeft } from '../model/stations';

/** A station the board can place a head on now: this Mac's always, the server's once it is connected, main always. */
export function isStationDrawn(station: (typeof RULER)[number], connected: boolean): boolean {
  return station.side === 'mac' || connected || station.id === 'main';
}

/** The stations every row shares, drawn once across both grounds, with the push seam between them. */
export function StationRuler({ connected }: { connected: boolean }) {
  const t = useTranslations('workStatus');
  return (
    <div aria-hidden className="relative h-[var(--work-ruler-h)]" data-work-ruler>
      <div className="absolute inset-x-0 top-[var(--work-ruler-line-y)] h-px bg-[color:var(--work-rail)]" />
      <span
        className="absolute bottom-0 top-[var(--work-ruler-line-y)] w-[var(--work-line)] -translate-x-1/2 bg-[color:var(--color-text-secondary)]"
        style={{ left: trackLeft(MAIN) }}
      />
      {RULER.filter(station => isStationDrawn(station, connected)).map(station => {
        const live = station.side === 'mac' ? station.id === 'working' : connected || station.id === 'main';
        return (
          <div key={station.id} className="absolute top-2 flex -translate-x-1/2 flex-col items-center" style={{ left: trackLeft(station) }}>
            <span className={cn(
              'whitespace-nowrap text-body leading-body font-[var(--font-weight-emphasis)]',
              live ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-tertiary)]',
            )}>
              {t(`ruler.${station.id}`)}
            </span>
            <span className={cn(
              'mt-[calc(var(--work-ruler-line-y)-0.5rem-var(--leading-body)-var(--work-dot)/2)] block size-[var(--work-dot)] rounded-full border-2',
              live ? 'border-[color:var(--color-text-secondary)]' : 'border-[color:var(--work-rail)]',
              station.side === 'server' ? 'bg-[color:var(--work-ground-server)]' : 'bg-[color:var(--work-ground-mac)]',
            )} />
          </div>
        );
      })}
      <span
        className="absolute top-2.5 -translate-x-1/2 rounded-full bg-[color:var(--color-text-primary)] px-2 text-label leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-on-accent)]"
        style={{ left: SEAM_LEFT }}
      >
        {t('band.seam')}
      </span>
    </div>
  );
}

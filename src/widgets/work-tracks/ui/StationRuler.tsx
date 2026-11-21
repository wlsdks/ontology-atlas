'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { RULER, SEAM_X, trackLeft } from '../model/stations';

/** The stations every row shares, drawn once across both grounds, with the push seam between them. */
export function StationRuler({ connected }: { connected: boolean }) {
  const t = useTranslations('workStatus');
  return (
    <div aria-hidden className="relative h-14" data-work-ruler>
      <div className="absolute inset-x-0 top-[var(--work-ruler-line-y)] h-px bg-[color:var(--work-rail-faint)]" />
      {RULER.map(station => {
        const live = station.side === 'mac' ? station.id === 'working' : connected || station.id === 'main';
        return (
          <div key={station.id} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: trackLeft(station.x) }}>
            <span className={cn(
              'whitespace-nowrap text-body leading-body font-[var(--font-weight-emphasis)]',
              live ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-tertiary)]',
            )}>
              {t(`ruler.${station.id}`)}
            </span>
            <span className={cn(
              'mt-[calc(var(--work-ruler-line-y)-var(--leading-body)-var(--work-dot)/2)] block size-[var(--work-dot)] rounded-full border-2 bg-[color:var(--work-ground-mac)]',
              live ? 'border-[color:var(--color-text-tertiary)]' : 'border-[color:var(--work-rail)]',
              station.side === 'server' && 'bg-[color:var(--work-ground-server)]',
            )} />
          </div>
        );
      })}
      <span
        className="absolute top-0.5 -translate-x-1/2 rounded-full bg-[color:var(--color-text-primary)] px-2 text-label leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-on-accent)]"
        style={{ left: trackLeft(SEAM_X) }}
      >
        {t('band.seam')}
      </span>
    </div>
  );
}

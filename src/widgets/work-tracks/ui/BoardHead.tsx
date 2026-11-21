'use client';

import { useTranslations } from 'next-intl';
import { Laptop, Server } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { SEAM_LEFT } from '../model/stations';
import { StationRuler } from './StationRuler';

const GROUND_TITLE = 'shrink-0 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]';
const GROUND_FACT = 'min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]';

interface BoardHeadProps {
  folder: string;
  /** What the server ground says while it has no rows: not connected, or no remote to connect to. */
  serverNotice: string | null;
  connected: boolean;
}

/**
 * The two grounds' names and the shared ruler, pinned while the rows scroll under them. Its own
 * opaque grounds and seam continue the board's, so no row shows through a station label.
 */
export function BoardHead({ folder, serverNotice, connected }: BoardHeadProps) {
  const t = useTranslations('workStatus');
  return (
    <div data-work-head className="sticky top-[var(--work-sticky-top)] z-10 bg-[color:var(--work-ground-mac)]">
      <div aria-hidden className="absolute inset-y-0 right-0 bg-[color:var(--work-ground-server)]" style={{ left: SEAM_LEFT }} />
      <div aria-hidden className="absolute inset-y-0 w-px -translate-x-1/2 bg-[color:var(--work-seam)]" style={{ left: SEAM_LEFT }} />
      <header className="relative flex h-[var(--work-header-h)] items-end">
        <div className="flex min-w-0 items-baseline gap-2.5 pl-6 pr-4" style={{ width: SEAM_LEFT }}>
          <Laptop aria-hidden size={ICON_SIZE.lg} className="shrink-0 self-center text-[color:var(--color-text-secondary)]" />
          <h2 className={GROUND_TITLE}>{t('band.mac')}</h2>
          <span className={GROUND_FACT} title={folder}>{folder}</span>
        </div>
        <div className="flex min-w-0 flex-1 items-baseline gap-2.5 pl-8 pr-4">
          <Server aria-hidden size={ICON_SIZE.lg} className="shrink-0 self-center text-[color:var(--color-text-secondary)]" />
          <h2 className={GROUND_TITLE}>{t('band.server')}</h2>
        </div>
      </header>
      <StationRuler connected={connected} />
      {serverNotice ? (
        <p
          data-testid="work-server-state"
          title={serverNotice}
          className="absolute top-[calc(var(--work-header-h)+0.25rem)] line-clamp-2 text-label leading-label text-[color:var(--color-text-tertiary)]"
          style={{ left: `calc(${SEAM_LEFT} + 2rem)`, width: 'calc(var(--work-server-w) - 2rem - var(--work-track-end) - 1.75rem)' }}
        >
          {serverNotice}
        </p>
      ) : null}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[color:var(--work-rail-faint)]" />
    </div>
  );
}

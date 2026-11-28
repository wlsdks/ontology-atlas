import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { roundPlaces, type RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';
import { Button } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

/** The line states every field of `roundFingerprint` a person can judge, so the press allows what it shows. */
export function AutomationAllowHere({ round, runner, cadence, changed, sentenceId }: {
  round: RoundRecord;
  runner: RoundsRunnerValue;
  cadence: string;
  changed: boolean;
  sentenceId: string;
}) {
  const t = useTranslations('automations');
  const kinds = useTranslations('library.rounds.kind');
  const [failed, setFailed] = useState(false);

  const places = roundPlaces(round);
  const parts: string[] = [
    round.kind === 'ontology' ? t('ontology.title') : kinds(round.kind === 'service' ? 'service' : 'consistency'),
    cadence,
  ];
  for (const place of places) {
    if (place.kind === 'vault') {
      parts.push(place.paths.length > 0 ? place.paths.join(', ') : t('allowHere.wholeFolder'));
      continue;
    }
    parts.push(place.location?.trim() ? `${place.connectorName} · ${place.location.trim()}` : place.connectorName);
    if (place.query?.trim()) parts.push(t('allowHere.query', { query: place.query.trim() }));
  }
  if (round.query?.trim() && !places.some((place) => place.kind === 'service' && place.query === round.query)) {
    parts.push(t('allowHere.query', { query: round.query.trim() }));
  }
  if (round.kind === 'consistency') {
    parts.push(round.onStale === 'mark' ? t('allowHere.staleMark') : t('allowHere.staleRedraft'));
  }
  if (typeof round.limit === 'number') parts.push(t('allowHere.limit', { count: round.limit }));

  return (
    <div data-testid="automation-allow-here" data-allow-changed={changed ? 'true' : 'false'}
      className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
      <div className="min-w-0 flex-1 space-y-1">
        <p id={sentenceId} role="status" className="break-words text-body text-[color:var(--color-status-warning)]">
          {changed ? t('allowHere.changed') : round.enabled ? t('allowHere.waiting') : t('allowHere.paused')}
        </p>
        <p data-testid="automation-allow-here-line" className="break-words text-body text-[color:var(--color-text-secondary)]">
          {parts.join(' · ')}
        </p>
        {failed ? <p role="alert" className="text-body text-[color:var(--color-danger-text)]">{t('changeFailed')}</p> : null}
      </div>
      <Button variant="outline" size="sm" data-testid="automation-allow-here-button" className="atlas-touch-floor self-start md:self-center"
        onClick={() => setFailed(!runner.allow(round.id))}>
        <ShieldCheck size={ICON_SIZE.sm} aria-hidden />{t('allowHere.button')}
      </Button>
    </div>
  );
}

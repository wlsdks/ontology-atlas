'use client';

import { CalendarClock, ChevronDown, Pause, Play } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cadenceKey, cadenceMinutes, type RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';
import { RowButton, RowDisclosure } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { AutomationScheduleActions } from './AutomationScheduleActions';
import { AutomationRunHistory } from './AutomationRunHistory';

function automationDate(locale: string, value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
    : '—';
}

export function AutomationScheduleRow({ round, runner, expanded, onToggle }: {
  round: RoundRecord;
  runner: RoundsRunnerValue;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('automations');
  const cadenceText = useTranslations('library.rounds.cadence');
  const locale = useLocale();
  const entries = runner.ledger.filter((entry) => entry.roundId === round.id);
  const last = entries.at(-1);
  const running = runner.running?.roundId === round.id;
  const key = cadenceKey(round.cadence);
  const time = 'daily' in round.cadence ? round.cadence.daily : '09:00';
  const minutes = cadenceMinutes(round.cadence);
  const cadence = key === 'minutes' ? cadenceText('everyMinutes', { count: minutes! })
    : key === 'hours' ? cadenceText('everyHours', { count: minutes! / 60 })
    : key === 'hour' || key === '6h' ? t(`cadence.${key}`)
    : t(key === 'daily' ? 'cadence.dailyAt' : 'cadence.weekdaysAt', { time });
  const detailId = `automation-detail-${round.id}`;

  return (
    <li className="min-w-0 py-2">
      <RowButton onClick={onToggle} active={expanded} aria-expanded={expanded} aria-controls={detailId}
        data-testid={`automation-${round.id}`} className="w-full px-4 py-5 text-left" hoverSurface="lift">
        <span className="mt-1 flex-none self-start text-[color:var(--color-text-tertiary)]">
          {running ? <Play size={ICON_SIZE.md} aria-hidden /> : round.enabled ? <CalendarClock size={ICON_SIZE.md} aria-hidden /> : <Pause size={ICON_SIZE.md} aria-hidden />}
        </span>
        <span className="grid min-w-0 flex-1 grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:items-center">
          <span className="col-span-2 min-w-0 md:col-span-1">
            <span className="block break-words text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{round.name}</span>
            <span className="mt-1 block text-body text-[color:var(--color-text-tertiary)]">{running ? t('state.running') : round.enabled ? t('state.on') : t('state.paused')}</span>
          </span>
          <span className="min-w-0 text-body text-[color:var(--color-text-secondary)]">
            <span className="block">{cadence}</span>
            <span className="mt-1 block text-label text-[color:var(--color-text-tertiary)]">
              {round.enabled ? t('nextRunAt', { time: automationDate(locale, round.nextDueAt) }) : t('noNextRun')}
            </span>
          </span>
          <span className="min-w-0 text-body text-[color:var(--color-text-secondary)] md:text-right">
            <span className="block">{last ? t(`outcome.${last.outcome}`) : t('outcome.none')}</span>
            {last ? <time dateTime={last.endedAt} className="mt-1 block text-label text-[color:var(--color-text-tertiary)]">{automationDate(locale, last.endedAt)}</time> : null}
          </span>
        </span>
        <ChevronDown size={ICON_SIZE.sm} aria-hidden className={`mt-1 flex-none self-start transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
      </RowButton>

      <RowDisclosure id={detailId} open={expanded} className="px-4 pb-4 pt-4 md:pl-10">
        <div className="space-y-5 border-l border-[color:var(--color-divider)] pl-5">
        {'query' in round && round.query ? <p className="break-words text-body text-[color:var(--color-text-secondary)]"><span className="text-[color:var(--color-text-tertiary)]">{t('scopeLabel')} · </span>{round.query}</p> : null}
        <AutomationRunHistory entries={entries} />
        <AutomationScheduleActions round={round} runner={runner} />
        </div>
      </RowDisclosure>
    </li>
  );
}

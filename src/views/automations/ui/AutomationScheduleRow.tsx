'use client';

import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarClock, Pause, Play } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cadenceKey, cadenceMinutes, type RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { AutomationAllowHere } from './AutomationAllowHere';
import { AutomationRemoveConfirm, AutomationScheduleActions, useScheduleChange } from './AutomationScheduleActions';
import { useRunLead, useUnrecordedText, WARNING_INK } from './AutomationRunHistory';
import { automationDate } from './automation-date';
import { AUTOMATION_CELL, AUTOMATION_ROW_GRID } from './AutomationListFrame';

const ROW_SELECTOR = '[data-schedule-row]';

/** Up and Down walk the schedule rows; Enter and Space select the focused one. */
function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, select: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    select();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = [...(event.currentTarget.closest('[role="rowgroup"]')?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? [])];
  const next = rows[rows.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/** A full-width line under the schedule's row: never folded, there while its state holds. */
function RowStrip({ children, testId }: { children: ReactNode; testId?: string }) {
  return <div role="row" data-testid={testId} className="bg-[color:var(--color-overlay-1)]">
    <div role="gridcell" aria-colspan={4} className="px-[var(--card-pad)] py-3">{children}</div>
  </div>;
}

export function AutomationScheduleRow({ round, runner, selected, tabbable, onSelect, onEdit, arrival }: {
  round: RoundRecord;
  runner: RoundsRunnerValue;
  selected: boolean;
  /** The one row the Tab key lands on; the arrows reach the rest. */
  tabbable: boolean;
  onSelect: () => void;
  onEdit: () => void;
  arrival?: { className?: string; style?: CSSProperties };
}) {
  const t = useTranslations('automations');
  const cadenceText = useTranslations('library.rounds.cadence');
  const ledgerText = useTranslations('library.rounds.ledger');
  const locale = useLocale();
  const runLead = useRunLead();
  const unrecordedText = useUnrecordedText();
  const change = useScheduleChange();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const recorded = runner.ledger.findLast((entry) => entry.roundId === round.id);
  const unrecorded = runner.unrecorded.get(round.id);
  const lastIsUnrecorded = unrecorded !== undefined && (!recorded || Date.parse(unrecorded.endedAt) >= Date.parse(recorded.endedAt));
  const last = lastIsUnrecorded ? unrecorded : recorded;
  const lead = !lastIsUnrecorded && recorded ? runLead(recorded) : null;
  const summary = lastIsUnrecorded ? unrecordedText(unrecorded) : lead ? lead.text : t('noRuns');
  const running = runner.running?.roundId === round.id;
  const key = cadenceKey(round.cadence);
  const time = 'daily' in round.cadence ? round.cadence.daily : '09:00';
  const minutes = cadenceMinutes(round.cadence);
  const cadence = key === 'minutes' ? cadenceText('everyMinutes', { count: minutes! })
    : key === 'hours' ? cadenceText('everyHours', { count: minutes! / 60 })
    : key === 'hour' || key === '6h' ? t(`cadence.${key}`)
    : t(key === 'daily' ? 'cadence.dailyAt' : 'cadence.weekdaysAt', { time });
  const notHere = runner.notAllowedHere.has(round.id);
  const onHere = round.enabled && !notHere;
  const allowSentenceId = `automation-allow-${round.id}`;
  const StateIcon = running ? Play : onHere ? CalendarClock : Pause;

  const closeConfirm = () => {
    setConfirmRemove(false);
    menuTrigger.current?.focus();
  };

  return (
    <div role="presentation" style={arrival?.style} className={cn('min-w-0 border-t border-[color:var(--color-divider)] max-md:first:border-t-0', arrival?.className)}>
      <div role="row" aria-selected={selected} tabIndex={tabbable ? 0 : -1} data-schedule-row data-testid={`automation-${round.id}`}
        onClick={onSelect} onKeyDown={(event) => onRowKeyDown(event, onSelect)}
        className={cn(AUTOMATION_ROW_GRID, 'cursor-pointer py-3.5 transition-[background-color] motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
          selected ? 'bg-[color:var(--color-overlay-2)]' : 'hover:bg-[color:var(--color-overlay-1)]')}>
        <div role="gridcell" data-automation-col="name" className={AUTOMATION_CELL.name}>
          <span title={round.name} className="block truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{round.name}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-body text-[color:var(--color-text-tertiary)]">
            <StateIcon size={ICON_SIZE.sm} aria-hidden className="flex-none" />
            <span className="truncate">
              {running ? `${t('state.running')} · ${ledgerText(runner.running?.phase === 'agent' ? 'phaseAgent' : 'phaseChecking')}`
                : onHere ? t('state.on') : round.enabled ? t('allowHere.state') : t('state.paused')}
            </span>
          </span>
        </div>
        <div role="gridcell" data-automation-col="cadence" className={AUTOMATION_CELL.cadence}>
          <span className="block truncate text-body text-[color:var(--color-text-secondary)]">{cadence}</span>
          <span className="mt-0.5 block truncate text-label text-[color:var(--color-text-tertiary)]">
            {onHere ? t('nextRunAt', { time: automationDate(locale, round.nextDueAt) }) : notHere ? t('allowHere.noNextRun') : t('noNextRun')}
          </span>
        </div>
        <div role="gridcell" data-automation-col="outcome" className={AUTOMATION_CELL.outcome}>
          <span className="block truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {last ? t(`outcome.${last.outcome}`) : t('outcome.none')}
          </span>
          <span data-testid="automation-summary" title={summary} data-run-note={lead?.note ?? undefined}
            className={cn('mt-0.5 block truncate text-body', lead?.warning || lastIsUnrecorded ? WARNING_INK : 'text-[color:var(--color-text-secondary)]')}>
            {summary}
          </span>
          <span className="mt-0.5 block min-h-[var(--leading-label)] truncate text-label text-[color:var(--color-text-tertiary)]">
            {last ? <time dateTime={last.endedAt}>{automationDate(locale, last.endedAt)}</time> : null}
            {lastIsUnrecorded ? <span className={WARNING_INK}> · {t('unrecorded.short')}</span> : null}
          </span>
        </div>
        {/* The actions answer their own presses; none of them selects the row. */}
        <div role="gridcell" className={AUTOMATION_CELL.actions} onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}>
          <AutomationScheduleActions ref={menuTrigger} round={round} runner={runner} change={change}
            notAllowedSentenceId={notHere ? allowSentenceId : null} onEdit={onEdit} onRemove={() => setConfirmRemove(true)} />
        </div>
      </div>
      {notHere ? (
        <RowStrip>
          <AutomationAllowHere round={round} runner={runner} cadence={cadence}
            changed={runner.changedSinceAllowed.has(round.id)} sentenceId={allowSentenceId} />
        </RowStrip>
      ) : null}
      {confirmRemove ? (
        <RowStrip>
          <AutomationRemoveConfirm round={round} runner={runner} change={change} onClose={closeConfirm} />
        </RowStrip>
      ) : null}
      {change.failed ? (
        <RowStrip>
          <p role="alert" className="text-body text-[color:var(--color-danger-text)]">{t('changeFailed')}</p>
        </RowStrip>
      ) : null}
    </div>
  );
}

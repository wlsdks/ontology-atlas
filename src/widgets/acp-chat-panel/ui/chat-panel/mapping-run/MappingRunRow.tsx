'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { isMappingActive, mappingFraction, RollingCount, type MappingFigures, type MappingRun } from '@/features/work-run';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { estimateRequests, remainingMinutes } from '@/shared/lib/vault-document/mapping-estimate';
import { MOTION, MOTION_EASE } from '@/shared/motion';
import { WorkProgress } from '@/shared/motion/status-glyphs/WorkProgress';
import { controlClass } from '@/shared/ui';
import { CONTROL_DISABLED_CLASS } from '@/shared/ui/control-class';

import { mappingShare } from '../../../model/use-mapping-run';

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

type RowState = 'notStarted' | MappingRun['phase'];

/** What the one control does in each state: the press that started a run is the one that stops it. */
type RowAction = 'start' | 'stop' | 'none' | 'continue' | 'close';

interface MappingRunRowProps {
  /** This folder's run; null before a press and once an ended one is closed. */
  run: MappingRun | null;
  /** The folder's lines at rest, for the row before a press. */
  resting: MappingFigures | null;
  /** The folder's Auto-approve, read as it is now. */
  autoApprove: boolean;
  /** A press can start a run now: no turn of this conversation runs and the folder is free. */
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
  onHide: () => void;
}

function actionOf(run: MappingRun | null): RowAction {
  if (!run) return 'start';
  switch (run.phase) {
    case 'running':
    case 'asking':
      return 'stop';
    case 'stopping':
      return 'none';
    case 'stopped':
      return run.stopReason === 'switched' ? 'close' : 'continue';
    case 'finished':
      return 'close';
  }
}

function useDuration() {
  const t = useTranslations('workCard.mapping');
  return (minutes: number) => (minutes < MINUTES_PER_HOUR
    ? t('minutes', { minutes: Math.max(1, Math.round(minutes)) })
    : t('hours', { hours: Math.round(minutes / MINUTES_PER_HOUR) }));
}

const COUNT_CLASS = 'font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]';

/** The running request, its count on the map and the time left; each part stays whole, and a wrap never leaves a dot at a line's end. */
function RunningFigures({ run }: { run: MappingRun }) {
  const t = useTranslations('workCard.mapping');
  const locale = useLocale();
  const duration = useDuration();
  const whole = (value: number) => new Intl.NumberFormat(locale).format(value);
  const share = mappingShare(run.now ?? run.start);
  const left = remainingMinutes(run.now?.sum.abilitiesUncovered ?? Number.NaN, run.finished);
  const parts: ReactNode[] = [t('request', { part: run.requestsSent })];
  if (share) {
    parts.push(t.rich('onMap', {
      ...share,
      count: () => <RollingCount value={share.mapped} format={whole} className={COUNT_CLASS} />,
    }));
  }
  if (left !== null && left > 0) parts.push(t('left', { duration: duration(left) }));
  return (
    <span className="block overflow-hidden">
      <span className="-ml-4 flex flex-wrap">
        {parts.map((part, index) => (
          <span
            key={index}
            className="relative whitespace-nowrap pl-4 before:absolute before:left-1.5 before:text-[color:var(--color-text-quaternary)] before:content-['·']"
          >
            {part}
          </span>
        ))}
      </span>
    </span>
  );
}

function useRowCopy(run: MappingRun | null, resting: MappingFigures | null): { title: string; body: ReactNode } {
  const t = useTranslations('workCard.mapping');
  const tTurn = useTranslations('workCard.turn');
  const tChat = useTranslations('acpChat');
  const duration = useDuration();
  if (!run) {
    const share = mappingShare(resting) ?? { mapped: 0, total: 0, percent: 0 };
    const uncovered = resting?.sum.abilitiesUncovered ?? 0;
    const requests = estimateRequests(uncovered);
    return { title: t('startTitle'), body: t('startBody', { ...share, requests, duration: duration(remainingMinutes(uncovered, []) ?? 0) }) };
  }
  const { mapped, total, percent } = mappingShare(run.now ?? run.start) ?? { mapped: 0, total: 0, percent: 0 };
  const { agent, requestsSent: sent } = run;
  switch (run.phase) {
    case 'running':
      return { title: t('title'), body: <RunningFigures run={run} /> };
    case 'asking':
      return { title: t('waitingTitle'), body: t('waitingBody', { agent }) };
    case 'stopping':
      return { title: tTurn('stoppingTitle', { agent }), body: tTurn('stoppingBody', { agent }) };
    case 'finished': {
      const minutes = Math.max(0, (run.endedAt ?? run.startedAt) - run.startedAt) / MS_PER_MINUTE;
      return { title: t('finishedTitle'), body: t('finishedBody', { total, sent, duration: duration(minutes) }) };
    }
    case 'stopped':
      switch (run.stopReason) {
        case 'message':
          return { title: t('stoppedTitle', { percent }), body: t('messageBody') };
        case 'noProgress':
          return { title: t('noProgressTitle'), body: t('noProgressBody', { mapped, total }) };
        case 'pastEstimate':
          return { title: t('pastEstimateTitle'), body: t('pastEstimateBody', { sent, mapped, total }) };
        case 'agentError':
          return { title: tTurn('endedTitle', { agent }), body: t('agentErrorBody', { mapped, total }) };
        case 'usageLimit':
          return { title: tChat('trouble.limit.title'), body: t('usageLimitBody', { mapped, total }) };
        case 'switched':
          return { title: tTurn('switchedTitle'), body: t('switchedBody', { agent, folder: run.folderName, mapped, total }) };
        default:
          return { title: t('stoppedTitle', { percent }), body: t('stoppedBody') };
      }
  }
}

/**
 * A change of state eases the row's height from the height last drawn instead of jumping; under
 * reduced motion it changes in place.
 */
function useEasedHeight(state: RowState) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const drawn = useRef<{ state: RowState; heightPx: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const heightPx = host.getBoundingClientRect().height;
    const previous = drawn.current;
    drawn.current = { state, heightPx };
    if (!previous || previous.state === state || reducedMotion || Math.abs(previous.heightPx - heightPx) < 1) return;
    host.animate(
      [{ height: `${previous.heightPx}px` }, { height: `${heightPx}px` }],
      { duration: MOTION.base.duration * 1_000, easing: `cubic-bezier(${MOTION_EASE.join(',')})` },
    );
  });
  return hostRef;
}

/**
 * The map conversation's one control for mapping the rest of the code: it starts a run, shows how
 * far it has come, stops it and continues it. Its count and bar move once per request.
 */
export function MappingRunRow({ run, resting, autoApprove, canStart, onStart, onStop, onClose, onHide }: MappingRunRowProps) {
  const t = useTranslations('workCard.mapping');
  const tCard = useTranslations('workCard');
  const copy = useRowCopy(run, resting);
  const state: RowState = run ? run.phase : 'notStarted';
  const action = actionOf(run);
  const hostRef = useEasedHeight(state);
  const active = run !== null && isMappingActive(run);
  const fraction = run ? mappingFraction(run) : null;
  const actionWord = action === 'stop' ? tCard('stop') : action === 'continue' ? t('continue') : action === 'close' ? tCard('close') : null;
  const press = { start: onStart, continue: onStart, stop: onStop, close: onClose, none: undefined }[action];
  const disabled = action === 'none' || ((action === 'start' || action === 'continue') && !canStart);

  return (
    <div
      ref={hostRef}
      data-testid="mapping-run-row"
      data-mapping-state={state}
      className={cn(
        'motion-stagger-in relative flex shrink-0 items-start overflow-hidden rounded-card border transition-[background-color,border-color]',
        active
          ? 'border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)]'
          : 'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] has-[[data-mapping-action]:enabled:hover]:bg-[color:var(--color-overlay-2)]',
      )}
    >
      <button
        type="button"
        data-mapping-action={action}
        data-testid="mapping-run-action"
        disabled={disabled}
        onClick={press}
        className={cn(
          CONTROL_DISABLED_CLASS,
          'grid min-w-0 flex-1 gap-0.5 rounded-card p-[var(--card-pad)] text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
        )}
      >
        <span key={state} className="motion-stagger-fade grid min-w-0 gap-0.5">
          <span className="flex min-w-0 items-baseline gap-3">
            <span data-testid="mapping-run-title" className="min-w-0 flex-1 text-body leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {copy.title}
            </span>
            {actionWord ? (
              <span data-testid="mapping-run-word" className="shrink-0 text-body leading-body text-[color:var(--color-text-secondary)]">
                {actionWord}
              </span>
            ) : null}
          </span>
          <span data-testid="mapping-run-body" className="text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
            {copy.body}
          </span>
          {!run && !autoApprove ? (
            <span data-testid="mapping-run-approval" className="text-label leading-label text-[color:var(--color-text-quaternary)]">
              {t('approvalLine')}
            </span>
          ) : null}
        </span>
      </button>
      {!run ? (
        <button
          type="button"
          data-testid="mapping-run-hide"
          onClick={onHide}
          className={cn(
            controlClass({ shape: 'link', size: 'md', tone: 'default', hoverInk: 'strong' }),
            'shrink-0 whitespace-nowrap py-[var(--card-pad)] pr-[var(--card-pad)]',
          )}
        >
          {t('hideForNow')}
        </button>
      ) : null}
      {active ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 h-0.5 [&>[role=progressbar]]:h-full [&>[role=progressbar]]:rounded-none',
            run.phase !== 'running' && '[&_[data-work-sweep]]:[animation-play-state:paused]',
          )}
        >
          <WorkProgress
            phase="running"
            done={fraction ?? 0}
            total={fraction === null ? null : 1}
            label={tCard('progressLabel', { title: copy.title })}
          />
        </div>
      ) : null}
    </div>
  );
}

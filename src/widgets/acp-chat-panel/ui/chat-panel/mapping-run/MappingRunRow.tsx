'use client';

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { isMappingActive, mappingFraction, RollingCount, type MappingFigures, type MappingRun } from '@/features/work-run';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { estimateRequests, remainingMinutes } from '@/shared/lib/vault-document/mapping-estimate';
import { MOTION, MOTION_EASE } from '@/shared/motion';
import { WorkProgress } from '@/shared/motion/status-glyphs/WorkProgress';
import { Button, controlClass } from '@/shared/ui';

import { mappingShare } from '../../../model/use-mapping-run';
import { useMappingDuration } from './use-mapping-duration';

const MS_PER_MINUTE = 60_000;

type RowState = 'notStarted' | MappingRun['phase'];

/** What the one control does in each state: the press that started a run is the one that stops it. */
type RowAction = 'start' | 'stop' | 'none' | 'continue' | 'close';

interface MappingRunRowProps {
  /** This folder's run; null before a press and once an ended one is closed. */
  run: MappingRun | null;
  /** The widest project line at rest, for the row before a press. */
  resting: MappingFigures | null;
  /** The folder keeps Auto-approve on, which answers the run's requests in their new conversations. */
  autoApprove: boolean;
  /** The not-started row stands on one line: its title, its count, what waits for an answer, and Start. */
  collapsed: boolean;
  /** A press can start a run now: no turn of this conversation runs and the folder is free. */
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
  onCollapse: () => void;
  onExpand: () => void;
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

const COUNT_CLASS = 'font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]';

/** The running request, its count on the map and the time left; each part stays whole, and a wrap never leaves a dot at a line's end. */
function RunningFigures({ run }: { run: MappingRun }) {
  const t = useTranslations('workCard.mapping');
  const locale = useLocale();
  const duration = useMappingDuration();
  const whole = (value: number) => new Intl.NumberFormat(locale).format(value);
  const share = mappingShare(run.now ?? run.start);
  const left = remainingMinutes(run.now?.abilitiesUncovered ?? Number.NaN, run.finished);
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
  const duration = useMappingDuration();
  if (!run) {
    const share = mappingShare(resting) ?? { mapped: 0, total: 0, percent: 0 };
    const uncovered = resting?.abilitiesUncovered ?? 0;
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
        case 'cancelled':
          return { title: t('cancelledTitle'), body: t('stoppedBody') };
        case 'noProgress':
          return { title: t('noProgressTitle'), body: t('noProgressBody', { mapped, total }) };
        case 'pastEstimate':
          return { title: t('pastEstimateTitle'), body: t('pastEstimateBody', { sent, mapped, total }) };
        case 'lineLost':
          return { title: t('lineLostTitle'), body: mappingShare(run.now ?? run.start) ? t('lineLostBody', { mapped, total }) : t('stoppedBody') };
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
function useEasedHeight(state: RowState | 'collapsed') {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const drawn = useRef<{ state: RowState | 'collapsed'; heightPx: number } | null>(null);
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
 * The press that swaps the one-line row and the full row leaves its own control: focus lands on
 * the control that swaps back, so the keyboard never drops to the page.
 */
function useFocusAcrossSwap(host: RefObject<HTMLDivElement | null>, oneLine: boolean) {
  const pressed = useRef(false);
  useLayoutEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    host.current?.querySelector<HTMLElement>(`[data-swap-focus="${oneLine ? 'expand' : 'collapse'}"]`)?.focus();
  }, [host, oneLine]);
  return () => {
    pressed.current = true;
  };
}

/**
 * The map conversation's row for mapping the rest of the code. One worded button keeps one seat
 * through every state (Start, Stop, Continue, Close), so the control that starts a run stops it.
 * Its count and bar move once per request.
 */
export function MappingRunRow({ run, resting, autoApprove, canStart, collapsed, onStart, onStop, onClose, onCollapse, onExpand }: MappingRunRowProps) {
  const t = useTranslations('workCard.mapping');
  const tCard = useTranslations('workCard');
  const copy = useRowCopy(run, resting);
  const state: RowState = run ? run.phase : 'notStarted';
  const oneLine = collapsed && !run;
  const action = actionOf(run);
  const hostRef = useEasedHeight(oneLine ? 'collapsed' : state);
  const swapFocus = useFocusAcrossSwap(hostRef, oneLine);
  const active = run !== null && isMappingActive(run);
  const fraction = run ? mappingFraction(run) : null;
  const actionWord = { start: t('start'), stop: tCard('stop'), none: tCard('stop'), continue: t('continue'), close: tCard('close') }[action];
  const press = { start: onStart, continue: onStart, stop: onStop, close: onClose, none: undefined }[action];
  const disabled = action === 'none' || ((action === 'start' || action === 'continue') && !canStart);
  const collapse = (
    <button
      type="button"
      data-testid="mapping-run-collapse"
      data-swap-focus="collapse"
      onClick={() => {
        swapFocus();
        onCollapse();
      }}
      className={cn(
        controlClass({ shape: 'link', size: 'sm', tone: 'default', hoverInk: 'strong' }),
        'ml-2 inline min-h-0 whitespace-nowrap align-baseline text-label leading-label',
      )}
    >
      {t('showLess')}
    </button>
  );
  const button = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-testid="mapping-run-action"
      data-mapping-action={action}
      disabled={disabled}
      onClick={press}
      className="shrink-0"
    >
      {actionWord}
    </Button>
  );

  if (oneLine) {
    const share = mappingShare(resting);
    return (
      <div
        ref={hostRef}
        data-testid="mapping-run-row"
        data-mapping-state={state}
        data-collapsed="true"
        className="motion-stagger-in relative flex shrink-0 items-center gap-3 overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-[var(--card-pad)] py-1.5"
      >
        {/* What waits for an answer never gives way; in a narrow dock the title does, its full text still its name. */}
        <p key="collapsed" className="motion-stagger-fade flex min-w-0 flex-1 items-baseline gap-2">
          <button
            type="button"
            data-testid="mapping-run-title"
            data-swap-focus="expand"
            aria-expanded={false}
            title={t('showMore')}
            onClick={() => {
              swapFocus();
              onExpand();
            }}
            className={cn(
              controlClass({ shape: 'link', size: 'sm', tone: 'default', hoverInk: 'strong' }),
              'min-h-0 min-w-0 text-body leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]',
            )}
          >
            <span className="truncate">{copy.title}</span>
          </button>
          {share ? (
            <span data-testid="mapping-run-body" className="shrink-0 whitespace-nowrap text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
              {t('mappedShort', { percent: share.percent })}
            </span>
          ) : null}
          <span
            data-testid="mapping-run-approval"
            title={t(autoApprove ? 'approvalAuto' : 'approvalLine')}
            className="shrink-0 whitespace-nowrap text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            {t(autoApprove ? 'approvalAutoShort' : 'approvalLineShort')}
          </span>
        </p>
        {button}
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      data-testid="mapping-run-row"
      data-mapping-state={state}
      className={cn(
        'motion-stagger-in relative flex shrink-0 items-start gap-3 overflow-hidden rounded-card border p-[var(--card-pad)] transition-[background-color,border-color]',
        active
          ? 'border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)]'
          : 'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]',
      )}
    >
      <div key={state} className="motion-stagger-fade grid min-w-0 flex-1 gap-0.5">
        <p data-testid="mapping-run-title" className="text-body leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {copy.title}
        </p>
        <p className="text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
          <span data-testid="mapping-run-body">{copy.body}</span>
        </p>
        {run ? null : (
          <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
            <span data-testid="mapping-run-approval">{t(autoApprove ? 'approvalAuto' : 'approvalLine')}</span>
            {collapse}
          </p>
        )}
      </div>
      {button}
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

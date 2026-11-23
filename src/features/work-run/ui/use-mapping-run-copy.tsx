'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { remainingMinutes } from '@/shared/lib/vault-document/mapping-estimate';

import { mappingFraction, type MappingRun } from '../model/mapping-run';
import type { TurnRunLine } from '../model/turn-run';
import type { MoruState } from './WorkRunMoru';
import type { MeaningFigure } from './use-meaning-run-copy';
import type { SeatTint } from './use-scheduled-run-copy';
import { lineKind, useTurnLineText } from './use-turn-run-copy';
import type { WorkRunMarks } from './use-work-run-copy';

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

/** The activity line redraws at most once a second, however often the agent reports. */
export const MAPPING_LINE_STEP_MS = 1_000;

export interface MappingRunCopy {
  title: string;
  /** What the agent does now while it runs; the state's sentence otherwise. */
  detail: ReactNode;
  /** The request, the count on the map and the time left, only while a request runs. */
  figures: ReactNode | null;
  /** Abilities on the map over those found, for the bar; null before any line was read. */
  fraction: number | null;
  /**
   * A stop the person can continue from. Continue opens the map's conversation, whose row starts the
   * next run and which also shows what the agent did, so one door serves both.
   */
  continues: boolean;
  tint: SeatTint;
  moru: MoruState;
}

/** On the map out of found, by the widest project's line, as the card states it. */
export function mappingCounts(run: MappingRun): { mapped: number; total: number; percent: number } | null {
  const figures = run.now ?? run.start;
  if (figures === null) return null;
  const { abilitiesTotal: total, abilitiesUncovered: uncovered } = figures.widest;
  const mapped = Math.max(0, total - uncovered);
  // Floored, so one ability off the map never reads as 100%.
  return { mapped, total, percent: total > 0 ? Math.floor((mapped / total) * 100) : 0 };
}

export function mappingTint(run: MappingRun): SeatTint {
  if (run.phase === 'finished') return 'success';
  return run.phase === 'stopped' ? 'amber' : 'running';
}

function mappingMoru(run: MappingRun): MoruState {
  const line = { kind: lineKind(run.line) };
  switch (run.phase) {
    case 'running':
      return { phase: 'running', line };
    case 'asking':
    case 'stopping':
      return { phase: 'asking', line };
    case 'finished':
      return { phase: 'clean', line: { kind: 'writing' } };
    case 'stopped':
      return { phase: 'failed', line: { kind: 'writing' } };
  }
}

/**
 * The line last drawn, replaced at most once a step: a report inside the step waits for its end
 * and only the latest is kept, so a busy agent never redraws the card faster than once a second.
 */
export function usePacedLine(line: TurnRunLine): TurnRunLine {
  const [shown, setShown] = useState(line);
  const shownAt = useRef(Number.NEGATIVE_INFINITY);
  const key = JSON.stringify(line);
  const shownKey = JSON.stringify(shown);
  useEffect(() => {
    if (key === shownKey) return undefined;
    const timer = window.setTimeout(() => {
      shownAt.current = Date.now();
      setShown(line);
    }, Math.max(0, shownAt.current + MAPPING_LINE_STEP_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [key, shownKey, line]);
  return shown;
}

/** What a mapping run says on the card and in the Runs list; its figures change only when a request ends. */
export function useMappingRunCopy(run: MappingRun, line: TurnRunLine, marks: WorkRunMarks, figure: MeaningFigure): MappingRunCopy {
  const t = useTranslations('workCard.mapping');
  const tTurn = useTranslations('workCard.turn');
  const tChat = useTranslations('acpChat');
  const locale = useLocale();
  const lineText = useTurnLineText(marks);
  const whole = (value: number) => new Intl.NumberFormat(locale).format(value);
  const duration = (minutes: number) => (minutes < MINUTES_PER_HOUR
    ? t('minutes', { minutes: Math.max(1, Math.round(minutes)) })
    : t('hours', { hours: Math.round(minutes / MINUTES_PER_HOUR) }));
  const counts = mappingCounts(run) ?? { mapped: 0, total: 0, percent: 0 };
  const { mapped, total, percent } = counts;
  const agent = run.agent;
  const sent = run.requestsSent;
  const continues = run.phase === 'stopped' && run.stopReason !== 'switched';
  const base = { fraction: mappingFraction(run), continues, tint: mappingTint(run), moru: mappingMoru(run) };

  switch (run.phase) {
    case 'running': {
      const left = remainingMinutes(run.now?.sum.abilitiesUncovered ?? Number.NaN, run.finished);
      const parts: ReactNode[] = [t('request', { part: sent })];
      if (mappingCounts(run)) parts.push(t.rich('onMap', { total, percent, mapped, count: () => figure(mapped, whole) }));
      if (left !== null && left > 0) parts.push(t('left', { duration: duration(left) }));
      // Each part stays whole, so a narrow card wraps only between parts.
      const figures = parts.flatMap((part, index) => {
        const unbroken = <span key={`part-${index}`} className="whitespace-nowrap">{part}</span>;
        return index === 0 ? [unbroken] : [<Separator key={`dot-${index}`} />, unbroken];
      });
      return { ...base, title: t('title'), detail: lineText(line), figures: <>{figures}</> };
    }
    case 'asking':
      return { ...base, title: t('waitingTitle'), detail: t('waitingBody', { agent }), figures: null };
    case 'stopping':
      return { ...base, title: tTurn('stoppingTitle', { agent }), detail: tTurn('stoppingBody', { agent }), figures: null };
    case 'finished': {
      const minutes = Math.max(0, (run.endedAt ?? run.startedAt) - run.startedAt) / MS_PER_MINUTE;
      return { ...base, title: t('finishedTitle'), detail: t('finishedBody', { total, sent, duration: duration(minutes) }), figures: null };
    }
    case 'stopped':
      switch (run.stopReason) {
        case 'message':
          return { ...base, title: t('stoppedTitle', { percent }), detail: t('messageBody'), figures: null };
        case 'noProgress':
          return { ...base, title: t('noProgressTitle'), detail: t('noProgressBody', { mapped, total }), figures: null };
        case 'pastEstimate':
          return { ...base, title: t('pastEstimateTitle'), detail: t('pastEstimateBody', { sent, mapped, total }), figures: null };
        case 'agentError':
          return { ...base, title: tTurn('endedTitle', { agent }), detail: t('agentErrorBody', { mapped, total }), figures: null };
        case 'usageLimit':
          return { ...base, title: tChat('trouble.limit.title'), detail: t('usageLimitBody', { mapped, total }), figures: null };
        case 'switched':
          return { ...base, title: tTurn('switchedTitle'), detail: t('switchedBody', { agent, folder: run.folderName, mapped, total }), figures: null };
        default:
          return { ...base, title: t('stoppedTitle', { percent }), detail: t('stoppedBody'), figures: null };
      }
  }
}

function Separator() {
  return <span aria-hidden className="px-1.5 text-[color:var(--color-text-quaternary)]">·</span>;
}

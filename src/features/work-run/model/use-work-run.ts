'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { elapsedParts } from '@/shared/lib/agent-activity/elapsed';

import { isMeaningActive, type MeaningProgress } from './meaning-run';
import { isScheduledActive, type ScheduledRun } from './scheduled-run';
import { elapsedMs, isRunActive, type WorkRun } from './work-run';
import { workRuns, type SeatRun, type WorkRunSnapshot } from './work-run-store';

export function useWorkRunSnapshot(): WorkRunSnapshot {
  return useSyncExternalStore(workRuns.subscribe, workRuns.read, workRuns.readServer);
}

/** The run that belongs to this folder, or null: another folder's run is never shown here. */
export function useFolderWorkRun(folder: string): WorkRun | null {
  const { run } = useWorkRunSnapshot();
  return run && run.folder === folder ? run : null;
}

/** A run takes the card while its card is open and its own stage is not on screen. */
function holdsSeat(entry: SeatRun, snapshot: WorkRunSnapshot): boolean {
  const { run } = entry;
  if (run.card !== 'open' || run.phase === 'stopped') return false;
  if (entry.kind === 'meaning') return entry.run.folder === snapshot.folder && !snapshot.meaningStage;
  return entry.kind === 'check'
    ? snapshot.stageFolder !== entry.run.folder
    : !snapshot.automationsShown && entry.run.folder === snapshot.folder;
}

/** The runs the card speaks for, oldest first: the card names the last, the person's latest. */
export function seatRuns(snapshot: WorkRunSnapshot): SeatRun[] {
  return [...snapshot.runs.values()]
    .filter((entry) => holdsSeat(entry, snapshot))
    .sort((a, b) => a.run.startedAt - b.run.startedAt);
}

/**
 * The run the Library tile's ring follows: the wiki check or the meaning preparation of the open
 * folder, whichever the card names while it works, else the one started last.
 */
export function libraryRingRun(snapshot: WorkRunSnapshot, folder: string): SeatRun | null {
  const working = [...snapshot.runs.values()]
    .filter((entry) => entry.kind !== 'scheduled' && entry.run.folder === folder && isSeatRunActive(entry))
    .sort((a, b) => a.run.startedAt - b.run.startedAt);
  const named = seatRuns(snapshot).at(-1);
  return working.find((entry) => entry.key === named?.key) ?? working.at(-1) ?? null;
}

export function workCardHoldsSeat(snapshot: WorkRunSnapshot): boolean {
  for (const entry of snapshot.runs.values()) if (holdsSeat(entry, snapshot)) return true;
  return false;
}

export function isSeatRunActive(entry: SeatRun): boolean {
  if (entry.kind === 'meaning') return isMeaningActive(entry.run);
  return entry.kind === 'check' ? isRunActive(entry.run) : isScheduledActive(entry.run);
}

/** The meaning run's figures, at most four times a second; read only by the leaves that draw them. */
export function useMeaningProgress(): MeaningProgress | null {
  return useSyncExternalStore(workRuns.subscribeMeaningProgress, workRuns.readMeaningProgress, () => null);
}

/** The open folder's scheduled runs, oldest first; another folder's never show here. */
export function useScheduledRuns(): ScheduledRun[] {
  const snapshot = useWorkRunSnapshot();
  const runs: ScheduledRun[] = [];
  for (const entry of snapshot.runs.values()) {
    if (entry.kind === 'scheduled' && entry.run.folder === snapshot.folder) runs.push(entry.run);
  }
  return runs;
}

/** Registers Automations as the stage of every scheduled run while it is mounted. */
export function useAutomationsStage(shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    workRuns.enterAutomations();
    return () => workRuns.leaveAutomations();
  }, [shown]);
}

/** Ticks once a second while the run is active and stops in the render that ends it. */
export function useWorkRunElapsed(run: Pick<WorkRun, 'phase' | 'startedAt' | 'endedAt'> | ScheduledRun | null): string | null {
  const t = useTranslations('acpChat');
  const active = run !== null && (run.phase === 'running' || run.phase === 'asking');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!run) return null;
  const { hours, minutes, seconds } = elapsedParts(elapsedMs(run, Math.max(now, run.startedAt)));
  if (hours > 0) return t('elapsedHours', { hours, minutes });
  if (minutes > 0) return t('elapsedMinutes', { minutes, seconds });
  return t('elapsedSeconds', { seconds });
}

/** Registers the Check results stage for a folder while it is mounted, so the card stands down. */
export function useWorkRunStage(folder: string, shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    workRuns.enterStage(folder);
    return () => workRuns.leaveStage(folder);
  }, [folder, shown]);
}

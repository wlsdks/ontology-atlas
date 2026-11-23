'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { elapsedParts } from '@/shared/lib/agent-activity/elapsed';

import { isMappingActive, type MappingRun } from './mapping-run';
import { isMeaningActive, type MeaningProgress } from './meaning-run';
import { isScheduledActive, type ScheduledRun } from './scheduled-run';
import { elapsedMs, isRunActive, type WorkRun } from './work-run';
import { isTurnActive, type TurnRun } from './turn-run';
import { workRuns, type SeatRun, type WorkRunSnapshot } from './work-run-store';

export function useWorkRunSnapshot(): WorkRunSnapshot {
  return useSyncExternalStore(workRuns.subscribe, workRuns.read, workRuns.readServer);
}

export function useFolderWorkRun(folder: string): WorkRun | null {
  const { run } = useWorkRunSnapshot();
  return run && run.folder === folder ? run : null;
}

function holdsSeat(entry: SeatRun, snapshot: WorkRunSnapshot): boolean {
  if (entry.kind === 'turn') return entry.run.card === 'open' && snapshot.turnStage !== entry.run.owner;
  if (entry.kind === 'mapping') return entry.run.card === 'open' && snapshot.mappingStage !== entry.run.folder;
  const { run } = entry;
  if (run.card !== 'open' || run.phase === 'stopped') return false;
  if (entry.kind === 'meaning') return entry.run.folder === snapshot.folder && !snapshot.meaningStage;
  return entry.kind === 'check'
    ? snapshot.stageFolder !== entry.run.folder
    : !snapshot.automationsShown && entry.run.folder === snapshot.folder;
}

const asking = (entry: SeatRun) => (entry.kind === 'turn' || entry.kind === 'mapping') && entry.run.phase === 'asking';

/**
 * The runs the card speaks for, oldest first: the card names the last, the person's latest,
 * unless a turn waits for permission, which takes the card over a run that is only working.
 */
export function seatRuns(snapshot: WorkRunSnapshot): SeatRun[] {
  return [...snapshot.runs.values()]
    .filter((entry) => holdsSeat(entry, snapshot))
    .sort((a, b) => Number(asking(a)) - Number(asking(b)) || a.run.startedAt - b.run.startedAt);
}

/**
 * The run the Library tile's ring follows: the wiki check, a writing turn or the meaning
 * preparation of the open folder, whichever the card names while it works, else the one started
 * last. A mapping run rings the map tile instead.
 */
export function libraryRingRun(snapshot: WorkRunSnapshot, folder: string): SeatRun | null {
  const working = [...snapshot.runs.values()]
    .filter((entry) => entry.kind !== 'scheduled' && entry.kind !== 'mapping' && entry.run.folder === folder && isSeatRunActive(entry))
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
  if (entry.kind === 'mapping') return isMappingActive(entry.run);
  if (entry.kind === 'turn') return isTurnActive(entry.run);
  return entry.kind === 'check' ? isRunActive(entry.run) : isScheduledActive(entry.run);
}

/** The meaning run's figures, at most four times a second; read only by the leaves that draw them. */
export function useMeaningProgress(): MeaningProgress | null {
  return useSyncExternalStore(workRuns.subscribeMeaningProgress, workRuns.readMeaningProgress, () => null);
}

/** This folder's Library turn that is still running, wherever its conversation is. */
export function useActiveTurn(folder: string): TurnRun | null {
  const { runs } = useWorkRunSnapshot();
  for (const entry of runs.values()) {
    if (entry.kind === 'turn' && entry.run.folder === folder && isTurnActive(entry.run)) return entry.run;
  }
  return null;
}

export function folderMappingRun(snapshot: WorkRunSnapshot, folder: string): MappingRun | null {
  const entry = snapshot.runs.get(`mapping:${folder}`);
  return entry?.kind === 'mapping' ? entry.run : null;
}

/** This folder's mapping run, running or ended and not yet closed, wherever its conversation is. */
export function useFolderMappingRun(folder: string): MappingRun | null {
  return folderMappingRun(useWorkRunSnapshot(), folder);
}

/** Registers the map conversation's mapping row as the stage of the folder's run while it is on screen. */
export function useMappingStage(folder: string, shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    workRuns.enterMappingStage(folder);
    return () => workRuns.leaveMappingStage(folder);
  }, [folder, shown]);
}

/** Registers a conversation as the stage of the turn it runs while it is on screen. */
export function useTurnStage(owner: string, shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    workRuns.enterTurnStage(owner);
    return () => workRuns.leaveTurnStage(owner);
  }, [owner, shown]);
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
export function useWorkRunElapsed(run: Pick<WorkRun, 'phase' | 'startedAt' | 'endedAt'> | ScheduledRun | Pick<TurnRun, 'phase' | 'startedAt' | 'endedAt'> | null): string | null {
  const t = useTranslations('acpChat');
  const active = run !== null && (run.phase === 'running' || run.phase === 'asking' || run.phase === 'stopping');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!run) return null;
  return elapsedLabel(t, elapsedMs(run, Math.max(now, run.startedAt)));
}

function elapsedLabel(t: ReturnType<typeof useTranslations<'acpChat'>>, ms: number): string {
  const { hours, minutes, seconds } = elapsedParts(ms);
  if (hours > 0) return t('elapsedHours', { hours, minutes });
  if (minutes > 0) return t('elapsedMinutes', { minutes, seconds });
  return t('elapsedSeconds', { seconds });
}

/** The time a request has waited, ticking once a second; it reads the real time on every tick. */
export function useWaitedLabel(since: number | null): string | null {
  const t = useTranslations('acpChat');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since === null ? null : elapsedLabel(t, Math.max(0, now - since));
}

/** Registers the Check results stage for a folder while it is mounted, so the card stands down. */
export function useWorkRunStage(folder: string, shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    workRuns.enterStage(folder);
    return () => workRuns.leaveStage(folder);
  }, [folder, shown]);
}

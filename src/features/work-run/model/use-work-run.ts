'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { elapsedParts } from '@/shared/lib/agent-activity/elapsed';

import { elapsedMs, isRunActive, type WorkRun } from './work-run';
import { isCountedActive, type CountedProgress, type CountedRun } from './counted-run';
import { workRuns, type WorkRunSnapshot } from './work-run-store';

export function useWorkRunSnapshot(): WorkRunSnapshot {
  return useSyncExternalStore(workRuns.subscribe, workRuns.read, workRuns.readServer);
}

const noProgress = () => null;

/** The counted run's figures, at most a few times a second; read only where they are drawn. */
export function useCountedProgress(): CountedProgress | null {
  return useSyncExternalStore(workRuns.subscribeProgress, workRuns.readProgress, noProgress);
}

/** One of the two runs the seat can carry. */
export type SeatRun = { kind: 'check'; run: WorkRun } | { kind: 'meaning'; run: CountedRun };

function checkHoldsSeat({ run, stageFolder }: WorkRunSnapshot): boolean {
  return run !== null && run.card === 'open' && run.phase !== 'stopped' && stageFolder !== run.folder;
}

function countedHoldsSeat({ counted, countedStage }: WorkRunSnapshot): boolean {
  return counted !== null && counted.card === 'open' && counted.phase !== 'stopped' && !countedStage;
}

const startedAt = (seat: SeatRun) => seat.run.startedAt;

/** The run whose card holds the seat: of two that could, the one the person started last. */
export function seatRun(snapshot: WorkRunSnapshot): SeatRun | null {
  const check: SeatRun | null = checkHoldsSeat(snapshot) && snapshot.run ? { kind: 'check', run: snapshot.run } : null;
  const meaning: SeatRun | null = countedHoldsSeat(snapshot) && snapshot.counted ? { kind: 'meaning', run: snapshot.counted } : null;
  if (check && meaning) return startedAt(meaning) > startedAt(check) ? meaning : check;
  return check ?? meaning;
}

/** Every run still working, the later started first. */
export function activeRuns(snapshot: WorkRunSnapshot): SeatRun[] {
  const runs: SeatRun[] = [];
  if (isRunActive(snapshot.run) && snapshot.run) runs.push({ kind: 'check', run: snapshot.run });
  if (isCountedActive(snapshot.counted) && snapshot.counted) runs.push({ kind: 'meaning', run: snapshot.counted });
  return runs.sort((a, b) => startedAt(b) - startedAt(a));
}

/** The ring follows the run the card would show, else the latest still working. */
export function ringRun(snapshot: WorkRunSnapshot): SeatRun | null {
  const seat = seatRun(snapshot);
  const active = activeRuns(snapshot);
  return active.find((entry) => entry.kind === seat?.kind) ?? active[0] ?? null;
}

/** The run that belongs to this folder, or null: another folder's run is never shown here. */
export function useFolderWorkRun(folder: string): WorkRun | null {
  const { run } = useWorkRunSnapshot();
  return run && run.folder === folder ? run : null;
}

/** A card holds the seat while it is open and its run's own stage is not on screen. */
export function workCardHoldsSeat(snapshot: WorkRunSnapshot): boolean {
  return seatRun(snapshot) !== null;
}

/** Ticks once a second while the run is active and stops in the render that ends it. */
export function useWorkRunElapsed(run: WorkRun | null): string | null {
  const t = useTranslations('acpChat');
  const active = isRunActive(run);
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

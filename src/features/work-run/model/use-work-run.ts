'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { elapsedParts } from '@/shared/lib/agent-activity/elapsed';

import { elapsedMs, isRunActive, type WorkRun } from './work-run';
import { workRuns, type WorkRunSnapshot } from './work-run-store';

export function useWorkRunSnapshot(): WorkRunSnapshot {
  return useSyncExternalStore(workRuns.subscribe, workRuns.read, workRuns.readServer);
}

/** The run that belongs to this folder, or null: another folder's run is never shown here. */
export function useFolderWorkRun(folder: string): WorkRun | null {
  const { run } = useWorkRunSnapshot();
  return run && run.folder === folder ? run : null;
}

/** The card holds the seat while it is open and the run's own stage is not on screen. */
export function workCardHoldsSeat(snapshot: WorkRunSnapshot): boolean {
  const { run, stageFolder } = snapshot;
  return run !== null && run.card === 'open' && run.phase !== 'stopped' && stageFolder !== run.folder;
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

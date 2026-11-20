'use client';

import { useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF, withQuery } from '@/shared/config/destinations';
import { navigateWithViewTransition } from '@/shared/lib/navigation/route-view-transition';

import type { ScheduledRun } from '../model/scheduled-run';
import { workRuns, type TurnDoor, type WorkRunDoor } from '../model/work-run-store';

export function useCheckDoor() {
  const router = useRouter();
  return (kind: WorkRunDoor) => {
    workRuns.openDoor(kind);
    navigateWithViewTransition(() => router.push(DESTINATION_HREF.library));
  };
}

/** A turn's door opens the Library, which seats the turn's conversation or the page it wrote. */
export function useTurnDoor() {
  const router = useRouter();
  return (door: TurnDoor) => {
    workRuns.openTurnDoor(door);
    navigateWithViewTransition(() => router.push(DESTINATION_HREF.library));
  };
}

/** Where a scheduled run's result is read: its schedule's history, landing on its own entry. */
export function scheduledRunHref(run: ScheduledRun): string {
  return withQuery(DESTINATION_HREF.automations, { kind: run.lane, round: run.roundId, run: run.id });
}

export function useOpenScheduledRun() {
  const router = useRouter();
  return (run: ScheduledRun) => {
    workRuns.closeRun(`scheduled:${run.id}`);
    navigateWithViewTransition(() => router.push(scheduledRunHref(run)));
  };
}


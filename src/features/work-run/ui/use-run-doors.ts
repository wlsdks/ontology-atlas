import { usePathname, useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF, withQuery } from '@/shared/config/destinations';
import { requestAgentChat } from '@/shared/lib/agent-chat/agent-chat-intent';
import { beginMapNavigation } from '@/shared/lib/navigation/map-navigation-pending';
import { resolveActiveNavDestination } from '@/shared/lib/navigation/nav-destination';
import { navigateWithViewTransition } from '@/shared/lib/navigation/route-view-transition';

import type { ScheduledRun } from '../model/scheduled-run';
import { workRuns, type TurnDoor, type WorkRunDoor } from '../model/work-run-store';

export function useCheckDoor() {
  const router = useRouter();
  return (kind: WorkRunDoor) => {
    workRuns.openDoor(kind);
    navigateWithViewTransition(DESTINATION_HREF.library, () => router.push(DESTINATION_HREF.library));
  };
}

/** A turn's door opens the Library, which seats the turn's conversation or the page it wrote. */
export function useTurnDoor() {
  const router = useRouter();
  return (door: TurnDoor) => {
    workRuns.openTurnDoor(door);
    navigateWithViewTransition(DESTINATION_HREF.library, () => router.push(DESTINATION_HREF.library));
  };
}

/** How long a door off the map keeps asking the map's conversation to open while the map loads. */
export const MAP_CONVERSATION_WAIT_MS = 15_000;
const ASK_AGAIN_MS = 200;

/**
 * Opens the map's conversation, where a mapping run's row lives, with nothing sent: a request
 * without a prompt only opens the dock. Off the map it goes there first and asks again until the
 * map's dock accepts, since a queued request without a runtime is dropped.
 */
export function useMapConversationDoor() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  return () => {
    if (requestAgentChat(null, null)) return;
    if (resolveActiveNavDestination(pathname) !== 'map') {
      const href = DESTINATION_HREF.map;
      beginMapNavigation(() => router.push(href), pathname + window.location.search);
    }
    const until = Date.now() + MAP_CONVERSATION_WAIT_MS;
    const timer = window.setInterval(() => {
      if (requestAgentChat(null, null) || Date.now() >= until) window.clearInterval(timer);
    }, ASK_AGAIN_MS);
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
    const href = scheduledRunHref(run);
    navigateWithViewTransition(href, () => router.push(href));
  };
}


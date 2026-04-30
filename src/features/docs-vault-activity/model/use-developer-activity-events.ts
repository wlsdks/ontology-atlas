'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { DeveloperActivityEvent } from '@/entities/docs-vault';
import {
  readDeveloperActivityEvents,
  subscribeRemoteDeveloperActivityEvents,
  subscribeDeveloperActivityEvents,
} from './activity-store';

const EMPTY_EVENTS: DeveloperActivityEvent[] = [];

export function useDeveloperActivityEvents(accountId?: string | null) {
  const localEvents = useSyncExternalStore(
    subscribeDeveloperActivityEvents,
    readDeveloperActivityEvents,
    () => EMPTY_EVENTS,
  );
  const [remoteEvents, setRemoteEvents] =
    useState<DeveloperActivityEvent[]>(EMPTY_EVENTS);

  useEffect(() => {
    const unsubscribe = subscribeRemoteDeveloperActivityEvents(
      accountId,
      setRemoteEvents,
      (err) => {
        if (typeof console !== 'undefined') {
          console.warn('[docs-vault-activity] subscribe failed:', err);
        }
      },
    );
    return unsubscribe;
  }, [accountId]);

  return useMemo(
    () => mergeDeveloperActivityEvents(localEvents, remoteEvents),
    [localEvents, remoteEvents],
  );
}

function mergeDeveloperActivityEvents(
  localEvents: DeveloperActivityEvent[],
  remoteEvents: DeveloperActivityEvent[],
): DeveloperActivityEvent[] {
  const byId = new Map<string, DeveloperActivityEvent>();
  for (const event of remoteEvents) byId.set(event.id, event);
  for (const event of localEvents) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  return [...byId.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
}

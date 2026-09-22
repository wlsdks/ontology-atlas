'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  COMPANION_STORAGE_KEY, EMPTY_JOURNAL, appendCompanionMemory, parseCompanionJournal,
  type CompanionMemory, type CompanionJournal,
} from './companion-journal';

const UPDATED = 'atlas-companion-journal-updated';
const UNAVAILABLE = '__storage_unavailable__';
function read() {
  try { return window.localStorage.getItem(COMPANION_STORAGE_KEY); }
  catch { return UNAVAILABLE; }
}
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === COMPANION_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(UPDATED, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(UPDATED, listener);
  };
}
function write(journal: CompanionJournal): boolean {
  try {
    window.localStorage.setItem(COMPANION_STORAGE_KEY, JSON.stringify(journal));
    window.dispatchEvent(new Event(UPDATED));
    return true;
  } catch { return false; }
}
const serverSnapshot = () => null;

export function useCompanionJournal() {
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  const parsed = useMemo(() => parseCompanionJournal(raw), [raw]);
  return {
    journal: parsed ?? EMPTY_JOURNAL,
    unreadable: parsed === null,
    save(memory: CompanionMemory) {
      // Read at the event boundary so another mounted home/tab cannot be overwritten by a stale render.
      const current = parseCompanionJournal(read());
      const next = current && appendCompanionMemory(current, memory);
      return next ? write(next) : false;
    },
    remove(id: string) {
      const current = parseCompanionJournal(read());
      return current ? write({ version: 1, memories: current.memories.filter((m) => m.id !== id) }) : false;
    },
    reset: () => write(EMPTY_JOURNAL),
  };
}

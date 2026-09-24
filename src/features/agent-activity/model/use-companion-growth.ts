'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { addGrowthEntry, EMPTY_GROWTH, GROWTH_PREFIX, parseCompanionGrowth, reviseGrowthReflection, type GrowthEntry, type ReflectionKind } from './companion-growth';
const UPDATED = 'atlas-companion-growth-updated';
const serverSnapshot = () => null;
const read = (key: string | null) => {
  if (!key) return null;
  try { return localStorage.getItem(key); } catch { return '__unavailable__'; }
};
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(UPDATED, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(UPDATED, listener); };
}
export function useCompanionGrowth(project: string | null) {
  const key = project ? GROWTH_PREFIX + project : null;
  const snapshot = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const parsed = useMemo(() => parseCompanionGrowth(raw), [raw]);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const record = useCallback((entry: GrowthEntry) => {
    if (!key) return false;
    const current = parseCompanionGrowth(read(key));
    const next = current && addGrowthEntry(current, entry);
    if (!next) { setFailedKey(key); return false; }
    if (next === current) return true;
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setFailedKey(null);
      window.dispatchEvent(new Event(UPDATED));
      return true;
    } catch { setFailedKey(key); return false; }
  }, [key]);
  const reset = useCallback(() => {
    if (!key) return false;
    try {
      localStorage.setItem(key, JSON.stringify(EMPTY_GROWTH));
      setFailedKey(null);
      window.dispatchEvent(new Event(UPDATED));
      return true;
    } catch { setFailedKey(key); return false; }
  }, [key]);
  const revise = useCallback((uid: string, note: string, reflection: ReflectionKind) => {
    if (!key) return false;
    const current = parseCompanionGrowth(read(key));
    const next = current && reviseGrowthReflection(current, uid, note, reflection);
    if (!next) return false;
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setFailedKey(null);
      window.dispatchEvent(new Event(UPDATED));
      return true;
    } catch { setFailedKey(key); return false; }
  }, [key]);
  return { growth: parsed ?? EMPTY_GROWTH, unreadable: parsed === null, failed: key !== null && failedKey === key, record, reset, revise };
}

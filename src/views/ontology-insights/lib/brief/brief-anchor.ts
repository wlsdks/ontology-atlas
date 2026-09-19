import { useCallback, useSyncExternalStore } from 'react';

/**
 * **When this reader last looked at the brief**, per vault — the anchor every "since"
 * count in the brief is measured from.
 *
 * It is a fact about a reader, not about the folder, so it lives in this browser only and
 * never reaches the vault (same reasoning as `unmatched-dismissals.ts`). It is scoped to the
 * vault's identity scope for the reason the notification box learned on 2026-08-01: one
 * global key made one folder's visit mark another folder's items seen.
 *
 * A first visit has no anchor; the brief then measures from a fixed window
 * (`DEFAULT_BRIEF_WINDOW_MS`) and says so, rather than from the epoch, which would count the
 * whole folder as "new since you left".
 */
const KEY_PREFIX = 'atlas.insights.briefSeenAt:';
const EVENT = 'ontology-atlas:insights-brief-seen-change';

export const DEFAULT_BRIEF_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface BriefAnchor {
  /** Ms since epoch the counts are measured from. */
  anchorMs: number;
  /** True when no visit was recorded and the default window is in use. */
  isDefaultWindow: boolean;
}

export function briefSeenKey(vaultScope: string): string {
  return `${KEY_PREFIX}${vaultScope}`;
}

let snapshot = new Map<string, number | null>();

export function readBriefSeenAt(vaultScope: string): number | null {
  if (!vaultScope || typeof window === 'undefined') return null;
  if (snapshot.has(vaultScope)) return snapshot.get(vaultScope) ?? null;
  let value: number | null = null;
  try {
    const raw = window.localStorage.getItem(briefSeenKey(vaultScope));
    const parsed = raw == null ? NaN : Number(raw);
    value = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    /* private mode — nothing stored, nothing read */
  }
  snapshot.set(vaultScope, value);
  return value;
}

export function writeBriefSeenAt(vaultScope: string, atMs: number): void {
  if (!vaultScope || typeof window === 'undefined') return;
  snapshot = new Map(snapshot);
  snapshot.set(vaultScope, atMs);
  try {
    window.localStorage.setItem(briefSeenKey(vaultScope), String(atMs));
  } catch {
    /* private mode — the value still holds for this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Pure: the anchor for a recorded visit, or the default window ending now. */
export function resolveBriefAnchor(seenAtMs: number | null, nowMs: number): BriefAnchor {
  if (seenAtMs != null && seenAtMs < nowMs) return { anchorMs: seenAtMs, isDefaultWindow: false };
  return { anchorMs: nowMs - DEFAULT_BRIEF_WINDOW_MS, isDefaultWindow: true };
}

function subscribe(onChange: () => void): () => void {
  const handle = () => {
    snapshot = new Map();
    onChange();
  };
  window.addEventListener(EVENT, handle);
  window.addEventListener('storage', handle);
  return () => {
    window.removeEventListener(EVENT, handle);
    window.removeEventListener('storage', handle);
  };
}

/**
 * The recorded visit for one vault and a way to record this one. The screen calls
 * `markSeen` when the person leaves the brief (or on an explicit "seen" action), never on
 * mount — marking on mount would zero every count the moment it was drawn.
 */
export function useBriefSeenAt(vaultScope: string): [number | null, (atMs?: number) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readBriefSeenAt(vaultScope),
    () => null,
  );
  const markSeen = useCallback(
    (atMs: number = Date.now()) => writeBriefSeenAt(vaultScope, atMs),
    [vaultScope],
  );
  return [value, markSeen];
}

import type { VaultRecentKey } from './recent-docs';

export const RADAR_REVIEW_STORAGE_PREFIX = 'aslan:docs-vault:radar-review:v1:';

type RadarReviewAction = 'confirmed' | 'dismissed' | 'pending';

export interface RadarReviewState {
  confirmed: Set<string>;
  dismissed: Set<string>;
}

interface StoredRadarReviewState {
  confirmed?: unknown;
  dismissed?: unknown;
}

function storageKey(key: VaultRecentKey): string {
  return `${RADAR_REVIEW_STORAGE_PREFIX}${key}`;
}

export function makeRadarReviewKey(fromSlug: string, toSlug: string): string {
  return `${fromSlug}->${toSlug}`;
}

export function readRadarReviewState(key: VaultRecentKey): RadarReviewState {
  if (typeof window === 'undefined') {
    return { confirmed: new Set(), dismissed: new Set() };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return { confirmed: new Set(), dismissed: new Set() };
    const parsed = JSON.parse(raw) as StoredRadarReviewState;
    return {
      confirmed: parseStringSet(parsed.confirmed),
      dismissed: parseStringSet(parsed.dismissed),
    };
  } catch {
    return { confirmed: new Set(), dismissed: new Set() };
  }
}

export function writeRadarReviewState(
  key: VaultRecentKey,
  state: RadarReviewState,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(key),
      JSON.stringify({
        confirmed: [...state.confirmed],
        dismissed: [...state.dismissed],
      }),
    );
  } catch {
    /* private mode — ignore */
  }
}

export function updateRadarReviewState(
  key: VaultRecentKey,
  reviewKey: string,
  action: RadarReviewAction,
): RadarReviewState {
  const current = readRadarReviewState(key);
  const next: RadarReviewState = {
    confirmed: new Set(current.confirmed),
    dismissed: new Set(current.dismissed),
  };

  if (action === 'confirmed') {
    next.dismissed.delete(reviewKey);
    next.confirmed.add(reviewKey);
  } else if (action === 'dismissed') {
    next.confirmed.delete(reviewKey);
    next.dismissed.add(reviewKey);
  } else {
    next.confirmed.delete(reviewKey);
    next.dismissed.delete(reviewKey);
  }

  writeRadarReviewState(key, next);
  return next;
}

export function clearDismissedRadarReviewState(
  key: VaultRecentKey,
  fromSlug: string,
): RadarReviewState {
  const current = readRadarReviewState(key);
  const prefix = `${fromSlug}->`;
  const next: RadarReviewState = {
    confirmed: new Set(current.confirmed),
    dismissed: new Set(
      [...current.dismissed].filter((reviewKey) => !reviewKey.startsWith(prefix)),
    ),
  };

  writeRadarReviewState(key, next);
  return next;
}

function parseStringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is string => typeof item === 'string'));
}

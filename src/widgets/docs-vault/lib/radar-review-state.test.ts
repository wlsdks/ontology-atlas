import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearDismissedRadarReviewState,
  makeRadarReviewKey,
  RADAR_REVIEW_STORAGE_PREFIX,
  readRadarReviewState,
  updateRadarReviewState,
  writeRadarReviewState,
} from './radar-review-state';

describe('radar review state', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores confirmed and dismissed suggestions per vault', () => {
    const key = makeRadarReviewKey('docs/a', 'docs/b');

    const confirmed = updateRadarReviewState('server', key, 'confirmed');

    expect(confirmed.confirmed.has(key)).toBe(true);
    expect(confirmed.dismissed.has(key)).toBe(false);
    expect(readRadarReviewState('server').confirmed.has(key)).toBe(true);
    expect(readRadarReviewState('local:demo').confirmed.has(key)).toBe(false);
  });

  it('moves a suggestion between confirmed and dismissed', () => {
    const key = makeRadarReviewKey('docs/a', 'docs/b');

    updateRadarReviewState('server', key, 'confirmed');
    const dismissed = updateRadarReviewState('server', key, 'dismissed');

    expect(dismissed.confirmed.has(key)).toBe(false);
    expect(dismissed.dismissed.has(key)).toBe(true);
  });

  it('moves a suggestion back to pending', () => {
    const key = makeRadarReviewKey('docs/a', 'docs/b');

    updateRadarReviewState('server', key, 'confirmed');
    const pending = updateRadarReviewState('server', key, 'pending');

    expect(pending.confirmed.has(key)).toBe(false);
    expect(pending.dismissed.has(key)).toBe(false);
  });

  it('clears dismissed suggestions only for the selected document', () => {
    updateRadarReviewState(
      'server',
      makeRadarReviewKey('docs/a', 'docs/b'),
      'dismissed',
    );
    updateRadarReviewState(
      'server',
      makeRadarReviewKey('docs/c', 'docs/d'),
      'dismissed',
    );

    const state = clearDismissedRadarReviewState('server', 'docs/a');

    expect(state.dismissed.has(makeRadarReviewKey('docs/a', 'docs/b'))).toBe(
      false,
    );
    expect(state.dismissed.has(makeRadarReviewKey('docs/c', 'docs/d'))).toBe(
      true,
    );
  });

  it('ignores malformed storage', () => {
    window.localStorage.setItem(`${RADAR_REVIEW_STORAGE_PREFIX}server`, '{');

    expect(readRadarReviewState('server')).toEqual({
      confirmed: new Set(),
      dismissed: new Set(),
    });
  });

  it('round-trips explicit state', () => {
    writeRadarReviewState('server', {
      confirmed: new Set(['a->b']),
      dismissed: new Set(['a->c']),
    });

    const state = readRadarReviewState('server');
    expect(state.confirmed.has('a->b')).toBe(true);
    expect(state.dismissed.has('a->c')).toBe(true);
  });
});

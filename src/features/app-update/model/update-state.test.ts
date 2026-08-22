import { describe, expect, it } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  shouldCheckForUpdate,
  shouldSurfaceVersion,
  summarizeNotes,
} from './update-state';

describe('shouldCheckForUpdate', () => {
  it('never checks on the web — a browser tab cannot replace itself', () => {
    // Speaking of updates on the web proposes something impossible.
    expect(
      shouldCheckForUpdate({ isDesktop: false, now: 0, lastCheckedAt: null, manual: true }),
    ).toBe(false);
  });

  it('checks on first desktop launch', () => {
    expect(shouldCheckForUpdate({ isDesktop: true, now: 1_000, lastCheckedAt: null })).toBe(true);
  });

  it('stays quiet inside the interval and speaks once past it', () => {
    const lastCheckedAt = 1_000_000;
    expect(
      shouldCheckForUpdate({ isDesktop: true, now: lastCheckedAt + 60_000, lastCheckedAt }),
    ).toBe(false);
    expect(
      shouldCheckForUpdate({ isDesktop: true, now: lastCheckedAt + CHECK_INTERVAL_MS, lastCheckedAt }),
    ).toBe(true);
  });

  it('a manual check ignores the interval — the user asked', () => {
    const lastCheckedAt = 1_000_000;
    expect(
      shouldCheckForUpdate({ isDesktop: true, now: lastCheckedAt + 1, lastCheckedAt, manual: true }),
    ).toBe(true);
  });

  it('recovers when the clock moves backwards', () => {
    // If a timezone change or manual adjustment makes the elapsed time negative, leaving it means the
    // next check never comes. A failure that stops quietly and is hard to notice.
    expect(shouldCheckForUpdate({ isDesktop: true, now: 500, lastCheckedAt: 1_000_000 })).toBe(true);
  });
});

describe('shouldSurfaceVersion', () => {
  it('does not re-ask about a version the user dismissed', () => {
    expect(shouldSurfaceVersion('1.0.1', '1.0.1')).toBe(false);
  });

  it('asks again when a newer version arrives — dismissal is "not now", not "never"', () => {
    expect(shouldSurfaceVersion('1.0.2', '1.0.1')).toBe(true);
  });

  it('asks when nothing was dismissed', () => {
    expect(shouldSurfaceVersion('1.0.1', null)).toBe(true);
  });

  it('never surfaces an empty version', () => {
    expect(shouldSurfaceVersion('', null)).toBe(false);
  });
});

describe('summarizeNotes', () => {
  it('keeps only the first paragraph — a popover that becomes reading material goes unread', () => {
    expect(summarizeNotes('첫 문단입니다.\n\n둘째 문단은 안 보인다.')).toBe('첫 문단입니다.');
  });

  it('collapses newlines inside that paragraph', () => {
    expect(summarizeNotes('한 줄\n다음 줄')).toBe('한 줄 다음 줄');
  });

  it('truncates with an ellipsis instead of overflowing the surface', () => {
    const long = 'ㄱ'.repeat(400);
    const result = summarizeNotes(long, 50);
    expect(result).toHaveLength(50);
    expect(result?.endsWith('…')).toBe(true);
  });

  it('returns null for missing or blank notes', () => {
    expect(summarizeNotes(null)).toBeNull();
    expect(summarizeNotes(undefined)).toBeNull();
    expect(summarizeNotes('   ')).toBeNull();
  });
});

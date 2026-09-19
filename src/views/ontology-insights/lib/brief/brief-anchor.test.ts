import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BRIEF_WINDOW_MS,
  briefSeenKey,
  readBriefSeenAt,
  resolveBriefAnchor,
  writeBriefSeenAt,
} from './brief-anchor';

const now = Date.parse('2026-09-19T12:00:00Z');

describe('resolveBriefAnchor', () => {
  it('measures from the recorded visit when there is one', () => {
    expect(resolveBriefAnchor(now - 1000, now)).toEqual({ anchorMs: now - 1000, isDefaultWindow: false });
  });
  it('falls back to the default window on a first visit or a clock that ran backwards', () => {
    expect(resolveBriefAnchor(null, now)).toEqual({ anchorMs: now - DEFAULT_BRIEF_WINDOW_MS, isDefaultWindow: true });
    expect(resolveBriefAnchor(now + 5000, now).isDefaultWindow).toBe(true);
  });
});

describe('brief seen storage', () => {
  afterEach(() => window.localStorage.clear());
  it('is scoped per vault and refuses an empty scope', () => {
    writeBriefSeenAt('vault-a', now);
    expect(readBriefSeenAt('vault-a')).toBe(now);
    expect(readBriefSeenAt('vault-b')).toBeNull();
    writeBriefSeenAt('', now);
    expect(window.localStorage.getItem(briefSeenKey(''))).toBeNull();
  });
  it('ignores a slot something else wrote badly', () => {
    window.localStorage.setItem(briefSeenKey('vault-c'), 'yesterday');
    expect(readBriefSeenAt('vault-c')).toBeNull();
  });
});

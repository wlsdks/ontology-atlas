import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BRIEF_WINDOW_MS,
  briefSeenKey,
  canUndoBriefSeenAt,
  readBriefSeenAt,
  resolveBriefAnchor,
  undoBriefSeenAt,
  useBriefSeenAt,
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
    // The literal key, so the scope registry can prove this slot carries a vault suffix.
    expect(briefSeenKey('vault-a')).toBe('atlas.insights.briefSeenAt:vault-a');
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

describe('marking the visit is visible in the same frame', () => {
  it('reads as a recorded visit the moment it is written, not after a reload', () => {
    const at = Date.parse('2026-09-19T09:00:00Z');
    // The screen advances its read instant with the write; the anchor is then the visit itself.
    expect(resolveBriefAnchor(at, at + 1)).toEqual({ anchorMs: at, isDefaultWindow: false });
    // Without that advance the value is not yet in the past and the sentence would not change.
    expect(resolveBriefAnchor(at, at).isDefaultWindow).toBe(true);
  });
});

describe('the recorded visit survives a browser that will not store it', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('still reads as recorded when writing to storage throws', () => {
    // Private windows, blocked site data, and a full quota all throw here. The visit then holds
    // for this session only — but it must hold, or the brief keeps counting from the old anchor
    // and the person's "I have seen this" does nothing.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is disabled');
    });
    const { result } = renderHook(() => useBriefSeenAt('vault-private'));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1](now));
    expect(result.current[0]).toBe(now);
  });

  it('re-reads storage when another tab records the visit', () => {
    const { result } = renderHook(() => useBriefSeenAt('vault-shared'));
    expect(result.current[0]).toBeNull();
    window.localStorage.setItem(briefSeenKey('vault-shared'), String(now));
    act(() => {
      window.dispatchEvent(new Event('storage'));
    });
    expect(result.current[0]).toBe(now);
  });
});

describe('the visit mark can be taken back', () => {
  afterEach(() => window.localStorage.clear());

  it('restores the value the mark found, and says when there is nothing to restore', () => {
    const earlier = Date.parse('2026-09-15T00:00:00Z');
    writeBriefSeenAt('vault-undo', earlier);
    expect(canUndoBriefSeenAt('vault-undo')).toBe(true);

    writeBriefSeenAt('vault-undo', now);
    expect(readBriefSeenAt('vault-undo')).toBe(now);

    undoBriefSeenAt('vault-undo');
    expect(readBriefSeenAt('vault-undo')).toBe(earlier);
    // One press back is the whole reversal; a second press has nothing to undo.
    expect(canUndoBriefSeenAt('vault-undo')).toBe(false);
    undoBriefSeenAt('vault-undo');
    expect(readBriefSeenAt('vault-undo')).toBe(earlier);
  });

  it('returns a first visit to having no recorded mark at all', () => {
    expect(readBriefSeenAt('vault-first')).toBeNull();
    writeBriefSeenAt('vault-first', now);
    undoBriefSeenAt('vault-first');
    expect(readBriefSeenAt('vault-first')).toBeNull();
    expect(window.localStorage.getItem(briefSeenKey('vault-first'))).toBeNull();
  });

  it('is a no-op for a folder that was never marked', () => {
    expect(canUndoBriefSeenAt('vault-never')).toBe(false);
    undoBriefSeenAt('vault-never');
    expect(readBriefSeenAt('vault-never')).toBeNull();
  });
});

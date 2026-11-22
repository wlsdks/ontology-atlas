import { describe, expect, it } from 'vitest';
import {
  canAutomaticResultReplace,
  feedServesPlatform,
  formatMegabytes,
  isAutomaticCheckDue,
  phaseAfterCheck,
  phaseAfterFailedCheck,
  shouldCheckForUpdate,
  type UpdatePhase,
  shouldSurfaceVersion,
  readUpdateAutoCheck,
  summarizeNotes,
  writeUpdateAutoCheck,
} from './update-state';

describe('shouldCheckForUpdate', () => {
  it('never checks on the web — a browser tab cannot replace itself', () => {
    // Speaking of updates on the web proposes something impossible.
    expect(
      shouldCheckForUpdate({ isDesktop: false, now: 0, lastCheckedAt: null, automatic: true, manual: true }),
    ).toBe(false);
  });

  it('checks on first desktop launch', () => {
    expect(shouldCheckForUpdate({ isDesktop: true, now: 1_000, lastCheckedAt: null, automatic: true })).toBe(true);
  });

  it('is due an hour after the last successful check and not a moment before', () => {
    const hour = 60 * 60 * 1000;
    const lastCheckedAt = 1_000_000;
    expect(
      shouldCheckForUpdate({ isDesktop: true, now: lastCheckedAt + hour - 1, lastCheckedAt, automatic: true }),
    ).toBe(false);
    expect(
      shouldCheckForUpdate({ isDesktop: true, now: lastCheckedAt + hour, lastCheckedAt, automatic: true }),
    ).toBe(true);
  });

  it('a manual check ignores the interval — the user asked', () => {
    const lastCheckedAt = 1_000_000;
    expect(
      shouldCheckForUpdate({ isDesktop: true, now: lastCheckedAt + 1, lastCheckedAt, automatic: true, manual: true }),
    ).toBe(true);
  });

  it('recovers when the clock moves backwards', () => {
    // A negative elapsed time must still be due, or the next check never comes.
    expect(shouldCheckForUpdate({ isDesktop: true, now: 500, lastCheckedAt: 1_000_000, automatic: true })).toBe(true);
  });

  it('never checks on its own when automatic checks are off, but a press still does', () => {
    expect(shouldCheckForUpdate({ isDesktop: true, now: 1_000, lastCheckedAt: null, automatic: false })).toBe(false);
    expect(
      shouldCheckForUpdate({ isDesktop: true, now: 1_000, lastCheckedAt: null, automatic: false, manual: true }),
    ).toBe(true);
  });
});

describe('update auto-check preference', () => {
  it('defaults to on and remembers off', () => {
    window.localStorage.clear();
    expect(readUpdateAutoCheck()).toBe('on');
    writeUpdateAutoCheck('off');
    expect(readUpdateAutoCheck()).toBe('off');
    window.localStorage.clear();
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

describe('canAutomaticResultReplace', () => {
  it.each<[UpdatePhase, boolean]>([
    [{ kind: 'idle' }, true],
    [{ kind: 'current' }, true],
    [{ kind: 'failed', operation: 'check', message: 'x' }, true],
    [{ kind: 'checking' }, false],
    [{ kind: 'available', version: '2.1.0', notes: null }, false],
    [{ kind: 'downloading', version: '2.1.0', received: 1, total: 2 }, false],
    [{ kind: 'ready', version: '2.1.0' }, false],
    [{ kind: 'failed', operation: 'install', message: 'x' }, false],
  ])('lets an automatic result replace %o only when no work or answer is on screen', (phase, expected) => {
    expect(canAutomaticResultReplace(phase)).toBe(expected);
  });
});

describe('phaseAfterCheck', () => {
  const found = { version: '2.1.0', notes: null };
  const base = { readyVersion: null, dismissedVersion: null } as const;

  it('leaves a running download alone when an automatic check finds a version', () => {
    const phase: UpdatePhase = { kind: 'downloading', version: '2.1.0', received: 5, total: 10 };
    expect(phaseAfterCheck({ ...base, found, manual: false, phase })).toBeNull();
  });

  it('offers a found version from an idle screen', () => {
    expect(phaseAfterCheck({ ...base, found, manual: false, phase: { kind: 'idle' } })).toEqual({
      kind: 'available',
      version: '2.1.0',
      notes: null,
    });
  });

  it('stays silent for a dismissed version unless the person asked', () => {
    const input = { ...base, dismissedVersion: '2.1.0', found, phase: { kind: 'idle' } as UpdatePhase };
    expect(phaseAfterCheck({ ...input, manual: false })).toBeNull();
    expect(phaseAfterCheck({ ...input, manual: true })).toMatchObject({ kind: 'available' });
  });

  it('never offers a version already installed in this session for download again', () => {
    const input = { ...base, readyVersion: '2.1.0', found, phase: { kind: 'idle' } as UpdatePhase };
    expect(phaseAfterCheck({ ...input, manual: false })).toBeNull();
    expect(phaseAfterCheck({ ...input, manual: true })).toEqual({ kind: 'ready', version: '2.1.0' });
  });

  it('offers a newer version than the one waiting for restart', () => {
    expect(
      phaseAfterCheck({ ...base, readyVersion: '2.1.0', found: { version: '2.2.0', notes: null }, manual: true, phase: { kind: 'idle' } }),
    ).toMatchObject({ kind: 'available', version: '2.2.0' });
  });

  it('reports current only to a press', () => {
    expect(phaseAfterCheck({ ...base, found: null, manual: true, phase: { kind: 'checking' } })).toEqual({ kind: 'current' });
    expect(phaseAfterCheck({ ...base, found: null, manual: false, phase: { kind: 'idle' } })).toBeNull();
  });
});

describe('formatMegabytes', () => {
  it.each([
    [0, '0.0'],
    [1024 * 1024, '1.0'],
    [12_345_678, '11.8'],
    [-5, '0.0'],
  ])('formats %d bytes as %s MB', (bytes, expected) => {
    expect(formatMegabytes(bytes)).toBe(expected);
  });
});

describe('isAutomaticCheckDue', () => {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const now = 100 * HOUR;

  it('sends at most one request per tick, whatever the last one answered', () => {
    expect(isAutomaticCheckDue({ now, lastSuccessAt: null, lastAttemptAt: now - 10 * MINUTE, consecutiveFailures: 1 })).toBe(false);
    expect(isAutomaticCheckDue({ now, lastSuccessAt: null, lastAttemptAt: now - 30 * MINUTE, consecutiveFailures: 1 })).toBe(true);
  });

  it('falls back to the hourly interval after two failures in a row', () => {
    const input = { now, lastSuccessAt: null, consecutiveFailures: 2 };
    expect(isAutomaticCheckDue({ ...input, lastAttemptAt: now - 45 * MINUTE })).toBe(false);
    expect(isAutomaticCheckDue({ ...input, lastAttemptAt: now - HOUR })).toBe(true);
  });

  it('waits an hour after a success', () => {
    const input = { now, lastAttemptAt: now - 45 * MINUTE, consecutiveFailures: 0 };
    expect(isAutomaticCheckDue({ ...input, lastSuccessAt: now - 45 * MINUTE })).toBe(false);
    expect(isAutomaticCheckDue({ ...input, lastSuccessAt: now - HOUR, lastAttemptAt: now - HOUR })).toBe(true);
  });

  it('treats a clock that went backwards as due', () => {
    expect(isAutomaticCheckDue({ now, lastSuccessAt: now + HOUR, lastAttemptAt: now + HOUR, consecutiveFailures: 0 })).toBe(true);
  });
});

describe('feedServesPlatform', () => {
  it.each([
    ['MacIntel', true],
    ['Win32', false],
    ['Linux x86_64', false],
  ])('answers %s with %s', (platform, expected) => {
    expect(feedServesPlatform(platform)).toBe(expected);
  });
});

describe('phaseAfterCheck against what is on screen', () => {
  const downloading: UpdatePhase = { kind: 'downloading', version: '2.1.0', received: 1, total: 2 };

  it('lets not even a press replace a running download', () => {
    expect(
      phaseAfterCheck({ found: { version: '2.1.0', notes: null }, manual: true, phase: downloading, readyVersion: null, dismissedVersion: null }),
    ).toBeNull();
  });

  it('moves an offer on screen to a newer version found automatically', () => {
    expect(
      phaseAfterCheck({
        found: { version: '2.2.0', notes: null },
        manual: false,
        phase: { kind: 'available', version: '2.1.0', notes: null },
        readyVersion: null,
        dismissedVersion: null,
      }),
    ).toMatchObject({ kind: 'available', version: '2.2.0' });
  });
});

describe('phaseAfterFailedCheck', () => {
  it('keeps the restart offer when a press fails with a version ready', () => {
    expect(phaseAfterFailedCheck({ manual: true, readyVersion: '2.1.0', message: 'x' })).toEqual({ kind: 'ready', version: '2.1.0' });
  });

  it('reports a failed press and stays silent for an automatic failure', () => {
    expect(phaseAfterFailedCheck({ manual: true, readyVersion: null, message: 'x' })).toMatchObject({ kind: 'failed', operation: 'check' });
    expect(phaseAfterFailedCheck({ manual: false, readyVersion: null, message: 'x' })).toBeNull();
  });
});

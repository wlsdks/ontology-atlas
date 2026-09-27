import { describe, expect, it } from 'vitest';

import {
  INSTALL_PROGRESS_FRESH_MS,
  isInstallProgressFresh,
} from './acp-doctor';

describe('held install progress freshness', () => {
  const now = 1_787_000_000_000;

  it('draws progress that just arrived', () => {
    expect(isInstallProgressFresh({ at: now }, now)).toBe(true);
    expect(isInstallProgressFresh({ at: now - 1_000 }, now)).toBe(true);
  });

  it('includes the window boundary instead of dropping it one millisecond early', () => {
    expect(isInstallProgressFresh({ at: now - INSTALL_PROGRESS_FRESH_MS }, now)).toBe(true);
    expect(isInstallProgressFresh({ at: now - INSTALL_PROGRESS_FRESH_MS - 1 }, now)).toBe(false);
  });

  it('does not draw progress from yesterday', () => {
    expect(isInstallProgressFresh({ at: now - 24 * 60 * 60 * 1000 }, now)).toBe(false);
  });

  it('does not treat progress as stale when the clock moves backwards', () => {
    // A timezone change or manual adjustment can make elapsed time negative.
    expect(isInstallProgressFresh({ at: now + 60_000 }, now)).toBe(true);
  });

  it('keeps the freshness window finite and positive', () => {
    expect(INSTALL_PROGRESS_FRESH_MS).toBeGreaterThan(0);
    expect(Number.isFinite(INSTALL_PROGRESS_FRESH_MS)).toBe(true);
  });
});

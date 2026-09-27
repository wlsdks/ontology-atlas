import { describe, expect, it } from 'vitest';

import {
  INSTALL_PROGRESS_FRESH_MS,
  isInstallProgressFresh,
} from './acp-doctor';

/**
 * **Holding the last state and deciding how long to show it are different questions.**
 *
 * Rust keeps the last install result per runtime so that "a completion that went past while closed"
 * is not missed. But with no window, **an install that finished yesterday appears as "installed" when
 * settings are opened today** — stating something that is not what was just done as if it were, the
 * shape this repository has forbidden across every loading and progress surface.
 */
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
    // A timezone change or manual adjustment can make the elapsed time negative. Judging that "stale"
    // would make an install that just finished disappear.
    expect(isInstallProgressFresh({ at: now + 60_000 }, now)).toBe(true);
  });

  it('keeps the freshness window finite and positive', () => {
    expect(INSTALL_PROGRESS_FRESH_MS).toBeGreaterThan(0);
    expect(Number.isFinite(INSTALL_PROGRESS_FRESH_MS)).toBe(true);
  });
});

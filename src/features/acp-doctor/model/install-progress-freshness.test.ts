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
describe('들고 있던 설치 상태의 신선도', () => {
  const now = 1_787_000_000_000;

  it('방금 것은 그린다', () => {
    expect(isInstallProgressFresh({ at: now }, now)).toBe(true);
    expect(isInstallProgressFresh({ at: now - 1_000 }, now)).toBe(true);
  });

  it('창 경계는 포함한다 — 1ms 차이로 사라지지 않는다', () => {
    expect(isInstallProgressFresh({ at: now - INSTALL_PROGRESS_FRESH_MS }, now)).toBe(true);
    expect(isInstallProgressFresh({ at: now - INSTALL_PROGRESS_FRESH_MS - 1 }, now)).toBe(false);
  });

  it('어제 것은 안 그린다 — 이 검사가 존재하는 이유다', () => {
    expect(isInstallProgressFresh({ at: now - 24 * 60 * 60 * 1000 }, now)).toBe(false);
  });

  it('시계가 뒤로 가도 낡음으로 오해하지 않는다', () => {
    // A timezone change or manual adjustment can make the elapsed time negative. Judging that "stale"
    // would make an install that just finished disappear.
    expect(isInstallProgressFresh({ at: now + 60_000 }, now)).toBe(true);
  });

  it('창이 실제로 유한하다 — 상수가 0 이나 무한이면 이 계약은 아무것도 안 지킨다', () => {
    expect(INSTALL_PROGRESS_FRESH_MS).toBeGreaterThan(0);
    expect(Number.isFinite(INSTALL_PROGRESS_FRESH_MS)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import {
  INSTALL_PROGRESS_FRESH_MS,
  isInstallProgressFresh,
} from './acp-doctor';

/**
 * **마지막 상태를 들고 있는 것과, 그것을 언제까지 보여 주는 것은 다른 질문이다.**
 *
 * Rust 가 실행기별 마지막 설치 결과를 보관하는 이유는 「닫아 둔 사이에 지나간
 * 완료」를 놓치지 않기 위해서다. 그런데 창을 안 두면 **어제 끝난 설치가 오늘
 * 설정을 열 때 「설치했어요」로 뜬다** — 방금 한 일이 아닌 것을 방금 한 것처럼
 * 말하는 셈이고, 이 저장소가 로딩·진행 표면 전반에서 금지해 온 모양이다.
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
    // 시간대 변경·수동 조정으로 경과가 음수가 될 수 있다. 그때 「낡았다」로
    // 판정하면 방금 끝난 설치가 사라진다.
    expect(isInstallProgressFresh({ at: now + 60_000 }, now)).toBe(true);
  });

  it('창이 실제로 유한하다 — 상수가 0 이나 무한이면 이 계약은 아무것도 안 지킨다', () => {
    expect(INSTALL_PROGRESS_FRESH_MS).toBeGreaterThan(0);
    expect(Number.isFinite(INSTALL_PROGRESS_FRESH_MS)).toBe(true);
  });
});

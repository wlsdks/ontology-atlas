import { beforeEach, describe, expect, it } from 'vitest';

import { readVaultGuideAutoOpened } from './vault-guide-auto-open';

describe('전역 「자동 표시」 스위치의 사정거리', () => {
  /*
   * 이 테스트가 붙기 전엔 스위치가 «안내 여섯 중 다섯»만 껐다. 화면은 「자동
   * 표시 끔」이라고 말하면서 폴더 없는 첫 화면에서 시트를 그대로 띄웠다.
   * 게이트가 없으면 다음에 안내가 하나 더 늘 때 같은 구멍이 다시 생긴다.
   */
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('스위치가 켜져 있고 아직 안 봤으면 자동으로 뜬다 — 탐지기가 놀지 않는다', () => {
    window.localStorage.setItem('ontology-atlas:guide-auto-start:v1', '1');
    expect(readVaultGuideAutoOpened()).toBe(false);
  });

  it('스위치를 끄면 폴더-우선 시트도 자동으로 뜨지 않는다', () => {
    window.localStorage.setItem('ontology-atlas:guide-auto-start:v1', '0');
    // 「이미 열었음」으로 취급 = 자동 표시 안 함.
    expect(readVaultGuideAutoOpened()).toBe(true);
  });

  it('기본(저장값 없음)도 자동으로 뜨지 않는다 — 2026-08-13 소유자 확정', () => {
    expect(readVaultGuideAutoOpened()).toBe(true);
  });
});

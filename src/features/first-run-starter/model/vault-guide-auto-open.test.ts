import { beforeEach, describe, expect, it } from 'vitest';

import { readVaultGuideAutoOpened } from './vault-guide-auto-open';

describe('전역 「자동 표시」 스위치의 사정거리', () => {
  /*
   * Before this test existed the switch turned off «five of six guides». The screen
   * said "auto-display off" while still raising the sheet on a first screen with no
   * folder. Without a gate, the same hole reappears the next time a guide is added.
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
    // Treated as "already opened" = not auto-displayed.
    expect(readVaultGuideAutoOpened()).toBe(true);
  });

  it('기본(저장값 없음)도 자동으로 뜨지 않는다 — 2026-08-13 소유자 확정', () => {
    expect(readVaultGuideAutoOpened()).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 설정 시트는 **한 시트에 얼굴이 둘이면 안 된다** (2026-08-02, 소유자 재지적).
 *
 * ## 무엇이 있었나 — 실측
 *
 * 시트는 고정 880×672 인데, 행이 사는 폭이 얼굴마다 달랐다:
 *
 * | 얼굴 | 유도 | 행 폭 |
 * |---|---|---|
 * | 루트(LNB 2단) | 880 − 2 보더 − 180 LNB − 40 오른쪽 칸 `p-5` | **658px** |
 * | AI 드릴인 | 880 − 2 보더 − 32 `p-4` | **846px** |
 *
 * 드릴인이 LNB 를 떼면서 그 180px 를 내용이 먹었다. 늘어난 188px(+28.6%)이
 * 나르는 정보는 0인데, `justify-between` 행은 폭이 커질수록 양끝을 더 벌리므로
 * 「Anthropic ‥‥‥ [키 등록]」 사이가 통째로 빈 칸이 됐다. 소유자가 두 번
 * 지적한 *"ai연결 팝업창이 너무 가로가 길다"* 의 기계적 형태가 이것이다.
 *
 * ## 이 파일이 잠그는 것 — 값이 아니라 **유도**
 *
 * `--settings-content-measure` 는 취향으로 고른 658 이 아니라 **루트 얼굴의
 * 유도값 그대로**여야 한다. 그래야 드릴인의 행이 방금 나온 화면의 행과 같은
 * 폭이 된다. 시트 폭·LNB 폭·오른쪽 칸 패딩 중 무엇이 바뀌어도 토큰이 따라오지
 * 않으면 여기서 걸린다 — 값을 세 곳에 적어 두고 드리프트를 기다리지 않는다
 * (Carbon: "값이 두 곳에 적히면 이미 드리프트가 시작된 것").
 *
 * **왜 시트가 아니라 행을 묶나**: 시트 크기는 소유자가 고정으로 정했고
 * (2026-07-29 *"가로 세로 적당한 크기여야하고 고정 사이즈여야함"*), 줄이면
 * 루트의 LNB 2단과 「확장」 절이 같이 깨진다. 그리고 폭을 줄이는 것만으로는
 * 재발이 안 막힌다 — 다음에 시트를 넓히면 같은 병이 돌아온다. 묶어야 하는 것은
 * 행의 최대 측정폭이다.
 */

const ROOT = process.cwd();
const MENU = readFileSync(
  path.join(ROOT, 'src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx'),
  'utf8',
);
const PANEL = readFileSync(
  path.join(ROOT, 'src/widgets/app-settings-menu/ui/AiConnectionPanel.tsx'),
  'utf8',
);
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

/** 시트 자신의 고정 폭. */
function sheetWidth(): number {
  /*
   * 이 게이트가 재는 것은 **폭**이다. 종전엔 정규식이 그 옆의 radius 클래스
   * 이름(`rounded-xl`)까지 못박고 있어서, 같은 값의 램프 이름
   * (`rounded-panel` = 12px)으로 올리는 순간 「폭 선언을 못 찾았다」로 터졌다 —
   * 폭은 한 글자도 안 바뀌었는데. 게이트가 규격이 아니라 이웃 서식을 지키면
   * 다음 사람은 게이트를 고치는 대신 규격을 되돌린다.
   */
  const match = MENU.match(/w-\[(\d+)px\][^`'"]*rounded-(?:xl|panel) border border-\[color:var\(--color-border-soft\)\] bg-\[color:var\(--color-panel\)\]/);
  expect(match, '설정 시트의 고정 폭 선언을 못 찾았다 — 이 게이트가 빈 집합 위에서 돈다').toBeTruthy();
  return Number(match![1]);
}

/** 루트 얼굴의 왼쪽 목록 폭. */
function navWidth(): number {
  const at = MENU.indexOf('data-testid="app-settings-nav"');
  expect(at, 'LNB 선언을 못 찾았다').toBeGreaterThan(-1);
  const match = MENU.slice(at, at + 400).match(/w-\[(\d+)px\]/);
  expect(match, 'LNB 폭 선언을 못 찾았다').toBeTruthy();
  return Number(match![1]);
}

/** 토큰의 선언값. */
function tokenPx(name: string): number {
  const match = CSS.match(new RegExp(`${name}:\\s*(\\d+)px`));
  expect(match, `${name} 토큰이 없다`).toBeTruthy();
  return Number(match![1]);
}

describe('설정 시트 — 얼굴이 달라도 행의 폭은 하나다', () => {
  it('행 측정폭은 루트 얼굴의 유도값과 같다', () => {
    // 880 − 2(좌우 보더 1px) − 180(LNB) − 40(오른쪽 칸 p-5 좌우 20px)
    const derived = sheetWidth() - 2 - navWidth() - 40;
    expect(
      tokenPx('--settings-content-measure'),
      `--settings-content-measure 가 루트 얼굴의 행 폭(${derived}px)과 어긋났다. ` +
        `시트 폭·LNB 폭·오른쪽 칸 패딩 중 무엇을 바꿨다면 토큰도 같이 옮겨라 — ` +
        `안 그러면 드릴인만 다시 넓어진다.`,
    ).toBe(derived);
  });

  it('AI 드릴인이 그 측정폭을 실제로 소비한다', () => {
    // 토큰만 있고 아무도 안 쓰면 그건 규격이 아니라 오정보다 (`design.md`).
    const uses = PANEL.match(/max-w-\[var\(--settings-content-measure\)\]/g) ?? [];
    expect(
      uses.length,
      'AI 연결 패널이 행 측정폭을 안 쓴다 — 웹 강등 카드와 브리지 있는 화면 둘 다 묶여야 한다',
    ).toBe(2);
  });

  it('산문은 행보다 좁다 — 읽는 것과 조작하는 것의 측정폭은 다르다', () => {
    expect(tokenPx('--git-setup-measure')).toBeLessThan(tokenPx('--settings-content-measure'));
    // 「하나만 연결하면…」 한 줄이 846px 폭에 74자로 흐르던 자리
    // (`--measure-prose: 70ch` 초과). 산문 블록은 그 상한 안으로 들어온다.
    expect(
      (PANEL.match(/max-w-\[var\(--git-setup-measure\)\]/g) ?? []).length,
      '산문 블록(신뢰 고지 · 「무엇이 열리나」)이 산문 measure 를 안 쓴다',
    ).toBeGreaterThanOrEqual(2);
  });
});

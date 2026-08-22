import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The settings sheet **must not have two faces in one sheet** (2026-08-02, raised
 * again by the owner).
 *
 * **What was there — measured.** The sheet is a fixed 880×672, but the width a row
 * lives in differed per face:
 *
 * | Face | Derivation | Row width |
 * |---|---|---|
 * | Root (two-pane LNB) | 880 − 2 border − 180 LNB − 40 right-pane `p-5` | **658px** |
 * | AI drill-in | 880 − 2 border − 32 `p-4` | **846px** |
 *
 * Dropping the LNB in the drill-in handed those 180px to the content. The extra
 * 188px (+28.6%) carries zero information, and a `justify-between` row pushes its
 * ends further apart as it widens, so the gap between "Anthropic ‥‥‥ [register
 * key]" became one long emptiness. That is the mechanical form of the owner's
 * twice-repeated *"ai연결 팝업창이 너무 가로가 길다"* (the AI connection popup is
 * far too wide).
 *
 * **What this file locks — the derivation, not the value.**
 * `--settings-content-measure` must be **exactly the root face's derived value**,
 * not a 658 chosen by taste. That is what makes a drill-in row the same width as
 * the row on the screen it just came from. Change the sheet width, the LNB width,
 * or the right pane's padding without moving the token and it is caught here — the
 * value is not written in three places waiting to drift (Carbon: "when a value is
 * written in two places, drift has already started").
 *
 * **Why bind the row rather than the sheet**: the sheet size was fixed by the
 * owner (2026-07-29 *"가로 세로 적당한 크기여야하고 고정 사이즈여야함"* — it should
 * be a reasonable width and height, and a fixed size), and shrinking it breaks the
 * root's two-pane LNB and the "expand" section together. Shrinking the width also
 * would not prevent recurrence — widening the sheet next time brings the same
 * illness back. What must be bound is the row's maximum measure.
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

/** The sheet's own fixed width. */
function sheetWidth(): number {
  /*
   * What this gate measures is **width**. The regex used to also pin the adjacent
   * radius class name (`rounded-xl`), so moving to the ramp name of the same value
   * (`rounded-panel` = 12px) blew up with "cannot find the width declaration" —
   * while the width had not changed by one character. A gate that guards a
   * neighbour's formatting rather than the spec makes the next person revert the
   * spec instead of fixing the gate.
   */
  const match = MENU.match(/w-\[(\d+)px\][^`'"]*rounded-(?:xl|panel) border border-\[color:var\(--color-border-soft\)\] bg-\[color:var\(--color-panel\)\]/);
  expect(match, '설정 시트의 고정 폭 선언을 못 찾았다 — 이 게이트가 빈 집합 위에서 돈다').toBeTruthy();
  return Number(match![1]);
}

/** The root face's left list width. */
function navWidth(): number {
  const at = MENU.indexOf('data-testid="app-settings-nav"');
  expect(at, 'LNB 선언을 못 찾았다').toBeGreaterThan(-1);
  const match = MENU.slice(at, at + 400).match(/w-\[(\d+)px\]/);
  expect(match, 'LNB 폭 선언을 못 찾았다').toBeTruthy();
  return Number(match![1]);
}

/** The token's declared value. */
function tokenPx(name: string): number {
  const match = CSS.match(new RegExp(`${name}:\\s*(\\d+)px`));
  expect(match, `${name} 토큰이 없다`).toBeTruthy();
  return Number(match![1]);
}

describe('설정 시트 — 얼굴이 달라도 행의 폭은 하나다', () => {
  it('행 측정폭은 루트 얼굴의 유도값과 같다', () => {
    // 880 − 2 (1px border each side) − 180 (LNB) − 40 (right pane p-5, 20px each side)
    const derived = sheetWidth() - 2 - navWidth() - 40;
    expect(
      tokenPx('--settings-content-measure'),
      `--settings-content-measure 가 루트 얼굴의 행 폭(${derived}px)과 어긋났다. ` +
        `시트 폭·LNB 폭·오른쪽 칸 패딩 중 무엇을 바꿨다면 토큰도 같이 옮겨라 — ` +
        `안 그러면 드릴인만 다시 넓어진다.`,
    ).toBe(derived);
  });

  it('AI 드릴인이 그 측정폭을 실제로 소비한다', () => {
    // A token nobody uses is misinformation, not a spec (`design.md`).
    const uses = PANEL.match(/max-w-\[var\(--settings-content-measure\)\]/g) ?? [];
    expect(
      uses.length,
      'AI 연결 패널이 행 측정폭을 안 쓴다 — 웹 강등 카드와 브리지 있는 화면 둘 다 묶여야 한다',
    ).toBe(2);
  });

  it('산문은 행보다 좁다 — 읽는 것과 조작하는 것의 측정폭은 다르다', () => {
    expect(tokenPx('--git-setup-measure')).toBeLessThan(tokenPx('--settings-content-measure'));
    // The place where the "connect just one…" line ran 74 characters across 846px
    // (past `--measure-prose: 70ch`). Prose blocks come back inside that cap.
    expect(
      (PANEL.match(/max-w-\[var\(--git-setup-measure\)\]/g) ?? []).length,
      '산문 블록(신뢰 고지 · 「무엇이 열리나」)이 산문 measure 를 안 쓴다',
    ).toBeGreaterThanOrEqual(2);
  });
});

import { describe, expect, it } from 'vitest';

import {
  COMPOSER_CEILING_ROWS,
  COMPOSER_MAX_ROWS,
  COMPOSER_MIN_ROWS,
  composerGrowth,
  composerMaxRows,
  composerTopIsHidden,
  snapScrollTop,
} from './composer-growth';

/**
 * 실측 치수(1512×806, 다크, Pretendard 12.5px/20px):
 * padding 8+8 · border 1+1 · line-height 20 → 2줄 상자 = 58px.
 */
const BASE = { lineHeight: 20, paddingBlock: 16, borderBlock: 2 };
const rowsToContent = (rows: number) => rows * BASE.lineHeight + BASE.paddingBlock;

describe('composerGrowth', () => {
  it('한 줄짜리 글도 최소 2줄 상자를 지킨다', () => {
    const growth = composerGrowth({ ...BASE, contentHeight: rowsToContent(1) });
    expect(growth).toEqual({ height: 58, rows: COMPOSER_MIN_ROWS, overflowing: false });
  });

  it('세 줄이면 상자가 세 줄로 자란다 (구 고정 높이에서 잘리던 그 문장)', () => {
    const growth = composerGrowth({ ...BASE, contentHeight: rowsToContent(3) });
    expect(growth).toEqual({ height: 78, rows: 3, overflowing: false });
  });

  it('상한은 6줄이고, 그 위는 상자가 아니라 안쪽 스크롤이 받는다', () => {
    const at = composerGrowth({ ...BASE, contentHeight: rowsToContent(6) });
    expect(at).toEqual({ height: 138, rows: COMPOSER_MAX_ROWS, overflowing: false });

    const over = composerGrowth({ ...BASE, contentHeight: rowsToContent(9) });
    expect(over).toEqual({ height: 138, rows: COMPOSER_MAX_ROWS, overflowing: true });
  });

  it('어떤 줄 수에서도 높이는 정수 줄 + 크롬이다 — 반 줄이 생길 자리가 없다', () => {
    for (let rows = 1; rows <= 12; rows += 1) {
      const growth = composerGrowth({ ...BASE, contentHeight: rowsToContent(rows) });
      expect(growth).not.toBeNull();
      const text = growth!.height - BASE.paddingBlock - BASE.borderBlock;
      expect(text % BASE.lineHeight).toBe(0);
    }
  });

  it('잴 수 없는 상태(SSR·jsdom·폰트 로드 전)에서는 아무 값도 만들지 않는다', () => {
    expect(composerGrowth({ ...BASE, lineHeight: Number.NaN, contentHeight: 76 })).toBeNull();
    expect(composerGrowth({ ...BASE, contentHeight: 0 })).toBeNull();
    expect(composerGrowth({ ...BASE, lineHeight: 0, contentHeight: 76 })).toBeNull();
  });
});

describe('snapScrollTop', () => {
  it('격자 밖 값은 가장 가까운 줄 경계로 붙는다', () => {
    // 실측 결함: 한 프레임에 9px 이동 → 줄 높이 20 의 배수가 아니라 글리프가
    // 반으로 잘렸다. 9 는 첫 줄에 더 가까우므로 첫 줄로 되돌아간다.
    expect(snapScrollTop(9, 20)).toBe(0);
    expect(snapScrollTop(13, 20)).toBe(20);
    expect(snapScrollTop(31, 20)).toBe(40);
  });

  it('이미 격자 위인 값은 움직이지 않는다', () => {
    expect(snapScrollTop(0, 20)).toBe(0);
    expect(snapScrollTop(40, 20)).toBe(40);
  });

  it('줄 높이를 모르면 손대지 않는다', () => {
    expect(snapScrollTop(9, 0)).toBe(9);
    expect(snapScrollTop(9, Number.NaN)).toBe(9);
  });
});

describe('composerTopIsHidden', () => {
  it('상한에 닿았어도 맨 위에 있으면 가려진 것이 없다', () => {
    expect(composerTopIsHidden(true, 0)).toBe(false);
  });

  it('상한에 닿고 실제로 밀려 올라갔을 때만 참', () => {
    expect(composerTopIsHidden(true, 20)).toBe(true);
  });

  it('자라는 중(상한 미도달)에는 어떤 스크롤 값에서도 신호가 없다', () => {
    expect(composerTopIsHidden(false, 20)).toBe(false);
  });
});

/**
 * 상한은 **그 자리의 높이**가 정한다 (2026-08-16 소유자: *"어느 정도까지는
 * 길어지면 좋겠는데"*).
 *
 * 6줄이라는 기본값은 좁은 하단 띠에서 나온 수라 세로로 긴 대화 칸에는
 * 인색했다. 그렇다고 큰 수를 새로 박으면 **창을 줄였을 때** 작성 칸이 대화를
 * 통째로 밀어낸다 — 그 실패를 여기서 못 박는다.
 */
describe('작성 칸 상한 — 자기 높이에서 구한다', () => {
  const LINE = 20;

  it('세로로 긴 칸에서는 기본값보다 넉넉해진다', () => {
    // 900px 칸: 900 * 0.4 / 20 = 18 → 천장 16
    expect(composerMaxRows(900, LINE)).toBe(COMPOSER_CEILING_ROWS);
    // 500px 칸: 500 * 0.4 / 20 = 10
    expect(composerMaxRows(500, LINE)).toBe(10);
  });

  it('창이 작아지면 상한도 같이 작아진다 — 대화를 밀어내지 않는다', () => {
    // 200px 칸: 200 * 0.4 / 20 = 4
    expect(composerMaxRows(200, LINE)).toBe(4);
  });

  it('아주 작은 칸에서도 **자랄 수는 있다** — 시작 크기보다 한 줄은 크다', () => {
    expect(composerMaxRows(60, LINE)).toBe(COMPOSER_MIN_ROWS + 1);
  });

  it('잴 수 없으면 기본 상한으로 돌아간다', () => {
    expect(composerMaxRows(0, LINE)).toBe(COMPOSER_MAX_ROWS);
    expect(composerMaxRows(Number.NaN, LINE)).toBe(COMPOSER_MAX_ROWS);
    expect(composerMaxRows(900, 0)).toBe(COMPOSER_MAX_ROWS);
  });

  it('넘겨준 상한을 실제로 쓴다 — 그 위로는 안쪽 스크롤이다', () => {
    const metrics = {
      lineHeight: LINE,
      paddingBlock: 0,
      borderBlock: 0,
      // 12줄짜리 글
      contentHeight: 12 * LINE,
    };
    expect(composerGrowth(metrics, 12)?.rows).toBe(12);
    expect(composerGrowth(metrics, 12)?.overflowing).toBe(false);
    expect(composerGrowth(metrics)?.rows).toBe(COMPOSER_MAX_ROWS);
    expect(composerGrowth(metrics)?.overflowing).toBe(true);
  });

  it('상한이 시작 크기보다 작아도 칸이 줄지 않는다', () => {
    const growth = composerGrowth(
      { lineHeight: LINE, paddingBlock: 0, borderBlock: 0, contentHeight: LINE },
      1,
    );
    expect(growth?.rows).toBe(COMPOSER_MIN_ROWS);
  });
});

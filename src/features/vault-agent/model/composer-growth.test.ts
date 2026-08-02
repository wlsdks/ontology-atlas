import { describe, expect, it } from 'vitest';

import {
  COMPOSER_MAX_ROWS,
  COMPOSER_MIN_ROWS,
  composerGrowth,
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

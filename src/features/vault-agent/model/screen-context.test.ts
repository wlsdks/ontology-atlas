// 화면 문맥 블록의 계약: 없는 것은 말하지 않는다 · 매 왕복에 실리므로 상한이 있다.
import { describe, expect, it } from 'vitest';

import {
  EMPTY_SCREEN_CONTEXT,
  RECENT_CHANGES_CHAR_CAP,
  RECENT_CHANGES_LINE_CAP,
  formatScreenContextBlock,
} from './screen-context';

describe('formatScreenContextBlock — 최근 적용 변경', () => {
  it('이력이 없으면 줄 자체를 넣지 않는다 — 빈 목록은 "변경 없음"이라는 거짓이 된다', () => {
    const block = formatScreenContextBlock(EMPTY_SCREEN_CONTEXT);
    expect(block).not.toContain('recent_changes_in_this_folder');
  });

  it('git 이 아닌 폴더(undefined)도 마찬가지다', () => {
    const block = formatScreenContextBlock({
      ...EMPTY_SCREEN_CONTEXT,
      recentChanges: undefined,
    });
    expect(block).not.toContain('recent_changes_in_this_folder');
  });

  it('있으면 최신 순으로 싣는다 — 대화를 저장하지 않고도 이어지는 근거', () => {
    const block = formatScreenContextBlock({
      ...EMPTY_SCREEN_CONTEXT,
      recentChanges: ['환불 정의 추가 (2시간 전)', '결제 → 환불 연결 (어제)'],
    });
    expect(block).toContain('recent_changes_in_this_folder');
    expect(block).toContain('- 환불 정의 추가 (2시간 전)');
    expect(block.indexOf('환불 정의 추가')).toBeLessThan(block.indexOf('결제 → 환불 연결'));
  });

  it('줄 수와 줄 길이에 상한이 있다 — 매 왕복에 실리는 비용이다', () => {
    const block = formatScreenContextBlock({
      ...EMPTY_SCREEN_CONTEXT,
      recentChanges: Array.from({ length: 20 }, (_, index) => `${'긴'.repeat(400)}${index}`),
    });
    const rows = block.split('\n').filter((line) => line.startsWith('  - '));
    expect(rows).toHaveLength(RECENT_CHANGES_LINE_CAP);
    for (const row of rows) {
      expect(row.length - 4).toBeLessThanOrEqual(RECENT_CHANGES_CHAR_CAP);
    }
  });
});

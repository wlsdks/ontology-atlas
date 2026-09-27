// The block never states what is absent, and it is capped because it rides every round trip.
import { describe, expect, it } from 'vitest';

import {
  EMPTY_SCREEN_CONTEXT,
  RECENT_CHANGES_CHAR_CAP,
  RECENT_CHANGES_LINE_CAP,
  formatScreenContextBlock,
} from './screen-context';

describe('formatScreenContextBlock recent applied changes', () => {
  it('omits the line entirely when there is no history', () => {
    const block = formatScreenContextBlock(EMPTY_SCREEN_CONTEXT);
    expect(block).not.toContain('recent_changes_in_this_folder');
  });

  it('omits the line for a folder outside git', () => {
    const block = formatScreenContextBlock({
      ...EMPTY_SCREEN_CONTEXT,
      recentChanges: undefined,
    });
    expect(block).not.toContain('recent_changes_in_this_folder');
  });

  it('lists changes newest first when present', () => {
    const block = formatScreenContextBlock({
      ...EMPTY_SCREEN_CONTEXT,
      recentChanges: ['환불 정의 추가 (2시간 전)', '결제 → 환불 연결 (어제)'],
    });
    expect(block).toContain('recent_changes_in_this_folder');
    expect(block).toContain('- 환불 정의 추가 (2시간 전)');
    expect(block.indexOf('환불 정의 추가')).toBeLessThan(block.indexOf('결제 → 환불 연결'));
  });

  it('caps the number and length of lines', () => {
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

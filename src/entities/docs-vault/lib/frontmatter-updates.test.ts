import { describe, expect, it } from 'vitest';
import { applyFrontmatterUpdates } from './frontmatter-updates';


/**
 * BOM·CRLF 원본에서도 **키가 갱신되지, 하나 더 붙지 않는다** (2026-07-28).
 *
 * CRLF 를 정규화하지 않으면 키 줄 끝에 `\r` 이 남아 매칭이 빗나가고, 갱신
 * 대신 같은 키가 하나 더 append 된다 — 그 파일은 그때부터 같은 키를 두 번
 * 가진 프론트매터가 된다.
 */
describe('BOM·CRLF 원본', () => {
  it('CRLF — 키를 갱신하고 CRLF 로 되돌린다', () => {
    const raw = '---\r\nkind: capability\r\ntitle: 옛 제목\r\n---\r\n본문\r\n';
    const next = applyFrontmatterUpdates(raw, { title: '새 제목' });
    const titleLines = next.split(/\r?\n/).filter((l) => l.startsWith('title:'));
    expect(titleLines).toEqual(['title: 새 제목']);
    expect(next.includes('\r\n')).toBe(true);
  });

  it('BOM — frontmatter 를 새로 만들지 않고 갱신한다', () => {
    const raw = '﻿---\nkind: capability\ntitle: 옛 제목\n---\n본문\n';
    const next = applyFrontmatterUpdates(raw, { title: '새 제목' });
    expect(next.startsWith('﻿')).toBe(true);
    expect(next).toContain('kind: capability');
    const titleLines = next.split('\n').filter((l) => l.startsWith('title:'));
    expect(titleLines).toEqual(['title: 새 제목']);
  });
});

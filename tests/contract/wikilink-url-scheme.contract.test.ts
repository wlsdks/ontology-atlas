import { defaultUrlTransform } from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { decodeWikilinkSlug, rewriteWikilinks, WIKILINK_SENTINEL } from '@/shared/lib/library/source-citation';

/**
 * A wikilink sentinel must not be a URL scheme: `react-markdown` sanitises URLs and turns an unknown
 * scheme into an empty string, leaving a plain span. The URL a wikilink produces must survive the
 * sanitiser, so a library bump that changes its allowlist breaks here first.
 */

describe('위키링크 URL 은 마크다운 렌더러의 살균을 통과한다', () => {
  const sentinel = WIKILINK_SENTINEL;
  // Exercise the shared rewrite consumed by both readers instead of scanning its old file.
  const destination = (slug: string) => rewriteWikilinks(`[[${slug}]]`).match(/\]\(([^)]+)\)$/)?.[1];

  it('뷰어가 센티넬 접두사를 갖고 있다 — 못 찾으면 이 시험이 공회전한다', () => {
    expect(sentinel).toBeTruthy();
    expect(destination('capabilities/example')).toContain(sentinel);
  });

  it('그 센티넬이 붙은 URL 이 살균 뒤에도 남는다', () => {
    const url = destination('capabilities/example')!;
    expect(
      defaultUrlTransform(url),
      `react-markdown strips "${url}". With an empty href the viewer's a component returns ` +
        'neither a link nor a not-found mark but **plain text with no mark at all**. ' +
        'A scheme shape (`X:`) outside the allow list is cut entirely; use a query or path shape.',
    ).not.toBe('');
  });

  it('한글 슬러그도 살아남는다 — 볼트 슬러그는 한글일 수 있다', () => {
    const url = destination('capabilities/스윕-검증-절차')!;
    expect(defaultUrlTransform(url)).not.toBe('');
  });

  /**
   * The idling guard in reverse — is this check passing *anything*? Feed it a value
   * that really gets stripped, confirming the sanitiser is alive in the first place.
   */
  it('계기가 살아 있다 — 정말 잘리는 스킴은 빈 값이 된다', () => {
    expect(defaultUrlTransform('javascript:alert(1)')).toBe('');
    expect(defaultUrlTransform('WIKILINK:capabilities/x')).toBe('');
  });
});

/**
 * **The second layer — the parser percent-encodes the URL.**
 *
 * Even after surviving sanitisation, every Korean wikilink fell through to the dotted
 * "link not in this folder" state. Measured: the value arriving at the viewer's `a`
 * component was `capabilities/%EC%8A%A4%EC%9C%95-…` (69 characters) — the markdown
 * parser had encoded it. The vault's slug set holds only the decoded form (21
 * characters), so it never matches.
 *
 * **ASCII slugs were fine because there was nothing to encode.** So this defect is
 * visible only in vaults using Korean (or space-containing, or non-ASCII) slugs — our
 * samples are ASCII, so nobody saw it. This gate guards that blind spot.
 */
describe('위키링크 해소는 퍼센트 인코딩과 정규화를 견딘다', () => {
  it('뷰어가 슬러그를 디코드한다', () => {
    expect(decodeWikilinkSlug(encodeURIComponent('capabilities/스윕-검증-절차'))).toBe('capabilities/스윕-검증-절차');
  });

  it('뷰어가 NFC 로 맞춘다 — 글자는 같은데 문자열이 다른 상태를 없앤다', () => {
    const slug = 'sources/원문.md';
    expect(decodeWikilinkSlug(encodeURIComponent(slug.normalize('NFD')))).toBe(slug.normalize('NFC'));
  });

  it('디코드 실패가 문서를 죽이지 않는다 — 잘린 퍼센트 시퀀스는 원문으로 둔다', () => {
    expect(decodeWikilinkSlug('sources/100%.md')).toBe('sources/100%.md');
  });
});

import { defaultUrlTransform } from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { decodeWikilinkSlug, rewriteWikilinks, WIKILINK_SENTINEL } from '@/shared/lib/source-citation';

/**
 * **A wikilink sentinel must not be a URL scheme** — the markdown renderer strips it.
 *
 * **What happened** (measured 2026-08-08). The viewer rewrote `[[slug|name]]` into a
 * standard markdown link `[name](WIKILINK:slug)` and then caught the `WIKILINK:`
 * prefix in the `a` component to route internally. The design makes sense but
 * **skipped one layer**:
 *
 * `react-markdown` sanitises URLs (`defaultUrlTransform`). Its allowlist is http,
 * https, mailto, xmpp, irc and similar, and it **turns an unknown scheme into an
 * empty string.** Measured:
 *
 * ```
 * defaultUrlTransform('WIKILINK:capabilities/x') === ''
 * ```
 *
 * So `href` was empty and the `a` component's first line
 * (`if (!href) return <span>{children}</span>`) returned **a plain span with no
 * marking** instead of a link. On screen there is only text — not a link, and not the
 * dotted "slug not found" marker either. **Two failures rendered as one picture.**
 *
 * **Why nobody saw it.** The dogfood vault had **zero** wikilinks in body text
 * (exhaustive count, 2026-08-08). Nobody traversed that path, so it stayed broken,
 * and the shipped samples have none either. The feature was the kind that is
 * documented, implemented, and has never once worked.
 *
 * It surfaced when the editor's `@` mention started putting wikilinks into body text
 * and walked that path for the first time.
 *
 * **What this gate locks:** *the URL a wikilink produces survives the renderer's
 * sanitiser.* How the implementation shapes the sentinel does not matter — scheme,
 * query, or data attribute. It only has to **still exist after sanitisation**. And
 * since the sanitiser is the library's, not ours, a version bump that changes its
 * allowlist breaks here first.
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

import { describe, expect, it } from 'vitest';

import { resolveDocLink } from './resolve-doc-link';
import { buildDocLinkMarkdown, relativeDocPath } from './relative-doc-path';

/**
 * The point of this test is not «is the path string pretty» but **does the viewer
 * resolve that link back to the same document**. So the producing side
 * (`relativeDocPath`) and the resolving side (`resolveDocLink`) are measured as a
 * **round trip**. Measuring one side alone can go green while the two disagree,
 * and that is exactly the accident this feature had (the parser passed an encoded
 * URL and the resolving side did not know).
 */

const VAULT = new Set([
  'domains/typed-api',
  'domains/orders',
  'capabilities/fixtures',
  'capabilities/스윕-검증-절차',
  'README',
  'guides/deep/nested-note',
]);

/** Round trip — feed the built link to the viewer's resolver and check the original slug comes back. */
function roundTrip(fromSlug: string, toSlug: string) {
  const href = relativeDocPath(fromSlug, toSlug);
  return resolveDocLink({ href, fromSlug, vaultSlugs: VAULT });
}

describe('relativeDocPath produces links the viewer resolves back', () => {
  it('climbs up and back down to another folder', () => {
    expect(relativeDocPath('domains/typed-api', 'capabilities/fixtures')).toBe(
      '../capabilities/fixtures.md',
    );
    expect(roundTrip('domains/typed-api', 'capabilities/fixtures')).toEqual({
      kind: 'internal',
      slug: 'capabilities/fixtures',
      anchor: undefined,
    });
  });

  it('prefixes ./ for the same folder so it reads as a link', () => {
    expect(relativeDocPath('domains/typed-api', 'domains/orders')).toBe('./orders.md');
    expect(roundTrip('domains/typed-api', 'domains/orders')).toMatchObject({
      kind: 'internal',
      slug: 'domains/orders',
    });
  });

  it('links from a vault-root doc into a folder', () => {
    expect(relativeDocPath('README', 'capabilities/fixtures')).toBe('capabilities/fixtures.md');
    expect(roundTrip('README', 'capabilities/fixtures')).toMatchObject({
      kind: 'internal',
      slug: 'capabilities/fixtures',
    });
  });

  it('links from a deep folder to a root doc', () => {
    expect(relativeDocPath('guides/deep/nested-note', 'README')).toBe('../../README.md');
    expect(roundTrip('guides/deep/nested-note', 'README')).toMatchObject({
      kind: 'internal',
      slug: 'README',
    });
  });

  /**
   * A Hangul slug is this feature's weak spot. The wikilink side had the same
   * defect — the markdown parser passes URLs percent-encoded and the resolving side
   * did not decode. **An ASCII slug has nothing to encode, so it stays fine and the
   * defect appears only in a Hangul vault.**
   */
  it('round-trips a Hangul slug even when it arrives percent-encoded', () => {
    const href = relativeDocPath('domains/typed-api', 'capabilities/스윕-검증-절차');
    expect(href).toBe('../capabilities/스윕-검증-절차.md');
    // Passed through as is
    expect(roundTrip('domains/typed-api', 'capabilities/스윕-검증-절차')).toMatchObject({
      kind: 'internal',
      slug: 'capabilities/스윕-검증-절차',
    });
    // Passed through **in the form the parser encodes** — which is how it really arrives.
    expect(
      resolveDocLink({
        href: encodeURI(href),
        fromSlug: 'domains/typed-api',
        vaultSlugs: VAULT,
      }),
      'a Hangul vault needs percent-encoded links to resolve',
    ).toMatchObject({ kind: 'internal', slug: 'capabilities/스윕-검증-절차' });
  });

  it('finds the slug when an anchor is attached', () => {
    const href = `${relativeDocPath('domains/typed-api', 'capabilities/fixtures')}#정의`;
    expect(
      resolveDocLink({ href, fromSlug: 'domains/typed-api', vaultSlugs: VAULT }),
    ).toMatchObject({ kind: 'internal', slug: 'capabilities/fixtures', anchor: '정의' });
  });
});

describe('buildDocLinkMarkdown keeps link syntax intact for any label', () => {
  it('uses the title as the label', () => {
    expect(
      buildDocLinkMarkdown({
        fromSlug: 'domains/typed-api',
        toSlug: 'capabilities/fixtures',
        label: 'Fixtures',
      }),
    ).toBe('[Fixtures](../capabilities/fixtures.md)');
  });

  it('uses the slug when the title is empty', () => {
    expect(
      buildDocLinkMarkdown({
        fromSlug: 'README',
        toSlug: 'capabilities/fixtures',
        label: '   ',
      }),
    ).toBe('[capabilities/fixtures](capabilities/fixtures.md)');
  });

  /** A title is a human-written value — a bracket in it breaks the link on the spot. */
  it('escapes brackets in the label', () => {
    const md = buildDocLinkMarkdown({
      fromSlug: 'README',
      toSlug: 'capabilities/fixtures',
      label: '[초안] 결제',
    });
    expect(md).toBe('[\\[초안\\] 결제](capabilities/fixtures.md)');
  });
});

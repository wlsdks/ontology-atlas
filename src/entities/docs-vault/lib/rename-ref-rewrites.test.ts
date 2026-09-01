// Bug sweep 2026-09-01: the web rename rewrote only body wikilink/md-link
// forms, so every frontmatter relation to the renamed node was orphaned —
// backlinks vanished and the graph minted a phantom stub under the old name.
// These tests pin the parity with MCP `redirectBacklinks` semantics.
import { describe, expect, it } from 'vitest';

import {
  computeRenameRefContext,
  rewriteRenamedDocRefs,
} from './rename-ref-rewrites';

const ALL_SLUGS = [
  'capabilities/auth',
  'capabilities/search',
  'elements/token',
  'd1',
];

describe('computeRenameRefContext', () => {
  it('allows tail rewriting only while the tail uniquely resolves', () => {
    expect(computeRenameRefContext(ALL_SLUGS, 'capabilities/auth').canRewriteTail).toBe(true);
    expect(
      computeRenameRefContext([...ALL_SLUGS, 'elements/auth'], 'capabilities/auth').canRewriteTail,
    ).toBe(false);
  });
});

describe('rewriteRenamedDocRefs — frontmatter graph refs', () => {
  const args = {
    oldSlug: 'capabilities/auth',
    newSlug: 'capabilities/authn',
    referrerSlug: 'd1',
    canRewriteTail: true,
  };

  it('rewrites exact refs in the relation key family', () => {
    const raw =
      '---\nkind: document\ndependencies: [capabilities/auth, elements/token]\n---\n\nBody\n';
    const next = rewriteRenamedDocRefs(raw, args);
    expect(next).toContain('dependencies: [capabilities/authn, elements/token]');
  });

  it('rewrites a unique bare tail and the domain scalar', () => {
    const raw = '---\nkind: capability\ndomain: auth\ncapabilities: [auth]\n---\n';
    const next = rewriteRenamedDocRefs(raw, args);
    expect(next).toContain('domain: authn');
    expect(next).toContain('capabilities: [authn]');
  });

  it('leaves an ambiguous tail untouched', () => {
    const raw = '---\nkind: document\ncapabilities: [auth]\n---\n';
    const next = rewriteRenamedDocRefs(raw, { ...args, canRewriteTail: false });
    expect(next).toBe(raw);
  });

  it('renames relation_notes keys with new-key-wins collision handling', () => {
    const raw =
      '---\nkind: document\nrelates: [capabilities/auth]\n' +
      'relation_notes: { capabilities/auth: old reason, capabilities/authn: kept reason }\n---\n';
    const next = rewriteRenamedDocRefs(raw, args);
    expect(next).toContain('relates: [capabilities/authn]');
    expect(next).toContain('capabilities/authn: kept reason');
    expect(next).not.toContain('old reason');
  });

  it('never appends a duplicate when the new ref already exists', () => {
    const raw =
      '---\nkind: document\ndependencies: [capabilities/auth, capabilities/authn]\n---\n';
    const next = rewriteRenamedDocRefs(raw, args);
    expect(next).toContain('dependencies: [capabilities/authn]');
  });
});

describe('rewriteRenamedDocRefs — body links', () => {
  const args = {
    oldSlug: 'capabilities/auth',
    newSlug: 'capabilities/authn',
    referrerSlug: 'capabilities/search',
    canRewriteTail: true,
  };

  it('rewrites full-slug wikilinks in every form', () => {
    const raw = '---\nkind: document\n---\n\n[[capabilities/auth]] [[capabilities/auth|Auth]] [[capabilities/auth#h]]\n';
    const next = rewriteRenamedDocRefs(raw, args);
    expect(next).toContain('[[capabilities/authn]]');
    expect(next).toContain('[[capabilities/authn|Auth]]');
    expect(next).toContain('[[capabilities/authn#h]]');
  });

  it('rewrites a same-directory relative markdown link', () => {
    // The old regex demanded the full slug inside the parentheses, so this
    // exact form was detected as a referrer but left dangling.
    const raw = '---\nkind: capability\n---\n\nSee [auth](auth.md) and [auth](./auth.md#h).\n';
    const next = rewriteRenamedDocRefs(raw, args);
    expect(next).toContain('[auth](authn.md)');
    expect(next).toContain('[auth](authn.md#h)');
  });

  it('rewrites a parent-relative markdown link from another directory', () => {
    const raw = '---\nkind: element\n---\n\n[auth](../capabilities/auth.md)\n';
    const next = rewriteRenamedDocRefs(raw, { ...args, referrerSlug: 'elements/token' });
    expect(next).toContain('[auth](../capabilities/authn.md)');
  });

  it('does not touch links resolving to other documents', () => {
    const raw = '---\nkind: document\n---\n\n[other](other-auth.md) [[capabilities/auth-extra]]\n';
    const next = rewriteRenamedDocRefs(raw, args);
    expect(next).toBe(raw);
  });

  it('returns the input unchanged when nothing references the renamed doc', () => {
    const raw = '---\nkind: document\nrelates: [elements/token]\n---\n\nPlain body.\n';
    expect(rewriteRenamedDocRefs(raw, args)).toBe(raw);
  });
});

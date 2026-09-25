// Bug sweep 2026-09-01: the web rename rewrote only body wikilink/md-link
// forms, so every frontmatter relation to the renamed node was orphaned —
// backlinks vanished and the graph minted a phantom stub under the old name.
// These tests pin the parity with MCP `redirectBacklinks` semantics.
import { describe, expect, it } from 'vitest';

import {
  computeRenameRefContext,
  planKindChangeReferrers,
  planReferrerRewrite,
  rewriteMovedDocSelf,
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

describe('rewriteRenamedDocRefs — 2026-09-01 review regressions', () => {
  it('rewrites broader and depends_on refs like the rest of the key family', () => {
    const raw =
      '---\nkind: capability\nbroader: [capabilities/auth]\ndepends_on: [capabilities/auth]\n---\n';
    const next = rewriteRenamedDocRefs(raw, {
      oldSlug: 'capabilities/auth',
      newSlug: 'capabilities/authn',
      referrerSlug: 'capabilities/leaf',
      canRewriteTail: true,
    });
    expect(next).toContain('broader: [capabilities/authn]');
    expect(next).toContain('depends_on: [capabilities/authn]');
  });

  it('resolves nested-vault wikilinks before rewriting, both directions', () => {
    // Inside the nested ontology/ vault, [[capabilities/y]] means
    // ontology/capabilities/y — the raw form must be rewritten when the NESTED
    // doc is renamed, and left alone when a root-level doc of the same written
    // name is renamed.
    const nestedBody = '---\nkind: document\n---\n\nsee [[capabilities/y]] and [[capabilities/y|the y]].\n';
    const nestedRename = rewriteRenamedDocRefs(nestedBody, {
      oldSlug: 'ontology/capabilities/y',
      newSlug: 'ontology/capabilities/z',
      referrerSlug: 'ontology/elements/a',
      canRewriteTail: false,
    });
    expect(nestedRename).toContain('[[capabilities/z]]');
    expect(nestedRename).toContain('[[capabilities/z|the y]]');

    const rootRename = rewriteRenamedDocRefs(nestedBody, {
      oldSlug: 'capabilities/y',
      newSlug: 'capabilities/z',
      referrerSlug: 'ontology/elements/a',
      canRewriteTail: false,
    });
    expect(rootRename, 'a nested link to a different node must not be redirected').toBe(nestedBody);
  });
});

/*
 * The moved document's own bytes (2026-09-26, map-edit QA D6). A rename moved the file and
 * rewrote every referrer, then wrote the old bytes verbatim at the new path — so the moved
 * file still declared `slug: <old path>` while it lived at the new one. The rule is MCP
 * `rename_concept`'s: `slug:` follows the move only when it mirrors the old file slug.
 */
describe('rewriteMovedDocSelf', () => {
  const moved = { oldSlug: 'capabilities/mcp-tool-server', newSlug: 'capabilities/mcp-tool-host' };

  it('moves a `slug:` that mirrors the old file slug, touching no other line', () => {
    const raw =
      '---\nuid: 292f0e3a-23a8-4bad-9f87-7a38e1f1a01c\nslug: capabilities/mcp-tool-server\n' +
      'kind: capability\ntitle: MCP tool server\n---\n\nBody stays.\n';
    const next = rewriteMovedDocSelf(raw, moved);
    expect(next).toBe(
      raw.replace('slug: capabilities/mcp-tool-server', 'slug: capabilities/mcp-tool-host'),
    );
  });

  it('keeps a `slug:` that is a user-facing alias rather than the file slug', () => {
    const raw = '---\nslug: ontology-atlas\nkind: project\ntitle: Atlas\n---\n';
    expect(
      rewriteMovedDocSelf(raw, { oldSlug: 'projects/atlas', newSlug: 'projects/atlas-2' }),
    ).toBe(raw);
  });

  it('adds no `slug:` to a document that never declared one', () => {
    const raw = '---\nkind: capability\ntitle: A\n---\n\nBody\n';
    expect(rewriteMovedDocSelf(raw, moved)).toBe(raw);
  });

  it("applies the caller's frontmatter changes in the same bytes (a reclassify move)", () => {
    const raw = '---\nslug: capabilities/x\nkind: capability\ntitle: X\n---\n\nBody\n';
    const next = rewriteMovedDocSelf(raw, {
      oldSlug: 'capabilities/x',
      newSlug: 'elements/x',
      updates: { kind: 'element' },
    });
    expect(next).toBe('---\nslug: elements/x\nkind: element\ntitle: X\n---\n\nBody\n');
  });
});

/*
 * A kind change moves an entry between the lists named for kinds (2026-09-26, map-edit review).
 *
 * Reclassifying `capabilities/companion-memories` into an element moved the file and rewrote
 * every referrer to the new address, but kept each entry under its OLD list: the domain then read
 * `capabilities: [..., elements/companion-memories, ...]`. It still resolved, so no warning fired
 * and the map drew nothing wrong, while `vault.mjs` counted an element among the domain's
 * capabilities. The lists named for a kind (`domains`, `capabilities`, `elements`; spec §5) say
 * what their entries are, so the entry follows its document's new kind — when the referrer's kind
 * may hold that list. When it may not, nothing is guessed: the entry stays and is reported.
 */
describe('planReferrerRewrite — a kind change moves the entry to the new kind list', () => {
  const reclassify = {
    oldSlug: 'capabilities/companion-memories',
    newSlug: 'elements/companion-memories',
    referrerSlug: 'domains/human-workbench',
    canRewriteTail: true,
    newKind: 'element',
  };

  it('writes the reported referrer with the element under elements, not capabilities', () => {
    const raw =
      '---\nkind: domain\ncapabilities: [capabilities/agent-work-visibility, capabilities/companion-memories]\n' +
      'elements: [elements/map-camera]\n---\n';
    const next = rewriteRenamedDocRefs(raw, reclassify);
    expect(next).toContain('capabilities: [capabilities/agent-work-visibility]\n');
    expect(next).toContain('elements: [elements/map-camera, elements/companion-memories]\n');
  });

  it('moves the entry from capabilities to elements, appending and keeping every other order', () => {
    const raw =
      '---\nkind: domain\ntitle: Human workbench\n' +
      'capabilities: [capabilities/agent-work-visibility, capabilities/companion-memories, capabilities/desktop-download-decision]\n' +
      'relation_notes: { capabilities/companion-memories: "Reflections live beside the chooser." }\n' +
      'elements: [elements/change-summary-headline, elements/map-camera]\n---\n\nBody.\n';
    const plan = planReferrerRewrite(raw, reclassify);
    expect(plan.text).toContain(
      'capabilities: [capabilities/agent-work-visibility, capabilities/desktop-download-decision]\n',
    );
    expect(plan.text).toContain(
      'elements: [elements/change-summary-headline, elements/map-camera, elements/companion-memories]\n',
    );
    // The rationale follows the edge's new spelling, so it still names a declared relation.
    expect(plan.text).toContain('relation_notes: { elements/companion-memories: ');
    expect(plan.text).not.toContain('capabilities/companion-memories');
    expect(plan.moved).toEqual([
      { ref: 'elements/companion-memories', from: 'capabilities', to: 'elements' },
    ]);
    expect(plan.kept).toEqual([]);
    // The compatibility wrapper writes the same bytes.
    expect(rewriteRenamedDocRefs(raw, reclassify)).toBe(plan.text);
  });

  it('creates the new kind list when the referrer had none, and never lists the entry twice', () => {
    const noList = '---\nkind: domain\ncapabilities: [capabilities/companion-memories]\n---\n';
    const created = planReferrerRewrite(noList, reclassify).text;
    expect(created).toContain('capabilities: []\n');
    expect(created).toContain('elements: [elements/companion-memories]\n');

    const alreadyThere =
      '---\nkind: domain\ncapabilities: [capabilities/companion-memories]\n' +
      'elements: [elements/companion-memories, elements/map-camera]\n---\n';
    const merged = planReferrerRewrite(alreadyThere, reclassify).text;
    expect(merged).toContain('elements: [elements/companion-memories, elements/map-camera]\n');
    expect(merged.match(/elements\/companion-memories/g)).toHaveLength(1);
  });

  it('rewrites a referrer that mentions the document only in prose, and touches no list', () => {
    const raw =
      '---\nkind: capability\ntitle: Memory recall\nelements: [elements/recall-index]\n---\n\n' +
      'Recall reads [companion memories](companion-memories.md) and [[capabilities/companion-memories]].\n';
    const plan = planReferrerRewrite(raw, {
      ...reclassify,
      referrerSlug: 'capabilities/memory-recall',
    });
    expect(plan.text).toContain('[companion memories](../elements/companion-memories.md)');
    expect(plan.text).toContain('[[elements/companion-memories]]');
    expect(plan.text).toContain('elements: [elements/recall-index]\n');
    expect(plan.text).not.toContain('capabilities:');
    expect(plan.moved).toEqual([]);
    expect(plan.kept).toEqual([]);
  });

  it('leaves the entry in place and reports it when the referrer kind has no list for the new kind', () => {
    // A capability keeps elements, not capabilities: an element that becomes a capability is
    // not guessed into a list its holder may not have (that would invent a same-kind bridge).
    const raw = '---\nkind: capability\ntitle: Recall\nelements: [elements/recall-index, elements/x]\n---\n';
    const plan = planReferrerRewrite(raw, {
      oldSlug: 'elements/x',
      newSlug: 'capabilities/x',
      referrerSlug: 'capabilities/recall',
      canRewriteTail: true,
      newKind: 'capability',
    });
    expect(plan.text).toContain('elements: [elements/recall-index, capabilities/x]\n');
    expect(plan.text).not.toMatch(/^capabilities:/m);
    expect(plan.moved).toEqual([]);
    expect(plan.kept).toEqual([{ ref: 'capabilities/x', key: 'elements' }]);
  });

  it('reports an in-place kind change that no list of the referrer can hold', () => {
    // A document keeps no folder, so the file stays where it is; no kind keeps a list of documents.
    const raw = '---\nkind: domain\ncapabilities: [capabilities/a, capabilities/x]\n---\n';
    const plan = planReferrerRewrite(raw, {
      oldSlug: 'capabilities/x',
      newSlug: 'capabilities/x',
      referrerSlug: 'domains/d',
      canRewriteTail: true,
      newKind: 'document',
    });
    expect(plan.text).toBe(raw);
    expect(plan.kept).toEqual([{ ref: 'capabilities/x', key: 'capabilities' }]);
  });

  it('moves an in-place kind change between lists without rewriting any address', () => {
    const raw = '---\nkind: project\ncapabilities: [notes/x]\ndomains: [domains/a]\n---\n';
    const plan = planReferrerRewrite(raw, {
      oldSlug: 'notes/x',
      newSlug: 'notes/x',
      referrerSlug: 'ontology-atlas',
      canRewriteTail: true,
      newKind: 'domain',
    });
    expect(plan.text).toContain('capabilities: []\n');
    expect(plan.text).toContain('domains: [domains/a, notes/x]\n');
    expect(plan.moved).toEqual([{ ref: 'notes/x', from: 'capabilities', to: 'domains' }]);
  });

  it('reports a domain: parent that is no longer a domain', () => {
    const raw = '---\nkind: capability\ndomain: domains/payments\n---\n';
    const plan = planReferrerRewrite(raw, {
      oldSlug: 'domains/payments',
      newSlug: 'capabilities/payments',
      referrerSlug: 'capabilities/refunds',
      canRewriteTail: true,
      newKind: 'capability',
    });
    expect(plan.text).toContain('domain: capabilities/payments\n');
    expect(plan.kept).toEqual([{ ref: 'capabilities/payments', key: 'domain' }]);
  });

  it('keeps a rename without a kind change in the same list, as before', () => {
    const raw = '---\nkind: domain\ncapabilities: [capabilities/companion-memories]\n---\n';
    const plan = planReferrerRewrite(raw, {
      oldSlug: reclassify.oldSlug,
      newSlug: reclassify.newSlug,
      referrerSlug: reclassify.referrerSlug,
      canRewriteTail: true,
    });
    expect(plan.text).toContain('capabilities: [elements/companion-memories]\n');
    expect(plan.moved).toEqual([]);
    expect(plan.kept).toEqual([]);
  });
});

describe('planKindChangeReferrers — what a kind change will do, read from the folder', () => {
  const doc = (slug: string, frontmatter: Record<string, unknown>) => ({ slug, frontmatter });

  it('lists only the referrers whose kind lists change or stay, never the moved document', () => {
    const docs = [
      doc('capabilities/companion-memories', { kind: 'capability' }),
      doc('domains/human-workbench', {
        kind: 'domain',
        capabilities: ['capabilities/companion-memories', 'capabilities/ontology-map'],
      }),
      doc('capabilities/memory-recall', { kind: 'capability', relates: ['capabilities/companion-memories'] }),
      doc('projects/atlas', { kind: 'project', capabilities: ['capabilities/companion-memories'] }),
      doc('capabilities/recall-bridge', { kind: 'capability', capabilities: ['capabilities/companion-memories'] }),
    ];
    expect(
      planKindChangeReferrers(docs, {
        oldSlug: 'capabilities/companion-memories',
        newSlug: 'elements/companion-memories',
        newKind: 'element',
      }),
    ).toEqual([
      {
        slug: 'domains/human-workbench',
        moved: [{ ref: 'elements/companion-memories', from: 'capabilities', to: 'elements' }],
        kept: [],
      },
      {
        slug: 'projects/atlas',
        moved: [{ ref: 'elements/companion-memories', from: 'capabilities', to: 'elements' }],
        kept: [],
      },
      {
        slug: 'capabilities/recall-bridge',
        moved: [{ ref: 'elements/companion-memories', from: 'capabilities', to: 'elements' }],
        kept: [],
      },
    ]);
  });
});

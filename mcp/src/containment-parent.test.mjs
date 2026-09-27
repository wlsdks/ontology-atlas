import assert from 'node:assert/strict';
import test from 'node:test';

import { parentedSlugs, suppressParentedExpectedFieldIssues } from './validate.mjs';

/**
 * **Never warn that a node has no parent when it already has one** (2026-08-11).
 *
 * Where it came from — walking the north-star journey for real: a vault freshly
 * made with `init --quick-start` **failed its own gates.** There was one warning
 * (`missing-expected-field: domain`) and that one turned three things red:
 * `health` exit 1, `mcp-verify` exit 1 (`vaultWarnings present`), `agent-brief`
 * exit 1 (`needs_shape 45/100`). To a person that reads as *"what did I do
 * wrong"*, and **to an agent it is a connection-failure signal** — while the
 * server and all 35 tools were in fact fine.
 *
 * The cause is that the gate **looks at one file at a time**. The warning's own
 * wording is *"a parent can be found in the tree"*, and that vault's project node
 * already held both via `contains: [capabilities/catalog, capabilities/checkout]`.
 * **It said there was no parent when the parent was already there.**
 *
 * Why no domain was invented: the analyzer derives domains **from README headings
 * only**. Fabricating a domain for a repository with no heading is something this
 * product forbids itself — the analyzer's own wording is *"source folder is
 * implementation evidence, not proof of a shared capability meaning"* and *"README
 * heading is a concept clue, not proof of a shared business boundary"*. Instead of
 * inventing a boundary that does not exist, **acknowledge the parent that does.**
 *
 * Same direction as this repository's contract: *"Project containment is
 * implicit"* — `projectIds` is derived by BFS over containment.
 *
 * ⚠️ **This narrows the warning, it does not remove it.** A capability nobody
 * contains still gets it — there the parent really is missing.
 */

const doc = (slug, frontmatter) => ({ slug, frontmatter });

test('containment parent · a capability the project contains has a parent', () => {
  const docs = [
    doc('shop', { kind: 'project', contains: ['capabilities/checkout', 'capabilities/catalog'] }),
    doc('capabilities/checkout', { kind: 'capability' }),
    doc('capabilities/catalog', { kind: 'capability' }),
  ];
  const parented = parentedSlugs(docs);
  assert.equal(parented.has('capabilities/checkout'), true);
  assert.equal(parented.has('capabilities/catalog'), true);
  assert.equal(parented.has('shop'), false, 'nothing contains the project');
});

test('containment parent · a domain capabilities list is also a parent', () => {
  const docs = [
    doc('domains/auth', { kind: 'domain', capabilities: ['capabilities/login'] }),
    doc('capabilities/login', { kind: 'capability' }),
  ];
  assert.equal(parentedSlugs(docs).has('capabilities/login'), true);
});

test('containment parent · uncontained nodes have no parent', () => {
  const docs = [
    doc('shop', { kind: 'project', contains: [] }),
    doc('capabilities/orphan', { kind: 'capability' }),
  ];
  assert.equal(parentedSlugs(docs).has('capabilities/orphan'), false);
});

test('suppress · a parent clears the missing-domain warning', () => {
  const docs = [
    doc('shop', { kind: 'project', contains: ['capabilities/checkout'] }),
    doc('capabilities/checkout', { kind: 'capability' }),
  ];
  const issuesBySlug = new Map([
    [
      'capabilities/checkout',
      [{ code: 'missing-expected-field', severity: 'warning', message: '`domain:` 가 비어있습니다: …' }],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.deepEqual(issuesBySlug.get('capabilities/checkout'), []);
});

test('suppress · without a parent the warning stays, since then it is a real defect', () => {
  const docs = [doc('capabilities/orphan', { kind: 'capability' })];
  const issuesBySlug = new Map([
    [
      'capabilities/orphan',
      [{ code: 'missing-expected-field', severity: 'warning', message: '`domain:` 가 비어있습니다: …' }],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.equal(issuesBySlug.get('capabilities/orphan').length, 1);
});

test('suppress · leaves warnings with other codes alone', () => {
  const docs = [doc('shop', { kind: 'project', contains: ['capabilities/checkout'] }), doc('capabilities/checkout', { kind: 'capability' })];
  const issuesBySlug = new Map([
    [
      'capabilities/checkout',
      [
        { code: 'missing-expected-field', severity: 'warning', message: '`domain:` 가 비어있습니다: …' },
        { code: 'dangling-graph-reference', severity: 'warning', message: '없는 노드를 가리킵니다' },
      ],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.deepEqual(
    issuesBySlug.get('capabilities/checkout').map((i) => i.code),
    ['dangling-graph-reference'],
  );
});

test('suppress · containment does not clear expected-field warnings other than domain', () => {
  // Containment establishes **the parent** and nothing else. The other expected fields are out of its reach.
  const docs = [doc('shop', { kind: 'project', contains: ['capabilities/checkout'] }), doc('capabilities/checkout', { kind: 'capability' })];
  const issuesBySlug = new Map([
    [
      'capabilities/checkout',
      [{ code: 'missing-expected-field', severity: 'warning', message: '`path:` 가 비어있습니다: …' }],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.equal(issuesBySlug.get('capabilities/checkout').length, 1);
});

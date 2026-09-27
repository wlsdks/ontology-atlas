import assert from 'node:assert/strict';
import test from 'node:test';

import { parentedSlugs, suppressParentedExpectedFieldIssues } from './validate.mjs';

/**
 * A node another node contains has a parent, so the missing-`domain:` warning
 * must not fire on it (an `init --quick-start` vault otherwise fails its own
 * health gate). No domain is invented: README headings are concept clues, not
 * boundaries. This narrows the warning; an uncontained capability keeps it.
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
  // Containment establishes the parent and nothing else.
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

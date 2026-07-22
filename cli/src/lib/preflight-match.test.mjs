import { strict as assert } from 'node:assert';
import test from 'node:test';
import { matchChangedFilesToVaultNodes } from './preflight-match.mjs';

function doc(slug, frontmatter) {
  return { slug, frontmatter };
}

test('matchChangedFilesToVaultNodes — element path: exact file match', () => {
  const docs = [
    doc('elements/token-issue', { kind: 'element', title: 'Token issue', path: 'src/features/auth/token.ts' }),
  ];
  const matches = matchChangedFilesToVaultNodes(docs, ['src/features/auth/token.ts', 'README.md']);
  assert.deepEqual(matches, [
    {
      slug: 'elements/token-issue',
      kind: 'element',
      title: 'Token issue',
      domain: '',
      matchedFiles: ['src/features/auth/token.ts'],
    },
  ]);
});

test('matchChangedFilesToVaultNodes — capability elements[]: directory containment', () => {
  const docs = [
    doc('capabilities/auth', {
      kind: 'capability',
      title: 'Auth',
      domain: 'auth',
      elements: ['src/features/auth/'],
    }),
  ];
  const matches = matchChangedFilesToVaultNodes(docs, ['src/features/auth/token.ts']);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].slug, 'capabilities/auth');
  assert.deepEqual(matches[0].matchedFiles, ['src/features/auth/token.ts']);
});

test('matchChangedFilesToVaultNodes — elements[] ontology slug refs are never treated as paths', () => {
  const docs = [
    doc('capabilities/auth', {
      kind: 'capability',
      title: 'Auth',
      elements: ['elements/token-issue', 'capabilities/other'],
    }),
  ];
  const matches = matchChangedFilesToVaultNodes(docs, ['elements/token-issue']);
  assert.deepEqual(matches, []);
});

test('matchChangedFilesToVaultNodes — no kind: frontmatter is skipped entirely', () => {
  const docs = [doc('README', { title: 'not an ontology node', path: 'README.md' })];
  const matches = matchChangedFilesToVaultNodes(docs, ['README.md']);
  assert.deepEqual(matches, []);
});

test('matchChangedFilesToVaultNodes — no changed files returns empty without scanning docs', () => {
  const docs = [doc('elements/x', { kind: 'element', path: 'src/x.ts' })];
  assert.deepEqual(matchChangedFilesToVaultNodes(docs, []), []);
  assert.deepEqual(matchChangedFilesToVaultNodes(docs, undefined), []);
});

test('matchChangedFilesToVaultNodes — dedupes matchedFiles and sorts by slug', () => {
  const docs = [
    doc('elements/b', { kind: 'element', title: 'B', path: 'src/b.ts' }),
    doc('elements/a', {
      kind: 'element',
      title: 'A',
      path: 'src/a.ts',
      elements: ['src/a.ts'], // not used for element kind, but must not crash
    }),
  ];
  const matches = matchChangedFilesToVaultNodes(docs, ['src/a.ts', 'src/b.ts']);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].slug, 'elements/a');
  assert.equal(matches[1].slug, 'elements/b');
});

test('matchChangedFilesToVaultNodes — a file outside any referenced path/dir does not match', () => {
  const docs = [doc('capabilities/auth', { kind: 'capability', elements: ['src/features/auth/'] })];
  const matches = matchChangedFilesToVaultNodes(docs, ['src/features/authorization/x.ts']);
  assert.deepEqual(matches, []);
});

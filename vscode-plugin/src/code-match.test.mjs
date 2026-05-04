// Unit tests for findOntologyMatch — code↔ontology jump (R13 #50).
// node --test src/code-match.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';
import { findOntologyMatch } from '../out/code-match.js';

const ROOT = '/abs/repo';

const NODES = [
  {
    slug: 'elements/file-system-access-api',
    kind: 'element',
    title: 'File System Access API',
    filePath: '/abs/repo/docs/ontology/elements/file-system-access-api.md',
    path: 'src/features/docs-vault-local',
  },
  {
    slug: 'elements/sigma-graphology',
    kind: 'element',
    title: 'sigma-graphology',
    filePath: '/abs/repo/docs/ontology/elements/sigma-graphology.md',
    path: 'package.json',
  },
  {
    slug: 'capabilities/builder-vault-write',
    kind: 'capability',
    title: 'Builder ↔ Vault md write',
    filePath: '/abs/repo/docs/ontology/capabilities/builder-vault-write.md',
    elements: [
      'src/views/ontology-edit/ui/OntologyEditPage.tsx',
      'src/features/docs-vault-local/model/use-local-vault.ts',
    ],
  },
];

test('정확 path 매치 (element.path === relative)', () => {
  const match = findOntologyMatch(ROOT, '/abs/repo/package.json', NODES);
  assert.equal(match?.slug, 'elements/sigma-graphology');
});

test('directory ancestor 매치 (element.path 가 prefix)', () => {
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/src/features/docs-vault-local/lib/foo.ts',
    NODES,
  );
  assert.equal(match?.slug, 'elements/file-system-access-api');
});

test('capability.elements 배열 안의 정확 path 매치', () => {
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/src/views/ontology-edit/ui/OntologyEditPage.tsx',
    NODES,
  );
  assert.equal(match?.slug, 'capabilities/builder-vault-write');
});

test('매치 없으면 null', () => {
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/some/random/unlabeled-file.ts',
    NODES,
  );
  assert.equal(match, null);
});

test('workspace root 외부 파일은 null (rel 이 ".." 로 시작)', () => {
  const match = findOntologyMatch(
    ROOT,
    '/abs/other/repo/file.ts',
    NODES,
  );
  assert.equal(match, null);
});

test('가장 specific 한 매치가 우선 (longer path score 높음)', () => {
  const nestedNodes = [
    {
      slug: 'elements/wide',
      kind: 'element',
      title: 'wide',
      filePath: '/x.md',
      path: 'src',
    },
    {
      slug: 'elements/specific',
      kind: 'element',
      title: 'specific',
      filePath: '/y.md',
      path: 'src/features/auth',
    },
  ];
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/src/features/auth/login.ts',
    nestedNodes,
  );
  assert.equal(match?.slug, 'elements/specific');
});

test('R13 #54 self-match — vault .md 자체 열면 그 노드 반환 (최우선)', () => {
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/docs/ontology/elements/file-system-access-api.md',
    NODES,
  );
  assert.equal(match?.slug, 'elements/file-system-access-api');
});

test('R13 #54 self-match — node.path 가 매치돼도 self-match 가 우선', () => {
  // edge: 어떤 element 의 .md 자체가 다른 element 의 path 안에 있어도
  // self-match 가 항상 이긴다 (loop order independent).
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/docs/ontology/elements/sigma-graphology.md',
    NODES,
  );
  assert.equal(match?.slug, 'elements/sigma-graphology');
});

test('R13 #54 self-match — vault 외부의 .md 는 영향 없음', () => {
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/docs/ARCHITECTURE.md', // not a vault node
    NODES,
  );
  assert.equal(match, null);
});

test('exact file path 매치가 directory ancestor 보다 우선', () => {
  const mixedNodes = [
    {
      slug: 'elements/folder',
      kind: 'element',
      title: 'folder',
      filePath: '/x.md',
      path: 'src/features',
    },
    {
      slug: 'elements/file',
      kind: 'element',
      title: 'file',
      filePath: '/y.md',
      path: 'src/features/auth.ts',
    },
  ];
  const match = findOntologyMatch(
    ROOT,
    '/abs/repo/src/features/auth.ts',
    mixedNodes,
  );
  assert.equal(match?.slug, 'elements/file');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildProjectMeaningInventory } from './project-meaning-inventory.mjs';

const GRAPH_HASH = 'project-graph-v1:a1b2c3d4';

function source(witnesses) {
  return {
    receipt: {
      contractVersion: 1,
      projectSlug: 'project',
      sourceId: 'source-project',
      sourceKind: 'git',
      sourceRevision: 'abc123',
      sourceFingerprint: 'git:abc123:clean',
      graphHash: GRAPH_HASH,
      measuredAt: '2026-08-02T10:00:00.000Z',
      status: 'verified_current',
      currentness: 'current',
      topGap: null,
      nextAction: { id: 'use_current_evidence' },
      witnessSummary: {
        total: witnesses.length,
        supported: witnesses.filter((row) => row.supported).length,
        missing: witnesses.filter((row) => !row.supported).length,
      },
      witnesses,
      diagnostics: { dirty: false, truncated: false },
    },
  };
}

function scope(rows) {
  return {
    operation: 'project_scope',
    project: 'project',
    nodes: { total: rows.length, limited: false, rows },
  };
}

test('builds an inventory only from the complete scoped graph and supported path witnesses', () => {
  const result = buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope([
      { slug: 'project', kind: 'project' },
      { slug: 'domains/core', kind: 'domain' },
      { slug: 'capabilities/search', kind: 'capability' },
    ]),
    artifactEdges: [
      { from: 'project', to: 'domains/core', via: 'domains', resolved: true, external: false },
      { from: 'domains/core', to: 'capabilities/search', via: 'capabilities', resolved: true, external: false },
      { from: 'capabilities/search', to: 'domains/core', via: 'dependencies', resolved: true, external: false },
    ],
    scopedDocs: [
      { slug: 'project', frontmatter: { path: 'README.md' }, body: '' },
      { slug: 'domains/core', frontmatter: {}, body: '' },
      { slug: 'capabilities/search', frontmatter: { path: 'src/search.ts' }, body: '' },
    ],
    projectSource: source([
      { id: 'readme', nodeSlug: 'project', role: 'scope', path: 'README.md', supported: true },
      { id: 'search', nodeSlug: 'capabilities/search', role: 'implementation', path: 'src/search.ts', supported: true },
    ]),
  });

  assert.deepEqual(result, {
    status: 'ready',
    evidenceClaims: [
      { concept: 'capabilities/search', path: 'src/search.ts' },
      { concept: 'project', path: 'README.md' },
    ],
    inventory: {
      contract: 'meaningWitnessInventory:v1',
      graphHash: GRAPH_HASH,
      sourceFingerprint: 'git:abc123:clean',
      concepts: ['capabilities/search', 'domains/core', 'project'],
      kinds: {
        project: 'project',
        'domains/core': 'domain',
        'capabilities/search': 'capability',
      },
      relations: [
        { from: 'capabilities/search', to: 'domains/core', type: 'depends_on' },
        { from: 'domains/core', to: 'capabilities/search', type: 'capabilities' },
        { from: 'project', to: 'domains/core', type: 'domains' },
      ],
      evidence: ['README.md', 'src/search.ts'],
      paths: ['README.md', 'src/search.ts'],
    },
  });
});

test('fails closed when the saved source receipt is malformed', () => {
  const projectSource = source([
    { id: 'search', nodeSlug: 'capabilities/search', role: 'implementation', path: 'src/search.ts', supported: true },
  ]);
  projectSource.receipt.witnessSummary.supported = 0;

  const result = buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope([{ slug: 'project' }, { slug: 'capabilities/search' }]),
    artifactEdges: [],
    scopedDocs: [{ slug: 'capabilities/search', frontmatter: { path: 'src/search.ts' } }],
    projectSource,
  });

  assert.deepEqual(result, { status: 'unavailable', reason: 'source_receipt_unavailable' });
});

test('does not synthesize an inventory for a missing receipt or invalid source binding view', () => {
  const input = {
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope([{ slug: 'project' }]),
    artifactEdges: [],
    scopedDocs: [],
  };
  assert.deepEqual(buildProjectMeaningInventory(input), {
    status: 'unavailable',
    reason: 'source_receipt_unavailable',
  });

  const projectSource = source([]);
  Object.assign(projectSource, {
    contractVersion: 1,
    projectSlug: 'project',
    status: 'invalid',
    currentness: 'stale',
    bindingCardinality: 2,
  });
  assert.deepEqual(buildProjectMeaningInventory({ ...input, projectSource }), {
    status: 'unavailable',
    reason: 'source_receipt_unavailable',
  });
});

test('keeps the current graph inventory but drops source evidence when the receipt graph is stale', () => {
  const projectSource = source([
    { id: 'search', nodeSlug: 'capabilities/search', role: 'implementation', path: 'src/search.ts', supported: true },
  ]);
  projectSource.receipt.graphHash = 'project-graph-v1:deadbeef';

  const result = buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope([{ slug: 'project' }, { slug: 'capabilities/search' }]),
    artifactEdges: [
      { from: 'project', to: 'capabilities/search', via: 'contains', resolved: true, external: false },
    ],
    scopedDocs: [{ slug: 'capabilities/search', frontmatter: { path: 'src/search.ts' } }],
    projectSource,
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.inventory.evidence, []);
  assert.deepEqual(result.inventory.paths, []);
  assert.deepEqual(result.evidenceClaims, []);
  assert.equal(result.inventory.sourceFingerprint, 'git:abc123:clean');
  assert.deepEqual(result.inventory.relations, [
    { from: 'project', to: 'capabilities/search', type: 'contains' },
  ]);
});

test('rejects limited and over-500 project scopes instead of treating partial rows as complete', () => {
  const limited = scope([{ slug: 'project' }]);
  limited.nodes.limited = true;
  limited.nodes.total = 2;
  assert.deepEqual(buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: limited,
    artifactEdges: [],
    scopedDocs: [],
    projectSource: source([]),
  }), { status: 'unavailable', reason: 'incomplete_project_scope' });

  const rows = [{ slug: 'project' }, ...Array.from({ length: 500 }, (_, index) => ({
    slug: `elements/node-${index}`,
  }))];
  assert.deepEqual(buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope(rows),
    artifactEdges: [],
    scopedDocs: [],
    projectSource: source([]),
  }), { status: 'unavailable', reason: 'incomplete_project_scope' });
});

test('excludes body-only, ghost, unsupported, and probe-wide file claims', () => {
  const projectSource = source([
    { id: 'real', nodeSlug: 'capabilities/search', role: 'implementation', path: 'src/search.ts', supported: true },
    { id: 'body', nodeSlug: 'capabilities/search', role: 'citation', path: 'docs/body-only.md', supported: true },
    { id: 'ghost', nodeSlug: 'capabilities/ghost', role: 'implementation', path: 'src/ghost.ts', supported: true },
    { id: 'unsupported', nodeSlug: 'capabilities/search', role: 'implementation', path: 'src/unsupported.ts', supported: false },
  ]);
  projectSource.rootPath = '/private/source-root';
  projectSource.receipt.probeFiles = ['/private/source-root/src/not-a-witness.ts'];

  const result = buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope([{ slug: 'project' }, { slug: 'capabilities/search' }]),
    artifactEdges: [],
    scopedDocs: [{
      slug: 'capabilities/search',
      frontmatter: { path: 'src/search.ts' },
      body: 'See docs/body-only.md and src/ghost.ts and src/unsupported.ts.',
    }],
    projectSource,
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.inventory.evidence, ['src/search.ts']);
  assert.deepEqual(result.inventory.paths, ['src/search.ts']);
  assert.deepEqual(result.evidenceClaims, [
    { concept: 'capabilities/search', path: 'src/search.ts' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private|body-only|ghost|unsupported|not-a-witness/);
});

test('keeps only deterministic resolved internal relations and maps only dependencies', () => {
  const result = buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope([
      { slug: 'project' },
      { slug: 'capabilities/a' },
      { slug: 'capabilities/b' },
    ]),
    artifactEdges: [
      { from: 'capabilities/b', to: 'capabilities/a', via: 'relates', resolved: true, external: false },
      { from: 'capabilities/a', to: 'capabilities/b', via: 'dependencies', resolved: true, external: false },
      { from: 'capabilities/a', to: 'capabilities/b', via: 'dependencies', resolved: true, external: false },
      { from: 'capabilities/b', to: 'capabilities/a', via: 'depends_on', resolved: true, external: false },
      { from: 'capabilities/a', to: 'capabilities/b', via: 'broader', resolved: true, external: false },
      { from: 'capabilities/a', to: 'outside', via: 'relates', resolved: true, external: false },
      { from: 'outside', to: 'capabilities/a', via: 'relates', resolved: true, external: false },
      { from: 'capabilities/a', to: 'capabilities/b', via: 'relates', resolved: false, external: false },
      { from: 'capabilities/a', to: 'capabilities/b', via: 'relates', resolved: true, external: true },
    ],
    scopedDocs: [],
    projectSource: source([]),
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.inventory.relations, [
    { from: 'capabilities/a', to: 'capabilities/b', type: 'depends_on' },
    { from: 'capabilities/b', to: 'capabilities/a', type: 'depends_on' },
    { from: 'capabilities/b', to: 'capabilities/a', type: 'relates' },
  ]);
});

test('fails closed on private or traversal witness paths without reflecting them', () => {
  for (const path of ['/private/project/secret.ts', '../secret.ts', 'src/../../secret.ts']) {
    const result = buildProjectMeaningInventory({
      projectSlug: 'project',
      graphHash: GRAPH_HASH,
      projectScope: scope([{ slug: 'project' }]),
      artifactEdges: [],
      scopedDocs: [{ slug: 'project', frontmatter: { path } }],
      projectSource: source([
        { id: 'secret', nodeSlug: 'project', role: 'implementation', path, supported: true },
      ]),
    });
    assert.deepEqual(result, { status: 'unavailable', reason: 'source_receipt_unavailable' });
    assert.doesNotMatch(JSON.stringify(result), /private|secret/);
  }
});

test('deduplicates and sorts concepts, relations, and evidence deterministically', () => {
  const result = buildProjectMeaningInventory({
    projectSlug: 'project',
    graphHash: GRAPH_HASH,
    projectScope: scope([
      { slug: 'project' },
      { slug: 'elements/z' },
      { slug: 'elements/a' },
    ]),
    artifactEdges: [
      { from: 'project', to: 'elements/z', via: 'elements', resolved: true, external: false },
      { from: 'project', to: 'elements/a', via: 'elements', resolved: true, external: false },
      { from: 'project', to: 'elements/z', via: 'elements', resolved: true, external: false },
    ],
    scopedDocs: [
      { slug: 'elements/z', frontmatter: { path: 'src/z.ts' } },
      { slug: 'elements/a', frontmatter: { path: 'src/a.ts' } },
    ],
    projectSource: source([
      { id: 'z-2', nodeSlug: 'elements/z', role: 'implementation', path: 'src/z.ts', supported: true },
      { id: 'a', nodeSlug: 'elements/a', role: 'implementation', path: 'src/a.ts', supported: true },
      { id: 'z-1', nodeSlug: 'elements/z', role: 'implementation', path: 'src/z.ts', supported: true },
    ]),
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.inventory.concepts, ['elements/a', 'elements/z', 'project']);
  assert.deepEqual(result.inventory.relations, [
    { from: 'project', to: 'elements/a', type: 'elements' },
    { from: 'project', to: 'elements/z', type: 'elements' },
  ]);
  assert.deepEqual(result.inventory.evidence, ['src/a.ts', 'src/z.ts']);
});

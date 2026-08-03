import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildProjectSourceGraphHash } from './project-source-graph-hash.mjs';
import { inspectProjectSource } from './project-source-inspection.mjs';
import {
  PROJECT_SOURCE_RECEIPT_VERSION,
  readProjectSourceView,
} from './project-source-receipt.mjs';

function vault() {
  return mkdtempSync(join(tmpdir(), 'atlas-project-source-'));
}

function writeState(root, bindings) {
  mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
  writeFileSync(join(root, '.ontology-atlas', 'project-sources.json'), JSON.stringify({
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    bindings,
  }));
}

function gitSource() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-project-source-git-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'player.ts'), 'export const player = true;\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', [
    '-c', 'user.name=Atlas Test',
    '-c', 'user.email=atlas@example.invalid',
    'commit', '-q', '-m', 'fixture',
  ], { cwd: root });
  return root;
}

function boundInspection(sourceRoot, inspection) {
  return binding({
    sourceId: inspection.sourceId,
    rootPath: sourceRoot,
    kind: inspection.kind,
    receipt: receipt({
      sourceId: inspection.sourceId,
      sourceKind: inspection.kind,
      sourceRevision: inspection.revision,
      sourceFingerprint: inspection.fingerprint,
      diagnostics: { dirty: inspection.dirty, truncated: inspection.truncated },
    }),
  });
}

const receipt = (overrides = {}) => ({
  contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
  projectSlug: 'music-streaming',
  sourceId: 'src_7b9f',
  sourceKind: 'git',
  sourceRevision: 'abc123',
  sourceFingerprint: 'git:abc123:clean',
  graphHash: 'graph-a',
  measuredAt: '2026-08-02T10:00:00.000Z',
  status: 'verified_current',
  currentness: 'current',
  topGap: null,
  nextAction: { id: 'use_current_evidence' },
  witnessSummary: { total: 1, supported: 1, missing: 0 },
  witnesses: [{ id: 'player-entry', nodeSlug: 'player', role: 'entrypoint', path: 'src/player.ts', supported: true }],
  diagnostics: { dirty: false, truncated: false },
  ...overrides,
});

const binding = (overrides = {}) => ({
  projectSlug: 'music-streaming',
  sourceId: 'src_7b9f',
  rootPath: '/private/work/music',
  kind: 'git',
  boundAt: '2026-08-02T09:00:00.000Z',
  receipt: receipt(),
  ...overrides,
});

test('readProjectSourceView keeps an unbound project valid and unmeasured', () => {
  const result = readProjectSourceView(vault(), 'music-streaming', 'graph-a');
  assert.deepEqual(result, {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug: 'music-streaming',
    status: 'not_measured',
    currentness: 'unavailable',
    measuredAt: null,
    topGap: { id: 'source_unbound' },
    nextAction: { id: 'connect_source' },
    bindingCardinality: 0,
    receipt: null,
  });
});

test('readProjectSourceView returns one saved receipt without leaking its private root', () => {
  const root = vault();
  writeState(root, [binding()]);
  const result = readProjectSourceView(root, 'music-streaming', 'graph-a');
  assert.equal(result.status, 'verified_current');
  assert.equal(result.currentness, 'unavailable');
  assert.equal(result.bindingCardinality, 1);
  assert.equal(result.receipt.contractVersion, PROJECT_SOURCE_RECEIPT_VERSION);
  assert.doesNotMatch(JSON.stringify(result), /\/private\/work\/music/);
});

test('readProjectSourceView independently verifies a matching bound Git source as current', () => {
  const root = vault();
  const sourceRoot = gitSource();
  const inspection = inspectProjectSource(sourceRoot);
  writeState(root, [boundInspection(sourceRoot, inspection)]);

  const result = readProjectSourceView(root, 'music-streaming', 'graph-a');

  assert.equal(result.status, 'verified_current');
  assert.equal(result.currentness, 'current');
  assert.equal(result.topGap, null);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(sourceRoot));
});

test('readProjectSourceView marks a changed bound Git source stale instead of restamping it', () => {
  const root = vault();
  const sourceRoot = gitSource();
  const inspection = inspectProjectSource(sourceRoot);
  assert.ok(inspection.files.length > 0, 'the source probe must inspect a non-empty file set');
  writeState(root, [boundInspection(sourceRoot, inspection)]);
  writeFileSync(join(sourceRoot, 'src', 'player.ts'), 'export const player = false;\n');

  const result = readProjectSourceView(root, 'music-streaming', 'graph-a');

  assert.equal(result.status, 'review_required');
  assert.equal(result.currentness, 'stale');
  assert.deepEqual(result.topGap, { id: 'source_changed' });
  assert.deepEqual(result.nextAction, { id: 'remeasure_source' });
});

test('readProjectSourceView verifies and invalidates a bound non-Git folder source', () => {
  const root = vault();
  const sourceRoot = mkdtempSync(join(tmpdir(), 'atlas-project-source-folder-'));
  writeFileSync(join(sourceRoot, 'product.txt'), 'first\n');
  const inspection = inspectProjectSource(sourceRoot);
  assert.equal(inspection.kind, 'folder');
  assert.deepEqual(inspection.files, ['product.txt']);
  writeState(root, [boundInspection(sourceRoot, inspection)]);

  assert.equal(
    readProjectSourceView(root, 'music-streaming', 'graph-a').currentness,
    'current',
  );
  writeFileSync(join(sourceRoot, 'product.txt'), 'second\n');
  const changed = readProjectSourceView(root, 'music-streaming', 'graph-a');
  assert.equal(changed.status, 'review_required');
  assert.equal(changed.currentness, 'stale');
  assert.deepEqual(changed.topGap, { id: 'source_changed' });
});

test('browser and MCP share one project-scoped graph hash contract', () => {
  const root = vault();
  const graphHash = buildProjectSourceGraphHash('music-streaming', [
    {
      slug: 'capabilities/play',
      frontmatter: { path: './src/player.ts', title: 'Play', kind: 'capability' },
    },
    {
      slug: 'music-streaming',
      frontmatter: {
        capabilities: ['capabilities/play'],
        title: 'Music',
        kind: 'project',
      },
    },
  ]);
  writeState(root, [binding({ receipt: receipt({ graphHash }) })]);

  const result = readProjectSourceView(root, 'music-streaming', graphHash);
  assert.equal(result.status, 'verified_current');
  assert.equal(result.topGap, null);
  assert.equal(result.receipt.graphHash, graphHash);
});

test('readProjectSourceView fails closed for duplicate bindings and malformed state', () => {
  const duplicateRoot = vault();
  writeState(duplicateRoot, [binding(), binding({ sourceId: 'src_other', rootPath: '/private/work/other' })]);
  assert.deepEqual(readProjectSourceView(duplicateRoot, 'music-streaming', 'graph-a'), {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug: 'music-streaming',
    status: 'invalid',
    currentness: 'stale',
    measuredAt: null,
    topGap: { id: 'multiple_active_sources' },
    nextAction: { id: 'repair_source_binding' },
    bindingCardinality: 2,
    receipt: null,
  });

  const malformedRoot = vault();
  mkdirSync(join(malformedRoot, '.ontology-atlas'));
  writeFileSync(join(malformedRoot, '.ontology-atlas', 'project-sources.json'), '{not-json');
  const malformed = readProjectSourceView(malformedRoot, 'music-streaming', 'graph-a');
  assert.equal(malformed.status, 'invalid');
  assert.equal(malformed.topGap.id, 'receipt_malformed');

  const privateWitnessRoot = vault();
  writeState(privateWitnessRoot, [binding({
    receipt: receipt({
      witnesses: [{ id: 'player-entry', nodeSlug: 'player', role: 'entrypoint', path: '/private/work/player.ts', supported: true }],
    }),
  })]);
  const privateWitness = readProjectSourceView(privateWitnessRoot, 'music-streaming', 'graph-a');
  assert.equal(privateWitness.status, 'invalid');
  assert.equal(privateWitness.topGap.id, 'receipt_malformed');
});

test('readProjectSourceView marks a receipt stale when the ontology graph changed', () => {
  const root = vault();
  writeState(root, [binding()]);
  const result = readProjectSourceView(root, 'music-streaming', 'graph-b');
  assert.equal(result.status, 'review_required');
  assert.equal(result.currentness, 'stale');
  assert.deepEqual(result.topGap, { id: 'ontology_changed' });
  assert.deepEqual(result.nextAction, { id: 'remeasure_source' });
});

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analysisRecordFileName, serializeAnalysisRecord } from '../analysis-history/analysis-record.mts';
import { readAnalysisRecord } from '../analysis-history/analysis-records.mjs';
import { compileOntology } from '../ontology-compiler.mjs';
import { queryCompiledOntology } from '../ontology-engine.mjs';
import { retiredQueryOperationError } from './retired-arguments.mjs';

/**
 * A retired operation's refusal names a replacement. Each test sends the replacement the refusal
 * names to one small vault and checks that the fact the retired operation answered comes back.
 */
let uidCounter = 0;
const doc = (slug, frontmatter) => ({
  slug,
  frontmatter: { uid: `00000000-0000-4000-8000-${String(++uidCounter).padStart(12, '0')}`, ...frontmatter },
  body: '',
  mtime: 1,
});

const graph = compileOntology([
  doc('domains/auth', { kind: 'domain', title: 'Auth', capabilities: ['capabilities/login', 'capabilities/session'] }),
  doc('domains/billing', { kind: 'domain', title: 'Billing', capabilities: ['capabilities/charge'] }),
  doc('capabilities/login', { kind: 'capability', title: 'Login', domain: 'domains/auth' }),
  doc('capabilities/session', { kind: 'capability', title: 'Session', domain: 'domains/auth', depends_on: ['capabilities/login'] }),
  doc('capabilities/charge', { kind: 'capability', title: 'Charge', domain: 'domains/billing', depends_on: ['capabilities/session'] }),
], { includeIndexes: true });
const ask = (query) => queryCompiledOntology(graph, query);

test('the refusal of every retired operation names a call that exists', () => {
  const named = {
    all_paths: 'path',
    centrality: 'match_nodes',
    builder_context: 'neighbors',
    match_edges: 'neighbors',
    domain_profile: 'node_profile',
    topological_order: 'health',
    analysis_history: 'analysis_record',
  };
  for (const [operation, replacement] of Object.entries(named)) {
    assert.ok(retiredQueryOperationError(operation).message.includes(replacement), operation);
  }
  assert.equal(retiredQueryOperationError('domain_matrix'), null, 'domain_matrix answers the Flat dial counts');
});

test('path answers all_paths, match_nodes sort:"degree" answers centrality, neighbors answers match_edges', () => {
  const path = ask({ operation: 'path', from: 'capabilities/charge', to: 'capabilities/login' });
  assert.deepEqual(path.hops, ['capabilities/charge', 'capabilities/session', 'capabilities/login']);
  assert.deepEqual(ask({ operation: 'match_nodes', sort: 'degree', limit: 1 }).nodes.map((node) => node.slug), ['capabilities/session']);
  const edges = ask({ operation: 'neighbors', slug: 'capabilities/session' }).edges;
  assert.ok(edges.some((edge) => edge.via === 'dependencies' && edge.from === 'capabilities/session' && edge.to === 'capabilities/login'));
});

test('node_profile lists a domain\'s members (domain_profile), domain_matrix still counts cross-domain edges', () => {
  const members = ask({ operation: 'node_profile', slug: 'domains/auth' }).lineage.descendants.nodes.map((node) => node.slug);
  assert.deepEqual(members.sort(), ['capabilities/login', 'capabilities/session']);
  const row = ask({ operation: 'domain_matrix' }).connections.rows[0];
  assert.deepEqual([row.from, row.to, row.count], ['domains/billing', 'domains/auth', 1]);
});

test('health dependencyOrder lists the build order, prerequisite first (topological_order)', () => {
  const { order, acyclic } = ask({ operation: 'health' }).dependencyOrder;
  assert.equal(acyclic, true);
  assert.deepEqual(order.map((row) => row.slug), ['capabilities/login', 'capabilities/session', 'capabilities/charge']);
});

test('relation_check takes type (relation), subgraph takes slug (seed), limit sizes a section (nodeLimit)', () => {
  const check = ask({ operation: 'relation_check', from: 'capabilities/charge', to: 'capabilities/session', type: 'depends_on' });
  assert.equal(check.exists, true);
  assert.ok(ask({ operation: 'subgraph', slug: 'capabilities/session' }).nodes.some((node) => node.slug === 'capabilities/login'));
  assert.equal(ask({ operation: 'components', limit: 1 }).components.length, 1);
});

test('a saved analysis is found by the UUID that ends its file name in .ontology-atlas/analyses/', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-retired-history-'));
  try {
    const id = '95f4ba81-41f7-483b-a617-2a4be815be32';
    const record = {
      schema: 'atlas-analysis/v1', recordType: 'run', id, createdAt: '2026-09-05T08:00:00.000Z', mode: 'meaning',
      scope: { projectSlug: 'demo', projectUid: null, targetSlugs: [], profileSlug: null },
      request: { id: 'request-1', text: 'Review the recorded boundary.', parentRunId: null },
      origin: { surface: 'map', runtimeId: 'test', sessionId: null, userEventId: 'user-1', answerEventId: 'answer-1', startedAt: '2026-09-05T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
      basis: { graphHash: null, sourceFingerprint: null, profileHash: null, documents: [] },
      evidence: [], observations: [], profileSnapshot: null, toolReads: [], sourceAccess: 'unproven', findings: [],
      qualification: { status: 'unverified', reasons: ['no_evidence'] }, answer: 'Raw output.\n',
    };
    const directory = path.join(root, '.ontology-atlas/analyses');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, analysisRecordFileName(record)), serializeAnalysisRecord(record));
    const [fileName] = await readdir(directory);
    const recordId = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.md$/.exec(fileName)?.[1];
    assert.equal(recordId, id);
    assert.equal((await readAnalysisRecord(root, recordId)).record.id, id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

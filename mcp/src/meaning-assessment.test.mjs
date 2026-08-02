import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  MEANING_COMPETENCY_QUESTIONS,
  MEANING_WITNESS_INVENTORY_CONTRACT,
  deriveMeaningAssessment,
} from './meaning-assessment.mjs';
import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

const GRAPH_HASH = 'project-graph-v1:a1b2c3d4';

function doc(slug, frontmatter) {
  return { slug, frontmatter, body: '', mtime: 1 };
}

test('a real agent_brief 100/100 cannot override missing semantic witnesses', () => {
  const artifact = compileOntology([
    doc('sample-product', {
      kind: 'project',
      title: 'Sample Product',
      domains: ['domains/core'],
    }),
    doc('domains/core', {
      kind: 'domain',
      title: 'Core',
      capabilities: ['capabilities/a', 'capabilities/b'],
    }),
    doc('capabilities/a', {
      kind: 'capability',
      title: 'Capability A',
      domain: 'domains/core',
    }),
    doc('capabilities/b', {
      kind: 'capability',
      title: 'Capability B',
      domain: 'domains/core',
    }),
  ], { includeIndexes: true });
  const structural = queryCompiledOntology(artifact, {
    operation: 'agent_brief',
    project: 'sample-product',
  });
  assert.deepEqual(
    { status: structural.readiness.status, score: structural.readiness.score },
    { status: 'ready', score: 100 },
  );

  const assessment = deriveMeaningAssessment({
    projectSlug: 'sample-product',
    graphHash: GRAPH_HASH,
    structure: { status: 'ready' },
    competency: {
      contract: MEANING_COMPETENCY_CONTRACT,
      receiptVersion: 1,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash: GRAPH_HASH,
      inventory: {
        contract: MEANING_WITNESS_INVENTORY_CONTRACT,
        graphHash: GRAPH_HASH,
        sourceFingerprint: 'git:abc123:clean',
        concepts: ['sample-product', 'domains/core', 'capabilities/a', 'capabilities/b'],
        relations: [
          { from: 'sample-product', to: 'domains/core', type: 'domains' },
          { from: 'domains/core', to: 'capabilities/a', type: 'capabilities' },
          { from: 'domains/core', to: 'capabilities/b', type: 'capabilities' },
        ],
        evidence: [],
        paths: [],
      },
      questions: MEANING_COMPETENCY_QUESTIONS.map(({ id }) => ({
        id,
        status: 'visible-gap',
        witnesses: { concepts: [], relations: [], evidence: [], paths: [] },
        unresolvedWitnesses: [`${id}-evidence-unresolved`],
      })),
    },
    source: {
      status: 'verified_current',
      currentness: 'current',
      graphHash: GRAPH_HASH,
      receiptContractVersion: 1,
      sourceId: 'source-sample',
      sourceRevision: 'abc123',
      sourceFingerprint: 'git:abc123:clean',
      measuredAt: '2026-08-02T06:38:07.944Z',
      topGapId: null,
    },
  });

  assert.equal(assessment.status, 'needs_evidence');
  assert.deepEqual(assessment.topGap, {
    dimension: 'competency',
    id: 'competency_question_incomplete',
    questionId: 'scope',
  });
  assert.notEqual(assessment.status, 'verified_current');
});

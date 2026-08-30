import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGENT_BRIEF_COMPACT_MAX_BYTES,
  AGENT_BRIEF_TASK_MAX_CHARS,
  buildCompactAgentBrief,
} from './agent-brief-compact.mjs';

const docs = [
  {
    slug: 'project',
    frontmatter: { kind: 'project', title: 'Encoding Library', domains: ['domains/encoding'] },
    body: '## Definition\n\nA library for parsing and writing encoded data.\n\n## Excludes\n\n- Unrecorded formats.\n',
  },
  {
    slug: 'domains/encoding',
    frontmatter: { kind: 'domain', title: 'Encoding', capabilities: ['capabilities/parse', 'capabilities/write'] },
    body: '## Definition\n\nThe encoding responsibility.\n',
  },
  {
    slug: 'capabilities/parse',
    frontmatter: { kind: 'capability', title: 'Parse DER Data', domain: 'domains/encoding', elements: ['elements/parser'] },
    body: '## Definition\n\nInterpret DER-encoded input.\n\n## Uncertainty\n\nError behavior is not recorded.\n',
  },
  {
    slug: 'capabilities/write',
    frontmatter: { kind: 'capability', title: 'Write DER Data', domain: 'domains/encoding', elements: ['elements/writer'] },
    body: '## Definition\n\nProduce DER-encoded output.\n\n## Uncertainty\n\nOptional SET ordering is not recorded.\n',
  },
  {
    slug: 'elements/parser',
    frontmatter: { kind: 'element', title: 'Parser', domain: 'domains/encoding', path: 'src/parser.ts' },
    body: '## Definition\n\nParser implementation.\n',
  },
  {
    slug: 'elements/writer',
    frontmatter: { kind: 'element', title: 'Writer', domain: 'domains/encoding', path: 'src/writer.ts' },
    body: '## Definition\n\nWriter implementation.\n\n## Evidence\n\n- `tests/writer.test.ts`\n',
  },
];

const brief = {
  projectSlug: 'project',
  status: 'needs_attention',
  readiness: { status: 'needs_attention', score: 75 },
  graph: { nodes: 6, domains: 1, capabilities: 2, elements: 2, edges: 9 },
  projectSource: {
    status: 'verified_current',
    currentness: 'current',
    measuredAt: '2026-08-30T00:00:00.000Z',
    topGap: null,
    nextAction: { id: 'use_current_evidence' },
    receipt: {
      witnessSummary: { total: 1, supported: 1, missing: 0 },
      witnesses: [{ nodeSlug: 'elements/writer', path: 'src/writer.ts', supported: true }],
    },
  },
  meaningAssessment: {
    status: 'needs_evidence',
    dimensions: {
      competency: {
        questions: ['scope', 'domains', 'abilities', 'evidence', 'impact'].map((id) => ({
          id,
          status: id === 'impact' ? 'visible-gap' : 'answered',
          witnessStatus: id === 'impact' ? 'missing' : 'resolved',
        })),
      },
    },
    topGap: { dimension: 'competency', id: 'competency_question_incomplete', questionId: 'impact' },
    nextAction: { id: 'resolve_competency_question', target: 'impact' },
  },
  meaningRepair: {
    contract: 'meaningRepair:v2',
    status: 'blocked',
    projectSlug: 'project',
    blockedBy: 'source_not_current',
    primaryQuestion: null,
    questionsNeedingReview: [],
    provenance: null,
    reviewRevision: null,
    questions: null,
    workflow: [],
    stopWhen: ['source_not_current'],
    writePolicy: { humanApprovalRequired: true, automaticWrite: false, automaticFinalize: false },
  },
};

const artifact = {
  nodes: docs.map((doc) => ({ slug: doc.slug, kind: doc.frontmatter.kind, title: doc.frontmatter.title })),
  edges: [],
};

describe('compact agent brief projection', () => {
  it('selects a broad writing capability without promoting task text into proof', () => {
    const result = buildCompactAgentBrief({
      brief,
      artifact,
      docs,
      task: 'Encode an optional DER SET and keep present elements ordered.',
    });
    assert.equal(result.focus.capability.slug, 'capabilities/write');
    assert.equal(result.focus.selectionPolicy.includes('not behavior proof'), true);
    assert.deepEqual(result.focus.evidenceAnchors.map((row) => row.slug), ['elements/writer']);
    assert.equal(result.focus.evidenceAnchors[0].sourceStatus, 'supported_current');
    assert.equal(result.focus.verification.status, 'recorded');
    assert.deepEqual(result.focus.verification.recordedPaths, ['tests/writer.test.ts']);
    assert.equal(Object.hasOwn(result.task, 'text'), false);
    assert.ok(Buffer.byteLength(JSON.stringify(result, null, 2), 'utf8') <= AGENT_BRIEF_COMPACT_MAX_BYTES);
  });

  it('returns no capability when the bounded vault records no task match', () => {
    const result = buildCompactAgentBrief({
      brief,
      artifact,
      docs,
      task: 'Rotate a lunar camera rig.',
    });
    assert.equal(result.focus.status, 'not_recorded');
    assert.equal(result.focus.capability, null);
    assert.deepEqual(result.focus.evidenceAnchors, []);
    assert.equal(result.focus.startingPointStatus, 'unknown');
  });

  it('does not turn passive encoded input into a writing match', () => {
    const result = buildCompactAgentBrief({
      brief,
      artifact,
      docs,
      task: 'Parse DER-encoded input and report malformed values.',
    });
    assert.equal(result.focus.capability.slug, 'capabilities/parse');
  });

  it('does not match SET to settings or admit one weak body-only token', () => {
    const unrelatedDocs = [
      docs[0],
      {
        slug: 'capabilities/settings',
        frontmatter: { kind: 'capability', title: 'Settings', domain: 'domains/encoding' },
        body: '## Definition\n\nManage application settings.\n',
      },
      {
        slug: 'capabilities/general',
        frontmatter: { kind: 'capability', title: 'General Service', domain: 'domains/encoding' },
        body: '## Definition\n\nA general service with one lunar integration.\n',
      },
    ];
    const settings = buildCompactAgentBrief({
      brief,
      artifact,
      docs: unrelatedDocs,
      task: 'Validate SET ordering.',
    });
    assert.equal(settings.focus.capability, null);
    const weak = buildCompactAgentBrief({
      brief,
      artifact,
      docs: unrelatedDocs,
      task: 'Review lunar behavior.',
    });
    assert.equal(weak.focus.capability, null);
  });

  it('returns not_recorded when two capability matches tie', () => {
    const tiedDocs = [
      docs[0],
      {
        slug: 'capabilities/cache-a',
        frontmatter: { kind: 'capability', title: 'Cache A', domain: 'domains/encoding' },
        body: '## Definition\n\nCache records.\n',
      },
      {
        slug: 'capabilities/cache-b',
        frontmatter: { kind: 'capability', title: 'Cache B', domain: 'domains/encoding' },
        body: '## Definition\n\nCache records.\n',
      },
    ];
    const result = buildCompactAgentBrief({
      brief,
      artifact,
      docs: tiedDocs,
      task: 'Change cache records.',
    });
    assert.equal(result.focus.status, 'not_recorded');
    assert.equal(result.focus.capability, null);
  });

  it('returns the matched fourth child instead of unrelated first elements', () => {
    const childDocs = [
      docs[0],
      {
        slug: 'capabilities/record-output',
        frontmatter: {
          kind: 'capability',
          title: 'Record Encoding',
          domain: 'domains/encoding',
          elements: ['elements/metrics', 'elements/cache', 'elements/logger', 'elements/writer-fourth'],
        },
        body: '## Definition\n\nEncode records for output.\n',
      },
      ...[
        ['elements/metrics', 'Metrics', 'src/metrics.ts'],
        ['elements/cache', 'Cache', 'src/cache.ts'],
        ['elements/logger', 'Logger', 'src/logger.ts'],
        ['elements/writer-fourth', 'Writer', 'src/writer.ts'],
      ].map(([slug, title, path]) => ({
        slug,
        frontmatter: { kind: 'element', title, domain: 'domains/encoding', path },
        body: `## Definition\n\n${title} implementation.\n`,
      })),
    ];
    const result = buildCompactAgentBrief({
      brief,
      artifact,
      docs: childDocs,
      task: 'Encode a record with the writer.',
    });
    assert.equal(result.focus.capability.slug, 'capabilities/record-output');
    assert.deepEqual(result.focus.evidenceAnchors.map((row) => row.slug), ['elements/writer-fourth']);
  });

  it('never relabels a last-measured witness as current when the outer source view is stale', () => {
    const staleBrief = structuredClone(brief);
    staleBrief.projectSource.status = 'review_required';
    staleBrief.projectSource.currentness = 'stale';
    staleBrief.projectSource.topGap = { id: 'source_changed' };
    staleBrief.projectSource.nextAction = { id: 'remeasure_source' };
    const result = buildCompactAgentBrief({
      brief: staleBrief,
      artifact,
      docs,
      task: 'Encode an optional DER SET.',
    });
    assert.equal(result.currentness.source.currentness, 'stale');
    assert.equal(result.focus.evidenceAnchors[0].sourceStatus, 'stale_or_unavailable');
  });

  it('rejects oversized tasks before projection', () => {
    assert.throws(
      () => buildCompactAgentBrief({
        brief,
        artifact,
        docs,
        task: 'x'.repeat(AGENT_BRIEF_TASK_MAX_CHARS + 1),
      }),
      /task must contain at most 2000 characters/,
    );
  });

  it('fails closed when retained safety detail pushes the compact response over budget', () => {
    const oversizedBrief = structuredClone(brief);
    oversizedBrief.meaningRepair.stopWhen = Array.from(
      { length: 20 },
      (_, index) => `required_stop_${index}_${'x'.repeat(400)}`,
    );
    assert.throws(
      () => buildCompactAgentBrief({
        brief: oversizedBrief,
        artifact,
        docs,
        task: 'Encode an optional DER SET.',
      }),
      /above the 8000-byte budget.*largest fields.*do not drop currentness, meaningRepair, qualifiers, or unknowns/i,
    );
  });
});

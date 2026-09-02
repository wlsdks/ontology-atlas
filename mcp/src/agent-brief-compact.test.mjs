import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  AGENT_BRIEF_COMPACT_MAX_BYTES,
  AGENT_BRIEF_TASK_MAX_CHARS,
  buildCompactAgentBrief,
  projectSourceSnapshotUnchanged,
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
    body: '## Definition\n\nWriter implementation.\n\n## Evidence\n\n- `tests/writer.test.ts`\n- `package.json`\n',
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
  it('requires the same source fingerprint, revision, and graph hash after coordinate reads', () => {
    const before = {
      status: 'verified_current',
      currentness: 'current',
      receipt: {
        sourceId: 'sha256:source',
        sourceFingerprint: 'sha256:fingerprint',
        sourceRevision: 'revision-a',
        graphHash: 'sha256:graph',
      },
    };
    assert.equal(projectSourceSnapshotUnchanged(before, before), true);
    assert.equal(projectSourceSnapshotUnchanged(before, {
      ...before,
      receipt: { ...before.receipt, sourceFingerprint: 'sha256:remeasured' },
    }), false);
    assert.equal(projectSourceSnapshotUnchanged(before, {
      ...before,
      receipt: { ...before.receipt, sourceRevision: 'new-revision' },
    }), false);
    assert.equal(projectSourceSnapshotUnchanged(before, {
      ...before,
      receipt: { ...before.receipt, graphHash: 'sha256:new-graph' },
    }), false);
  });

  it('projects current reviewed task navigation without persisting task text or source prose', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-compact-navigation-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(root, 'tests'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{"scripts":{"test":"node --test"}}\n');
      writeFileSync(join(root, 'src/writer.ts'), 'export function writeDerSet() { return true; }\n');
      writeFileSync(join(root, 'tests/writer.test.ts'), "test('writes optional DER SET values', () => {});\n");
      const navigationDocs = docs.map((row) => row.slug !== 'elements/writer' ? row : {
        ...row,
        body: `## Definition

Writer implementation.

## Evidence

- \`package.json\`
- Primary implementation: \`src/writer.ts#writeDerSet\`
- Focused test: \`tests/writer.test.ts#writes optional DER SET values\`

## Includes

DER SET output ordering and optional values.

## Excludes

DER parsing and unrelated encodings.
`,
      });
      const result = buildCompactAgentBrief({
        brief,
        artifact,
        docs: navigationDocs,
        sourceRoot: root,
        task: 'Encode an optional DER SET and keep present elements ordered.',
      });
      assert.equal(result.contract, 'agentBriefCompact:v2');
      assert.equal(result.focus.taskNavigation.status, 'ready');
      assert.equal(result.focus.taskNavigation.primary.symbol, 'writeDerSet');
      assert.equal(result.focus.taskNavigation.primary.line, 1);
      assert.equal(result.focus.taskNavigation.tests[0].symbol, 'writes optional DER SET values');
      assert.deepEqual(result.focus.verification.recordedPaths, ['tests/writer.test.ts']);
      assert.equal(result.focus.verification.manifest, 'package.json');
      assert.equal(result.focus.verification.runner, 'package-script');
      assert.match(result.handoffPrompt, /Verify: package-script\/package\.json; batch manifest; focused once, full once, no overlap\./);
      assert.match(result.handoffPrompt, /Read: primary \+ supporting \+ tests \+ manifest; stop_on_match\./);
      assert.equal(JSON.stringify(result).includes('return true'), false);
      assert.equal(Object.hasOwn(result.task, 'text'), false);
      assert.ok(Buffer.byteLength(JSON.stringify(result, null, 2), 'utf8') <= AGENT_BRIEF_COMPACT_MAX_BYTES);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('withdraws exact targets when source currentness changes after named-file reads', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-compact-navigation-race-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(root, 'tests'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{"scripts":{"test":"node --test"}}\n');
      writeFileSync(join(root, 'src/writer.ts'), 'export function writeDerSet() { return true; }\n');
      writeFileSync(join(root, 'tests/writer.test.ts'), "test('writes optional DER SET values', () => {});\n");
      const navigationDocs = docs.map((row) => row.slug !== 'elements/writer' ? row : {
        ...row,
        body: `## Definition

Writer implementation.

## Evidence

- \`tests/writer.test.ts\`
- \`package.json\`
- Primary implementation: \`src/writer.ts#writeDerSet\`
- Focused test: \`tests/writer.test.ts#writes optional DER SET values\`

## Includes

DER SET output ordering and optional values.

## Excludes

DER parsing and unrelated encodings.
`,
      });
      const result = buildCompactAgentBrief({
        brief,
        artifact,
        docs: navigationDocs,
        sourceRoot: root,
        confirmSourceCurrent: () => false,
        task: 'Encode an optional DER SET and keep present elements ordered.',
      });

      assert.equal(result.focus.taskNavigation.status, 'blocked');
      assert.equal(result.focus.taskNavigation.currentness, 'stale');
      assert.equal(result.focus.taskNavigation.blockedBy, 'source_changed_during_navigation');
      assert.equal(result.focus.taskNavigation.primary, null);
      assert.deepEqual(result.focus.taskNavigation.tests, []);
      assert.equal(result.status, 'needs_attention');
      assert.equal(result.readiness.status, 'needs_attention');
      assert.equal(result.currentness.source.status, 'review_required');
      assert.equal(result.currentness.source.currentness, 'stale');
      assert.equal(result.currentness.meaning.status, 'review_required');
      assert.equal(result.meaningRepair.status, 'blocked');
      assert.equal(result.meaningRepair.blockedBy, 'source_changed_during_navigation');
      assert.equal(result.focus.evidenceAnchors[0].sourceStatus, 'stale_or_unavailable');
      assert.equal(result.focus.verification.manifest, null);
      assert.equal(result.focus.verification.runner, null);
      assert.match(result.handoffPrompt, /Task navigation: blocked\/stale \(source_changed_during_navigation\)/);
      assert.match(result.handoffPrompt, /Current source: review_required\/stale/);
      assert.match(result.handoffPrompt, /Meaning: review_required/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('downgrades outer currentness when a previously current private binding disappears', () => {
    const result = buildCompactAgentBrief({
      brief,
      artifact,
      docs,
      sourceRoot: null,
      sourceAccessRequired: true,
      task: 'Encode an optional DER SET and keep present elements ordered.',
    });

    assert.equal(result.focus.taskNavigation.status, 'blocked');
    assert.equal(result.focus.taskNavigation.currentness, 'stale');
    assert.equal(result.focus.taskNavigation.blockedBy, 'source_changed_during_navigation');
    assert.equal(result.currentness.source.status, 'review_required');
    assert.equal(result.currentness.source.currentness, 'stale');
    assert.equal(result.currentness.meaning.status, 'review_required');
    assert.equal(result.focus.evidenceAnchors[0].sourceStatus, 'stale_or_unavailable');
  });

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
    assert.equal(result.focus.verification.status, 'unknown');
    assert.deepEqual(result.focus.verification.recordedPaths, []);
    assert.ok(result.focus.unknowns.every((row) => row.length <= 96));
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

  it('routes by persisted responsibility and boundaries instead of noun overlap', () => {
    const policyDocs = [
      {
        slug: 'project',
        frontmatter: { kind: 'project', title: 'Policy Runtime' },
        body: '## Definition\n\nA runtime that evaluates collateral policy.\n',
      },
      {
        slug: 'capabilities/policy-appraisal',
        frontmatter: { kind: 'capability', title: 'Policy Appraisal' },
        body: [
          '## Definition',
          '',
          'Evaluate whether collateral remains acceptable before expiry using a configured safety margin.',
          '',
          '## Includes',
          '',
          '- Reject collateral when remaining validity is below the safety margin.',
          '',
          '## Excludes',
          '',
          '- Post-expiry diagnostic reporting.',
          '',
        ].join('\n'),
      },
      {
        slug: 'capabilities/expiry-diagnostics',
        frontmatter: { kind: 'capability', title: 'Expiry Diagnostics' },
        body: [
          '## Definition',
          '',
          'Report why expired collateral was rejected and expose validity-margin diagnostics.',
          '',
          '## Includes',
          '',
          '- Post-expiry diagnostic reporting.',
          '',
          '## Excludes',
          '',
          '- Deciding pre-expiry acceptance policy.',
          '',
        ].join('\n'),
      },
    ];
    const taskCases = [
      [
        'Before expiry, reject collateral whose remaining validity is below a safety margin; do not add post-expiry diagnostics.',
        'capabilities/policy-appraisal',
      ],
      [
        'Implement a pre-expiry validity-margin rejection policy; diagnostics after expiry are out of scope.',
        'capabilities/policy-appraisal',
      ],
      [
        'Decide pre-expiry acceptance from remaining collateral validity and leave diagnostic reporting unchanged.',
        'capabilities/policy-appraisal',
      ],
      [
        'Add post-expiry diagnostics explaining rejected collateral; do not change pre-expiry acceptance policy.',
        'capabilities/expiry-diagnostics',
      ],
    ];
    assert.equal(taskCases.length, 4, 'the boundary-routing gate must exercise real subjects');

    for (const orderedDocs of [policyDocs, [policyDocs[0], ...policyDocs.slice(1).reverse()]]) {
      for (const [task, expectedSlug] of taskCases) {
        const result = buildCompactAgentBrief({
          brief,
          artifact,
          docs: orderedDocs,
          task,
        });
        assert.equal(result.focus.capability?.slug, expectedSlug, task);
      }
    }
  });

  it('fails closed when task boundaries conflict or appear only in Excludes', () => {
    const boundaryDocs = [
      docs[0],
      {
        slug: 'capabilities/retain-cache',
        frontmatter: { kind: 'capability', title: 'Retain Cache' },
        body: [
          '## Definition',
          '',
          'Retain accepted records in a local cache.',
          '',
          '## Excludes',
          '',
          '- Purging rejected records.',
          '',
        ].join('\n'),
      },
      {
        slug: 'capabilities/archive-cache',
        frontmatter: { kind: 'capability', title: 'Archive Cache' },
        body: [
          '## Definition',
          '',
          'Retain accepted records in a local cache.',
          '',
          '## Excludes',
          '',
          '- Purging rejected records.',
          '',
        ].join('\n'),
      },
    ];
    const ambiguous = buildCompactAgentBrief({
      brief,
      artifact,
      docs: boundaryDocs,
      task: 'Retain accepted records in the local cache.',
    });
    assert.equal(ambiguous.focus.status, 'not_recorded');
    assert.equal(ambiguous.focus.capability, null);

    const excludesOnly = buildCompactAgentBrief({
      brief,
      artifact,
      docs: [docs[0], boundaryDocs[1]],
      task: 'Purge rejected records.',
    });
    assert.equal(excludesOnly.focus.status, 'not_recorded');
    assert.equal(excludesOnly.focus.capability, null);

    const commaBoundary = buildCompactAgentBrief({
      brief,
      artifact,
      docs,
      task: 'Encode DER output, do not parse DER input.',
    });
    assert.equal(commaBoundary.focus.capability?.slug, 'capabilities/write');

    const unchangedOnly = buildCompactAgentBrief({
      brief,
      artifact,
      docs,
      task: 'Writer must remain unchanged.',
    });
    assert.equal(unchangedOnly.focus.status, 'not_recorded');
    assert.equal(unchangedOnly.focus.capability, null);

    const notInScope = buildCompactAgentBrief({
      brief,
      artifact,
      docs: [
        docs[0],
        {
          slug: 'capabilities/diagnostics',
          frontmatter: { kind: 'capability', title: 'Diagnostics' },
          body: '## Definition\n\nReport diagnostic events.\n',
        },
      ],
      task: 'Diagnostics are not in scope.',
    });
    assert.equal(notInScope.focus.status, 'not_recorded');
    assert.equal(notInScope.focus.capability, null);
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
      sourceRoot: '/private/unreadable-source',
      task: 'Encode an optional DER SET.',
    });
    assert.equal(result.currentness.source.currentness, 'stale');
    assert.equal(result.focus.evidenceAnchors[0].sourceStatus, 'stale_or_unavailable');
    assert.equal(result.focus.taskNavigation.status, 'blocked');
    assert.equal(result.focus.taskNavigation.blockedBy, 'source_not_current');
    assert.equal(result.focus.taskNavigation.primary, null);
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
      /above the 12000-byte budget.*largest fields.*do not drop currentness, meaningRepair, qualifiers, or unknowns/i,
    );
  });
});

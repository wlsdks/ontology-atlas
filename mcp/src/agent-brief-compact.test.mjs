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
    // The two documents make the same persisted claim but carry different
    // names, and the task repeats one of those names. A title is a reviewed
    // claim too (2026-09-04), so the named capability wins instead of a tie.
    const namedByTitle = buildCompactAgentBrief({
      brief,
      artifact,
      docs: boundaryDocs,
      task: 'Retain accepted records in the local cache.',
    });
    assert.equal(namedByTitle.focus.capability?.slug, 'capabilities/retain-cache');

    // Same claim, names that match the task equally: still ambiguous, still refused.
    const ambiguous = buildCompactAgentBrief({
      brief,
      artifact,
      docs: boundaryDocs.map((doc, index) => (
        index === 0
          ? doc
          : { ...doc, slug: `capabilities/local-cache-${index}`, frontmatter: { ...doc.frontmatter, title: `Local Cache ${index}` } }
      )),
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

  it('reads a titled claim over a long unstructured body and legacy Inclusions bullets', () => {
    // Measured 2026-09-04 on the dogfood vault: a 25k-character capability with
    // no `## Definition` was scored on its whole body and won every task on
    // generic nouns, beating the capability whose title named the task.
    const longBody = [
      '# Agent Server',
      '',
      'Provides a stdio interface so an agent can read and update local vaults.',
      '',
      '## User Outcomes',
      '',
      '- The agent finds meaning nodes and reads relationships, evidence, and impact scope together.',
      '- Search results, display names, and map state are never invented by the server.',
      '',
      '## Inclusions / Exclusions',
      '',
      '- Included: tool registration and I/O contracts, vault parser and writer,',
      '  deterministic compiler and graph query.',
      '- Excluded: map rendering, search palette layout, embedding store.',
      '',
      '## Constraints',
      '',
      'Display names, result rows, and search keep their canonical slugs in every response.',
      '',
    ].join('\n');
    const shapedDocs = [
      docs[0],
      {
        slug: 'capabilities/agent-server',
        frontmatter: { kind: 'capability', title: 'Agent Server', path: 'server/src' },
        body: longBody,
      },
      {
        slug: 'capabilities/map-search',
        frontmatter: { kind: 'capability', title: 'Map Rendering & Search', path: 'src/widgets/map' },
        body: '## Definition\n\nRender, pan, and search the vault graph on a canvas.\n',
      },
    ];
    const palette = buildCompactAgentBrief({
      brief,
      artifact,
      docs: shapedDocs,
      task: 'Fix the map search palette so results keep display names.',
    });
    assert.equal(palette.focus.capability?.slug, 'capabilities/map-search');
    assert.ok(palette.focus.capability.matchedTerms.includes('map'));

    const registration = buildCompactAgentBrief({
      brief,
      artifact,
      docs: shapedDocs,
      task: 'Add a new agent server tool registration contract.',
    });
    assert.equal(registration.focus.capability?.slug, 'capabilities/agent-server');

    // `Excluded:` inside the legacy combined section is still a boundary.
    const excluded = buildCompactAgentBrief({
      brief,
      artifact,
      docs: [docs[0], shapedDocs[1]],
      task: 'Change the embedding store.',
    });
    assert.equal(excluded.focus.capability, null);
  });

  it('refuses a claim carried only by passing prose and keeps the named claim', () => {
    // Measured 2026-09-04 on the dogfood vault: "Open a node's full detail
    // panel from the map popover" selected a source-receipt capability whose
    // Definition merely name-drops map datasheets and full details, because
    // four incidental prose nouns outweighed the capability whose own name and
    // Includes carry the surface. Prose describes; a name and an Includes line
    // claim. Only a named claim can be selected.
    const proseDocs = [
      docs[0],
      {
        slug: 'capabilities/source-receipt',
        frontmatter: { kind: 'capability', title: 'Source Evidence Receipt', path: 'src/shared/lib/receipt.ts' },
        body: [
          '## Definition',
          '',
          'Compare declared implementation paths against the actual source list.',
          'Map datasheets, full node details, and every panel read the same receipt.',
          '',
        ].join('\n'),
      },
      {
        slug: 'capabilities/map-browsing',
        frontmatter: { kind: 'capability', title: 'Map Rendering & Search', path: 'src/widgets/map' },
        body: [
          '## Definition',
          '',
          'Render, pan, and search the whole graph on one canvas.',
          '',
          '## Includes',
          '',
          '- The compact node popover a map click opens, and the opt-in full detail panel it escalates to.',
          '',
        ].join('\n'),
      },
    ];
    const named = buildCompactAgentBrief({
      brief,
      artifact,
      docs: proseDocs,
      task: "Open a node's full detail panel from the map popover",
    });
    assert.equal(named.focus.capability?.slug, 'capabilities/map-browsing');
    assert.ok(named.focus.capability.matchedTerms.includes('popover'));

    // With the named claim removed nothing owns the surface: the brief refuses
    // instead of presenting the prose document as a confident starting point.
    const proseOnly = buildCompactAgentBrief({
      brief,
      artifact,
      docs: [proseDocs[0], proseDocs[1]],
      task: "Open a node's full detail panel from the map popover",
    });
    assert.equal(proseOnly.focus.status, 'not_recorded');
    assert.equal(proseOnly.focus.capability, null);
    assert.deepEqual(proseOnly.focus.evidenceAnchors, []);
  });

  it('keeps a capability its own name even when its Excludes prose repeats it', () => {
    // A capability writes its own subject into its boundary all the time:
    // "Git write operations" under Git History, "the tools that own them"
    // under MCP Server. Subtracting that word cancelled the strongest evidence
    // the vault has about ownership — the name a person chose — and the
    // capability then fell below the support bar and refused. An Excludes
    // bullet bounds what the capability does with its subject; it does not
    // withdraw the subject. Includes bullets stay cancellable.
    const boundaryNameDocs = [
      docs[0],
      {
        slug: 'capabilities/git-history',
        frontmatter: { kind: 'capability', title: 'Git History', path: 'src/features/git-history' },
        body: [
          '## Definition',
          '',
          'Show which commits touched a concept.',
          '',
          '## Excludes',
          '',
          '- Git write operations such as commit or push.',
          '',
        ].join('\n'),
      },
    ];
    const named = buildCompactAgentBrief({
      brief,
      artifact,
      docs: boundaryNameDocs,
      task: 'Show which git commits touched a node.',
    });
    assert.equal(named.focus.capability?.slug, 'capabilities/git-history');
    assert.ok(named.focus.capability.matchedTerms.includes('git'));

    // Same word, claimed only by an Includes bullet: the boundary still wins.
    const includesOnly = buildCompactAgentBrief({
      brief,
      artifact,
      docs: [
        docs[0],
        {
          slug: 'capabilities/registry',
          frontmatter: { kind: 'capability', title: 'Registry', path: 'src/features/registry' },
          body: [
            '## Definition',
            '',
            'Announce the registry inventory to a caller.',
            '',
            '## Includes',
            '',
            '- Tool registration and the inventory contract.',
            '',
            '## Excludes',
            '',
            '- Structural code questions, which belong to the tools that own them.',
            '',
          ].join('\n'),
        },
      ],
      task: 'Add a registry tool to the inventory contract.',
    });
    assert.equal(includesOnly.focus.capability?.slug, 'capabilities/registry');
    assert.equal(includesOnly.focus.capability.matchedTerms.includes('tool'), false);
  });

  it('counts a task word and its inflected form once', () => {
    // "lists" contributes both `lists` and `list`; scoring them separately let
    // one repeated noun in an Includes bullet tie a capability whose own name
    // states the surface, and a tie returns nothing.
    const inflectionDocs = [
      docs[0],
      {
        slug: 'capabilities/index-panel',
        frontmatter: { kind: 'capability', title: 'Index Panel' },
        body: '## Definition\n\nBrowse the index panel beside the map.\n',
      },
      {
        slug: 'capabilities/inventory',
        frontmatter: { kind: 'capability', title: 'Inventory' },
        body: [
          '## Definition',
          '',
          'Return inventories to a caller.',
          '',
          '## Includes',
          '',
          '- Every list of lists the server returns.',
          '',
        ].join('\n'),
      },
    ];
    const result = buildCompactAgentBrief({
      brief,
      artifact,
      docs: inflectionDocs,
      task: 'Change what the index panel lists.',
    });
    assert.equal(result.focus.capability?.slug, 'capabilities/index-panel');
    const canonicalDuplicates = result.task.terms.filter((term) => term.endsWith('s') && result.task.terms.includes(term.slice(0, -1)));
    assert.deepEqual(canonicalDuplicates, []);
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

  it('verifies coordinates against the live source when a stale receipt still finds every witness', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-compact-live-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, 'src/writer.ts'), 'export function writeDerSet() { return true; }\n');
      const navigationDocs = docs.map((row) => row.slug !== 'elements/writer' ? row : {
        ...row,
        body: '## Definition\n\nWriter implementation.\n\n## Evidence\n\n- Primary implementation: `src/writer.ts#writeDerSet`\n',
      });
      const staleBrief = structuredClone(brief);
      staleBrief.projectSource.status = 'review_required';
      staleBrief.projectSource.currentness = 'stale';
      staleBrief.projectSource.topGap = { id: 'source_changed' };
      staleBrief.projectSource.nextAction = { id: 'remeasure_source' };
      staleBrief.projectSource.live = {
        contract: 'projectSourceLiveWitnesses:v1',
        status: 'witnesses_supported',
        sourceRevision: 'f'.repeat(40),
        sourceFingerprint: 'sha256:live',
        witnessSummary: { total: 1, supported: 1, missing: 0 },
        missingPaths: [],
      };
      const result = buildCompactAgentBrief({
        brief: staleBrief,
        artifact,
        docs: navigationDocs,
        sourceRoot: root,
        confirmSourceCurrent: () => true,
        sourceAccessRequired: true,
        task: 'Encode an optional DER SET.',
      });
      assert.equal(result.currentness.source.currentness, 'stale');
      assert.equal(result.currentness.source.live.status, 'witnesses_supported');
      assert.equal(result.currentness.source.live.sourceRevision, 'f'.repeat(12));
      assert.equal(result.focus.evidenceAnchors[0].sourceStatus, 'supported_live');
      assert.equal(result.focus.taskNavigation.currentness, 'live_verified');
      assert.equal(result.focus.taskNavigation.receipt, 'stale');
      assert.equal(result.focus.taskNavigation.primary.symbol, 'writeDerSet');
      assert.match(result.handoffPrompt, /receipt stale; coordinates verified against live source ffffffffffff/);
      assert.match(result.handoffPrompt, /Current source: review_required\/stale \(live ffffffffffff: 1\/1 witnesses resolve\)/);
      assert.equal(JSON.stringify(result).includes(root), false);
      assert.ok(Buffer.byteLength(JSON.stringify(result, null, 2), 'utf8') <= AGENT_BRIEF_COMPACT_MAX_BYTES);

      // The live answer is re-confirmed after the named-file reads; a source
      // that moved again in between withdraws every coordinate.
      const raced = buildCompactAgentBrief({
        brief: staleBrief,
        artifact,
        docs: navigationDocs,
        sourceRoot: root,
        confirmSourceCurrent: () => false,
        sourceAccessRequired: true,
        task: 'Encode an optional DER SET.',
      });
      assert.equal(raced.focus.taskNavigation.status, 'blocked');
      assert.equal(raced.focus.taskNavigation.blockedBy, 'source_changed_during_navigation');
      assert.equal(raced.focus.evidenceAnchors[0].sourceStatus, 'stale_or_unavailable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

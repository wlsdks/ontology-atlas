import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { agentBriefExitCode, assertAgentBriefResponseShape } from './agent-brief.mjs';
import { assertAgentBriefCompactShape } from './agent-brief-compact.mjs';

describe('agent-brief-compact', () => {
  it('validates compact agent_brief truth fields, byte budget, and full-detail boundary', () => {
    const valid = {
      contract: 'agentBriefCompact:v2',
      operation: 'agent_brief',
      detail: 'compact',
      sideEffect: false,
      project: {
        slug: 'project/app',
        title: 'App',
        scope: { nodes: 4, domains: 1, capabilities: 1, elements: 1, internalEdges: 5 },
      },
      task: {
        requestLocal: true,
        persisted: false,
        digest: `sha256:${'a'.repeat(64)}`,
        terms: ['session', 'token'],
      },
      status: 'needs_attention',
      readiness: { status: 'needs_attention', score: 75 },
      currentness: {
        source: {
          status: 'verified_current',
          currentness: 'current',
          measuredAt: '2026-08-30T00:00:00.000Z',
          topGap: null,
          nextAction: { id: 'use_current_evidence' },
          witnessSummary: { total: 1, supported: 1, missing: 0 },
        },
        meaning: {
          status: 'needs_evidence',
          topGap: { dimension: 'competency', id: 'competency_question_incomplete', questionId: 'impact' },
          nextAction: { id: 'resolve_competency_question', target: 'impact' },
          questions: ['scope', 'domains', 'abilities', 'evidence', 'impact'].map((id) => ({
            id,
            status: id === 'impact' ? 'visible-gap' : 'answered',
            witnessStatus: id === 'impact' ? 'missing' : 'resolved',
          })),
        },
      },
      validation: {
        status: 'pass',
        scope: 'whole_vault',
        problemFiles: 0,
        errorFiles: 0,
        warningFiles: 0,
        sourcePathsChecked: true,
        driftCount: 0,
      },
      meaningRepair: {
        contract: 'meaningRepair:v2',
        status: 'blocked',
        projectSlug: 'project/app',
        blockedBy: 'source_not_current',
        primaryQuestion: null,
        questionsNeedingReview: [],
        provenance: null,
        reviewRevision: null,
        questions: null,
        workflow: [],
        stopWhen: ['source_not_current'],
        writePolicy: {
          humanApprovalRequired: true,
          automaticWrite: false,
          automaticFinalize: false,
        },
      },
      purpose: { slug: 'project/app', statement: 'The app manages sessions.', scopeLimit: 'Other behavior is unmeasured.' },
      focus: {
        status: 'matched_with_evidence',
        selectionPolicy: 'Lexical task match selects persisted evidence for reading; it is not behavior proof or semantic approval.',
        capability: {
          slug: 'capabilities/session',
          title: 'Manage Sessions',
          kind: 'capability',
          claimStatus: 'recorded_bounded_claim',
          matchedTerms: ['session'],
          statement: 'Manage a session.',
          claimLimit: 'Revocation impact is unknown.',
        },
        evidenceAnchors: [{
          slug: 'elements/session-store',
          title: 'Session Store',
          kind: 'element',
          path: 'src/session-store.ts',
          relation: 'capabilities/session --elements--> elements/session-store',
          claimStatus: 'recorded_path_anchor',
          sourceStatus: 'supported_current',
        }],
        startingPointStatus: 'partial',
        impact: {
          status: 'unknown',
          basis: 'declared_dependencies',
          completeness: 'unknown',
          sourceBacked: false,
          declaredEdges: 0,
          edges: [],
        },
        verification: {
          status: 'unknown',
          recordedPaths: [],
          manifest: null,
          runner: null,
          nextAction: 'Inspect tests near the anchor.',
        },
        taskNavigation: {
          contract: 'taskNavigation:v1',
          status: 'ready',
          basis: 'reviewed_markdown_evidence',
          currentness: 'current',
          primary: {
            path: 'src/session-store.ts',
            symbol: 'SessionStore::write',
            role: 'primary',
            line: 12,
            endLine: 18,
            sourceStatus: 'supported_current',
          },
          supporting: null,
          tests: [{
            path: 'tests/session-store.test.ts',
            symbol: 'stores a session',
            role: 'test',
            line: 8,
            endLine: 11,
            sourceStatus: 'supported_current',
          }],
          boundary: {
            in: 'Session storage writes.',
            out: 'Session issuance.',
            completeness: 'recorded_non_exhaustive',
          },
          diagnostics: [],
          readPlan: {
            kind: 'source_batch',
            targetCount: 2,
            policy: 'stop_on_match',
          },
        },
        unknowns: ['Revocation impact is unknown.'],
      },
      nextReads: [{
        reason: 'Read full bodies.',
        tool: 'get_concepts',
        arguments: { slugs: ['project/app', 'capabilities/session', 'elements/session-store'], body: 'full' },
      }],
      safety: {
        humanApprovalRequiredForMeaningWrites: true,
        automaticWrite: false,
        automaticFinalize: false,
        structuralReadinessIsSemanticApproval: false,
      },
      fullDetail: {
        tool: 'query_ontology',
        arguments: { operation: 'agent_brief', project: 'project/app', detail: 'full' },
        reason: 'Read full detail only when needed.',
      },
      handoffPrompt: [
        'Task navigation: ready/current',
        'Primary: "src/session-store.ts#SessionStore::write:12-18"',
        'Supporting: none recorded',
        'Focused tests: ["tests/session-store.test.ts#stores a session:8-11"]',
        'IN: "Session storage writes."',
        'OUT: "Session issuance."',
        'Current source: verified_current/current',
        'Meaning: needs_evidence',
        'Verify: runner unknown; focused once; discover one full check.',
        'Read: primary + supporting + tests; stop_on_match.',
        'Tests: named positive + negative regression; exact observable output.',
      ].join('\n'),
    };

    assert.equal(assertAgentBriefCompactShape(valid), valid);
    assert.equal(assertAgentBriefResponseShape(valid), valid);
    assert.equal(agentBriefExitCode(valid), 1);
    const uncertainty = {
      scope: 'selected_task_documents',
      sources: [
        { slug: 'project/app', status: 'not_recorded', totalUnits: 0, omittedUnits: 0, unknownIndexes: [] },
        { slug: 'capabilities/session', status: 'recorded', totalUnits: 2, omittedUnits: 1, unknownIndexes: [0] },
        { slug: 'elements/session-store', status: 'not_recorded', totalUnits: 0, omittedUnits: 0, unknownIndexes: [] },
      ],
      system: [{ code: 'meaning_gap', unknownIndex: 1 }],
    };
    const covered = { ...valid, focus: { ...valid.focus, unknowns: [...valid.focus.unknowns, 'Meaning remains unverified.'], uncertainty } };
    assert.equal(assertAgentBriefCompactShape(covered), covered);
    for (const mutate of [
      (row) => { row.focus.uncertainty.sources[1].omittedUnits = 0; },
      (row) => { row.focus.uncertainty.sources[1].unknownIndexes = [4]; },
      (row) => { row.focus.uncertainty.sources[1].unknownIndexes = [0, 0]; },
      (row) => { row.focus.uncertainty.sources[0].status = 'complete'; },
      (row) => { row.focus.uncertainty.sources[0].slug = 'another-project'; },
      (row) => { row.focus.uncertainty.system[0].unknownIndex = 0; },
      (row) => { row.focus.uncertainty.system = []; },
      (row) => { row.focus.unknowns.push('Unattributed claim.'); },
      (row) => { row.nextReads[0].arguments.slugs = ['capabilities/session', 'elements/session-store']; },
    ]) {
      const malformed = structuredClone(covered);
      mutate(malformed);
      assert.throws(() => assertAgentBriefCompactShape(malformed), /uncertainty/i);
    }
    const padded = structuredClone(valid);
    padded.purpose.statement += 'x'.repeat(11_950 - Buffer.byteLength(JSON.stringify(padded), 'utf8'));
    assert.ok(Buffer.byteLength(JSON.stringify(padded, null, 2), 'utf8') > 12_000);
    assert.equal(assertAgentBriefCompactShape(padded), padded);
    padded.purpose.statement += '🔒'.repeat(20);
    assert.throws(() => assertAgentBriefCompactShape(padded), /12000 UTF-8 JSON bytes/);
    assert.throws(
      () => assertAgentBriefCompactShape({ ...valid, safety: { ...valid.safety, automaticWrite: true } }),
      /human approval and no-auto-write\/finalize/,
    );
    assert.throws(
      () => assertAgentBriefCompactShape({
        ...valid,
        focus: {
          ...valid.focus,
          taskNavigation: {
            ...valid.focus.taskNavigation,
            readPlan: {
              ...valid.focus.taskNavigation.readPlan,
              policy: 'broad_search',
            },
          },
        },
      }),
      /taskNavigation readPlan must be one bounded source batch/,
    );
    assert.throws(
      () => assertAgentBriefCompactShape({
        ...valid,
        focus: {
          ...valid.focus,
          taskNavigation: {
            ...valid.focus.taskNavigation,
            primary: { ...valid.focus.taskNavigation.primary, line: 0 },
          },
        },
      }),
      /taskNavigation.*target/i,
    );
    assert.throws(
      () => assertAgentBriefCompactShape({ ...valid, playbooks: [] }),
      /keep playbooks behind full detail/,
    );
    assert.throws(
      () => assertAgentBriefCompactShape({
        ...valid,
        currentness: {
          ...valid.currentness,
          source: {
            ...valid.currentness.source,
            status: 'review_required',
            currentness: 'stale',
          },
        },
      }),
      /cannot claim supported_current when outer source currentness is not current/,
    );
    assert.throws(
      () => assertAgentBriefCompactShape({ ...valid, handoffPrompt: 'Current source: verified_current/current\nMeaning: verified_current' }),
      /preserve the exact source batch, verification sequence, and final currentness facts/,
    );
    for (const fact of ['Focused tests:', 'IN:', 'OUT:', 'Verify:', 'stop_on_match', 'Tests:']) {
      assert.throws(
        () => assertAgentBriefCompactShape({
          ...valid,
          handoffPrompt: valid.handoffPrompt
            .split('\n')
            .filter((line) => !line.includes(fact))
            .join('\n'),
        }),
        /preserve the exact source batch, verification sequence, and final currentness facts/,
      );
    }
    assert.throws(
      () => assertAgentBriefCompactShape({
        ...valid,
        purpose: { ...valid.purpose, statement: 'x'.repeat(8_000) },
      }),
      /fit 12000 UTF-8 JSON bytes/,
    );
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachMeaningRepair,
  buildMeaningRepair,
  buildMeaningRepairReviewPage,
} from './meaning-repair.mjs';

const GRAPH_HASH = 'project-graph-v1:1234abcd';

function fixture(overrides = {}) {
  const input = {
    projectSlug: 'projects/example',
    graphHash: GRAPH_HASH,
    meaningAssessment: {
      contract: 'meaningAssessment:v1',
      projectSlug: 'projects/example',
      status: 'needs_evidence',
      dimensions: {
        structure: { status: 'ready', basis: 'structure_only' },
        competency: { status: 'needs_evidence', questions: [] },
        source: { status: 'verified_current', currentness: 'current' },
      },
      topGap: {
        dimension: 'competency',
        id: 'competency_question_incomplete',
        questionId: 'abilities',
      },
      nextAction: { id: 'resolve_competency_question', target: 'abilities' },
      provenance: {
        graphHash: GRAPH_HASH,
        sourceFingerprint: 'git:source-fingerprint',
        sourceMeasuredAt: '2026-08-03T00:00:00.000Z',
      },
    },
    competency: {
      contract: 'projectCompetencyMarkdown:v1',
      questions: [
        {
          id: 'abilities',
          status: 'partial',
          witnesses: {
            concepts: ['domains/one', 'capabilities/one'],
            relations: [{ from: 'domains/one', to: 'capabilities/one', type: 'capabilities' }],
            evidence: [],
            paths: [],
          },
        },
        {
          id: 'evidence',
          status: 'partial',
          witnesses: {
            concepts: ['capabilities/one'],
            relations: [],
            evidence: ['src/one'],
            paths: ['src/one'],
          },
        },
      ],
    },
    inventoryResult: {
      status: 'ready',
      inventory: {
        contract: 'meaningWitnessInventory:v1',
        graphHash: GRAPH_HASH,
        sourceFingerprint: 'git:source-fingerprint',
        concepts: [
          'projects/example',
          'domains/one',
          'domains/two',
          'capabilities/one',
          'capabilities/two',
          'capabilities/three',
        ],
        kinds: {
          'projects/example': 'project',
          'domains/one': 'domain',
          'domains/two': 'domain',
          'capabilities/one': 'capability',
          'capabilities/two': 'capability',
          'capabilities/three': 'capability',
        },
        relations: [
          { from: 'projects/example', to: 'domains/one', type: 'contains' },
          { from: 'projects/example', to: 'domains/two', type: 'contains' },
          { from: 'domains/one', to: 'capabilities/one', type: 'capabilities' },
          { from: 'domains/two', to: 'capabilities/two', type: 'capabilities' },
          { from: 'domains/two', to: 'capabilities/three', type: 'capabilities' },
        ],
        evidence: ['src/one', 'src/two'],
        paths: ['src/one', 'src/two'],
      },
      evidenceClaims: [
        { concept: 'capabilities/one', path: 'src/one' },
        { concept: 'capabilities/two', path: 'src/two' },
      ],
    },
    scopedDocs: [
      { slug: 'projects/example', mtime: 1, frontmatter: { kind: 'project' } },
      { slug: 'domains/one', mtime: 2, frontmatter: { kind: 'domain' } },
      { slug: 'domains/two', mtime: 3, frontmatter: { kind: 'domain' } },
      {
        slug: 'capabilities/one',
        mtime: 4,
        frontmatter: { kind: 'capability', domain: 'domains/one', path: 'src/one' },
      },
      {
        slug: 'capabilities/two',
        mtime: 5,
        frontmatter: { kind: 'capability', domain: 'domains/two', path: 'src/two' },
      },
      {
        slug: 'capabilities/three',
        mtime: 6,
        frontmatter: { kind: 'capability', domain: 'domains/two', path: 'src/three' },
      },
    ],
  };
  return { ...input, ...overrides };
}

function largeReviewFixture({ domainCount = 6, capabilityCount = 20, longNames = false } = {}) {
  const input = fixture();
  const domains = Array.from(
    { length: domainCount },
    (_, index) => longNames
      ? `domains/responsibility-boundary-${String(index + 1).padStart(2, '0')}`
      : `domains/d${index + 1}`,
  );
  const capabilities = Array.from(
    { length: capabilityCount },
    (_, index) => longNames
      ? `capabilities/observable-product-ability-${String(index + 1).padStart(2, '0')}`
      : `capabilities/c${String(index + 1).padStart(2, '0')}`,
  );
  const domainRelations = domains.map((domain) => ({
    from: input.projectSlug,
    to: domain,
    type: 'contains',
  }));
  const capabilityRelations = capabilities.map((capability, index) => ({
    from: domains[index % domains.length],
    to: capability,
    type: 'capabilities',
  }));
  const paths = capabilities.map((_, index) => `src/c${String(index + 1).padStart(2, '0')}`);
  input.inventoryResult.inventory = {
    ...input.inventoryResult.inventory,
    concepts: [input.projectSlug, ...domains, ...capabilities],
    kinds: Object.fromEntries([
      [input.projectSlug, 'project'],
      ...domains.map((slug) => [slug, 'domain']),
      ...capabilities.map((slug) => [slug, 'capability']),
    ]),
    relations: [...domainRelations, ...capabilityRelations],
    evidence: paths,
    paths,
  };
  input.inventoryResult.evidenceClaims = capabilities.map((concept, index) => ({
    concept,
    path: paths[index],
  }));
  input.scopedDocs = [
    { slug: input.projectSlug, mtime: 1, frontmatter: { kind: 'project' } },
    ...domains.map((slug, index) => ({
      slug,
      mtime: index + 2,
      frontmatter: { kind: 'domain' },
    })),
    ...capabilities.map((slug, index) => ({
      slug,
      mtime: domainCount + index + 2,
      frontmatter: {
        kind: 'capability',
        domain: domains[index % domains.length],
        path: paths[index],
      },
    })),
  ];
  input.competency.questions.find(({ id }) => id === 'abilities').witnesses = {
    concepts: [capabilities[0]],
    relations: [capabilityRelations[0]],
    evidence: [],
    paths: [],
  };
  input.competency.questions.find(({ id }) => id === 'evidence').witnesses = {
    concepts: capabilities.slice(0, 2),
    relations: [],
    evidence: paths.slice(0, 2),
    paths: paths.slice(0, 2),
  };
  return { input, domains, capabilities };
}

test('buildMeaningRepair separates declared, review candidates, and unresolved targets', () => {
  const result = buildMeaningRepair(fixture());

  assert.equal(result.contract, 'meaningRepair:v2');
  assert.equal(result.status, 'human_review_required');
  assert.equal(result.primaryQuestion, 'abilities');
  assert.deepEqual(result.questionsNeedingReview, ['abilities', 'evidence']);

  assert.deepEqual(result.questions.abilities, {
    basis: 'typed_containment',
    answerStatus: 'partial',
    targetCount: 2,
    review: {
      state: 'structural_candidates_only',
      alreadyDeclared: 1,
      candidateAdditions: 1,
      declaredWithoutSupport: 0,
      unresolved: 0,
    },
  });
  assert.deepEqual(result.questions.evidence, {
    basis: 'current_source_canonical_path',
    answerStatus: 'partial',
    targetCount: 3,
    review: {
      state: 'source_path_candidates_only',
      alreadyDeclared: 1,
      candidateAdditions: 1,
      declaredWithoutSupport: 0,
      unresolved: 1,
    },
  });
  assert.match(result.reviewRevision, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.workflow[0], {
    step: 'read_review_inputs',
    derivation: {
      operation: 'meaning_repair_review',
      order: 'project_then_domains_then_capabilities',
    },
    calls: [{
      tool: 'query_ontology',
      arguments: {
        operation: 'meaning_repair_review',
        project: 'projects/example',
        expectedGraphHash: GRAPH_HASH,
        expectedSourceFingerprint: 'git:source-fingerprint',
        reviewRevision: result.reviewRevision,
      },
    }],
  });
  assert.equal(result.writePolicy.humanApprovalRequired, true);
  assert.equal(result.writePolicy.automaticWrite, false);
  assert.ok(
    Buffer.byteLength(JSON.stringify(result)) <= 5 * 1024,
    'the executable action packet must stay within the explicit 5 KiB handoff budget',
  );
});

test('buildMeaningRepairReviewPage emits bounded full-body pages without omitting a target', () => {
  const { input, domains, capabilities } = largeReviewFixture();
  const repair = buildMeaningRepair(input);
  const expectedTargets = [input.projectSlug, ...domains, ...capabilities];
  const emittedTargets = [];
  const pageSizes = [];
  let cursor;
  do {
    const page = buildMeaningRepairReviewPage(input, {
      expectedGraphHash: GRAPH_HASH,
      expectedSourceFingerprint: 'git:source-fingerprint',
      reviewRevision: repair.reviewRevision,
      ...(cursor ? { cursor } : {}),
    });
    assert.equal(page.contract, 'meaningRepairReviewPage:v1');
    assert.equal(page.status, 'ready');
    assert.equal(page.sideEffect, false);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 5 * 1024);
    assert.ok(page.targets.length > 0 && page.targets.length <= 20);
    assert.deepEqual(page.readCall, {
      tool: 'get_concepts',
      arguments: { slugs: page.targets.map(({ slug }) => slug), body: 'full' },
    });
    pageSizes.push(page.targets.length);
    emittedTargets.push(...page.targets.map(({ slug }) => slug));
    cursor = page.pagination.nextCursor ?? undefined;
    assert.equal(page.pagination.hasMore, Boolean(cursor));
  } while (cursor);

  assert.deepEqual(pageSizes, [20, 7]);
  assert.deepEqual(emittedTargets, expectedTargets);
  assert.equal(new Set(emittedTargets).size, emittedTargets.length);
});

test('buildMeaningRepair keeps a seven-domain twenty-six-capability project within the handoff budget', () => {
  const { input, domains, capabilities } = largeReviewFixture({
    domainCount: 7,
    capabilityCount: 26,
    longNames: true,
  });
  const result = buildMeaningRepair(input);
  const emittedTargets = [];
  const pageSizes = [];
  let cursor;
  do {
    const page = buildMeaningRepairReviewPage(input, {
      expectedGraphHash: GRAPH_HASH,
      expectedSourceFingerprint: 'git:source-fingerprint',
      reviewRevision: result.reviewRevision,
      ...(cursor ? { cursor } : {}),
    });
    assert.equal(page.status, 'ready');
    assert.ok(page.targets.length > 0 && page.targets.length <= 20);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 5 * 1024);
    pageSizes.push(page.targets.length);
    emittedTargets.push(...page.targets.map(({ slug }) => slug));
    cursor = page.pagination.nextCursor ?? undefined;
  } while (cursor);

  assert.deepEqual(emittedTargets, [input.projectSlug, ...domains, ...capabilities]);
  assert.equal(pageSizes.length, 2, 'the large fixture should stay within two bounded review pages');
  assert.equal(new Set(emittedTargets).size, emittedTargets.length);
  assert.ok(
    Buffer.byteLength(JSON.stringify(result)) <= 5 * 1024,
    'a normal seven-domain project must not make agent_brief reject its repair packet',
  );
});

test('buildMeaningRepairReviewPage fails closed on stale provenance and a foreign cursor', () => {
  const input = fixture();
  const repair = buildMeaningRepair(input);
  const args = {
    expectedGraphHash: GRAPH_HASH,
    expectedSourceFingerprint: 'git:source-fingerprint',
    reviewRevision: repair.reviewRevision,
  };
  const stale = buildMeaningRepairReviewPage(input, {
    ...args,
    expectedSourceFingerprint: 'git:old-source',
  });
  assert.equal(stale.status, 'blocked');
  assert.equal(stale.blockedBy, 'provenance_changed');
  assert.deepEqual(stale.targets, []);
  assert.equal(stale.readCall, null);

  const first = buildMeaningRepairReviewPage(input, args);
  assert.equal(first.status, 'ready');
  assert.throws(
    () => buildMeaningRepairReviewPage(input, { ...args, cursor: `${first.pagination.nextCursor}x` }),
    /cursor_invalid/,
  );

  const { input: pagedInput } = largeReviewFixture();
  const pagedRepair = buildMeaningRepair(pagedInput);
  const pagedFirst = buildMeaningRepairReviewPage(pagedInput, {
    expectedGraphHash: GRAPH_HASH,
    expectedSourceFingerprint: 'git:source-fingerprint',
    reviewRevision: pagedRepair.reviewRevision,
  });
  assert.equal(pagedFirst.pagination.hasMore, true);
  pagedInput.scopedDocs[0].mtime += 1;
  const changedRepair = buildMeaningRepair(pagedInput);
  const foreign = buildMeaningRepairReviewPage(pagedInput, {
    reviewRevision: changedRepair.reviewRevision,
    cursor: pagedFirst.pagination.nextCursor,
  });
  assert.equal(foreign.status, 'blocked');
  assert.equal(foreign.blockedBy, 'cursor_not_found');
});

test('buildMeaningRepair fails closed when source evidence is not current', () => {
  const input = fixture();
  input.meaningAssessment.dimensions.source.currentness = 'stale';
  const result = buildMeaningRepair(input);

  assert.equal(result.status, 'blocked');
  assert.equal(result.blockedBy, 'source_not_current');
  assert.equal(result.questions, null);
  assert.deepEqual(result.workflow, []);
});

test('buildMeaningRepair fails closed when the project inventory is limited or unavailable', () => {
  const result = buildMeaningRepair(fixture({
    inventoryResult: { status: 'unavailable', reason: 'incomplete_project_scope' },
  }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.blockedBy, 'incomplete_project_scope');
  assert.equal(result.questions, null);
});

test('buildMeaningRepair fails closed when a review target has no conflict-guard mtime', () => {
  const input = fixture();
  delete input.scopedDocs[0].mtime;
  const result = buildMeaningRepair(input);

  assert.equal(result.status, 'blocked');
  assert.equal(result.blockedBy, 'review_mtime_unavailable');
  assert.equal(result.reviewRevision, null);
});

test('buildMeaningRepair never exposes private source coordinates from its inputs', () => {
  const input = fixture();
  input.meaningAssessment.provenance.rootPath = '/private/source/root';
  input.meaningAssessment.provenance.remote = 'git@example.invalid:private/repo.git';
  input.inventoryResult.privateRoot = '/another/private/root';

  const rendered = JSON.stringify(buildMeaningRepair(input));
  assert.doesNotMatch(rendered, /private\/source|another\/private|example\.invalid|rootPath|remote/);
});

test('attachMeaningRepair makes the human review action the first agent-brief action', () => {
  const repair = buildMeaningRepair(fixture());
  const result = attachMeaningRepair({
    operation: 'agent_brief',
    nextActions: [{ id: 'existing_health_action', kind: 'health_check', severity: 'warn' }],
  }, repair);

  assert.deepEqual(result.nextActions[0], {
    id: 'review_competency_repair',
    kind: 'competency_repair',
    severity: 'warn',
    count: 2,
    target: 'abilities',
    detailContract: 'meaningRepair:v2',
    message: 'Review current competency claims against graph-structural and current-source candidates; explicit human approval is required before any write.',
  });
  assert.equal(result.nextActions[1].id, 'existing_health_action');
  assert.equal(result.meaningRepair, repair);
});

test('attachMeaningRepair exposes a blocked packet without replacing the actionable source/health queue', () => {
  const input = fixture();
  input.meaningAssessment.dimensions.source.currentness = 'unavailable';
  const repair = buildMeaningRepair(input);
  const existing = [{ id: 'verify_source_currentness', kind: 'source', severity: 'warn' }];
  const result = attachMeaningRepair({ operation: 'agent_brief', nextActions: existing }, repair);

  assert.deepEqual(result.nextActions, existing);
  assert.equal(result.meaningRepair.status, 'blocked');
  assert.equal(result.meaningRepair.blockedBy, 'source_not_current');
});

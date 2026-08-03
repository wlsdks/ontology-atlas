import test from 'node:test';
import assert from 'node:assert/strict';

import { attachMeaningRepair, buildMeaningRepair } from './meaning-repair.mjs';

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
      { slug: 'domains/one', frontmatter: { kind: 'domain' } },
      { slug: 'domains/two', frontmatter: { kind: 'domain' } },
      {
        slug: 'capabilities/one',
        frontmatter: { kind: 'capability', domain: 'domains/one', path: 'src/one' },
      },
      {
        slug: 'capabilities/two',
        frontmatter: { kind: 'capability', domain: 'domains/two', path: 'src/two' },
      },
      {
        slug: 'capabilities/three',
        frontmatter: { kind: 'capability', domain: 'domains/two', path: 'src/three' },
      },
    ],
  };
  return { ...input, ...overrides };
}

function largeReviewFixture() {
  const input = fixture();
  const domains = Array.from({ length: 6 }, (_, index) => `domains/d${index + 1}`);
  const capabilities = Array.from(
    { length: 20 },
    (_, index) => `capabilities/c${String(index + 1).padStart(2, '0')}`,
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
    ...domains.map((slug) => ({ slug, frontmatter: { kind: 'domain' } })),
    ...capabilities.map((slug, index) => ({
      slug,
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

  assert.equal(result.contract, 'meaningRepair:v1');
  assert.equal(result.status, 'human_review_required');
  assert.equal(result.primaryQuestion, 'abilities');
  assert.deepEqual(result.questionsNeedingReview, ['abilities', 'evidence']);

  assert.deepEqual(result.questions.abilities, {
    basis: 'typed_containment',
    targetCount: 2,
    review: {
      state: 'structural_candidates_only',
      alreadyDeclared: [{ slug: 'domains/one', witnessCapabilities: ['capabilities/one'] }],
      candidateAdditions: [{
        slug: 'domains/two',
        witnessCapabilities: ['capabilities/three', 'capabilities/two'],
      }],
      declaredWithoutSupport: [],
      unresolved: [],
    },
  });
  assert.deepEqual(result.questions.evidence, {
    basis: 'current_source_canonical_path',
    targetCount: 3,
    review: {
      state: 'source_path_candidates_only',
      alreadyDeclared: ['capabilities/one'],
      candidateAdditions: ['capabilities/two'],
      declaredWithoutSupport: [],
      unresolved: ['capabilities/three'],
    },
  });
  assert.deepEqual(result.workflow[0], {
    step: 'read_review_inputs',
    derivation: { slugs: 'project_and_all_review_targets' },
    calls: [{
      tool: 'get_concepts',
      arguments: {
        slugs: [
          'projects/example',
          'domains/one',
          'domains/two',
          'capabilities/one',
          'capabilities/three',
          'capabilities/two',
        ],
        body: 'full',
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

test('buildMeaningRepair emits executable full-body review batches without omitting a target', () => {
  const { input, domains, capabilities } = largeReviewFixture();
  const result = buildMeaningRepair(input);
  const readStep = result.workflow[0];
  const expectedTargets = [input.projectSlug, ...domains, ...capabilities];
  const emittedTargets = readStep.calls.flatMap((call) => call.arguments.slugs);

  assert.deepEqual(readStep.derivation, { slugs: 'project_and_all_review_targets' });
  assert.deepEqual(readStep.calls.map((call) => call.arguments.slugs.length), [20, 7]);
  assert.ok(readStep.calls.every((call) => (
    call.tool === 'get_concepts'
      && call.arguments.body === 'full'
      && call.arguments.slugs.length > 0
      && call.arguments.slugs.length <= 20
      && call.deriveArguments === undefined
  )));
  assert.deepEqual(emittedTargets, expectedTargets);
  assert.equal(new Set(emittedTargets).size, emittedTargets.length);
  assert.ok(
    Buffer.byteLength(JSON.stringify(result)) <= 5 * 1024,
    'the executable action packet must stay within the explicit 5 KiB handoff budget',
  );
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
    detailContract: 'meaningRepair:v1',
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

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { link, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, test } from 'node:test';

import {
  EXIT,
  HANDOFF_SCHEMA,
  acceptQualification,
  buildAuditFragment,
  buildHiddenPacket,
  canonicalJson,
  chunkWriterCalls,
  digestJson,
  joinQualification,
  prepareRelease,
  sealCandidate,
} from './qualification-handoff.mjs';
import {
  CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA,
  CONSTRUCTION_QUALITY_AXES,
  evaluateConstructionQualification,
} from '../../../../mcp/src/construction-qualification.mjs';
import { constructionPlanDigest, proposalCoverageRefs } from '../../../../mcp/src/construction-lifecycle.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = new URL('./qualification-handoff.mjs', import.meta.url).pathname;
const QUESTION_APPROVED_ISO = '2026-01-02T02:55:00.000Z';
const HUMAN_ID = 'human:reviewer';
const clone = structuredClone;

async function writeJson(path, value) {
  await writeFile(path, canonicalJson(value, { pretty: true }));
}

function artifactDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value, { pretty: true })).digest('hex')}`;
}

function compileSchema(schema) {
  const allowed = new Set([
    'type', 'description', 'properties', 'required', 'additionalProperties',
    'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength',
    'pattern', 'format', 'enum', 'const', 'anyOf', 'allOf', 'if', 'then', 'not',
    'contains', 'minimum', 'maximum', 'examples',
  ]);
  const visit = (row, path = '$') => {
    assert.equal(row !== null && typeof row === 'object' && !Array.isArray(row), true, `${path} must be a schema object`);
    for (const key of Object.keys(row)) assert.equal(allowed.has(key), true, `${path} has unsupported schema keyword ${key}`);
    for (const [key, child] of Object.entries(row.properties ?? {})) visit(child, `${path}.properties.${key}`);
    if (row.items) visit(row.items, `${path}.items`);
    for (const [key, rows] of [['anyOf', row.anyOf], ['allOf', row.allOf]]) {
      rows?.forEach((child, index) => visit(child, `${path}.${key}[${index}]`));
    }
    for (const key of ['if', 'then', 'not', 'contains']) if (row[key]) visit(row[key], `${path}.${key}`);
    if (row.additionalProperties && typeof row.additionalProperties === 'object') {
      visit(row.additionalProperties, `${path}.additionalProperties`);
    }
  };
  visit(schema);
  return (value) => validateSchemaValue(schema, value);
}

function validateSchemaValue(schema, value, path = '$') {
  const errors = [];
  const validate = (row, subject, currentPath) => {
    if (row.anyOf && !row.anyOf.some((child) => validateSchemaValue(child, subject, currentPath).length === 0)) {
      errors.push(`${currentPath} did not match anyOf`);
    }
    for (const child of row.allOf ?? []) validate(child, subject, currentPath);
    if (row.if && validateSchemaValue(row.if, subject, currentPath).length === 0 && row.then) validate(row.then, subject, currentPath);
    if (row.not && validateSchemaValue(row.not, subject, currentPath).length === 0) errors.push(`${currentPath} matched forbidden schema`);
    if (Object.hasOwn(row, 'const') && canonicalJson(subject) !== canonicalJson(row.const)) errors.push(`${currentPath} const mismatch`);
    if (row.enum && !row.enum.some((item) => canonicalJson(item) === canonicalJson(subject))) errors.push(`${currentPath} enum mismatch`);

    const typeMatches = row.type === undefined
      || (row.type === 'null' && subject === null)
      || (row.type === 'array' && Array.isArray(subject))
      || (row.type === 'object' && subject !== null && typeof subject === 'object' && !Array.isArray(subject))
      || (row.type === 'integer' && Number.isInteger(subject))
      || (row.type === 'number' && typeof subject === 'number' && Number.isFinite(subject))
      || (row.type === 'string' && typeof subject === 'string')
      || (row.type === 'boolean' && typeof subject === 'boolean');
    if (!typeMatches) {
      errors.push(`${currentPath} type mismatch`);
      return;
    }
    if (typeof subject === 'string') {
      if (row.minLength !== undefined && subject.length < row.minLength) errors.push(`${currentPath} below minLength`);
      if (row.maxLength !== undefined && subject.length > row.maxLength) errors.push(`${currentPath} above maxLength`);
      if (row.pattern && !new RegExp(row.pattern).test(subject)) errors.push(`${currentPath} pattern mismatch`);
      if (row.format === 'date-time' && !Number.isFinite(Date.parse(subject))) errors.push(`${currentPath} date-time mismatch`);
    }
    if (typeof subject === 'number') {
      if (row.minimum !== undefined && subject < row.minimum) errors.push(`${currentPath} below minimum`);
      if (row.maximum !== undefined && subject > row.maximum) errors.push(`${currentPath} above maximum`);
    }
    if (Array.isArray(subject)) {
      if (row.minItems !== undefined && subject.length < row.minItems) errors.push(`${currentPath} below minItems`);
      if (row.maxItems !== undefined && subject.length > row.maxItems) errors.push(`${currentPath} above maxItems`);
      if (row.uniqueItems && new Set(subject.map((item) => canonicalJson(item))).size !== subject.length) errors.push(`${currentPath} duplicate items`);
      subject.forEach((item, index) => { if (row.items) validate(row.items, item, `${currentPath}[${index}]`); });
      if (row.contains && !subject.some((item, index) => validateSchemaValue(row.contains, item, `${currentPath}[${index}]`).length === 0)) {
        errors.push(`${currentPath} missing contained item`);
      }
    }
    if (subject !== null && typeof subject === 'object' && !Array.isArray(subject)) {
      for (const key of row.required ?? []) if (!Object.hasOwn(subject, key)) errors.push(`${currentPath}.${key} required`);
      for (const [key, child] of Object.entries(row.properties ?? {})) {
        if (Object.hasOwn(subject, key)) validate(child, subject[key], `${currentPath}.${key}`);
      }
      if (row.additionalProperties === false) {
        for (const key of Object.keys(subject)) if (!Object.hasOwn(row.properties ?? {}, key)) errors.push(`${currentPath}.${key} additional`);
      }
    }
  };
  validate(schema, value, path);
  return errors;
}

function reviewPlan(conceptCount = 4) {
  const base = [
    { kind: 'project', slug: 'paper-kite', title: 'Paper Kite', body: '## Definition\n\nA fictitious paper-flight planner.' },
    { kind: 'domain', slug: 'domains/flight-planning', title: 'Flight Planning', body: '## Definition\n\nThe flight-planning decision boundary.' },
    { kind: 'capability', slug: 'capabilities/route-sketching', title: 'Route Sketching', body: '## Definition\n\nSketches a bounded route.' },
    { kind: 'element', slug: 'elements/route-calculator', title: 'Route Calculator', body: '## Definition\n\nCalculates a proposed route.' },
  ];
  while (base.length < conceptCount) {
    const number = base.length - 3;
    base.push({
      kind: 'element',
      slug: `elements/fixture-${String(number).padStart(2, '0')}`,
      title: `Fixture ${number}`,
      body: `## Definition\n\nFictitious fixture element ${number}.`,
    });
  }
  return {
    concepts: base,
    relations: [
      { from: 'paper-kite', to: 'domains/flight-planning', type: 'domains', why: 'The project is bounded by flight planning.' },
      { from: 'domains/flight-planning', to: 'capabilities/route-sketching', type: 'capabilities', why: 'Route sketching realizes flight planning.' },
      { from: 'capabilities/route-sketching', to: 'elements/route-calculator', type: 'elements', why: 'The calculator implements the sketch.' },
    ],
    competencyAnswers: {
      scope: { status: 'partial', answer: 'Paper Kite plans fictitious flights.' },
      abilities: { status: 'answered', answer: 'It sketches a route.' },
      evidence: { status: 'answered', answer: 'The calculator is the implementation anchor.' },
      impact: { status: 'answered', answer: 'The bounded relation chain names the declared impact.' },
    },
  };
}

function candidate(plan = reviewPlan()) {
  return {
    builderId: 'agent:builder',
    proposal: {
      projectSlug: 'paper-kite',
      conceptSlugs: plan.concepts.map(({ slug }) => slug),
      relationTypes: plan.relations.map(({ type }) => type),
    },
    sourceHidden: true,
    canWrite: false,
    planDigest: constructionPlanDigest(plan),
    sourceDigest: digestJson({ source: 'fictitious-paper-kite' }),
    planRevision: 1,
    requiredGapIds: ['proposal:partial-competency-answer:competencyAnswers.scope'],
    reviewPlan: plan,
    proposalValidation: {
      status: 'pass',
      canWrite: false,
      findings: [{
        code: 'partial-competency-answer',
        severity: 'warning',
        path: 'competencyAnswers.scope',
        message: 'The fictitious persona remains partial.',
      }],
    },
  };
}

function analysisArtifact(rawCandidate) {
  const structuredContent = {
    proposalValidation: {
      ...clone(rawCandidate.proposalValidation),
      reviewPlan: clone(rawCandidate.reviewPlan),
      constructionLifecycle: {
        writeEligibility: 'reviewable',
        planDigest: rawCandidate.planDigest,
        sourceDigest: rawCandidate.sourceDigest,
        planRevision: rawCandidate.planRevision,
        requiredGapIds: [...rawCandidate.requiredGapIds],
        reviewPlan: clone(rawCandidate.reviewPlan),
      },
    },
  };
  return {
    calls: [{
      id: 7,
      name: 'analyze_repo_structure',
      args: { proposal: clone(rawCandidate.proposal) },
    }],
    responses: [{ id: 7, result: { structuredContent } }],
  };
}

function witnesses() {
  const sourcePayload = { path: 'src/route.js', observation: 'fictitious route function' };
  return [
    {
      id: 'w-source',
      kind: 'source_span',
      current: true,
      provenance: { sourceRef: 'src/route.js', digest: digestJson(sourcePayload) },
      payload: sourcePayload,
    },
  ];
}

function manifestFor(plan) {
  return proposalCoverageRefs(plan).map((proposalRef, index) => ({
    id: `claim-${String(index + 1).padStart(3, '0')}`,
    statement: index === 0
      ? 'All declared outputs are bounded to the sealed candidate rows.'
      : `The sealed candidate carries fictitious row ${proposalRef}.`,
    status: 'supported',
    witnessRefs: ['w-source'],
    proposalRefs: [proposalRef],
  }));
}

function groupedManifestFor(plan) {
  const rows = manifestFor(plan);
  const [first, second, ...rest] = rows;
  return [{
    ...first,
    statement: `${first.statement} ${second.statement}`,
    witnessRefs: [...new Set([...first.witnessRefs, ...second.witnessRefs])],
    proposalRefs: [...first.proposalRefs, ...second.proposalRefs],
  }, ...rest];
}

function quantifiers(manifest) {
  return [{
    claimId: manifest[0].id,
    term: 'all',
    classification: 'source_bounded',
    rationale: 'All means the exact sealed proposal-ref set, not the whole repository.',
    sourceRefs: ['candidate:reviewPlan'],
  }];
}

function access(role, actorId, startedAt, endedAt) {
  return {
    contract: 'qualificationHandoffAccess:v1',
    actorId,
    role,
    startedAt,
    endedAt,
    readScopes: ['sealed-handoff'],
    writeScopes: ['scratch-output'],
    boundaries: {
      subjectSourceAccessed: role === 'source_aware_auditor',
      hiddenArtifactsAccessed: false,
      auditorArtifactsAccessed: false,
      builderPrivateArtifactsAccessed: false,
      vaultAccessed: false,
      networkUsed: false,
      otherAgentContacted: false,
    },
  };
}

function qualificationCore() {
  const audienceCases = [
    { id: 'executive', audience: 'executive' },
    { id: 'employee', audience: 'employee' },
    { id: 'agent-impact', audience: 'agent' },
    { id: 'agent-next-action', audience: 'agent' },
  ];
  const scenarios = audienceCases.map(({ id, audience }) => ({
    id: `scenario:${id}`,
    audience,
    trigger: `A fictitious ${id} decision begins.`,
    decision: `Choose the bounded ${id} next step.`,
    expectedOutcome: `Name the evidence for the ${id} decision.`,
  }));
  const competencyQuestions = audienceCases.map(({ id, audience }) => ({
    id: `cq:${id}`,
    scenarioId: `scenario:${id}`,
    audience,
    question: `What is the bounded ${id} answer?`,
    owner: { id: HUMAN_ID, authority: 'human' },
    revision: { version: 1, approvedBy: HUMAN_ID, approvedAt: QUESTION_APPROVED_ISO },
    expectedAnswer: { shape: 'one-row', quantifier: 'one', targets: [`target:${id}`] },
    requiredWitnessKinds: ['source_span'],
    unknownPolicy: { allowed: true, response: 'State that the fictitious evidence is unknown.' },
    examples: [{ id: `example:${id}`, expectedStatus: 'answered' }],
    counterexamples: [{ id: `counterexample:${id}`, mustReject: 'An unbounded whole-repository claim.' }],
  }));
  const axes = [
    'semantic',
    'structural',
    'functional',
    'pragmatic',
    'maintainability',
    'interoperability',
  ];
  return {
    qualificationId: 'qualification:paper-kite:v1',
    purposeAuthority: {
      outcome: 'Plan a fictitious paper flight.',
      decisions: ['Choose a bounded route.'],
      scope: 'Paper Kite candidate meaning.',
      nonGoals: ['Claim complete aviation coverage.'],
      owners: [{ id: HUMAN_ID, authority: 'human' }],
      sourceRefs: ['docs/paper-kite.md'],
    },
    scenarios,
    competencyQuestions,
    axisResults: axes.map((axis) => ({
      axis,
      status: 'passed',
      evidenceRefs: ['w-source'],
      findingIds: [],
    })),
    diagnostics: [],
    regression: {
      baselineQualificationId: null,
      status: 'not_applicable',
      priorCqIds: [],
      rerunCqIds: [],
      evidenceRefs: [],
    },
    resourceUse: {
      durationMs: 1,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: null,
    },
  };
}

function compactAnswers(manifest, core = qualificationCore(manifest)) {
  const buckets = core.competencyQuestions.map(() => []);
  manifest.forEach(({ id }, index) => buckets[index % buckets.length].push(id));
  return core.competencyQuestions.map((question, index) => ({
    cqId: question.id,
    status: 'answered',
    answer: `Fictitious compact answer for ${question.id}.`,
    claimIds: buckets[index],
    targets: question.expectedAnswer.targets.map((target) => ({
      target,
      claimIds: buckets[index],
    })),
  }));
}

function auditRows(manifest) {
  return manifest.map((claim) => ({
    claimId: claim.id,
    status: 'verified',
    citations: claim.witnessRefs.map((witnessRef) => ({
      witnessRef,
      status: 'verified',
      sourceFragments: [{
        sourceRef: 'src/route.js',
        startLine: 1,
        endLine: 2,
        digest: digestJson({ claimId: claim.id, witnessRef }),
      }],
    })),
  }));
}

function sharedFragmentAuditRows(manifest) {
  const fragment = {
    sourceRef: 'src/route.js',
    startLine: 1,
    endLine: 2,
    digest: digestJson({ sourceRef: 'src/route.js', lines: [1, 2] }),
  };
  return manifest.map((claim) => ({
    claimId: claim.id,
    status: 'verified',
    citations: claim.witnessRefs.map((witnessRef) => ({
      witnessRef,
      status: 'verified',
      sourceFragments: [fragment],
    })),
  }));
}

function catalogAuditRows(manifest) {
  return {
    sourceFragmentCatalog: [{
      id: 'fragment:route-lines-1-2',
      sourceRef: 'src/route.js',
      startLine: 1,
      endLine: 2,
      digest: digestJson({ sourceRef: 'src/route.js', lines: [1, 2] }),
    }],
    claimResults: manifest.map((claim) => ({
      claimId: claim.id,
      status: 'verified',
      citations: claim.witnessRefs.map((witnessRef) => ({
        witnessRef,
        status: 'verified',
        sourceFragmentRefs: ['fragment:route-lines-1-2'],
      })),
    })),
  };
}

function sealedFixture(plan = reviewPlan()) {
  const rawCandidate = candidate(plan);
  const rawManifest = manifestFor(plan);
  const rawWitnesses = witnesses();
  const sealed = sealCandidate({
    candidate: rawCandidate,
    manifest: rawManifest,
    witnesses: rawWitnesses,
    quantifierClassifications: quantifiers(rawManifest),
  });
  return { ...sealed, quantifierClassifications: quantifiers(rawManifest) };
}

function branches(sealed, options = {}) {
  const hiddenAccess = access(
    'source_hidden_evaluator',
    options.hiddenActor ?? 'agent:hidden',
    '2026-01-02T03:00:00.000Z',
    options.nonOverlap ? '2026-01-02T03:02:00.000Z' : '2026-01-02T03:10:00.000Z',
  );
  const auditAccess = access(
    'source_aware_auditor',
    options.auditActor ?? 'agent:audit',
    options.nonOverlap ? '2026-01-02T03:03:00.000Z' : '2026-01-02T03:05:00.000Z',
    '2026-01-02T03:15:00.000Z',
  );
  const hidden = buildHiddenPacket({
    candidate: sealed.candidate,
    seal: sealed.seal,
    manifest: sealed.manifest,
    witnesses: sealed.witnesses,
    access: hiddenAccess,
    qualificationCore: options.qualificationCore ?? qualificationCore(sealed.manifest),
    answers: options.answers ?? compactAnswers(sealed.manifest),
  });
  const audit = buildAuditFragment({
    candidate: sealed.candidate,
    seal: sealed.seal,
    manifest: sealed.manifest,
    witnesses: sealed.witnesses,
    access: auditAccess,
    claimResults: auditRows(sealed.manifest),
    quantifierClassifications: sealed.quantifierClassifications,
    sourceDigest: sealed.candidate.sourceDigest,
  });
  return { hidden, audit };
}

function joinedFixture() {
  const sealed = sealedFixture();
  const { hidden, audit } = branches(sealed);
  const joined = joinQualification({ ...sealed, hidden, audit });
  return { sealed, hidden, audit, joined };
}

function acceptedFixture() {
  const value = joinedFixture();
  const accepted = acceptQualification({
    ...value.sealed,
    join: value.joined,
    human: {
      id: 'human:reviewer',
      authority: 'human',
      decision: 'accepted',
      decidedAt: '2026-01-02T03:20:00.000Z',
      requestDigest: value.joined.receipt.acceptanceRequestDigest,
      planDigest: value.joined.request.planDigest,
      planRevision: value.joined.request.planRevision,
      acceptedGapIds: value.joined.request.requiredGapIds,
    },
  });
  return { ...value, accepted };
}

describe('qualification handoff happy path', () => {
  test('schema documents commands, atomic output, quantifiers, and all exit codes', () => {
    assert.deepEqual(Object.keys(HANDOFF_SCHEMA.commands), ['coverage', 'seal', 'hidden', 'audit', 'join', 'accept', 'release']);
    assert.deepEqual(HANDOFF_SCHEMA.commands.coverage.compactInput, ['analysisPath', 'proposalPath', 'builderId']);
    assert.deepEqual(HANDOFF_SCHEMA.commands.coverage.output, ['proposal-coverage.json']);
    assert.equal(
      HANDOFF_SCHEMA.derivedCandidate.supportedAnalysisForms.includes(
        'recorded calls[] entry { name, args, response: <direct structuredContent> }',
      ),
      true,
    );
    assert.match(HANDOFF_SCHEMA.commands.seal.proposalCoverage.order, /sort/);
    assert.deepEqual(HANDOFF_SCHEMA.commands.seal.proposalCoverage.patterns, {
      concept: 'concept:<slug>',
      relation: 'relation:<type>:<from>-><to>',
      competency: 'competency:<id>',
      dependencyImpact: 'impact:relation:<type>:<from>-><to>',
      competencyImpact: 'impact:competency:<id>',
    });
    const sealSchemas = HANDOFF_SCHEMA.commands.seal.jsonSchemas;
    assert.deepEqual(compileSchema(sealSchemas.manifest)(manifestFor(reviewPlan())), []);
    assert.deepEqual(compileSchema(sealSchemas.witnesses)(witnesses()), []);
    const derivedDigestWitnesses = witnesses();
    delete derivedDigestWitnesses[0].provenance.digest;
    assert.deepEqual(compileSchema(sealSchemas.witnesses)(derivedDigestWitnesses), []);
    const digestlessExternalWitnesses = clone(derivedDigestWitnesses);
    delete digestlessExternalWitnesses[0].payload;
    assert.notDeepEqual(compileSchema(sealSchemas.witnesses)(digestlessExternalWitnesses), []);
    assert.equal(HANDOFF_SCHEMA.commands.seal.witnessPayloadDigest.deriveWhenPayloadPresent, true);
    assert.equal(HANDOFF_SCHEMA.commands.seal.witnessPayloadDigest.requiredWithoutPayload, true);
    assert.deepEqual(compileSchema(sealSchemas.quantifierClassifications)(quantifiers(manifestFor(reviewPlan()))), []);
    const longQuantifierSource = quantifiers(manifestFor(reviewPlan()));
    longQuantifierSource[0].sourceRefs = ['s'.repeat(501)];
    assert.ok(compileSchema(sealSchemas.quantifierClassifications)(longQuantifierSource).length > 0);
    assert.match(HANDOFF_SCHEMA.io.atomicity, /staged/);
    assert.match(HANDOFF_SCHEMA.quantifiers.rule, /source_bounded/);
    assert.match(HANDOFF_SCHEMA.commands.hidden.qualificationCore, /predates source-hidden evaluation/);
    assert.deepEqual(HANDOFF_SCHEMA.commands.hidden.claimCoverage, {
      source: 'manifest[*].id',
      collector: 'union(answers[*].claimIds)',
      requirement: 'exact_set',
      duplicatesAcrossAnswers: 'allowed',
      unassignableClaimRule: 'If an approved CQ cannot truthfully carry a manifest claim, stop before hidden invocation and revise the question set through human approval; never pad an unrelated answer.',
    });
    assert.ok(
      HANDOFF_SCHEMA.qualityAxes,
      'the emitted agent contract must expose all quality-axis decisions before hidden evaluation',
    );
    assert.deepEqual(
      Object.keys(HANDOFF_SCHEMA.qualityAxes.dimensions),
      [...CONSTRUCTION_QUALITY_AXES],
    );
    assert.deepEqual(HANDOFF_SCHEMA.qualityAxes.mandatory, [
      'semantic',
      'structural',
      'evidence_provenance',
      'maintainability',
      'interoperability',
    ]);
    assert.deepEqual(HANDOFF_SCHEMA.qualityAxes.humanGapEligible, ['functional', 'pragmatic']);
    assert.ok(
      HANDOFF_SCHEMA.qualityAxes.referenceNamespaces,
      'the emitted agent contract must identify each qualification reference namespace',
    );
    assert.deepEqual(HANDOFF_SCHEMA.qualityAxes.referenceNamespaces, {
      axisEvidenceRefs: 'sealed source-witnesses.json[*].id only',
      diagnosticEvidenceRefs: 'sealed source-witnesses.json[*].id only',
      axisFindingIds: 'qualificationCore.diagnostics[*].id with the same axis',
      answerClaimIds: 'sealed claim-manifest.json[*].id; the union across answers is the exact manifest id set',
      targetClaimIds: 'subset of the containing answer claimIds for that exact expected target',
    });
    for (const axis of CONSTRUCTION_QUALITY_AXES) {
      assert.ok(HANDOFF_SCHEMA.qualityAxes.dimensions[axis].question.length > 0);
      assert.ok(HANDOFF_SCHEMA.qualityAxes.dimensions[axis].evidence.length > 0);
    }
    assert.deepEqual(HANDOFF_SCHEMA.commands.hidden.unknownPolicy, {
      required: ['allowed', 'response'],
      allowed: 'boolean; true permits an explicit partial/unknown/refusal gap, false does not',
      response: 'nonblank refusal or bounded unknown behavior returned when evidence cannot close the CQ',
    });
    assert.deepEqual(HANDOFF_SCHEMA.commands.hidden.qualificationCoreShape, {
      required: [
        'qualificationId',
        'purposeAuthority',
        'scenarios',
        'competencyQuestions',
        'axisResults',
        'diagnostics',
        'regression',
        'resourceUse',
      ],
      forbidden: [
        'contract',
        'subject',
        'actors',
        'witnesses',
        'claims',
        'citationChecks',
        'sourceHiddenTask',
        'acceptance',
        'cqResults',
        'canWrite',
        'writePlan',
      ],
      additionalProperties: false,
    });
    assert.equal(HANDOFF_SCHEMA.access.contract, 'qualificationHandoffAccess:v1');
    assert.deepEqual(HANDOFF_SCHEMA.access.roles, {
      hidden: 'source_hidden_evaluator',
      audit: 'source_aware_auditor',
    });
    const hiddenSchemas = HANDOFF_SCHEMA.commands.hidden.jsonSchemas;
    assert.deepEqual(hiddenSchemas.qualificationCore.required, HANDOFF_SCHEMA.commands.hidden.qualificationCoreShape.required);
    assert.equal(hiddenSchemas.qualificationCore.additionalProperties, false);
    assert.equal(hiddenSchemas.qualificationCore.properties.qualificationId.maxLength, 300);
    for (const key of hiddenSchemas.qualificationCore.required) {
      assert.ok(CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA.properties[key], `public qualification schema is missing ${key}`);
      assert.equal(hiddenSchemas.qualificationCore.properties[key].type, CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA.properties[key].type);
    }
    assert.equal(
      hiddenSchemas.qualificationCore.properties.competencyQuestions.items.properties.purpose,
      undefined,
    );
    assert.deepEqual(
      hiddenSchemas.qualificationCore.properties.competencyQuestions.items.properties.revision.properties.approvedAt,
      {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
        examples: ['2026-01-02T03:00:00.000Z'],
      },
    );
    assert.equal(
      hiddenSchemas.qualificationCore.properties.axisResults.items.properties.axis.enum.includes('evidence_provenance'),
      false,
    );
    assert.equal(hiddenSchemas.qualificationCore.properties.axisResults.minItems, 6);
    assert.equal(hiddenSchemas.qualificationCore.properties.axisResults.maxItems, 6);
    assert.match(
      hiddenSchemas.qualificationCore.properties.axisResults.items.properties.evidenceRefs.description,
      /sealed source-witnesses\.json only/,
    );
    assert.match(
      hiddenSchemas.qualificationCore.properties.axisResults.items.properties.findingIds.description,
      /diagnostics whose axis equals this row axis/,
    );
    assert.match(
      hiddenSchemas.qualificationCore.properties.diagnostics.items.properties.evidenceRefs.description,
      /sealed source-witnesses\.json only/,
    );
    assert.match(
      hiddenSchemas.answers.items.properties.claimIds.description,
      /complete manifest id set/,
    );
    assert.deepEqual(
      hiddenSchemas.qualificationCore.properties.axisResults.allOf.map((row) => row.contains.properties.axis.const),
      ['semantic', 'structural', 'functional', 'pragmatic', 'maintainability', 'interoperability'],
    );
    assert.equal(
      hiddenSchemas.qualificationCore.properties.diagnostics.items.properties.axis.enum.includes('evidence_provenance'),
      false,
    );
    assert.deepEqual(
      hiddenSchemas.qualificationCore.properties.diagnostics.items.properties.id.not,
      { const: 'qualification-handoff:audit-pending' },
    );
    assert.equal(hiddenSchemas.qualificationCore.properties.purposeAuthority.properties.owners.minItems, 1);
    assert.equal(hiddenSchemas.qualificationCore.properties.purposeAuthority.properties.owners.maxItems, 1);
    assert.equal(hiddenSchemas.access.properties.contract.const, 'qualificationHandoffAccess:v1');
    assert.equal(hiddenSchemas.access.properties.role.const, 'source_hidden_evaluator');
    assert.equal(hiddenSchemas.access.properties.boundaries.properties.hiddenArtifactsAccessed.const, false);
    assert.deepEqual(hiddenSchemas.answers.items.required, ['cqId', 'status', 'claimIds', 'targets']);
    assert.deepEqual(hiddenSchemas.answers.items.properties.status.enum, ['answered', 'partial', 'unknown', 'refused']);
    assert.equal(hiddenSchemas.answers.items.allOf.length, 2);
    assert.deepEqual(HANDOFF_SCHEMA.commands.hidden.siblingPathInput, [
      'handoffDir', 'access', 'qualificationCorePath', 'answersPath',
    ]);
    assert.match(HANDOFF_SCHEMA.commands.hidden.siblingPathRule, /plain sibling \.json filenames/);
    assert.match(HANDOFF_SCHEMA.commands.hidden.siblingFileRule, /exactly one filesystem link/);
    const validateCore = compileSchema(hiddenSchemas.qualificationCore);
    const validateAccessSchema = compileSchema(hiddenSchemas.access);
    const validateAnswersSchema = compileSchema(hiddenSchemas.answers);
    const acceptedCore = qualificationCore();
    const acceptedAccess = access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z');
    const acceptedAnswers = compactAnswers(manifestFor(reviewPlan()), acceptedCore);
    assert.deepEqual(validateCore(acceptedCore), []);
    assert.deepEqual(validateAccessSchema(acceptedAccess), []);
    assert.deepEqual(validateAnswersSchema(acceptedAnswers), []);
    const duplicateAxis = clone(acceptedCore);
    duplicateAxis.axisResults.at(-1).axis = duplicateAxis.axisResults[0].axis;
    assert.ok(validateCore(duplicateAxis).length > 0);
    const whitespaceAccess = clone(acceptedAccess);
    whitespaceAccess.actorId = '   ';
    assert.ok(validateAccessSchema(whitespaceAccess).length > 0);
    const whitespaceAnswer = clone(acceptedAnswers);
    whitespaceAnswer[0].answer = '   ';
    assert.ok(validateAnswersSchema(whitespaceAnswer).length > 0);
    const longGap = clone(acceptedAnswers);
    longGap[0].status = 'partial';
    longGap[0].gap = 'x'.repeat(1001);
    assert.ok(validateAnswersSchema(longGap).length > 0);
    const longQualificationId = clone(acceptedCore);
    longQualificationId.qualificationId = 'q'.repeat(301);
    assert.ok(validateCore(longQualificationId).length > 0);
    assert.match(HANDOFF_SCHEMA.commands.audit.claimResults, /deduplicated sourceFragmentCatalog/);
    const auditSchemas = HANDOFF_SCHEMA.commands.audit.jsonSchemas;
    const auditCatalog = catalogAuditRows(manifestFor(reviewPlan()));
    assert.deepEqual(compileSchema(auditSchemas.access)(
      access('source_aware_auditor', 'agent:audit', '2026-01-02T03:05:00.000Z', '2026-01-02T03:15:00.000Z'),
    ), []);
    assert.deepEqual(compileSchema(auditSchemas.claimResults)(auditCatalog.claimResults), []);
    assert.deepEqual(compileSchema(auditSchemas.sourceFragmentCatalog)(auditCatalog.sourceFragmentCatalog), []);
    assert.deepEqual(compileSchema(auditSchemas.quantifierClassifications)(quantifiers(manifestFor(reviewPlan()))), []);
    const inventedFragmentField = clone(auditCatalog.sourceFragmentCatalog);
    inventedFragmentField[0].fragment = 'not part of the audit contract';
    assert.notDeepEqual(compileSchema(auditSchemas.sourceFragmentCatalog)(inventedFragmentField), []);
    assert.deepEqual(Object.keys(HANDOFF_SCHEMA.exits).map(Number), [0, 2, 64, 65, 70, 74]);
  });

  test('derives hidden CQ/evidence boilerplate, joins verified evidence, accepts, and releases exact rows', () => {
    const { sealed, hidden, joined, accepted } = acceptedFixture();
    const reservedRegressionId = 'qualification-handoff:cold-start-regression';
    assert.equal(sealed.witnesses.some(({ kind }) => kind === 'regression'), false);
    assert.equal(hidden.qualification.witnesses.some(({ id, kind, current }) => (
      id === reservedRegressionId && kind === 'regression' && current === true
    )), true);
    assert.deepEqual(hidden.qualification.regression.evidenceRefs, [reservedRegressionId]);
    assert.equal(evaluateConstructionQualification(hidden.qualification).findings.some(({ code }) => (
      code === 'invalid-prior-cq-regression-evidence'
    )), false);
    const pendingEvidence = hidden.qualification.axisResults.find(({ axis }) => axis === 'evidence_provenance');
    assert.equal(pendingEvidence.status, 'not_measured');
    assert.equal(hidden.qualification.diagnostics.some(({ id }) => id === 'qualification-handoff:audit-pending'), true);
    assert.ok(hidden.qualification.cqResults.every((row) => row.witnessRefs.length > 0));
    assert.equal(joined.evaluation.axes.evidence_provenance.status, 'passed');
    assert.equal(joined.qualification.diagnostics.some(({ id }) => id === 'qualification-handoff:audit-pending'), false);
    assert.equal(joined.lifecycle.writeEligibility, 'blocked');
    assert.equal(Object.hasOwn(joined.lifecycle, 'writePlan'), false);
    assert.equal(accepted.lifecycle.writeEligibility, 'executable');
    const release = prepareRelease({
      ...sealed,
      acceptedQualification: accepted.qualification,
      acceptanceReceipt: accepted.receipt,
      analyzeRequest: {
        name: 'analyze_repo_structure',
        args: { proposal: sealed.candidate.proposal, qualification: accepted.qualification },
      },
      released: {
        status: 'pass',
        canWrite: true,
        writePlan: accepted.lifecycle.writePlan,
        constructionLifecycle: accepted.lifecycle,
      },
    });
    assert.equal(release.receipt.status, 'prepared_not_executed');
    assert.equal(release.conceptCalls.flatMap((call) => call.args.concepts).length, sealed.candidate.reviewPlan.concepts.length);
    assert.equal(release.relationCalls.flatMap((call) => call.args.relations).length, sealed.candidate.reviewPlan.relations.length);
  });

  test('CLI coverage preflight publishes exact ordered refs before the manifest and seals them on the first attempt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-coverage-'));
    const plan = reviewPlan();
    const rawCandidate = candidate(plan);
    await Promise.all([
      writeJson(join(root, 'analysis.json'), analysisArtifact(rawCandidate)),
      writeJson(join(root, 'proposal.json'), rawCandidate.proposal),
    ]);
    const coverageInput = join(root, 'coverage-input.json');
    await writeJson(coverageInput, {
      analysisPath: 'analysis.json',
      proposalPath: 'proposal.json',
      builderId: rawCandidate.builderId,
    });
    await execFileAsync(process.execPath, [SCRIPT, 'coverage', '--input', coverageInput, '--output', join(root, 'coverage')]);
    const coverage = JSON.parse(await readFile(join(root, 'coverage/proposal-coverage.json'), 'utf8'));
    assert.deepEqual(coverage.refs, proposalCoverageRefs(plan));
    assert.equal(coverage.refs.length > plan.concepts.length, true, 'coverage preflight must include non-concept refs');
    assert.equal(coverage.refs.some((ref) => ref.startsWith('relation:')), true, 'coverage preflight measured no relations');
    assert.equal(Object.hasOwn(coverage, 'writePlan'), false);

    const embeddedInput = join(root, 'coverage-embedded-input.json');
    await writeJson(embeddedInput, {
      analysis: analysisArtifact(rawCandidate),
      proposal: rawCandidate.proposal,
      builderId: rawCandidate.builderId,
    });
    await execFileAsync(process.execPath, [
      SCRIPT,
      'coverage',
      '--input',
      embeddedInput,
      '--output',
      join(root, 'coverage-embedded'),
    ]);
    assert.equal(
      await readFile(join(root, 'coverage-embedded/proposal-coverage.json'), 'utf8'),
      await readFile(join(root, 'coverage/proposal-coverage.json'), 'utf8'),
    );

    const manifest = coverage.refs.map((proposalRef, index) => ({
      id: `coverage-claim-${String(index + 1).padStart(3, '0')}`,
      statement: `The candidate includes the bounded review row ${proposalRef}.`,
      status: 'supported',
      witnessRefs: ['w-source'],
      proposalRefs: [proposalRef],
    }));
    await Promise.all([
      writeJson(join(root, 'manifest.json'), manifest),
      writeJson(join(root, 'witnesses.json'), witnesses()),
    ]);
    const sealInput = join(root, 'seal-input.json');
    await writeJson(sealInput, {
      analysisPath: 'analysis.json',
      proposalPath: 'proposal.json',
      manifestPath: 'manifest.json',
      witnessesPath: 'witnesses.json',
      builderId: rawCandidate.builderId,
      quantifierClassifications: [],
    });
    await execFileAsync(process.execPath, [SCRIPT, 'seal', '--input', sealInput, '--output', join(root, 'sealed')]);
    const sealed = JSON.parse(await readFile(join(root, 'sealed/candidate-seal.json'), 'utf8'));
    assert.deepEqual(sealed.proposalCoverageRefs, coverage.refs);
  });

  test('CLI coverage accepts a recorded direct response and still binds its exact request proposal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-recorded-coverage-'));
    const plan = reviewPlan();
    const rawCandidate = candidate(plan);
    const analysis = analysisArtifact(rawCandidate);
    const recordedAnalysis = {
      contract: 'rootedMcpReadTranscript:v1',
      calls: [
        {
          id: 'root-check',
          name: 'connection_info',
          args: {},
          response: { sameRoot: false },
        },
        {
          ...analysis.calls[0],
          response: analysis.responses[0].result.structuredContent,
        },
      ],
    };
    await Promise.all([
      writeJson(join(root, 'analysis.json'), recordedAnalysis),
      writeJson(join(root, 'analysis-standard.json'), analysis),
      writeJson(join(root, 'proposal.json'), rawCandidate.proposal),
      writeJson(join(root, 'coverage-input.json'), {
        analysisPath: 'analysis.json',
        proposalPath: 'proposal.json',
        builderId: rawCandidate.builderId,
      }),
      writeJson(join(root, 'coverage-standard-input.json'), {
        analysisPath: 'analysis-standard.json',
        proposalPath: 'proposal.json',
        builderId: rawCandidate.builderId,
      }),
    ]);

    await Promise.all([
      execFileAsync(process.execPath, [
        SCRIPT,
        'coverage',
        '--input',
        join(root, 'coverage-input.json'),
        '--output',
        join(root, 'coverage'),
      ]),
      execFileAsync(process.execPath, [
        SCRIPT,
        'coverage',
        '--input',
        join(root, 'coverage-standard-input.json'),
        '--output',
        join(root, 'coverage-standard'),
      ]),
    ]);

    const coverageText = await readFile(join(root, 'coverage/proposal-coverage.json'), 'utf8');
    const coverage = JSON.parse(coverageText);
    assert.deepEqual(coverage.refs, proposalCoverageRefs(plan));
    assert.equal(Object.hasOwn(coverage, 'writePlan'), false);
    assert.equal(
      coverageText,
      await readFile(join(root, 'coverage-standard/proposal-coverage.json'), 'utf8'),
    );

    recordedAnalysis.calls[1].args.proposal = {
      ...recordedAnalysis.calls[1].args.proposal,
      projectSlug: 'drifted-paper-kite',
    };
    await writeJson(join(root, 'analysis-drifted.json'), recordedAnalysis);
    await writeJson(join(root, 'coverage-drifted-input.json'), {
      analysisPath: 'analysis-drifted.json',
      proposalPath: 'proposal.json',
      builderId: rawCandidate.builderId,
    });
    await assert.rejects(
      execFileAsync(process.execPath, [
        SCRIPT,
        'coverage',
        '--input',
        join(root, 'coverage-drifted-input.json'),
        '--output',
        join(root, 'coverage-drifted'),
      ]),
      (error) => error.code === EXIT.DATA && /proposal drifted/.test(error.stderr),
    );
    await assert.rejects(stat(join(root, 'coverage-drifted')), (error) => error.code === 'ENOENT');
  });

  test('seal derives an omitted payload digest without mutating input and still rejects drift', async () => {
    const plan = reviewPlan();
    const rawCandidate = candidate(plan);
    const manifest = manifestFor(plan);
    const digestlessWitnesses = witnesses();
    delete digestlessWitnesses[0].provenance.digest;

    const sealed = sealCandidate({
      candidate: rawCandidate,
      manifest,
      witnesses: digestlessWitnesses,
      quantifierClassifications: quantifiers(manifest),
    });

    assert.equal(Object.hasOwn(digestlessWitnesses[0].provenance, 'digest'), false);
    assert.equal(sealed.witnesses[0].provenance.digest, digestJson(digestlessWitnesses[0].payload));
    const driftedWitnesses = witnesses();
    driftedWitnesses[0].provenance.digest = `sha256:${'0'.repeat(64)}`;
    assert.throws(() => sealCandidate({
      candidate: rawCandidate,
      manifest,
      witnesses: driftedWitnesses,
      quantifierClassifications: quantifiers(manifest),
    }), /payload digest drifted/);
    const payloadlessWitnesses = witnesses();
    delete payloadlessWitnesses[0].payload;
    delete payloadlessWitnesses[0].provenance.digest;
    assert.throws(() => sealCandidate({
      candidate: rawCandidate,
      manifest,
      witnesses: payloadlessWitnesses,
      quantifierClassifications: quantifiers(manifest),
    }), /needs a digest/);

    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-witness-digest-red-'));
    await Promise.all([
      writeJson(join(root, 'analysis.json'), analysisArtifact(rawCandidate)),
      writeJson(join(root, 'proposal.json'), rawCandidate.proposal),
      writeJson(join(root, 'manifest.json'), manifest),
      writeJson(join(root, 'witnesses.json'), driftedWitnesses),
      writeJson(join(root, 'seal-input.json'), {
        analysisPath: 'analysis.json',
        proposalPath: 'proposal.json',
        manifestPath: 'manifest.json',
        witnessesPath: 'witnesses.json',
        builderId: rawCandidate.builderId,
        quantifierClassifications: quantifiers(manifest),
      }),
    ]);
    await assert.rejects(
      execFileAsync(process.execPath, [
        SCRIPT,
        'seal',
        '--input',
        join(root, 'seal-input.json'),
        '--output',
        join(root, 'sealed'),
      ]),
      (error) => error.code === EXIT.DATA && /payload digest drifted/.test(error.stderr),
    );
    await assert.rejects(stat(join(root, 'sealed')), (error) => error.code === 'ENOENT');
  });

  test('CLI writes schema atomically to a new directory and refuses an existing target with exit 74', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-test-'));
    const output = join(root, 'schema-output');
    await execFileAsync(process.execPath, [SCRIPT, 'schema', '--output', output]);
    assert.equal((await stat(output)).isDirectory(), true);
    assert.equal(HANDOFF_SCHEMA.schemaDiscovery.completeContractRequiresFileOutput, true);
    assert.match(HANDOFF_SCHEMA.schemaDiscovery.preferredInvocation, /schema --output/);
    const schemaText = await readFile(join(output, 'schema.json'), 'utf8');
    const schema = JSON.parse(schemaText);
    assert.equal(schema.contract, HANDOFF_SCHEMA.contract);
    assert.ok(schemaText.length > 10000, 'file-backed schema gate measured an idle/truncated contract');
    const core = schema.commands.hidden.jsonSchemas.qualificationCore;
    assert.ok(core.properties.purposeAuthority.required.includes('owners'));
    assert.ok(core.properties.competencyQuestions.items.required.includes('scenarioId'));
    assert.ok(core.properties.competencyQuestions.items.properties.revision.required.includes('version'));
    const auditCatalog = schema.commands.audit.jsonSchemas.sourceFragmentCatalog;
    assert.ok(auditCatalog.items.required.includes('sourceRef'));
    assert.equal(Object.hasOwn(auditCatalog.items.properties, 'fragment'), false);
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'schema', '--output', output]),
      (error) => error.code === EXIT.IO,
    );
  });

  test('CLI compact paths execute the complete seal-to-release handoff without embedded artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-compact-'));
    const plan = reviewPlan();
    const rawCandidate = candidate(plan);
    const rawManifest = manifestFor(plan);
    const rawWitnesses = witnesses();
    await Promise.all([
      writeJson(join(root, 'candidate.json'), rawCandidate),
      writeJson(join(root, 'manifest.json'), rawManifest),
      writeJson(join(root, 'witnesses.json'), rawWitnesses),
    ]);
    const run = async (command, inputName, input, outputName) => {
      const inputPath = join(root, inputName);
      await writeJson(inputPath, input);
      await execFileAsync(process.execPath, [SCRIPT, command, '--input', inputPath, '--output', join(root, outputName)]);
    };
    await run('seal', '01-seal.json', {
      candidatePath: 'candidate.json',
      manifestPath: 'manifest.json',
      witnessesPath: 'witnesses.json',
      quantifierClassifications: quantifiers(rawManifest),
    }, 'handoff');
    await run('hidden', '02-hidden.json', {
      handoffDir: 'handoff',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(),
      answers: compactAnswers(rawManifest),
    }, 'hidden');
    await run('audit', '03-audit.json', {
      handoffDir: 'handoff',
      access: access('source_aware_auditor', 'agent:audit', '2026-01-02T03:05:00.000Z', '2026-01-02T03:15:00.000Z'),
      claimResults: auditRows(rawManifest),
      quantifierClassifications: quantifiers(rawManifest),
      sourceDigest: rawCandidate.sourceDigest,
    }, 'auditor');
    await run('join', '04-join.json', {
      handoffDir: 'handoff',
      hiddenDir: 'hidden',
      auditorDir: 'auditor',
    }, 'joined');
    const [request, joinReceipt] = await Promise.all([
      readFile(join(root, 'joined/acceptance-request.json'), 'utf8').then(JSON.parse),
      readFile(join(root, 'joined/join-receipt.json'), 'utf8').then(JSON.parse),
    ]);
    await run('accept', '05-accept.json', {
      handoffDir: 'handoff',
      joinedDir: 'joined',
      human: {
        id: 'human:reviewer',
        authority: 'human',
        decision: 'accepted',
        decidedAt: '2026-01-02T03:20:00.000Z',
        requestDigest: joinReceipt.acceptanceRequestDigest,
        planDigest: request.planDigest,
        planRevision: request.planRevision,
        acceptedGapIds: request.requiredGapIds,
      },
    }, 'accepted');
    const [acceptedQualification, lifecycle] = await Promise.all([
      readFile(join(root, 'accepted/qualification-accepted.json'), 'utf8').then(JSON.parse),
      readFile(join(root, 'accepted/lifecycle-release-preview.json'), 'utf8').then(JSON.parse),
    ]);
    await Promise.all([
      writeJson(join(root, 'analyze-request.json'), {
        name: 'analyze_repo_structure',
        args: { proposal: rawCandidate.proposal, qualification: acceptedQualification },
      }),
      writeJson(join(root, 'analyze-response.json'), {
        status: 'pass',
        canWrite: true,
        writePlan: lifecycle.writePlan,
        constructionLifecycle: lifecycle,
      }),
    ]);
    await run('release', '06-release.json', {
      handoffDir: 'handoff',
      acceptedDir: 'accepted',
      analyzeRequestPath: 'analyze-request.json',
      releasedPath: 'analyze-response.json',
    }, 'release');
    const releaseReceipt = JSON.parse(await readFile(join(root, 'release/release-receipt.json'), 'utf8'));
    assert.equal(releaseReceipt.status, 'prepared_not_executed');
    assert.deepEqual(releaseReceipt.rowCounts, {
      concepts: plan.concepts.length,
      relations: plan.relations.length,
    });
  });

  test('CLI sibling hidden inputs reproduce every embedded output byte-for-byte', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-hidden-paths-'));
    const sealed = sealedFixture();
    const core = qualificationCore();
    const answers = compactAnswers(sealed.manifest, core);
    const hiddenAccess = access(
      'source_hidden_evaluator',
      'agent:hidden',
      '2026-01-02T03:00:00.000Z',
      '2026-01-02T03:10:00.000Z',
    );
    await mkdir(join(root, 'handoff'));
    await Promise.all([
      ...Object.entries(sealed.files).map(([name, value]) => writeJson(join(root, 'handoff', name), value)),
      writeJson(join(root, 'qualification-core.json'), core),
      writeJson(join(root, 'hidden-answers.json'), answers),
    ]);
    const inlineInput = {
      handoffDir: 'handoff',
      access: hiddenAccess,
      qualificationCore: core,
      answers,
    };
    const pathInput = {
      handoffDir: 'handoff',
      access: hiddenAccess,
      qualificationCorePath: 'qualification-core.json',
      answersPath: 'hidden-answers.json',
    };
    await Promise.all([
      writeJson(join(root, 'inline-input.json'), inlineInput),
      writeJson(join(root, 'path-input.json'), pathInput),
    ]);
    await execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', join(root, 'inline-input.json'), '--output', join(root, 'inline-output')]);
    await execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', join(root, 'path-input.json'), '--output', join(root, 'path-output')]);

    assert.equal(HANDOFF_SCHEMA.commands.hidden.output.length, 4, 'hidden byte-parity gate must measure all outputs');
    for (const name of HANDOFF_SCHEMA.commands.hidden.output) {
      const [inline, hydrated] = await Promise.all([
        readFile(join(root, 'inline-output', name), 'utf8'),
        readFile(join(root, 'path-output', name), 'utf8'),
      ]);
      assert.equal(hydrated, inline, `${name} drifted through sibling-file hydration`);
    }
    assert.ok(
      Buffer.byteLength(canonicalJson(pathInput)) < Buffer.byteLength(canonicalJson(inlineInput)),
      'sibling paths must reduce the wrapper an evaluator assembles',
    );
  });

  test('hidden canonicalizes its derived pending-acceptance timestamp without mutating access evidence', () => {
    const sealed = sealedFixture();
    const hiddenAccess = access(
      'source_hidden_evaluator',
      'agent:hidden',
      '2026-01-02T03:00:00Z',
      '2026-01-02T03:10:00Z',
    );
    const hidden = buildHiddenPacket({
      ...sealed,
      access: hiddenAccess,
      qualificationCore: qualificationCore(),
      answers: compactAnswers(sealed.manifest),
    });
    assert.equal(hidden.access.endedAt, hiddenAccess.endedAt);
    assert.equal(hidden.qualification.acceptance.decidedAt, '2026-01-02T03:10:00.000Z');
  });

  test('audit fragment catalog deduplicates input while preserving the legacy output exactly', () => {
    const sealed = sealedFixture();
    const base = {
      ...sealed,
      access: access('source_aware_auditor', 'agent:audit', '2026-01-02T03:05:00.000Z', '2026-01-02T03:15:00.000Z'),
      quantifierClassifications: sealed.quantifierClassifications,
      sourceDigest: sealed.candidate.sourceDigest,
    };
    const legacyRows = sharedFragmentAuditRows(sealed.manifest);
    const catalog = catalogAuditRows(sealed.manifest);
    const legacy = buildAuditFragment({ ...base, claimResults: legacyRows });
    const deduplicated = buildAuditFragment({ ...base, ...catalog });

    assert.deepEqual(deduplicated, legacy);
    assert.ok(
      Buffer.byteLength(canonicalJson(catalog)) < Buffer.byteLength(canonicalJson({ claimResults: legacyRows })),
      'catalog input should be smaller than repeated fragment objects',
    );
  });

  test('derived seal paths reproduce the direct candidate without copying analyzer output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-derived-seal-'));
    const plan = reviewPlan();
    const rawCandidate = candidate(plan);
    const manifest = manifestFor(plan);
    await Promise.all([
      writeJson(join(root, 'candidate.json'), rawCandidate),
      writeJson(join(root, 'analysis.json'), analysisArtifact(rawCandidate)),
      writeJson(join(root, 'proposal.json'), rawCandidate.proposal),
      writeJson(join(root, 'manifest.json'), manifest),
      writeJson(join(root, 'witnesses.json'), witnesses()),
    ]);
    const directInput = join(root, 'direct-input.json');
    await writeJson(directInput, {
      candidatePath: 'candidate.json',
      manifestPath: 'manifest.json',
      witnessesPath: 'witnesses.json',
      quantifierClassifications: quantifiers(manifest),
    });
    await execFileAsync(process.execPath, [SCRIPT, 'seal', '--input', directInput, '--output', join(root, 'direct')]);
    const derivedInput = join(root, 'derived-input.json');
    await writeJson(derivedInput, {
      analysisPath: 'analysis.json',
      proposalPath: 'proposal.json',
      manifestPath: 'manifest.json',
      witnessesPath: 'witnesses.json',
      builderId: rawCandidate.builderId,
      quantifierClassifications: quantifiers(manifest),
    });
    await execFileAsync(process.execPath, [SCRIPT, 'seal', '--input', derivedInput, '--output', join(root, 'derived')]);
    const [direct, derived] = await Promise.all([
      readFile(join(root, 'direct/candidate-packet.json'), 'utf8').then(JSON.parse),
      readFile(join(root, 'derived/candidate-packet.json'), 'utf8').then(JSON.parse),
    ]);
    assert.deepEqual(derived, direct);
    assert.equal(derived.reviewPlan.concepts[0].body, plan.concepts[0].body);
  });

  test('one grouped claim can cover multiple ordered proposal refs through join', () => {
    const plan = reviewPlan();
    const manifest = groupedManifestFor(plan);
    const sealed = sealCandidate({
      candidate: candidate(plan),
      manifest,
      witnesses: witnesses(),
      quantifierClassifications: quantifiers(manifest),
    });
    const { hidden, audit } = branches({ ...sealed, quantifierClassifications: quantifiers(manifest) });
    const joined = joinQualification({ ...sealed, hidden, audit });
    assert.equal(sealed.manifest.length, proposalCoverageRefs(plan).length - 1);
    assert.equal(sealed.manifest[0].proposalRefs.length, 2);
    assert.equal(joined.lifecycle.proposalCoverage.status, 'complete');
  });

  test('allows multiple immutable claims to audit separate assertions on one proposal row', () => {
    const plan = reviewPlan();
    const manifest = manifestFor(plan);
    manifest.splice(1, 0, {
      ...clone(manifest[0]),
      id: 'claim-extra-boundary',
      statement: 'The same project row carries a separately audited fictitious boundary assertion.',
    });
    const sealed = sealCandidate({
      candidate: candidate(plan),
      manifest,
      witnesses: witnesses(),
      quantifierClassifications: quantifiers(manifest),
    });
    assert.equal(sealed.manifest.length, proposalCoverageRefs(plan).length + 1);
    assert.deepEqual(sealed.manifest[0].proposalRefs, sealed.manifest[1].proposalRefs);
  });

  test('preserves analyzer-authored trailing body newlines without changing the plan digest', () => {
    const plan = reviewPlan();
    plan.concepts[0].body += '\n';
    const manifest = manifestFor(plan);
    const sealed = sealCandidate({
      candidate: candidate(plan),
      manifest,
      witnesses: witnesses(),
      quantifierClassifications: quantifiers(manifest),
    });
    assert.equal(sealed.candidate.reviewPlan.concepts[0].body, plan.concepts[0].body);
    assert.equal(sealed.candidate.planDigest, constructionPlanDigest(plan));
  });

  test('a partial CQ keeps an explicit uncovered target and nonblank gap through join', () => {
    const sealed = sealedFixture();
    const answers = compactAnswers(sealed.manifest);
    answers[0].status = 'partial';
    answers[0].gap = 'Runtime behavior remains outside the source-hidden packet.';
    answers[0].targets[0].claimIds = [];
    const { hidden, audit } = branches(sealed, { answers });
    const cq = hidden.qualification.cqResults[0];
    assert.equal(cq.status, 'partial');
    assert.equal(cq.gap, answers[0].gap);
    assert.deepEqual(cq.targetResults[0], {
      target: answers[0].targets[0].target,
      witnessRefs: [],
      claimIds: [],
    });
    const joined = joinQualification({ ...sealed, hidden, audit });
    assert.ok(joined.lifecycle.requiredGapIds.includes(`cq:${cq.cqId}`));
  });
});

describe('seal RED probes', () => {
  test('CLI compact hydration fails closed for a missing path and a drifted sealed artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-path-red-'));
    const missingInput = join(root, 'missing-input.json');
    await writeJson(missingInput, {
      candidatePath: 'missing-candidate.json',
      manifestPath: 'missing-manifest.json',
      witnessesPath: 'missing-witnesses.json',
      quantifierClassifications: [],
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'seal', '--input', missingInput, '--output', join(root, 'missing-output')]),
      (error) => error.code === EXIT.IO,
    );

    const plan = reviewPlan();
    const rawCandidate = candidate(plan);
    const rawManifest = manifestFor(plan);
    await Promise.all([
      writeJson(join(root, 'candidate.json'), rawCandidate),
      writeJson(join(root, 'manifest.json'), rawManifest),
      writeJson(join(root, 'witnesses.json'), witnesses()),
    ]);
    const sealInput = join(root, 'seal-input.json');
    await writeJson(sealInput, {
      candidatePath: 'candidate.json',
      manifestPath: 'manifest.json',
      witnessesPath: 'witnesses.json',
      quantifierClassifications: quantifiers(rawManifest),
    });
    await execFileAsync(process.execPath, [SCRIPT, 'seal', '--input', sealInput, '--output', join(root, 'handoff')]);
    const packetPath = join(root, 'handoff/candidate-packet.json');
    const packet = JSON.parse(await readFile(packetPath, 'utf8'));
    packet.proposal.projectSlug = 'drifted-after-seal';
    await writeJson(packetPath, packet);
    const hiddenInput = join(root, 'hidden-input.json');
    await writeJson(hiddenInput, {
      handoffDir: 'handoff',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(),
      answers: compactAnswers(rawManifest),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', hiddenInput, '--output', join(root, 'hidden')]),
      (error) => error.code === EXIT.DATA,
    );
  });

  test('derived seal rejects analysis/proposal drift and a missing lifecycle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-derived-red-'));
    const plan = reviewPlan();
    const rawCandidate = candidate(plan);
    const manifest = manifestFor(plan);
    const analysis = analysisArtifact(rawCandidate);
    await Promise.all([
      writeJson(join(root, 'analysis.json'), analysis),
      writeJson(join(root, 'drifted-proposal.json'), { ...rawCandidate.proposal, projectSlug: 'different' }),
      writeJson(join(root, 'manifest.json'), manifest),
      writeJson(join(root, 'witnesses.json'), witnesses()),
    ]);
    const base = {
      analysisPath: 'analysis.json',
      proposalPath: 'drifted-proposal.json',
      manifestPath: 'manifest.json',
      witnessesPath: 'witnesses.json',
      builderId: rawCandidate.builderId,
      quantifierClassifications: quantifiers(manifest),
    };
    const driftInput = join(root, 'drift-input.json');
    await writeJson(driftInput, base);
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'seal', '--input', driftInput, '--output', join(root, 'drift-output')]),
      (error) => error.code === EXIT.DATA,
    );
    const missingLifecycle = clone(analysis);
    delete missingLifecycle.responses[0].result.structuredContent.proposalValidation.constructionLifecycle;
    await Promise.all([
      writeJson(join(root, 'missing-lifecycle.json'), missingLifecycle),
      writeJson(join(root, 'proposal.json'), rawCandidate.proposal),
    ]);
    const missingInput = join(root, 'missing-lifecycle-input.json');
    await writeJson(missingInput, {
      ...base,
      analysisPath: 'missing-lifecycle.json',
      proposalPath: 'proposal.json',
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'seal', '--input', missingInput, '--output', join(root, 'missing-lifecycle-output')]),
      (error) => error.code === EXIT.DATA,
    );
  });

  test('rejects a missing original proposal plus premature canWrite and writePlan', () => {
    const plan = reviewPlan();
    const raw = { candidate: candidate(plan), manifest: manifestFor(plan), witnesses: witnesses(), quantifierClassifications: quantifiers(manifestFor(plan)) };
    const canWrite = clone(raw);
    canWrite.candidate.canWrite = true;
    assert.throws(() => sealCandidate(canWrite), /canWrite/);
    const writePlan = clone(raw);
    writePlan.candidate.writePlan = plan;
    assert.throws(() => sealCandidate(writePlan), /writePlan/);
    const missingProposal = clone(raw);
    delete missingProposal.candidate.proposal;
    assert.throws(() => sealCandidate(missingProposal), /original proposal/);
  });

  test('rejects missing and foreign proposal refs, unknown witnesses, and payload digest drift', () => {
    const plan = reviewPlan();
    const make = () => ({ candidate: candidate(plan), manifest: manifestFor(plan), witnesses: witnesses(), quantifierClassifications: quantifiers(manifestFor(plan)) });
    const missing = make();
    missing.manifest.pop();
    assert.throws(() => sealCandidate(missing), /cover/);
    const orderDrift = make();
    [orderDrift.manifest[0], orderDrift.manifest[1]] = [orderDrift.manifest[1], orderDrift.manifest[0]];
    assert.throws(() => sealCandidate(orderDrift), /first-occurrence order drifted/);
    const foreign = make();
    foreign.manifest[0].proposalRefs = ['concept:foreign'];
    assert.throws(() => sealCandidate(foreign), /foreign ref/);
    const unknown = make();
    unknown.manifest[0].witnessRefs = ['w-foreign'];
    assert.throws(() => sealCandidate(unknown), /unknown witness/);
    const drift = make();
    drift.witnesses[0].payload.observation = 'mutated';
    assert.throws(() => sealCandidate(drift), /payload digest drifted/);
  });

  test('requires explicit source-bounded quantifier classification and blocks classified unsafe usage', () => {
    const plan = reviewPlan();
    const input = { candidate: candidate(plan), manifest: manifestFor(plan), witnesses: witnesses() };
    assert.throws(() => sealCandidate({ ...input, quantifierClassifications: [] }), /Every lexical quantifier/);
    const unsafe = quantifiers(input.manifest);
    unsafe[0].classification = 'unsafe';
    assert.throws(() => sealCandidate({ ...input, quantifierClassifications: unsafe }), (error) => error.exitCode === EXIT.GATE_BLOCKED);
    const overlong = quantifiers(input.manifest);
    overlong[0].sourceRefs = ['s'.repeat(501)];
    assert.throws(
      () => sealCandidate({ ...input, quantifierClassifications: overlong }),
      /sourceRefs/,
    );
  });
});

describe('hidden and audit RED probes', () => {
  test('hidden sibling paths reject incomplete, mixed, absolute, nested, and parent-traversal inputs before reading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-hidden-path-red-'));
    const cases = [
      {
        name: 'incomplete',
        input: { handoffDir: 'missing-handoff', qualificationCorePath: 'qualification-core.json', access: {} },
        diagnostic: /qualificationCorePath and answersPath together/,
      },
      {
        name: 'mixed',
        input: {
          handoffDir: 'missing-handoff',
          qualificationCorePath: 'qualification-core.json',
          answersPath: 'hidden-answers.json',
          qualificationCore: {},
          answers: [],
          access: {},
        },
        diagnostic: /cannot mix sibling paths with embedded qualificationCore or answers/,
      },
      {
        name: 'sealed-mixed',
        input: {
          handoffDir: 'missing-handoff',
          qualificationCorePath: 'qualification-core.json',
          answersPath: 'hidden-answers.json',
          candidate: { invalid: true },
          manifest: [],
          witnesses: [],
          seal: { invalid: true },
          access: {},
        },
        diagnostic: /cannot mix sibling paths with embedded candidate, manifest, witnesses, or seal/,
      },
      {
        name: 'absolute',
        input: {
          handoffDir: 'missing-handoff',
          qualificationCorePath: '/tmp/qualification-core.json',
          answersPath: 'hidden-answers.json',
          access: {},
        },
        diagnostic: /plain sibling JSON filename/,
      },
      {
        name: 'nested',
        input: {
          handoffDir: 'missing-handoff',
          qualificationCorePath: 'nested/qualification-core.json',
          answersPath: 'hidden-answers.json',
          access: {},
        },
        diagnostic: /plain sibling JSON filename/,
      },
      {
        name: 'parent',
        input: {
          handoffDir: 'missing-handoff',
          qualificationCorePath: '../qualification-core.json',
          answersPath: 'hidden-answers.json',
          access: {},
        },
        diagnostic: /plain sibling JSON filename/,
      },
    ];

    for (const probe of cases) {
      const inputPath = join(root, `${probe.name}.json`);
      const outputPath = join(root, `${probe.name}-output`);
      await writeJson(inputPath, probe.input);
      await assert.rejects(
        execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', inputPath, '--output', outputPath]),
        (error) => error.code === EXIT.DATA && probe.diagnostic.test(error.stderr),
      );
      await assert.rejects(stat(outputPath), (error) => error.code === 'ENOENT');
    }
  });

  test('hidden sibling reads reject symlinks, hard links, symlinked parents, and non-regular files without producing output', async () => {
    async function fixtureRoot(prefix) {
      const root = await mkdtemp(join(tmpdir(), prefix));
      const sealed = sealedFixture();
      await mkdir(join(root, 'handoff'));
      await Promise.all([
        ...Object.entries(sealed.files).map(([name, value]) => writeJson(join(root, 'handoff', name), value)),
        writeJson(join(root, 'hidden-answers.json'), compactAnswers(sealed.manifest)),
      ]);
      return root;
    }

    const outside = await mkdtemp(join(tmpdir(), 'qualification-handoff-hidden-outside-'));
    await writeJson(join(outside, 'qualification-core.json'), qualificationCore());
    const symlinkRoot = await fixtureRoot('qualification-handoff-hidden-symlink-');
    await symlink(join(outside, 'qualification-core.json'), join(symlinkRoot, 'qualification-core.json'));
    const symlinkInput = join(symlinkRoot, 'input.json');
    await writeJson(symlinkInput, {
      handoffDir: 'handoff',
      qualificationCorePath: 'qualification-core.json',
      answersPath: 'hidden-answers.json',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', symlinkInput, '--output', join(symlinkRoot, 'output')]),
      (error) => error.code === EXIT.DATA && /symbolic links are not allowed/.test(error.stderr),
    );
    await assert.rejects(stat(join(symlinkRoot, 'output')), (error) => error.code === 'ENOENT');

    const hardLinkRoot = await fixtureRoot('qualification-handoff-hidden-hardlink-');
    await link(join(outside, 'qualification-core.json'), join(hardLinkRoot, 'qualification-core.json'));
    const hardLinkInput = join(hardLinkRoot, 'input.json');
    await writeJson(hardLinkInput, {
      handoffDir: 'handoff',
      qualificationCorePath: 'qualification-core.json',
      answersPath: 'hidden-answers.json',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', hardLinkInput, '--output', join(hardLinkRoot, 'output')]),
      (error) => error.code === EXIT.DATA && /exactly one filesystem link/.test(error.stderr),
    );
    await assert.rejects(stat(join(hardLinkRoot, 'output')), (error) => error.code === 'ENOENT');

    const realRoot = await fixtureRoot('qualification-handoff-hidden-real-parent-');
    await writeJson(join(realRoot, 'qualification-core.json'), qualificationCore());
    const aliasRoot = await mkdtemp(join(tmpdir(), 'qualification-handoff-hidden-alias-parent-'));
    await symlink(realRoot, join(aliasRoot, 'linked-root'), 'dir');
    const parentInput = join(realRoot, 'input.json');
    await writeJson(parentInput, {
      handoffDir: 'handoff',
      qualificationCorePath: 'qualification-core.json',
      answersPath: 'hidden-answers.json',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', join(aliasRoot, 'linked-root', 'input.json'), '--output', join(aliasRoot, 'parent-output')]),
      (error) => error.code === EXIT.DATA && /canonical input directory/.test(error.stderr),
    );
    await assert.rejects(stat(join(aliasRoot, 'parent-output')), (error) => error.code === 'ENOENT');

    const nestedRealRoot = await fixtureRoot('qualification-handoff-hidden-nested-real-');
    await mkdir(join(nestedRealRoot, 'nested'));
    await Promise.all([
      writeJson(join(nestedRealRoot, 'nested', 'qualification-core.json'), qualificationCore()),
      writeJson(join(nestedRealRoot, 'nested', 'hidden-answers.json'), compactAnswers(sealedFixture().manifest)),
    ]);
    const nestedAliasRoot = await mkdtemp(join(tmpdir(), 'qualification-handoff-hidden-nested-alias-'));
    await symlink(nestedRealRoot, join(nestedAliasRoot, 'linked-root'), 'dir');
    const nestedInput = join(nestedRealRoot, 'nested', 'input.json');
    await writeJson(nestedInput, {
      handoffDir: '../handoff',
      qualificationCorePath: 'qualification-core.json',
      answersPath: 'hidden-answers.json',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', join(nestedAliasRoot, 'linked-root', 'nested', 'input.json'), '--output', join(nestedAliasRoot, 'nested-output')]),
      (error) => error.code === EXIT.DATA && /symlinked ancestors/.test(error.stderr),
    );
    await assert.rejects(stat(join(nestedAliasRoot, 'nested-output')), (error) => error.code === 'ENOENT');

    const fifoRoot = await fixtureRoot('qualification-handoff-hidden-fifo-');
    await execFileAsync('mkfifo', [join(fifoRoot, 'qualification-core.json')]);
    const fifoInput = join(fifoRoot, 'input.json');
    await writeJson(fifoInput, {
      handoffDir: 'handoff',
      qualificationCorePath: 'qualification-core.json',
      answersPath: 'hidden-answers.json',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', fifoInput, '--output', join(fifoRoot, 'output')]),
      (error) => error.code === EXIT.DATA && /regular file/.test(error.stderr),
    );
    await assert.rejects(stat(join(fifoRoot, 'output')), (error) => error.code === 'ENOENT');
  });

  test('hidden sibling reads fail closed for missing, malformed, and swapped semantic files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-hidden-file-red-'));
    const sealed = sealedFixture();
    await mkdir(join(root, 'handoff'));
    await Promise.all(Object.entries(sealed.files).map(([name, value]) => writeJson(join(root, 'handoff', name), value)));
    const base = {
      handoffDir: 'handoff',
      qualificationCorePath: 'qualification-core.json',
      answersPath: 'hidden-answers.json',
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
    };

    await writeJson(join(root, 'hidden-answers.json'), compactAnswers(sealed.manifest));
    await writeJson(join(root, 'missing-input.json'), base);
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', join(root, 'missing-input.json'), '--output', join(root, 'missing-output')]),
      (error) => error.code === EXIT.IO,
    );
    await assert.rejects(stat(join(root, 'missing-output')), (error) => error.code === 'ENOENT');

    await writeFile(join(root, 'qualification-core.json'), '{');
    await writeJson(join(root, 'malformed-input.json'), base);
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', join(root, 'malformed-input.json'), '--output', join(root, 'malformed-output')]),
      (error) => error.code === EXIT.DATA,
    );
    await assert.rejects(stat(join(root, 'malformed-output')), (error) => error.code === 'ENOENT');

    await writeJson(join(root, 'qualification-core.json'), compactAnswers(sealed.manifest));
    await writeJson(join(root, 'hidden-answers.json'), qualificationCore());
    await writeJson(join(root, 'swapped-input.json'), base);
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, 'hidden', '--input', join(root, 'swapped-input.json'), '--output', join(root, 'swapped-output')]),
      (error) => error.code === EXIT.DATA,
    );
    await assert.rejects(stat(join(root, 'swapped-output')), (error) => error.code === 'ENOENT');
  });

  test('hidden rejects the reserved cold-start witness collision and unsealed non-cold-start evidence', () => {
    const plan = reviewPlan();
    const manifest = manifestFor(plan);
    const collisionWitnesses = [...witnesses(), {
      id: 'qualification-handoff:cold-start-regression',
      kind: 'regression',
      current: true,
      provenance: {
        sourceRef: 'fixtures/collision.json',
        digest: digestJson({ collision: true }),
      },
      payload: { collision: true },
    }];
    const collision = sealCandidate({
      candidate: candidate(plan),
      manifest,
      witnesses: collisionWitnesses,
      quantifierClassifications: quantifiers(manifest),
    });
    assert.throws(() => buildHiddenPacket({
      ...collision,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(),
      answers: compactAnswers(collision.manifest),
    }), /collides with reserved/);

    const sealed = sealedFixture();
    const core = qualificationCore();
    const cqIds = core.competencyQuestions.map(({ id }) => id);
    core.regression = {
      baselineQualificationId: 'qualification:paper-kite:v0',
      status: 'passed',
      priorCqIds: cqIds,
      rerunCqIds: cqIds,
      evidenceRefs: ['w-unsealed-regression'],
    };
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: core,
      answers: compactAnswers(sealed.manifest, core),
    }), /caller-sealed current regression witnesses/);
  });

  test('join never auto-promotes a failed evaluator maintainability judgment', () => {
    const sealed = sealedFixture();
    const core = qualificationCore();
    const maintainability = core.axisResults.find(({ axis }) => axis === 'maintainability');
    maintainability.status = 'failed';
    maintainability.findingIds = ['diagnostic:maintainability'];
    core.diagnostics.push({
      id: 'diagnostic:maintainability',
      axis: 'maintainability',
      category: 'evidence',
      message: 'The evaluator found a fictitious maintainability failure.',
      evidenceRefs: ['w-source'],
    });
    const branchRows = branches(sealed, { qualificationCore: core });
    assert.throws(
      () => joinQualification({ ...sealed, ...branchRows }),
      (error) => error.exitCode === EXIT.GATE_BLOCKED && /mandatory axis/.test(error.message),
    );
  });

  test('hidden rejects actor/access collision and incomplete compact claim coverage', () => {
    const sealed = sealedFixture();
    const base = {
      ...sealed,
      access: access('source_hidden_evaluator', sealed.candidate.builderId, '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers: compactAnswers(sealed.manifest),
    };
    assert.throws(() => buildHiddenPacket(base), /identities collide/);
    const leaked = clone(base);
    leaked.access.actorId = 'agent:hidden';
    leaked.access.boundaries.subjectSourceAccessed = true;
    assert.throws(() => buildHiddenPacket(leaked), /accessed subject source/);
    const priorHidden = clone(base);
    priorHidden.access.actorId = 'agent:hidden';
    priorHidden.access.boundaries.hiddenArtifactsAccessed = true;
    assert.throws(() => buildHiddenPacket(priorHidden), /accessed prior hidden artifacts/);
    const extraAccess = clone(base);
    extraAccess.access.actorId = 'agent:hidden';
    extraAccess.access.unexpected = true;
    assert.throws(() => buildHiddenPacket(extraAccess), /Access manifest contains an unknown field/);
    const extraBoundary = clone(base);
    extraBoundary.access.actorId = 'agent:hidden';
    extraBoundary.access.boundaries.unexpected = false;
    assert.throws(() => buildHiddenPacket(extraBoundary), /Access boundaries contain an unknown field/);
    const incomplete = clone(base);
    incomplete.access.actorId = 'agent:hidden';
    const omitted = sealed.manifest.at(-1).id;
    const answer = incomplete.answers.find(({ claimIds }) => claimIds.includes(omitted));
    answer.claimIds = answer.claimIds.filter((id) => id !== omitted);
    answer.targets.forEach((target) => { target.claimIds = target.claimIds.filter((id) => id !== omitted); });
    assert.throws(
      () => buildHiddenPacket(incomplete),
      (error) => (
        /do not cover every manifest claim; missing 1/.test(error.message)
        && error.details?.code === 'incomplete-manifest-claim-coverage'
        && error.details?.expectedClaimCount === sealed.manifest.length
        && error.details?.coveredClaimCount === sealed.manifest.length - 1
        && error.details?.missingClaimIds?.length === 1
        && error.details.missingClaimIds[0] === omitted
      ),
    );
  });

  test('hidden rejects invented, inconsistent, and late human CQ approval provenance', () => {
    const sealed = sealedFixture();
    const base = {
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers: compactAnswers(sealed.manifest),
    };
    const inconsistent = clone(base);
    inconsistent.qualificationCore.competencyQuestions[0].owner.id = 'human:invented';
    inconsistent.qualificationCore.competencyQuestions[0].revision.approvedBy = 'human:invented';
    assert.throws(() => buildHiddenPacket(inconsistent), /single purpose owner/);
    const late = clone(base);
    late.qualificationCore.competencyQuestions.forEach((question) => {
      question.revision.approvedAt = late.access.startedAt;
    });
    assert.throws(() => buildHiddenPacket(late), /before source-hidden evaluation starts/);
    const evaluatorAsOwner = clone(base);
    evaluatorAsOwner.qualificationCore.purposeAuthority.owners[0].id = evaluatorAsOwner.access.actorId;
    evaluatorAsOwner.qualificationCore.competencyQuestions.forEach((question) => {
      question.owner.id = evaluatorAsOwner.access.actorId;
      question.revision.approvedBy = evaluatorAsOwner.access.actorId;
    });
    assert.throws(() => buildHiddenPacket(evaluatorAsOwner), /collides with a construction actor/);
  });

  test('hidden blocks a failed CQ instead of laundering it into human gap acceptance', () => {
    const sealed = sealedFixture();
    const core = qualificationCore(sealed.manifest);
    core.competencyQuestions[0].requiredWitnessKinds = ['missing-witness-kind'];
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: core,
      answers: compactAnswers(sealed.manifest, core),
    }), (error) => (
      error.exitCode === EXIT.GATE_BLOCKED
      && /failed competency questions/.test(error.message)
      && error.details[0].id === core.competencyQuestions[0].id
    ));
  });

  test('hidden cannot launder an unowned FDE label through compact handoff', () => {
    const sealed = sealedFixture();
    const core = qualificationCore(sealed.manifest);
    core.scenarios[2].audience = 'fde';
    core.competencyQuestions[2].audience = 'fde';
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: core,
      answers: compactAnswers(sealed.manifest, core),
    }), (error) => (
      error.exitCode === EXIT.DATA
      && error.details.some(({ code }) => code === 'fde-audience-authority-decision-missing')
      && error.details.some(({ code }) => code === 'fde-audience-authority-not-carried')
    ));
  });

  test('hidden rejects authored cqResults/evidence axis and incomplete compact target coverage', () => {
    const sealed = sealedFixture();
    const authoredResults = qualificationCore(sealed.manifest);
    authoredResults.cqResults = [];
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: authoredResults,
      answers: compactAnswers(sealed.manifest),
    }), /protected field cqResults/);
    const authoredEvidence = qualificationCore(sealed.manifest);
    authoredEvidence.axisResults.push({ axis: 'evidence_provenance', status: 'passed', evidenceRefs: ['w-source'], findingIds: [] });
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: authoredEvidence,
      answers: compactAnswers(sealed.manifest),
    }), /except evidence_provenance/);
    const answers = compactAnswers(sealed.manifest);
    answers[0].targets[0].claimIds = [];
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers,
    }), /Answered CQ .* needs claimIds/);
    const missingGap = compactAnswers(sealed.manifest);
    missingGap[0].status = 'partial';
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers: missingGap,
    }), /partial CQ .* needs a nonblank gap/);
    const blankAnsweredGap = compactAnswers(sealed.manifest);
    blankAnsweredGap[0].gap = '';
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers: blankAnsweredGap,
    }), /Answered CQ .* cannot carry a gap/);
    const numericAnswer = compactAnswers(sealed.manifest);
    numericAnswer[0].answer = 42;
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers: numericAnswer,
    }), /answer must be a nonblank string/);
    const longGap = compactAnswers(sealed.manifest);
    longGap[0].status = 'partial';
    longGap[0].gap = 'x'.repeat(1001);
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers: longGap,
    }), /partial CQ .* needs a nonblank gap/);
    const longQualificationCore = qualificationCore(sealed.manifest);
    longQualificationCore.qualificationId = 'q'.repeat(301);
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: longQualificationCore,
      answers: compactAnswers(sealed.manifest, longQualificationCore),
    }), (error) => error.details?.some(({ code }) => code === 'invalid-qualification-id'));
    const authoredWitnesses = compactAnswers(sealed.manifest);
    authoredWitnesses[0].witnessRefs = ['w-source'];
    assert.throws(() => buildHiddenPacket({
      ...sealed,
      access: access('source_hidden_evaluator', 'agent:hidden', '2026-01-02T03:00:00.000Z', '2026-01-02T03:10:00.000Z'),
      qualificationCore: qualificationCore(sealed.manifest),
      answers: authoredWitnesses,
    }), /cannot author derived witnessRefs/);
  });

  test('audit rejects incomplete claim/citation coverage and a source digest mismatch', () => {
    const sealed = sealedFixture();
    const base = {
      ...sealed,
      access: access('source_aware_auditor', 'agent:audit', '2026-01-02T03:05:00.000Z', '2026-01-02T03:15:00.000Z'),
      claimResults: auditRows(sealed.manifest),
      quantifierClassifications: sealed.quantifierClassifications,
      sourceDigest: sealed.candidate.sourceDigest,
    };
    const missingClaim = clone(base);
    missingClaim.claimResults.pop();
    assert.throws(() => buildAuditFragment(missingClaim), /incomplete or reordered/);
    const missingCitation = clone(base);
    missingCitation.claimResults[0].citations = [];
    assert.throws(() => buildAuditFragment(missingCitation), /citation coverage/);
    const sourceMismatch = clone(base);
    sourceMismatch.sourceDigest = digestJson({ source: 'different' });
    assert.throws(() => buildAuditFragment(sourceMismatch), /source digest mismatches/);
  });

  test('audit records an explicit source mismatch as a failed verdict', () => {
    const sealed = sealedFixture();
    const rows = auditRows(sealed.manifest);
    rows[0].status = 'mismatch';
    rows[0].citations[0].status = 'mismatch';
    const audit = buildAuditFragment({
      ...sealed,
      access: access('source_aware_auditor', 'agent:audit', '2026-01-02T03:05:00.000Z', '2026-01-02T03:15:00.000Z'),
      claimResults: rows,
      quantifierClassifications: sealed.quantifierClassifications,
      sourceDigest: sealed.candidate.sourceDigest,
    });
    assert.equal(audit.receipt.verdict, 'failed');
    assert.ok(audit.receipt.failures.length >= 2);
  });

  test('audit runtime rejects schema-forbidden access and unknown nested fields', () => {
    const sealed = sealedFixture();
    const base = {
      ...sealed,
      access: access('source_aware_auditor', 'agent:audit', '2026-01-02T03:05:00.000Z', '2026-01-02T03:15:00.000Z'),
      claimResults: auditRows(sealed.manifest),
      quantifierClassifications: sealed.quantifierClassifications,
      sourceDigest: sealed.candidate.sourceDigest,
    };

    const priorAuditorAccess = clone(base);
    priorAuditorAccess.access.boundaries.auditorArtifactsAccessed = true;
    assert.throws(() => buildAuditFragment(priorAuditorAccess), /auditor artifacts/);

    const unknownResult = clone(base);
    unknownResult.claimResults[0].extra = true;
    assert.throws(() => buildAuditFragment(unknownResult), /unknown field/);

    const unknownCitation = clone(base);
    unknownCitation.claimResults[0].citations[0].extra = true;
    assert.throws(() => buildAuditFragment(unknownCitation), /unknown field/);

    const unknownInlineFragment = clone(base);
    unknownInlineFragment.claimResults[0].citations[0].sourceFragments[0].fragment = 'not allowed';
    assert.throws(() => buildAuditFragment(unknownInlineFragment), /unknown field/);
  });

  test('audit fragment catalog rejects missing, foreign, duplicate, mixed, and unused evidence refs', () => {
    const sealed = sealedFixture();
    const catalog = catalogAuditRows(sealed.manifest);
    const base = {
      ...sealed,
      access: access('source_aware_auditor', 'agent:audit', '2026-01-02T03:05:00.000Z', '2026-01-02T03:15:00.000Z'),
      quantifierClassifications: sealed.quantifierClassifications,
      sourceDigest: sealed.candidate.sourceDigest,
    };

    assert.throws(
      () => buildAuditFragment({ ...base, claimResults: catalog.claimResults }),
      /sourceFragmentCatalog/,
    );

    const foreign = clone(catalog);
    foreign.claimResults[0].citations[0].sourceFragmentRefs[0] = 'fragment:foreign';
    assert.throws(() => buildAuditFragment({ ...base, ...foreign }), /unknown source fragment ref/);

    const duplicate = clone(catalog);
    duplicate.sourceFragmentCatalog.push({ ...duplicate.sourceFragmentCatalog[0], id: 'fragment:duplicate' });
    assert.throws(() => buildAuditFragment({ ...base, ...duplicate }), /duplicate source fragment/);

    const mixed = clone(catalog);
    mixed.claimResults[0].citations[0].sourceFragments = [{
      sourceRef: 'src/route.js',
      digest: digestJson({ mixed: true }),
    }];
    assert.throws(() => buildAuditFragment({ ...base, ...mixed }), /exactly one of sourceFragments or sourceFragmentRefs/);

    const unused = clone(catalog);
    unused.sourceFragmentCatalog.push({
      id: 'fragment:unused',
      sourceRef: 'src/unused.js',
      digest: digestJson({ unused: true }),
    });
    assert.throws(() => buildAuditFragment({ ...base, ...unused }), /unreferenced source fragment/);

    const overlongRef = clone(catalog);
    const oldRef = overlongRef.sourceFragmentCatalog[0].id;
    const longRef = 'f'.repeat(501);
    overlongRef.sourceFragmentCatalog[0].id = longRef;
    for (const result of overlongRef.claimResults) {
      for (const citation of result.citations) {
        citation.sourceFragmentRefs = citation.sourceFragmentRefs.map((ref) => ref === oldRef ? longRef : ref);
      }
    }
    assert.throws(() => buildAuditFragment({ ...base, ...overlongRef }), /too long/);
  });
});

describe('join RED probes', () => {
  function resealHiddenQualification(hidden) {
    hidden.receipt.qualificationDigest = artifactDigest(hidden.qualification);
  }

  test('rejects a prejoin verified citation or human acceptance', () => {
    const sealed = sealedFixture();
    const first = branches(sealed);
    first.hidden.qualification.citationChecks[0] = { claimId: sealed.manifest[0].id, witnessRef: 'w-source', status: 'verified' };
    resealHiddenQualification(first.hidden);
    assert.throws(() => joinQualification({ ...sealed, ...first }), /pre-verified/);
    const second = branches(sealed);
    second.hidden.qualification.acceptance.decision = 'accepted';
    second.hidden.qualification.acceptance.decidedBy = 'human:premature';
    second.hidden.qualification.acceptance.acceptedGapIds = sealed.candidate.requiredGapIds;
    resealHiddenQualification(second.hidden);
    assert.throws(() => joinQualification({ ...sealed, ...second }), /accepted before the join/);
  });

  test('rejects hidden claim/order mutation and audit source mutation even with refreshed local digests', () => {
    const sealed = sealedFixture();
    const first = branches(sealed);
    [first.hidden.qualification.claims[0], first.hidden.qualification.claims[1]] = [first.hidden.qualification.claims[1], first.hidden.qualification.claims[0]];
    resealHiddenQualification(first.hidden);
    assert.throws(() => joinQualification({ ...sealed, ...first }), /claims were mutated or reordered/);
    const second = branches(sealed);
    second.audit.fragment.sourceDigest = digestJson({ source: 'mutated' });
    second.audit.receipt.fragmentDigest = artifactDigest(second.audit.fragment);
    assert.throws(() => joinQualification({ ...sealed, ...second }), /source digest mismatches/);
  });

  test('rejects actor collision and non-overlapping parallel branches', () => {
    const sealed = sealedFixture();
    const collision = branches(sealed, { hiddenActor: 'agent:same', auditActor: 'agent:same' });
    assert.throws(() => joinQualification({ ...sealed, ...collision }), /must be distinct/);
    const serial = branches(sealed, { nonOverlap: true });
    assert.throws(() => joinQualification({ ...sealed, ...serial }), /did not overlap/);
    const ownerAsAuditor = branches(sealed, { auditActor: HUMAN_ID });
    assert.throws(() => joinQualification({ ...sealed, ...ownerAsAuditor }), /CQ owner identity collides/);
  });
});

describe('accept and release RED probes', () => {
  test('accept rejects request tampering, authority/digest mismatch, incomplete gaps, and construction-actor identity', () => {
    const { sealed, joined } = joinedFixture();
    const human = {
      id: 'human:reviewer',
      authority: 'human',
      decision: 'accepted',
      decidedAt: '2026-01-02T03:20:00.000Z',
      requestDigest: joined.receipt.acceptanceRequestDigest,
      planDigest: joined.request.planDigest,
      planRevision: joined.request.planRevision,
      acceptedGapIds: joined.request.requiredGapIds,
    };
    const requestDrift = clone(joined);
    requestDrift.request.planRevision += 1;
    assert.throws(() => acceptQualification({ ...sealed, join: requestDrift, human }), /request drifted/);
    const wrongAuthority = clone(human);
    wrongAuthority.authority = 'agent';
    assert.throws(() => acceptQualification({ ...sealed, join: joined, human: wrongAuthority }), /authority must be exactly human/);
    const digestDrift = clone(human);
    digestDrift.requestDigest = digestJson({ request: 'different' });
    assert.throws(() => acceptQualification({ ...sealed, join: joined, human: digestDrift }), /request digest mismatch/);
    const gapDrift = clone(human);
    gapDrift.acceptedGapIds = [];
    assert.throws(() => acceptQualification({ ...sealed, join: joined, human: gapDrift }), /exact required gap/);
    const actorCollision = clone(human);
    actorCollision.id = joined.receipt.actors.hiddenEvaluatorId;
    assert.throws(() => acceptQualification({ ...sealed, join: joined, human: actorCollision }), /collides/);
    const cqOwnerMismatch = clone(human);
    cqOwnerMismatch.id = 'human:different-reviewer';
    assert.throws(() => acceptQualification({ ...sealed, join: joined, human: cqOwnerMismatch }), /preapproved CQ owner/);
  });

  test('release rejects a non-executable result and source/plan drift', () => {
    const { sealed, accepted } = acceptedFixture();
    const released = {
      status: 'pass',
      canWrite: true,
      writePlan: accepted.lifecycle.writePlan,
      constructionLifecycle: accepted.lifecycle,
    };
    const analyzeRequest = {
      name: 'analyze_repo_structure',
      args: { proposal: sealed.candidate.proposal, qualification: accepted.qualification },
    };
    assert.throws(() => prepareRelease({
      ...sealed,
      acceptedQualification: accepted.qualification,
      acceptanceReceipt: accepted.receipt,
      analyzeRequest,
      released: { ...released, canWrite: false },
    }), (error) => error.exitCode === EXIT.GATE_BLOCKED);
    const drifted = clone(released);
    drifted.constructionLifecycle.sourceDigest = digestJson({ source: 'drifted' });
    assert.throws(() => prepareRelease({
      ...sealed,
      acceptedQualification: accepted.qualification,
      acceptanceReceipt: accepted.receipt,
      analyzeRequest,
      released: drifted,
    }), /source digest drifted/);
    const proposalDrift = clone(analyzeRequest);
    proposalDrift.args.proposal.projectSlug = 'different';
    assert.throws(() => prepareRelease({
      ...sealed,
      acceptedQualification: accepted.qualification,
      acceptanceReceipt: accepted.receipt,
      analyzeRequest: proposalDrift,
      released,
    }), /proposal drifted/);
    const qualificationDrift = clone(analyzeRequest);
    qualificationDrift.args.qualification.resourceUse.toolCalls += 1;
    assert.throws(() => prepareRelease({
      ...sealed,
      acceptedQualification: accepted.qualification,
      acceptanceReceipt: accepted.receipt,
      analyzeRequest: qualificationDrift,
      released,
    }), /qualification drifted/);
  });

  test('51 writer rows become two calls with no call over 50 rows', () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({ slug: `elements/fictitious-${index}` }));
    const calls = chunkWriterCalls('add_concepts', 'concepts', rows);
    assert.deepEqual(calls.map((call) => call.args.concepts.length), [50, 1]);
    assert.deepEqual(calls.map(({ id }) => id), [1, 2]);
  });
});

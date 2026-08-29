import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
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
import { evaluateConstructionQualification } from '../../../../mcp/src/construction-qualification.mjs';
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
  const audiences = ['executive', 'employee', 'fde', 'agent'];
  const scenarios = audiences.map((audience) => ({
    id: `scenario:${audience}`,
    audience,
    trigger: `A fictitious ${audience} decision begins.`,
    decision: `Choose the bounded ${audience} next step.`,
    expectedOutcome: `Name the evidence for the ${audience} decision.`,
  }));
  const competencyQuestions = audiences.map((audience) => ({
    id: `cq:${audience}`,
    scenarioId: `scenario:${audience}`,
    audience,
    question: `What is the bounded ${audience} answer?`,
    owner: { id: HUMAN_ID, authority: 'human' },
    revision: { version: 1, approvedBy: HUMAN_ID, approvedAt: QUESTION_APPROVED_ISO },
    expectedAnswer: { shape: 'one-row', quantifier: 'one', targets: [`target:${audience}`] },
    requiredWitnessKinds: ['source_span'],
    unknownPolicy: { allowed: true, response: 'State that the fictitious evidence is unknown.' },
    examples: [{ id: `example:${audience}`, expectedStatus: 'answered' }],
    counterexamples: [{ id: `counterexample:${audience}`, mustReject: 'An unbounded whole-repository claim.' }],
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
    assert.deepEqual(Object.keys(HANDOFF_SCHEMA.commands), ['seal', 'hidden', 'audit', 'join', 'accept', 'release']);
    assert.match(HANDOFF_SCHEMA.io.atomicity, /staged/);
    assert.match(HANDOFF_SCHEMA.quantifiers.rule, /source_bounded/);
    assert.match(HANDOFF_SCHEMA.commands.hidden.qualificationCore, /predates source-hidden evaluation/);
    assert.match(HANDOFF_SCHEMA.commands.audit.claimResults, /deduplicated sourceFragmentCatalog/);
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

  test('CLI writes schema atomically to a new directory and refuses an existing target with exit 74', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qualification-handoff-test-'));
    const output = join(root, 'schema-output');
    await execFileAsync(process.execPath, [SCRIPT, 'schema', '--output', output]);
    assert.equal((await stat(output)).isDirectory(), true);
    assert.equal(JSON.parse(await readFile(join(output, 'schema.json'), 'utf8')).contract, HANDOFF_SCHEMA.contract);
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
  });
});

describe('hidden and audit RED probes', () => {
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
    const incomplete = clone(base);
    incomplete.access.actorId = 'agent:hidden';
    const omitted = sealed.manifest.at(-1).id;
    const answer = incomplete.answers.find(({ claimIds }) => claimIds.includes(omitted));
    answer.claimIds = answer.claimIds.filter((id) => id !== omitted);
    answer.targets.forEach((target) => { target.claimIds = target.claimIds.filter((id) => id !== omitted); });
    assert.throws(() => buildHiddenPacket(incomplete), /do not cover every manifest claim/);
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

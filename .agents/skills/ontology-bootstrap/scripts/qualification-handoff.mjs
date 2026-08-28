#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  access,
  constants,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CONSTRUCTION_QUALIFICATION_CONTRACT,
  CONSTRUCTION_QUALITY_AXES,
  evaluateConstructionQualification,
} from '../../../../mcp/src/construction-qualification.mjs';
import {
  constructionPlanDigest,
  evaluateConstructionLifecycle,
  proposalCoverageRefs,
} from '../../../../mcp/src/construction-lifecycle.mjs';

export const EXIT = Object.freeze({
  OK: 0,
  GATE_BLOCKED: 2,
  USAGE: 64,
  DATA: 65,
  SOFTWARE: 70,
  IO: 74,
});

const CONTRACTS = Object.freeze({
  candidate: 'qualificationHandoffCandidate:v1',
  seal: 'qualificationHandoffSeal:v1',
  access: 'qualificationHandoffAccess:v1',
  hidden: 'qualificationHandoffHidden:v1',
  hiddenReceipt: 'qualificationHandoffHiddenReceipt:v1',
  audit: 'qualificationHandoffSourceFragment:v1',
  auditReceipt: 'qualificationHandoffAuditReceipt:v1',
  join: 'qualificationHandoffJoin:v1',
  request: 'qualificationHandoffAcceptanceRequest:v1',
  acceptance: 'qualificationHandoffAcceptance:v1',
  release: 'qualificationHandoffRelease:v1',
});

const ROLES = Object.freeze({
  HIDDEN: 'source_hidden_evaluator',
  AUDITOR: 'source_aware_auditor',
});
const QUANTIFIER_RE = /\b(all|always|any|each|every|exactly|never|none|only|solely)\b/gi;
const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const MANDATORY_AXES = Object.freeze([
  'semantic',
  'structural',
  'evidence_provenance',
  'maintainability',
  'interoperability',
]);
const EVIDENCE_PENDING_ID = 'qualification-handoff:audit-pending';
const COLD_START_REGRESSION_WITNESS_ID = 'qualification-handoff:cold-start-regression';
const EVIDENCE_PENDING_DIAGNOSTIC = Object.freeze({
  id: EVIDENCE_PENDING_ID,
  axis: 'evidence_provenance',
  category: 'evidence',
  message: 'Source-aware claim and citation verification is pending.',
  evidenceRefs: [],
});
const PROTECTED_HIDDEN_FIELDS = Object.freeze([
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
]);

export const HANDOFF_SCHEMA = Object.freeze({
  contract: 'qualificationHandoffCli:v1',
  purpose: 'Validate and package an ontology construction qualification without invoking MCP or writing a vault.',
  invocation: 'qualification-handoff.mjs <schema|seal|hidden|audit|join|accept|release> [--input file] [--output new-directory]',
  io: {
    schema: 'No input. Prints this document, or writes schema.json when --output is supplied.',
    otherCommands: 'Require one JSON --input and an absent --output directory. Each input embeds the previous stage artifacts as JSON values.',
    atomicity: 'Files are staged in a new sibling directory and renamed. Existing output paths are refused.',
  },
  exits: {
    0: 'success',
    2: 'a well-formed packet failed a release or semantic safety gate',
    64: 'command-line usage error',
    65: 'input contract, digest, coverage, actor, access, or mutation error',
    70: 'unexpected software error',
    74: 'input/output filesystem error',
  },
  commands: {
    seal: {
      input: ['candidate', 'manifest', 'witnesses', 'quantifierClassifications'],
      compactInput: ['candidatePath', 'manifestPath', 'witnessesPath', 'quantifierClassifications'],
      derivedCompactInput: ['analysisPath', 'proposalPath', 'manifestPath', 'witnessesPath', 'builderId', 'quantifierClassifications'],
      candidate: 'Must carry the exact original proposal as candidate.proposal.',
      output: ['candidate-packet.json', 'claim-manifest.json', 'source-witnesses.json', 'candidate-seal.json'],
    },
    hidden: {
      input: ['candidate', 'seal', 'manifest', 'witnesses', 'access', 'qualificationCore', 'answers'],
      compactInput: ['handoffDir', 'access', 'qualificationCore', 'answers'],
      answers: 'Compact rows {cqId,status,claimIds,targets:[{target,claimIds}],answer?,gap?}; witness refs and cqResults are derived. Partial/unknown/refused require gap and may leave explicit targets empty; answered targets require claims.',
      qualificationCore: 'Omits cqResults and the evidence_provenance axis; the helper injects an audit-pending diagnostic and axis. Maintainability remains the evaluator judgment supplied here and is never auto-promoted.',
      output: ['qualification-pending.json', 'hidden-access.json', 'hidden-receipt.json', 'hidden-answers.json'],
    },
    audit: {
      input: ['candidate', 'seal', 'manifest', 'witnesses', 'access', 'claimResults', 'quantifierClassifications'],
      compactInput: ['handoffDir', 'access', 'claimResults', 'quantifierClassifications', 'sourceDigest'],
      output: ['qualification-source-fragment.json', 'auditor-access.json', 'audit-receipt.json'],
    },
    join: {
      input: ['candidate', 'seal', 'manifest', 'witnesses', 'hidden', 'audit'],
      compactInput: ['handoffDir', 'hiddenDir', 'auditorDir'],
      output: ['qualification-joined-pending.json', 'qualification-evaluation.json', 'lifecycle-pending.json', 'acceptance-request.json', 'join-receipt.json'],
    },
    accept: {
      input: ['candidate', 'seal', 'manifest', 'witnesses', 'join', 'human'],
      compactInput: ['handoffDir', 'joinedDir', 'human'],
      human: ['id', 'authority=human', 'decidedAt', 'decision=accepted', 'requestDigest', 'planDigest', 'planRevision', 'acceptedGapIds'],
      output: ['qualification-accepted.json', 'qualification-evaluation.json', 'lifecycle-release-preview.json', 'acceptance-receipt.json'],
    },
    release: {
      input: ['candidate', 'seal', 'manifest', 'witnesses', 'acceptedQualification', 'acceptanceReceipt', 'analyzeRequest', 'released'],
      compactInput: ['handoffDir', 'acceptedDir', 'analyzeRequestPath', 'releasedPath', 'firstCallId?'],
      analyzeRequest: 'The exact final analyze_repo_structure call; args.proposal and args.qualification are verified before the response is trusted.',
      released: 'The current analyzer proposalValidation (directly or nested under structuredContent.proposalValidation).',
      output: ['concept-calls.json', 'relation-calls.json', 'release-receipt.json'],
    },
  },
  access: {
    required: ['contract', 'actorId', 'role', 'startedAt', 'endedAt', 'readScopes', 'writeScopes', 'boundaries'],
    boundaries: [
      'subjectSourceAccessed',
      'hiddenArtifactsAccessed',
      'auditorArtifactsAccessed',
      'builderPrivateArtifactsAccessed',
      'vaultAccessed',
      'networkUsed',
      'otherAgentContacted',
    ],
  },
  quantifiers: {
    lexicalTerms: [...new Set('all always any each every exactly never none only solely'.split(' '))],
    rule: 'Every lexical match needs a claimId/term classification of source_bounded or unsafe. Source-bounded rows need rationale and sourceRefs; unsafe rows block the stage.',
  },
  compactPaths: {
    resolution: 'Relative paths resolve against the directory containing the CLI --input JSON. Absolute paths remain absolute.',
    handoffDir: ['candidate-packet.json', 'claim-manifest.json', 'source-witnesses.json', 'candidate-seal.json'],
    hiddenDir: ['qualification-pending.json', 'hidden-access.json', 'hidden-receipt.json'],
    auditorDir: ['qualification-source-fragment.json', 'auditor-access.json', 'audit-receipt.json'],
    joinedDir: ['qualification-joined-pending.json', 'acceptance-request.json', 'join-receipt.json'],
    acceptedDir: ['qualification-accepted.json', 'acceptance-receipt.json'],
    rule: 'Compact and embedded artifact forms are mutually exclusive. Missing, malformed, or digest-drifted files fail closed.',
  },
  derivedCandidate: {
    rule: 'analysisPath must carry the exact analyze_repo_structure request plus current structuredContent. The helper binds proposalPath to that request and derives only lifecycle/review-plan fields; it does not generate claims.',
    supportedAnalysisForms: ['batch calls+responses envelope', 'call/request plus result.structuredContent', 'call/request plus structuredContent'],
  },
  coldStartRegression: {
    reservedWitnessId: COLD_START_REGRESSION_WITNESS_ID,
    rule: 'For baselineQualificationId:null + not_applicable + empty prior/rerun/evidence refs, hidden adds a current regression witness digest-bound to the exact CQ set and regression row. Any sealed ID collision is rejected. Non-cold-start rows must cite caller-sealed current regression witnesses.',
    maintainability: 'The reserved witness does not promote maintainability. The evaluator-authored maintainability axis must independently pass for an executable join.',
  },
});

export class HandoffError extends Error {
  constructor(message, { exitCode = EXIT.DATA, details } = {}) {
    super(message);
    this.name = 'HandoffError';
    this.exitCode = exitCode;
    this.details = details;
  }
}

function assert(condition, message, options) {
  if (!condition) throw new HandoffError(message, options);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every(nonBlank)
    && new Set(value).size === value.length;
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_RE.test(value);
}

function validTimestamp(value) {
  return nonBlank(value) && Number.isFinite(Date.parse(value));
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactSet(left, right) {
  return uniqueStrings(left)
    && uniqueStrings(right)
    && same([...left].sort(), [...right].sort());
}

function uniqueRows(rows, key, label) {
  assert(Array.isArray(rows), `${label} must be an array.`);
  assert(rows.every((row) => isRecord(row) && nonBlank(row[key])), `${label} rows need ${key}.`);
  assert(new Set(rows.map((row) => row[key])).size === rows.length, `${label} ${key} values must be unique.`);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value, { pretty = false } = {}) {
  return `${JSON.stringify(canonicalize(value), null, pretty ? 2 : 0)}${pretty ? '\n' : ''}`;
}

export function digestJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function artifactDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value, { pretty: true })).digest('hex')}`;
}

function manifestProjection(rows) {
  return rows.map(({ id, statement, status, witnessRefs, proposalRefs }) => ({
    id,
    statement,
    status,
    witnessRefs: [...witnessRefs],
    proposalRefs: [...proposalRefs],
  }));
}

function qualificationWitnesses(witnesses) {
  return witnesses.map(({ id, kind, current, provenance }) => ({
    id,
    kind,
    current,
    provenance: structuredClone(provenance),
  }));
}

function validateCandidate(candidate) {
  assert(isRecord(candidate), 'candidate must be an object.');
  assert(nonBlank(candidate.builderId), 'candidate.builderId is required.');
  assert(isRecord(candidate.proposal), 'candidate.proposal must carry the exact original proposal.');
  assert(candidate.sourceHidden === true, 'candidate.sourceHidden must be true.');
  assert(candidate.canWrite === false, 'candidate.canWrite must be false before qualification.');
  assert(!Object.hasOwn(candidate, 'writePlan'), 'candidate must not contain a premature writePlan.');
  assert(isRecord(candidate.reviewPlan), 'candidate.reviewPlan is required.');
  assert(Array.isArray(candidate.reviewPlan.concepts), 'reviewPlan.concepts must be an array.');
  assert(Array.isArray(candidate.reviewPlan.relations), 'reviewPlan.relations must be an array.');
  assert(isRecord(candidate.reviewPlan.competencyAnswers), 'reviewPlan.competencyAnswers is required.');
  uniqueRows(candidate.reviewPlan.concepts, 'slug', 'reviewPlan.concepts');
  assert(candidate.reviewPlan.concepts.every(({ body }) => (
    typeof body === 'string' && body.trim().length > 0
  )), 'Every concept needs its complete body.');
  assert(candidate.reviewPlan.concepts.filter(({ kind }) => kind === 'project').length === 1, 'Review plan needs exactly one project concept.');
  const relationKeys = candidate.reviewPlan.relations.map(({ from, to, type }) => `${type}:${from}->${to}`);
  assert(candidate.reviewPlan.relations.every(({ from, to, type }) => [from, to, type].every(nonBlank)), 'Every relation needs from, to, and type.');
  assert(new Set(relationKeys).size === relationKeys.length, 'Review plan relations must be unique.');
  const computed = constructionPlanDigest(candidate.reviewPlan);
  assert(validDigest(candidate.planDigest) && candidate.planDigest === computed, 'candidate plan digest drifted.');
  assert(validDigest(candidate.sourceDigest), 'candidate.sourceDigest is required.');
  assert(Number.isInteger(candidate.planRevision) && candidate.planRevision > 0, 'candidate.planRevision must be positive.');
  assert(uniqueStrings(candidate.requiredGapIds), 'candidate.requiredGapIds must be unique strings.');
  assert(candidate.proposalValidation?.status === 'pass', 'candidate proposal validation did not pass.');
  assert(candidate.proposalValidation?.canWrite === false, 'candidate proposal validation must remain non-writing.');
  assert(!Object.hasOwn(candidate.proposalValidation, 'writePlan'), 'candidate proposal validation contains a premature writePlan.');
  assert(Array.isArray(candidate.proposalValidation.findings), 'candidate proposal findings must be an array.');
  const initialLifecycle = evaluateConstructionLifecycle({
    reviewPlan: candidate.reviewPlan,
    sourceDigest: candidate.sourceDigest,
    proposalFindings: candidate.proposalValidation.findings,
  });
  assert(initialLifecycle.writeEligibility === 'reviewable' && !Object.hasOwn(initialLifecycle, 'writePlan'), 'candidate lifecycle must be a non-writing review plan.');
  assert(candidate.planRevision === initialLifecycle.planRevision, 'candidate plan revision drifted.');
  assert(same(candidate.requiredGapIds, initialLifecycle.requiredGapIds), 'candidate required gap ids drifted.');
  const expectedRefs = proposalCoverageRefs(candidate.reviewPlan);
  if (Object.hasOwn(candidate, 'proposalCoverageRefs')) {
    assert(same(candidate.proposalCoverageRefs, expectedRefs), 'candidate proposal coverage refs drifted.');
  }
  return expectedRefs;
}

function validateWitnesses(witnesses) {
  uniqueRows(witnesses, 'id', 'witnesses');
  for (const witness of witnesses) {
    assert(nonBlank(witness.kind), `Witness ${witness.id} needs a kind.`);
    assert(typeof witness.current === 'boolean', `Witness ${witness.id} needs currentness.`);
    assert(isRecord(witness.provenance), `Witness ${witness.id} needs provenance.`);
    assert(nonBlank(witness.provenance.sourceRef), `Witness ${witness.id} needs a portable sourceRef.`);
    assert(!witness.provenance.sourceRef.startsWith('/') && !witness.provenance.sourceRef.startsWith('file:'), `Witness ${witness.id} sourceRef must be portable.`);
    assert(validDigest(witness.provenance.digest), `Witness ${witness.id} needs a digest.`);
    if (Object.hasOwn(witness, 'payload')) {
      assert(witness.provenance.digest === digestJson(witness.payload), `Witness ${witness.id} payload digest drifted.`);
    }
  }
}

function quantifierMatches(manifest) {
  const matches = [];
  for (const claim of manifest) {
    for (const match of claim.statement.matchAll(QUANTIFIER_RE)) {
      matches.push({ claimId: claim.id, term: match[1].toLowerCase() });
    }
  }
  return matches;
}

function validateQuantifiers(manifest, classifications) {
  assert(Array.isArray(classifications), 'quantifierClassifications must be an array.');
  uniqueRows(classifications.map((row) => ({ ...row, key: `${row.claimId}\u0000${String(row.term).toLowerCase()}` })), 'key', 'quantifierClassifications');
  const matches = quantifierMatches(manifest);
  const required = new Set(matches.map(({ claimId, term }) => `${claimId}\u0000${term}`));
  const provided = new Set();
  for (const row of classifications) {
    const key = `${row.claimId}\u0000${String(row.term).toLowerCase()}`;
    assert(required.has(key), `Quantifier classification ${key} is foreign.`);
    assert(['source_bounded', 'unsafe'].includes(row.classification), `Quantifier ${key} needs source_bounded or unsafe classification.`);
    assert(nonBlank(row.rationale), `Quantifier ${key} needs a rationale.`);
    assert(uniqueStrings(row.sourceRefs), `Quantifier ${key} needs sourceRefs.`);
    if (row.classification === 'source_bounded') {
      assert(row.sourceRefs.length > 0, `Source-bounded quantifier ${key} needs a sourceRef.`);
    }
    provided.add(key);
  }
  assert(same([...provided].sort(), [...required].sort()), 'Every lexical quantifier needs an exact classification.');
  const unsafe = classifications.filter(({ classification }) => classification === 'unsafe');
  assert(unsafe.length === 0, 'Unsafe lexical quantifiers must be repaired before sealing.', {
    exitCode: EXIT.GATE_BLOCKED,
    details: unsafe,
  });
  return { matches, classifications: structuredClone(classifications) };
}

function validateManifest(manifest, witnesses, expectedRefs) {
  uniqueRows(manifest, 'id', 'manifest');
  const witnessIds = new Set(witnesses.map(({ id }) => id));
  for (const claim of manifest) {
    assert(nonBlank(claim.statement), `Claim ${claim.id} needs a statement.`);
    assert(claim.status === 'supported', `Claim ${claim.id} must be supported before sealing.`);
    assert(uniqueStrings(claim.witnessRefs) && claim.witnessRefs.length > 0, `Claim ${claim.id} needs witnesses.`);
    assert(claim.witnessRefs.every((id) => witnessIds.has(id)), `Claim ${claim.id} has an unknown witness.`);
    assert(uniqueStrings(claim.proposalRefs) && claim.proposalRefs.length > 0, `Claim ${claim.id} needs one or more exact proposal refs.`);
  }
  const flattenedRefs = manifest.flatMap(({ proposalRefs }) => proposalRefs);
  const expected = new Set(expectedRefs);
  assert(flattenedRefs.every((ref) => expected.has(ref)), 'Manifest proposal coverage contains a foreign ref.');
  const firstSeen = [];
  const seen = new Set();
  for (const ref of flattenedRefs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    firstSeen.push(ref);
  }
  assert(same(firstSeen, expectedRefs), 'Manifest proposal coverage is missing or first-occurrence order drifted.');
}

function verifySeal(candidate, seal, manifest, witnesses) {
  const expectedRefs = validateCandidate(candidate);
  validateWitnesses(witnesses);
  validateManifest(manifest, witnesses, expectedRefs);
  assert(seal?.contract === CONTRACTS.seal, 'Unknown candidate seal contract.');
  assert(seal.builderId === candidate.builderId, 'Candidate seal builder mismatch.');
  assert(seal.planDigest === candidate.planDigest && seal.sourceDigest === candidate.sourceDigest, 'Candidate seal plan/source digest mismatch.');
  assert(seal.candidateDigest === artifactDigest(candidate), 'Candidate artifact digest drifted.');
  assert(seal.manifestDigest === artifactDigest(manifest), 'Manifest artifact digest drifted.');
  assert(seal.witnessesDigest === artifactDigest(witnesses), 'Witness artifact digest drifted.');
  assert(same(seal.proposalCoverageRefs, expectedRefs), 'Sealed proposal coverage drifted.');
  const quantifiers = validateQuantifiers(manifest, seal.quantifiers?.classifications ?? []);
  assert(same(quantifiers, seal.quantifiers), 'Sealed quantifier receipt drifted.');
  return expectedRefs;
}

export function sealCandidate({ candidate, manifest, witnesses, quantifierClassifications = [] } = {}) {
  const packet = { ...structuredClone(candidate), contract: CONTRACTS.candidate };
  const expectedRefs = validateCandidate(packet);
  validateWitnesses(witnesses);
  validateManifest(manifest, witnesses, expectedRefs);
  const quantifiers = validateQuantifiers(manifest, quantifierClassifications);
  packet.proposalCoverageRefs = expectedRefs;
  const sealedManifest = manifestProjection(manifest);
  const sealedWitnesses = structuredClone(witnesses);
  const seal = {
    contract: CONTRACTS.seal,
    builderId: packet.builderId,
    planDigest: packet.planDigest,
    sourceDigest: packet.sourceDigest,
    planRevision: packet.planRevision,
    candidateDigest: artifactDigest(packet),
    manifestDigest: artifactDigest(sealedManifest),
    witnessesDigest: artifactDigest(sealedWitnesses),
    proposalCoverageRefs: expectedRefs,
    counts: {
      concepts: packet.reviewPlan.concepts.length,
      relations: packet.reviewPlan.relations.length,
      claims: sealedManifest.length,
      witnesses: sealedWitnesses.length,
      requiredGaps: packet.requiredGapIds.length,
    },
    quantifiers,
  };
  return {
    candidate: packet,
    manifest: sealedManifest,
    witnesses: sealedWitnesses,
    seal,
    files: {
      'candidate-packet.json': packet,
      'claim-manifest.json': sealedManifest,
      'source-witnesses.json': sealedWitnesses,
      'candidate-seal.json': seal,
    },
  };
}

function validateAccess(accessRow, role) {
  assert(accessRow?.contract === CONTRACTS.access, 'Unknown access manifest contract.');
  assert(nonBlank(accessRow.actorId), 'Access manifest needs actorId.');
  assert(accessRow.role === role, `Access role must be ${role}.`);
  assert(validTimestamp(accessRow.startedAt) && validTimestamp(accessRow.endedAt), 'Access window needs timestamps.');
  assert(Date.parse(accessRow.endedAt) >= Date.parse(accessRow.startedAt), 'Access window ends before it starts.');
  assert(uniqueStrings(accessRow.readScopes) && uniqueStrings(accessRow.writeScopes), 'Access scopes must be unique strings.');
  assert(isRecord(accessRow.boundaries), 'Access boundaries are required.');
  for (const key of HANDOFF_SCHEMA.access.boundaries) {
    assert(typeof accessRow.boundaries[key] === 'boolean', `Access boundary ${key} must be explicit.`);
  }
  assert(accessRow.boundaries.vaultAccessed === false, 'Qualification helpers cannot access a vault.');
  assert(accessRow.boundaries.networkUsed === false, 'Qualification helpers cannot use the network.');
  assert(accessRow.boundaries.otherAgentContacted === false, 'Qualification branches must remain independent.');
  assert(accessRow.boundaries.builderPrivateArtifactsAccessed === false, 'Builder-private artifacts are outside the handoff.');
  if (role === ROLES.HIDDEN) {
    assert(accessRow.boundaries.subjectSourceAccessed === false, 'Source-hidden evaluator accessed subject source.');
    assert(accessRow.boundaries.auditorArtifactsAccessed === false, 'Source-hidden evaluator accessed auditor artifacts.');
  } else {
    assert(accessRow.boundaries.subjectSourceAccessed === true, 'Source-aware auditor did not access subject source.');
    assert(accessRow.boundaries.hiddenArtifactsAccessed === false, 'Source-aware auditor accessed hidden artifacts.');
  }
}

function claimWitnessRefs(claimIds, manifestById) {
  return [...new Set(claimIds.flatMap((id) => manifestById.get(id)?.witnessRefs ?? []))];
}

function deriveCqResults(qualificationCore, answers, manifest) {
  assert(Array.isArray(answers), 'Compact hidden answers are required.');
  uniqueRows(answers, 'cqId', 'answers');
  const questions = qualificationCore.competencyQuestions ?? [];
  assert(same(answers.map(({ cqId }) => cqId), questions.map(({ id }) => id)), 'Compact answers must cover competency questions in exact order.');
  const manifestById = new Map(manifest.map((claim) => [claim.id, claim]));
  const coveredClaimIds = new Set();
  const results = answers.map((answer, index) => {
    const question = questions[index];
    assert(!Object.hasOwn(answer, 'witnessRefs') && !Object.hasOwn(answer, 'targetResults'), `Answer ${answer.cqId} cannot author derived witnessRefs or targetResults.`);
    assert(['answered', 'partial', 'unknown', 'refused'].includes(answer.status), `Answer ${answer.cqId} has an invalid status.`);
    if (answer.status === 'answered') {
      assert(!nonBlank(answer.gap), `Answered CQ ${answer.cqId} cannot carry a gap.`);
    } else {
      assert(nonBlank(answer.gap), `${answer.status} CQ ${answer.cqId} needs a nonblank gap.`);
    }
    assert(uniqueStrings(answer.claimIds), `Answer ${answer.cqId} needs unique claimIds.`);
    assert(answer.claimIds.every((id) => manifestById.has(id)), `Answer ${answer.cqId} references an unknown claim.`);
    answer.claimIds.forEach((id) => coveredClaimIds.add(id));
    assert(Array.isArray(answer.targets), `Answer ${answer.cqId} needs compact targets.`);
    assert(same(answer.targets.map(({ target }) => target), question.expectedAnswer?.targets ?? []), `Answer ${answer.cqId} target coverage is incomplete, foreign, or reordered.`);
    const answerClaimSet = new Set(answer.claimIds);
    const targetResults = answer.targets.map((target) => {
      assert(!Object.hasOwn(target, 'witnessRefs'), `Answer ${answer.cqId} target ${target.target} cannot author derived witnessRefs.`);
      assert(uniqueStrings(target.claimIds), `Answer ${answer.cqId} target ${target.target} needs explicit claimIds.`);
      if (answer.status === 'answered') {
        assert(target.claimIds.length > 0, `Answered CQ ${answer.cqId} target ${target.target} needs claimIds.`);
      }
      assert(target.claimIds.every((id) => answerClaimSet.has(id)), `Answer ${answer.cqId} target ${target.target} references a claim outside its answer.`);
      return {
        target: target.target,
        witnessRefs: claimWitnessRefs(target.claimIds, manifestById),
        claimIds: [...target.claimIds],
      };
    });
    return {
      cqId: answer.cqId,
      status: answer.status,
      witnessRefs: claimWitnessRefs(answer.claimIds, manifestById),
      claimIds: [...answer.claimIds],
      targetResults,
      ...(answer.status === 'answered' ? {} : { gap: answer.gap }),
    };
  });
  assert(same([...coveredClaimIds].sort(), manifest.map(({ id }) => id).sort()), 'Compact answers do not cover every manifest claim.');
  return results;
}

function validateCoreAxes(qualificationCore) {
  uniqueRows(qualificationCore.axisResults, 'axis', 'qualificationCore.axisResults');
  const expected = CONSTRUCTION_QUALITY_AXES.filter((axis) => axis !== 'evidence_provenance');
  assert(exactSet(qualificationCore.axisResults.map(({ axis }) => axis), expected), 'qualificationCore must provide every axis except evidence_provenance.');
  assert(Array.isArray(qualificationCore.diagnostics), 'qualificationCore.diagnostics must be an array.');
  assert(!qualificationCore.diagnostics.some(({ id, axis }) => id === EVIDENCE_PENDING_ID || axis === 'evidence_provenance'), 'qualificationCore cannot author the audit-pending evidence axis or diagnostic.');
  const byAxis = new Map(qualificationCore.axisResults.map((row) => [row.axis, row]));
  return CONSTRUCTION_QUALITY_AXES.map((axis) => (
    axis === 'evidence_provenance'
      ? { axis, status: 'not_measured', evidenceRefs: [], findingIds: [EVIDENCE_PENDING_ID] }
      : structuredClone(byAxis.get(axis))
  ));
}

function prepareRegression(qualificationCore, sealedWitnesses) {
  const row = qualificationCore.regression;
  assert(isRecord(row), 'qualificationCore.regression is required.');
  assert(!sealedWitnesses.some(({ id }) => id === COLD_START_REGRESSION_WITNESS_ID), `Sealed witness id collides with reserved ${COLD_START_REGRESSION_WITNESS_ID}.`);
  if (row.baselineQualificationId === null) {
    assert(
      row.status === 'not_applicable'
        && Array.isArray(row.priorCqIds) && row.priorCqIds.length === 0
        && Array.isArray(row.rerunCqIds) && row.rerunCqIds.length === 0
        && Array.isArray(row.evidenceRefs) && row.evidenceRefs.length === 0,
      'Cold-start regression must use not_applicable with empty prior/rerun/evidence refs.',
    );
    const seed = {
      competencyQuestions: structuredClone(qualificationCore.competencyQuestions),
      regression: structuredClone(row),
    };
    const witness = {
      id: COLD_START_REGRESSION_WITNESS_ID,
      kind: 'regression',
      current: true,
      provenance: {
        sourceRef: 'qualification-handoff:cold-start-regression',
        digest: digestJson(seed),
      },
    };
    return {
      regression: { ...structuredClone(row), evidenceRefs: [COLD_START_REGRESSION_WITNESS_ID] },
      witnesses: [...qualificationWitnesses(sealedWitnesses), witness],
    };
  }
  const witnessById = new Map(sealedWitnesses.map((witness) => [witness.id, witness]));
  assert(uniqueStrings(row.evidenceRefs) && row.evidenceRefs.length > 0, 'Non-cold-start regression needs sealed regression evidence.');
  assert(row.evidenceRefs.every((id) => {
    const witness = witnessById.get(id);
    return witness?.kind === 'regression' && witness.current === true;
  }), 'Non-cold-start regression evidence must reference caller-sealed current regression witnesses.');
  return {
    regression: structuredClone(row),
    witnesses: qualificationWitnesses(sealedWitnesses),
  };
}

function verifyRegressionBinding(qualification, sealedWitnesses) {
  assert(!sealedWitnesses.some(({ id }) => id === COLD_START_REGRESSION_WITNESS_ID), `Sealed witness id collides with reserved ${COLD_START_REGRESSION_WITNESS_ID}.`);
  const row = qualification.regression;
  const sealedProjection = qualificationWitnesses(sealedWitnesses);
  if (row?.baselineQualificationId === null) {
    assert(
      row.status === 'not_applicable'
        && Array.isArray(row.priorCqIds) && row.priorCqIds.length === 0
        && Array.isArray(row.rerunCqIds) && row.rerunCqIds.length === 0
        && same(row.evidenceRefs, [COLD_START_REGRESSION_WITNESS_ID]),
      'Cold-start regression binding drifted.',
    );
    const seed = {
      competencyQuestions: structuredClone(qualification.competencyQuestions),
      regression: { ...structuredClone(row), evidenceRefs: [] },
    };
    const reserved = {
      id: COLD_START_REGRESSION_WITNESS_ID,
      kind: 'regression',
      current: true,
      provenance: {
        sourceRef: 'qualification-handoff:cold-start-regression',
        digest: digestJson(seed),
      },
    };
    assert(same(qualification.witnesses, [...sealedProjection, reserved]), 'Cold-start regression witness drifted.');
    return;
  }
  assert(same(qualification.witnesses, sealedProjection), 'Non-cold-start qualification witnesses drifted from the sealed set.');
  const witnessById = new Map(sealedWitnesses.map((witness) => [witness.id, witness]));
  assert(uniqueStrings(row?.evidenceRefs) && row.evidenceRefs.length > 0 && row.evidenceRefs.every((id) => {
    const witness = witnessById.get(id);
    return witness?.kind === 'regression' && witness.current === true;
  }), 'Non-cold-start regression evidence drifted from caller-sealed current regression witnesses.');
}

function evaluateHiddenShape(qualification, manifest) {
  const claimIds = new Set(manifest.map(({ id }) => id));
  const witnessIds = new Set(qualification.witnesses.map(({ id }) => id));
  const results = new Map((qualification.cqResults ?? []).map((row) => [row.cqId, row]));
  for (const question of qualification.competencyQuestions ?? []) {
    const result = results.get(question.id);
    assert(result, `Hidden qualification is missing CQ result ${question.id}.`);
    assert(result.claimIds.every((id) => claimIds.has(id)), `CQ ${question.id} references an unknown claim.`);
    assert(result.witnessRefs.every((id) => witnessIds.has(id)), `CQ ${question.id} references an unknown witness.`);
    const expectedTargets = question.expectedAnswer?.targets ?? [];
    const observedTargets = (result.targetResults ?? []).map(({ target }) => target);
    assert(same(observedTargets, expectedTargets), `CQ ${question.id} target coverage is incomplete, foreign, or reordered.`);
    for (const target of result.targetResults ?? []) {
      assert(target.claimIds.every((id) => claimIds.has(id)), `CQ ${question.id} target references an unknown claim.`);
      assert(target.witnessRefs.every((id) => witnessIds.has(id)), `CQ ${question.id} target references an unknown witness.`);
    }
  }
  const result = evaluateConstructionQualification(qualification);
  const errors = result.findings.filter(({ severity }) => severity === 'error');
  assert(errors.length === 0, 'Hidden qualification has invalid schema or incomplete claim/target rows.', { details: errors });
  assert(qualification.sourceHiddenTask.status === 'passed', 'Source-hidden task must pass before join.', { exitCode: EXIT.GATE_BLOCKED });
  assert(same(qualification.sourceHiddenTask.claimIds, manifest.map(({ id }) => id)), 'Source-hidden claim coverage is incomplete or reordered.');
  const evidenceAxis = qualification.axisResults.find(({ axis }) => axis === 'evidence_provenance');
  assert(same(evidenceAxis, { axis: 'evidence_provenance', status: 'not_measured', evidenceRefs: [], findingIds: [EVIDENCE_PENDING_ID] }), 'Prejoin evidence axis must remain audit-pending.');
  assert(qualification.diagnostics.filter(({ id }) => id === EVIDENCE_PENDING_ID).length === 1, 'Prejoin qualification needs exactly one audit-pending evidence diagnostic.');
  return result;
}

export function buildHiddenPacket({
  candidate,
  seal,
  manifest,
  witnesses,
  access: accessRow,
  qualificationCore,
  answers,
} = {}) {
  verifySeal(candidate, seal, manifest, witnesses);
  validateAccess(accessRow, ROLES.HIDDEN);
  assert(accessRow.actorId !== candidate.builderId, 'Builder and source-hidden evaluator identities collide.');
  assert(isRecord(qualificationCore), 'qualificationCore is required.');
  for (const key of PROTECTED_HIDDEN_FIELDS) {
    assert(!Object.hasOwn(qualificationCore, key), `qualificationCore cannot set protected field ${key}.`);
  }
  const cqResults = deriveCqResults(qualificationCore, answers, manifest);
  const axisResults = validateCoreAxes(qualificationCore);
  const regressionState = prepareRegression(qualificationCore, witnesses);
  const pending = {
    contract: CONSTRUCTION_QUALIFICATION_CONTRACT,
    ...structuredClone(qualificationCore),
    subject: {
      projectSlug: candidate.reviewPlan.concepts.find(({ kind }) => kind === 'project')?.slug,
      graphDigest: candidate.planDigest,
      sourceDigest: candidate.sourceDigest,
    },
    actors: {
      builder: { id: candidate.builderId, authority: 'agent' },
      evaluator: { id: accessRow.actorId, authority: 'agent' },
    },
    witnesses: regressionState.witnesses,
    claims: manifestProjection(manifest),
    cqResults,
    citationChecks: manifest.map(({ id }) => ({ claimId: id, witnessRef: null, status: 'missing' })),
    axisResults,
    diagnostics: [...structuredClone(qualificationCore.diagnostics), structuredClone(EVIDENCE_PENDING_DIAGNOSTIC)],
    regression: regressionState.regression,
    sourceHiddenTask: {
      status: 'passed',
      evaluatorId: accessRow.actorId,
      claimIds: manifest.map(({ id }) => id),
    },
    acceptance: {
      decision: 'pending',
      decidedBy: 'pending',
      authority: 'human',
      decidedAt: accessRow.endedAt,
      planDigest: candidate.planDigest,
      planRevision: candidate.planRevision,
      acceptedGapIds: [],
    },
  };
  assert(nonBlank(pending.subject.projectSlug), 'Review plan needs one project concept.');
  const evaluation = evaluateHiddenShape(pending, manifest);
  const receipt = {
    contract: CONTRACTS.hiddenReceipt,
    evaluatorId: accessRow.actorId,
    candidateDigest: artifactDigest(candidate),
    sealDigest: artifactDigest(seal),
    manifestDigest: artifactDigest(manifest),
    witnessesDigest: artifactDigest(witnesses),
    accessDigest: artifactDigest(accessRow),
    qualificationDigest: artifactDigest(pending),
    claimCount: manifest.length,
    sourceHiddenStatus: pending.sourceHiddenTask.status,
    evidenceProvenance: 'audit_pending',
    schemaErrorCount: evaluation.findings.filter(({ severity }) => severity === 'error').length,
    canWrite: false,
    writePlanAbsent: !Object.hasOwn(pending, 'writePlan'),
  };
  return {
    qualification: pending,
    access: structuredClone(accessRow),
    receipt,
    files: {
      'qualification-pending.json': pending,
      'hidden-access.json': accessRow,
      'hidden-receipt.json': receipt,
      'hidden-answers.json': answers,
    },
  };
}

function citationKey(claimId, witnessRef) {
  return `${claimId}\u0000${witnessRef}`;
}

function validateSourceFragmentRows(manifest, claimResults) {
  uniqueRows(claimResults, 'claimId', 'claimResults');
  assert(same(claimResults.map(({ claimId }) => claimId), manifest.map(({ id }) => id)), 'Source audit claim coverage is incomplete or reordered.');
  const citationChecks = [];
  for (const [index, result] of claimResults.entries()) {
    const claim = manifest[index];
    assert(['verified', 'mismatch'].includes(result.status), `Claim ${claim.id} needs verified or mismatch status.`);
    assert(Array.isArray(result.citations), `Claim ${claim.id} needs citations.`);
    assert(same(result.citations.map(({ witnessRef }) => witnessRef), claim.witnessRefs), `Claim ${claim.id} citation coverage is incomplete, foreign, or reordered.`);
    for (const citation of result.citations) {
      assert(['verified', 'mismatch'].includes(citation.status), `Citation ${citationKey(claim.id, citation.witnessRef)} needs a status.`);
      assert(Array.isArray(citation.sourceFragments) && citation.sourceFragments.length > 0, `Citation ${citationKey(claim.id, citation.witnessRef)} needs a source fragment.`);
      for (const fragment of citation.sourceFragments) {
        assert(nonBlank(fragment.sourceRef) && validDigest(fragment.digest), 'Source fragments need sourceRef and digest.');
        if (fragment.startLine !== undefined || fragment.endLine !== undefined) {
          assert(Number.isInteger(fragment.startLine) && fragment.startLine > 0, 'Source fragment startLine must be positive.');
          assert(Number.isInteger(fragment.endLine) && fragment.endLine >= fragment.startLine, 'Source fragment endLine is invalid.');
        }
      }
      citationChecks.push({
        claimId: claim.id,
        witnessRef: citation.witnessRef,
        status: citation.status === 'verified' ? 'verified' : 'mismatch',
      });
    }
  }
  return citationChecks;
}

export function buildAuditFragment({
  candidate,
  seal,
  manifest,
  witnesses,
  access: accessRow,
  claimResults,
  quantifierClassifications = [],
  sourceDigest,
} = {}) {
  verifySeal(candidate, seal, manifest, witnesses);
  validateAccess(accessRow, ROLES.AUDITOR);
  assert(accessRow.actorId !== candidate.builderId, 'Builder and source-aware auditor identities collide.');
  assert(sourceDigest === candidate.sourceDigest, 'Source-aware audit source digest mismatches the sealed source.');
  const quantifiers = validateQuantifiers(manifest, quantifierClassifications);
  assert(same(quantifiers.classifications, seal.quantifiers.classifications), 'Source audit quantifier classifications drifted from the seal.');
  const citationChecks = validateSourceFragmentRows(manifest, claimResults);
  const failures = [
    ...claimResults.filter(({ status }) => status !== 'verified').map(({ claimId }) => `claim:${claimId}`),
    ...citationChecks.filter(({ status }) => status !== 'verified').map(({ claimId, witnessRef }) => `citation:${citationKey(claimId, witnessRef)}`),
  ];
  const fragment = {
    contract: CONTRACTS.audit,
    auditorId: accessRow.actorId,
    builderId: candidate.builderId,
    sourceDigest,
    manifestProjection: manifestProjection(manifest),
    claimResults: structuredClone(claimResults),
    citationChecks,
    quantifierClassifications: quantifiers.classifications,
  };
  const receipt = {
    contract: CONTRACTS.auditReceipt,
    auditorId: accessRow.actorId,
    candidateDigest: artifactDigest(candidate),
    sealDigest: artifactDigest(seal),
    manifestDigest: artifactDigest(manifest),
    witnessesDigest: artifactDigest(witnesses),
    accessDigest: artifactDigest(accessRow),
    fragmentDigest: artifactDigest(fragment),
    verdict: failures.length === 0 ? 'verified' : 'failed',
    failures,
    counts: {
      claims: claimResults.length,
      citations: citationChecks.length,
      verifiedClaims: claimResults.filter(({ status }) => status === 'verified').length,
      verifiedCitations: citationChecks.filter(({ status }) => status === 'verified').length,
    },
  };
  return {
    fragment,
    access: structuredClone(accessRow),
    receipt,
    files: {
      'qualification-source-fragment.json': fragment,
      'auditor-access.json': accessRow,
      'audit-receipt.json': receipt,
    },
  };
}

function verifyHidden(candidate, seal, manifest, witnesses, hidden) {
  validateAccess(hidden.access, ROLES.HIDDEN);
  const q = hidden.qualification;
  const receipt = hidden.receipt;
  assert(receipt?.contract === CONTRACTS.hiddenReceipt, 'Unknown hidden receipt contract.');
  assert(receipt.evaluatorId === hidden.access.actorId, 'Hidden actor/access mismatch.');
  assert(receipt.candidateDigest === artifactDigest(candidate), 'Hidden candidate digest drifted.');
  assert(receipt.sealDigest === artifactDigest(seal), 'Hidden seal digest drifted.');
  assert(receipt.manifestDigest === artifactDigest(manifest), 'Hidden manifest digest drifted.');
  assert(receipt.witnessesDigest === artifactDigest(witnesses), 'Hidden witness digest drifted.');
  assert(receipt.accessDigest === artifactDigest(hidden.access), 'Hidden access digest drifted.');
  assert(receipt.qualificationDigest === artifactDigest(q), 'Hidden qualification digest drifted.');
  assert(q.actors?.builder?.id === candidate.builderId && q.actors?.evaluator?.id === hidden.access.actorId, 'Hidden qualification actor mismatch.');
  assert(q.acceptance?.decision === 'pending' && q.acceptance.decidedBy === 'pending', 'Qualification was accepted before the join.');
  assert(q.citationChecks.every(({ status }) => status === 'missing'), 'Source-hidden evaluator pre-verified a citation.');
  assert(same(q.claims, manifestProjection(manifest)), 'Hidden claims were mutated or reordered.');
  verifyRegressionBinding(q, witnesses);
  evaluateHiddenShape(q, manifest);
}

function verifyAudit(candidate, seal, manifest, witnesses, audit) {
  validateAccess(audit.access, ROLES.AUDITOR);
  const fragment = audit.fragment;
  const receipt = audit.receipt;
  assert(receipt?.contract === CONTRACTS.auditReceipt, 'Unknown audit receipt contract.');
  assert(receipt.auditorId === audit.access.actorId && fragment.auditorId === audit.access.actorId, 'Auditor actor/access mismatch.');
  assert(receipt.candidateDigest === artifactDigest(candidate), 'Audit candidate digest drifted.');
  assert(receipt.sealDigest === artifactDigest(seal), 'Audit seal digest drifted.');
  assert(receipt.manifestDigest === artifactDigest(manifest), 'Audit manifest digest drifted.');
  assert(receipt.witnessesDigest === artifactDigest(witnesses), 'Audit witness digest drifted.');
  assert(receipt.accessDigest === artifactDigest(audit.access), 'Audit access digest drifted.');
  assert(receipt.fragmentDigest === artifactDigest(fragment), 'Audit fragment digest drifted.');
  assert(receipt.verdict === 'verified', 'Source-aware audit did not verify every claim and citation.', { exitCode: EXIT.GATE_BLOCKED, details: receipt.failures });
  assert(fragment.sourceDigest === candidate.sourceDigest, 'Audit source digest mismatches the candidate.');
  assert(same(fragment.manifestProjection, manifestProjection(manifest)), 'Audit claim projection was mutated or reordered.');
  const checks = validateSourceFragmentRows(manifest, fragment.claimResults);
  assert(checks.every(({ status }) => status === 'verified'), 'Audit includes a source mismatch.', { exitCode: EXIT.GATE_BLOCKED });
  assert(!Object.hasOwn(fragment, 'acceptance'), 'Source fragment cannot carry acceptance.');
}

export function joinQualification({ candidate, seal, manifest, witnesses, hidden, audit } = {}) {
  verifySeal(candidate, seal, manifest, witnesses);
  verifyHidden(candidate, seal, manifest, witnesses, hidden);
  verifyAudit(candidate, seal, manifest, witnesses, audit);
  const actors = [candidate.builderId, hidden.access.actorId, audit.access.actorId];
  assert(new Set(actors).size === actors.length, 'Builder, hidden evaluator, and source auditor must be distinct.');
  const overlapStart = Math.max(Date.parse(hidden.access.startedAt), Date.parse(audit.access.startedAt));
  const overlapEnd = Math.min(Date.parse(hidden.access.endedAt), Date.parse(audit.access.endedAt));
  assert(overlapEnd > overlapStart, 'Hidden and source-aware branches did not overlap in time.');
  const joined = structuredClone(hidden.qualification);
  const pendingDiagnostics = joined.diagnostics.filter(({ id }) => id === EVIDENCE_PENDING_ID);
  assert(pendingDiagnostics.length === 1 && same(pendingDiagnostics[0], EVIDENCE_PENDING_DIAGNOSTIC), 'Join found a mutated audit-pending diagnostic.');
  const pendingAxis = joined.axisResults.find(({ axis }) => axis === 'evidence_provenance');
  assert(same(pendingAxis, { axis: 'evidence_provenance', status: 'not_measured', evidenceRefs: [], findingIds: [EVIDENCE_PENDING_ID] }), 'Join found a mutated audit-pending evidence axis.');
  joined.citationChecks = structuredClone(audit.fragment.citationChecks);
  joined.diagnostics = joined.diagnostics.filter(({ id }) => id !== EVIDENCE_PENDING_ID);
  const evidenceRefs = [...new Set(manifest.flatMap(({ witnessRefs }) => witnessRefs))];
  joined.axisResults = joined.axisResults.map((row) => (
    row.axis === 'evidence_provenance'
      ? { axis: 'evidence_provenance', status: 'passed', evidenceRefs, findingIds: [] }
      : row
  ));
  assert(same(joined.claims, manifestProjection(manifest)), 'Join mutated protected claims.');
  assert(joined.acceptance.decision === 'pending', 'Join must remain pending human acceptance.');
  const evaluation = evaluateConstructionQualification(joined);
  assert(evaluation.findings.length === 0, 'Joined qualification has findings.', { details: evaluation.findings });
  assert(MANDATORY_AXES.every((axis) => evaluation.axes[axis]?.status === 'passed'), 'Joined qualification has a red mandatory axis.', { exitCode: EXIT.GATE_BLOCKED });
  const lifecycle = evaluateConstructionLifecycle({
    reviewPlan: candidate.reviewPlan,
    sourceDigest: candidate.sourceDigest,
    expectedProjectSlug: joined.subject.projectSlug,
    qualification: joined,
    proposalFindings: candidate.proposalValidation.findings ?? [],
  });
  assert(lifecycle.proposalCoverage.status === 'complete', 'Joined proposal coverage is incomplete.');
  assert(lifecycle.writeEligibility === 'blocked' && !Object.hasOwn(lifecycle, 'writePlan'), 'Join produced a premature writePlan/canWrite state.');
  assert(lifecycle.firstBlockingPhase === 'human_plan_approval', 'Join has a non-acceptance blocking phase.', { exitCode: EXIT.GATE_BLOCKED, details: lifecycle.diagnostics });
  const request = {
    contract: CONTRACTS.request,
    decision: 'accepted',
    planDigest: candidate.planDigest,
    planRevision: candidate.planRevision,
    requiredGapIds: [...lifecycle.requiredGapIds],
    actors: {
      builderId: candidate.builderId,
      hiddenEvaluatorId: hidden.access.actorId,
      sourceAuditorId: audit.access.actorId,
    },
    joinedQualificationDigest: artifactDigest(joined),
  };
  const receipt = {
    contract: CONTRACTS.join,
    status: 'awaiting_human_acceptance',
    actors: request.actors,
    overlap: {
      startedAt: new Date(overlapStart).toISOString(),
      endedAt: new Date(overlapEnd).toISOString(),
      durationMs: overlapEnd - overlapStart,
    },
    inputDigests: {
      candidate: artifactDigest(candidate),
      seal: artifactDigest(seal),
      manifest: artifactDigest(manifest),
      witnesses: artifactDigest(witnesses),
      hiddenQualification: artifactDigest(hidden.qualification),
      hiddenReceipt: artifactDigest(hidden.receipt),
      hiddenAccess: artifactDigest(hidden.access),
      sourceFragment: artifactDigest(audit.fragment),
      auditReceipt: artifactDigest(audit.receipt),
      auditAccess: artifactDigest(audit.access),
    },
    joinedQualificationDigest: artifactDigest(joined),
    acceptanceRequestDigest: artifactDigest(request),
    claimProjectionDigest: artifactDigest(manifestProjection(manifest)),
    proposalCoverage: lifecycle.proposalCoverage,
    requiredGapIds: [...lifecycle.requiredGapIds],
    preAcceptance: {
      decision: joined.acceptance.decision,
      writeEligibility: lifecycle.writeEligibility,
      writePlanAbsent: !Object.hasOwn(lifecycle, 'writePlan'),
    },
  };
  return {
    qualification: joined,
    evaluation,
    lifecycle,
    request,
    receipt,
    files: {
      'qualification-joined-pending.json': joined,
      'qualification-evaluation.json': evaluation,
      'lifecycle-pending.json': lifecycle,
      'acceptance-request.json': request,
      'join-receipt.json': receipt,
    },
  };
}

function verifyJoin(candidate, seal, manifest, joinRow) {
  const { qualification, request, receipt } = joinRow;
  assert(receipt?.contract === CONTRACTS.join && receipt.status === 'awaiting_human_acceptance', 'Join receipt is not awaiting acceptance.');
  assert(request?.contract === CONTRACTS.request, 'Unknown acceptance request contract.');
  assert(receipt.joinedQualificationDigest === artifactDigest(qualification), 'Joined qualification drifted.');
  assert(receipt.acceptanceRequestDigest === artifactDigest(request), 'Acceptance request drifted.');
  assert(request.joinedQualificationDigest === artifactDigest(qualification), 'Acceptance request qualification digest drifted.');
  assert(receipt.inputDigests.candidate === artifactDigest(candidate), 'Join candidate digest drifted.');
  assert(receipt.inputDigests.seal === artifactDigest(seal), 'Join seal digest drifted.');
  assert(receipt.inputDigests.manifest === artifactDigest(manifest), 'Join manifest digest drifted.');
  assert(same(qualification.claims, manifestProjection(manifest)), 'Joined claim projection drifted.');
  assert(same(request.requiredGapIds, receipt.requiredGapIds), 'Acceptance request gap set drifted.');
}

export function acceptQualification({ candidate, seal, manifest, witnesses, join: joinRow, human } = {}) {
  verifySeal(candidate, seal, manifest, witnesses);
  verifyJoin(candidate, seal, manifest, joinRow);
  assert(isRecord(human), 'human acceptance input is required.');
  assert(human.decision === 'accepted', 'Only explicit accepted decisions can release a plan.', { exitCode: EXIT.GATE_BLOCKED });
  assert(human.authority === 'human', 'Acceptance authority must be exactly human.');
  assert(nonBlank(human.id) && validTimestamp(human.decidedAt), 'Human acceptance needs id and decidedAt.');
  assert(!Object.values(joinRow.receipt.actors).includes(human.id), 'Human acceptance identity collides with a construction actor.');
  assert(human.requestDigest === joinRow.receipt.acceptanceRequestDigest, 'Human acceptance request digest mismatch.');
  assert(human.planDigest === joinRow.request.planDigest, 'Acceptance request plan digest mismatch.');
  assert(human.planRevision === joinRow.request.planRevision, 'Acceptance request plan revision mismatch.');
  assert(exactSet(human.acceptedGapIds, joinRow.request.requiredGapIds), 'Acceptance must name the exact required gap set.');
  const accepted = structuredClone(joinRow.qualification);
  accepted.acceptance = {
    decision: 'accepted',
    decidedBy: human.id,
    authority: 'human',
    decidedAt: human.decidedAt,
    planDigest: human.planDigest,
    planRevision: human.planRevision,
    acceptedGapIds: [...human.acceptedGapIds],
  };
  assert(same(accepted.claims, manifestProjection(manifest)), 'Acceptance mutated protected claims.');
  const evaluation = evaluateConstructionQualification(accepted);
  assert(evaluation.findings.length === 0, 'Accepted qualification has findings.', { details: evaluation.findings });
  const lifecycle = evaluateConstructionLifecycle({
    reviewPlan: candidate.reviewPlan,
    sourceDigest: candidate.sourceDigest,
    expectedProjectSlug: accepted.subject.projectSlug,
    qualification: accepted,
    proposalFindings: candidate.proposalValidation.findings ?? [],
  });
  assert(lifecycle.writeEligibility === 'executable' && Object.hasOwn(lifecycle, 'writePlan'), 'Accepted qualification is not executable.', { exitCode: EXIT.GATE_BLOCKED, details: lifecycle.diagnostics });
  assert(same(lifecycle.writePlan, candidate.reviewPlan), 'Executable writePlan drifted from reviewPlan.');
  const receipt = {
    contract: CONTRACTS.acceptance,
    decision: 'accepted',
    decidedBy: human.id,
    authority: human.authority,
    decidedAt: human.decidedAt,
    requestDigest: human.requestDigest,
    actors: structuredClone(joinRow.receipt.actors),
    acceptedGapIds: [...human.acceptedGapIds],
    planDigest: candidate.planDigest,
    planRevision: candidate.planRevision,
    joinedQualificationDigest: artifactDigest(joinRow.qualification),
    acceptedQualificationDigest: artifactDigest(accepted),
    lifecycleDigest: artifactDigest(lifecycle),
    writeEligibility: lifecycle.writeEligibility,
  };
  return {
    qualification: accepted,
    evaluation,
    lifecycle,
    receipt,
    files: {
      'qualification-accepted.json': accepted,
      'qualification-evaluation.json': evaluation,
      'lifecycle-release-preview.json': lifecycle,
      'acceptance-receipt.json': receipt,
    },
  };
}

export function chunkWriterCalls(name, key, rows, { maxRows = 50, firstId = 1 } = {}) {
  assert(['add_concepts', 'add_relations'].includes(name), 'Unsupported writer call name.');
  assert(['concepts', 'relations'].includes(key), 'Unsupported writer argument key.');
  assert(Array.isArray(rows), `${key} must be an array.`);
  assert(Number.isInteger(maxRows) && maxRows > 0 && maxRows <= 50, 'Writer chunks must contain at most 50 rows.');
  assert(Number.isInteger(firstId) && firstId >= 0, 'firstId must be a non-negative integer.');
  const calls = [];
  for (let offset = 0; offset < rows.length; offset += maxRows) {
    calls.push({
      id: firstId + calls.length,
      name,
      args: { [key]: structuredClone(rows.slice(offset, offset + maxRows)) },
    });
  }
  return calls;
}

function releasedValidation(released) {
  return released?.structuredContent?.proposalValidation
    ?? released?.proposalValidation
    ?? released;
}

export function prepareRelease({
  candidate,
  seal,
  manifest,
  witnesses,
  acceptedQualification,
  acceptanceReceipt,
  analyzeRequest,
  released,
  firstCallId = 1,
} = {}) {
  verifySeal(candidate, seal, manifest, witnesses);
  assert(acceptanceReceipt?.contract === CONTRACTS.acceptance, 'Unknown acceptance receipt contract.');
  assert(acceptanceReceipt.acceptedQualificationDigest === artifactDigest(acceptedQualification), 'Accepted qualification digest drifted.');
  assert(acceptedQualification.acceptance?.decision === 'accepted', 'Release lacks human acceptance.');
  assert(acceptedQualification.acceptance.decidedBy === acceptanceReceipt.decidedBy, 'Release acceptance actor mismatch.');
  assert(same(acceptedQualification.claims, manifestProjection(manifest)), 'Release claim projection drifted.');
  assert(analyzeRequest?.name === 'analyze_repo_structure' && isRecord(analyzeRequest.args), 'Release needs the exact final analyze_repo_structure request.');
  assert(same(analyzeRequest.args.proposal, candidate.proposal), 'Final analyze request proposal drifted from the sealed original proposal.');
  assert(same(analyzeRequest.args.qualification, acceptedQualification), 'Final analyze request qualification drifted from the accepted qualification.');
  const recomputed = evaluateConstructionLifecycle({
    reviewPlan: candidate.reviewPlan,
    sourceDigest: candidate.sourceDigest,
    expectedProjectSlug: acceptedQualification.subject.projectSlug,
    qualification: acceptedQualification,
    proposalFindings: candidate.proposalValidation.findings ?? [],
  });
  assert(recomputed.writeEligibility === 'executable' && Object.hasOwn(recomputed, 'writePlan'), 'Recomputed lifecycle is not executable.', { exitCode: EXIT.GATE_BLOCKED, details: recomputed.diagnostics });
  const validation = releasedValidation(released);
  const lifecycle = validation?.constructionLifecycle;
  const writePlan = validation?.writePlan ?? lifecycle?.writePlan;
  assert(validation?.status === 'pass' && validation?.canWrite === true, 'Current analyzer release is non-executable.', { exitCode: EXIT.GATE_BLOCKED });
  assert(lifecycle?.writeEligibility === 'executable' && writePlan, 'Current analyzer omitted an executable writePlan.', { exitCode: EXIT.GATE_BLOCKED });
  assert(lifecycle.planDigest === candidate.planDigest, 'Released plan digest drifted.');
  assert(lifecycle.sourceDigest === candidate.sourceDigest, 'Released source digest drifted.');
  assert(lifecycle.planRevision === candidate.planRevision, 'Released plan revision drifted.');
  assert(same(writePlan, candidate.reviewPlan) && same(writePlan, recomputed.writePlan), 'Released writePlan drifted from the sealed reviewPlan.');
  assert(exactSet(lifecycle.requiredGapIds, acceptedQualification.acceptance.acceptedGapIds), 'Released required gaps drifted from acceptance.');
  const conceptCalls = chunkWriterCalls('add_concepts', 'concepts', writePlan.concepts, { firstId: firstCallId });
  const relationCalls = chunkWriterCalls('add_relations', 'relations', writePlan.relations, { firstId: firstCallId + conceptCalls.length });
  const receipt = {
    contract: CONTRACTS.release,
    status: 'prepared_not_executed',
    guard: 'This helper emitted scratch call data only; it did not invoke MCP or write a vault.',
    planDigest: candidate.planDigest,
    sourceDigest: candidate.sourceDigest,
    planRevision: candidate.planRevision,
    qualificationDigest: artifactDigest(acceptedQualification),
    acceptanceReceiptDigest: artifactDigest(acceptanceReceipt),
    analyzeRequestDigest: artifactDigest(analyzeRequest),
    writePlanDigest: digestJson(writePlan),
    rowCounts: { concepts: writePlan.concepts.length, relations: writePlan.relations.length },
    callCounts: { concepts: conceptCalls.length, relations: relationCalls.length },
    maxRowsPerCall: 50,
  };
  return {
    conceptCalls,
    relationCalls,
    receipt,
    files: {
      'concept-calls.json': conceptCalls,
      'relation-calls.json': relationCalls,
      'release-receipt.json': receipt,
    },
  };
}

function commandResult(command, input) {
  if (command === 'seal') return sealCandidate(input);
  if (command === 'hidden') return buildHiddenPacket(input);
  if (command === 'audit') return buildAuditFragment(input);
  if (command === 'join') return joinQualification(input);
  if (command === 'accept') return acceptQualification(input);
  if (command === 'release') return prepareRelease(input);
  throw new HandoffError(`Unknown command: ${command}`, { exitCode: EXIT.USAGE });
}

function compactRequested(input, keys) {
  return keys.some((key) => Object.hasOwn(input, key));
}

function validateCompactChoice(input, compactKeys, embeddedKeys, command) {
  assert(compactKeys.every((key) => nonBlank(input[key])), `${command} compact input needs ${compactKeys.join(', ')}.`);
  assert(embeddedKeys.every((key) => !Object.hasOwn(input, key)), `${command} cannot mix compact paths with embedded ${embeddedKeys.join(', ')}.`);
}

async function readHydratedJson(inputDirectory, pathValue, label) {
  const resolvedPath = resolve(inputDirectory, pathValue);
  try {
    return JSON.parse(await readFile(resolvedPath, 'utf8'));
  } catch (error) {
    const exitCode = error instanceof SyntaxError ? EXIT.DATA : EXIT.IO;
    throw new HandoffError(`Cannot hydrate ${label} from ${resolvedPath}: ${error.message}`, { exitCode });
  }
}

async function loadDirectoryArtifacts(inputDirectory, directoryPath, files) {
  const resolvedDirectory = resolve(inputDirectory, directoryPath);
  const entries = await Promise.all(Object.entries(files).map(async ([key, name]) => [
    key,
    await readHydratedJson(resolvedDirectory, name, `${key} artifact`),
  ]));
  return Object.fromEntries(entries);
}

async function loadHandoff(inputDirectory, handoffDir) {
  return loadDirectoryArtifacts(inputDirectory, handoffDir, {
    candidate: 'candidate-packet.json',
    manifest: 'claim-manifest.json',
    witnesses: 'source-witnesses.json',
    seal: 'candidate-seal.json',
  });
}

function analyzeCallFrom(analysis) {
  const candidates = [
    ...(Array.isArray(analysis.calls) ? analysis.calls : []),
    analysis.call,
    analysis.request,
    analysis.analyzeRequest,
  ].filter(isRecord);
  return candidates.find(({ name }) => name === 'analyze_repo_structure');
}

function analyzeStructuredContentFrom(analysis, call) {
  if (Array.isArray(analysis.responses)) {
    const response = analysis.responses.find(({ id }) => call?.id === undefined || id === call.id);
    if (response?.result?.structuredContent) return response.result.structuredContent;
  }
  return analysis.structuredContent
    ?? analysis.result?.structuredContent
    ?? analysis.response?.result?.structuredContent
    ?? (analysis.proposalValidation ? analysis : null);
}

function deriveCandidateFromAnalysis(analysis, proposal, builderId) {
  assert(nonBlank(builderId), 'Derived seal input needs builderId.');
  const call = analyzeCallFrom(analysis);
  assert(call?.args && Object.hasOwn(call.args, 'proposal'), 'Analysis artifact must carry the exact analyze_repo_structure request proposal.');
  assert(same(call.args.proposal, proposal), 'Analysis request proposal drifted from proposalPath.');
  const structuredContent = analyzeStructuredContentFrom(analysis, call);
  assert(isRecord(structuredContent), 'Analysis artifact does not expose current analyze structuredContent.');
  const validation = structuredContent.proposalValidation;
  const lifecycle = validation?.constructionLifecycle;
  const reviewPlan = validation?.reviewPlan ?? lifecycle?.reviewPlan;
  assert(validation?.status === 'pass' && validation?.canWrite === false, 'Derived candidate analysis must be a passing non-writing review result.');
  assert(!Object.hasOwn(validation, 'writePlan'), 'Derived candidate analysis contains a premature writePlan.');
  assert(isRecord(lifecycle), 'Derived candidate analysis is missing constructionLifecycle.');
  assert(lifecycle.writeEligibility === 'reviewable' && !Object.hasOwn(lifecycle, 'writePlan'), 'Derived candidate lifecycle must remain reviewable and non-writing.');
  assert(isRecord(reviewPlan), 'Derived candidate analysis is missing reviewPlan.');
  assert(lifecycle.planDigest === constructionPlanDigest(reviewPlan), 'Derived candidate lifecycle plan digest drifted.');
  assert(validDigest(lifecycle.sourceDigest), 'Derived candidate lifecycle source digest is missing.');
  assert(Number.isInteger(lifecycle.planRevision) && lifecycle.planRevision > 0, 'Derived candidate lifecycle plan revision is invalid.');
  assert(uniqueStrings(lifecycle.requiredGapIds), 'Derived candidate lifecycle required gaps are invalid.');
  assert(Array.isArray(validation.findings), 'Derived candidate proposal findings are missing.');
  return {
    builderId,
    proposal: structuredClone(proposal),
    sourceHidden: true,
    canWrite: false,
    planDigest: lifecycle.planDigest,
    sourceDigest: lifecycle.sourceDigest,
    planRevision: lifecycle.planRevision,
    requiredGapIds: [...lifecycle.requiredGapIds],
    reviewPlan: structuredClone(reviewPlan),
    proposalValidation: {
      status: validation.status,
      canWrite: validation.canWrite,
      ...(validation.gates === undefined ? {} : { gates: structuredClone(validation.gates) }),
      findings: structuredClone(validation.findings),
    },
  };
}

async function hydrateCommandInput(command, input, inputDirectory) {
  assert(isRecord(input), 'CLI input JSON must be an object.');
  if (command === 'seal' && compactRequested(input, ['analysisPath', 'proposalPath', 'builderId'])) {
    assert(!Object.hasOwn(input, 'candidatePath'), 'seal cannot mix candidatePath with analysisPath/proposalPath.');
    validateCompactChoice(
      input,
      ['analysisPath', 'proposalPath', 'manifestPath', 'witnessesPath', 'builderId'],
      ['candidate', 'manifest', 'witnesses'],
      command,
    );
    const [analysis, proposal, manifest, witnesses] = await Promise.all([
      readHydratedJson(inputDirectory, input.analysisPath, 'analysis'),
      readHydratedJson(inputDirectory, input.proposalPath, 'proposal'),
      readHydratedJson(inputDirectory, input.manifestPath, 'manifest'),
      readHydratedJson(inputDirectory, input.witnessesPath, 'witnesses'),
    ]);
    const candidate = deriveCandidateFromAnalysis(analysis, proposal, input.builderId);
    return { ...input, candidate, manifest, witnesses };
  }
  if (command === 'seal' && compactRequested(input, ['candidatePath', 'manifestPath', 'witnessesPath'])) {
    assert(!compactRequested(input, ['analysisPath', 'proposalPath', 'builderId']), 'seal cannot mix candidatePath with derived analysis inputs.');
    validateCompactChoice(
      input,
      ['candidatePath', 'manifestPath', 'witnessesPath'],
      ['candidate', 'manifest', 'witnesses'],
      command,
    );
    const [candidate, manifest, witnesses] = await Promise.all([
      readHydratedJson(inputDirectory, input.candidatePath, 'candidate'),
      readHydratedJson(inputDirectory, input.manifestPath, 'manifest'),
      readHydratedJson(inputDirectory, input.witnessesPath, 'witnesses'),
    ]);
    return { ...input, candidate, manifest, witnesses };
  }
  if (['hidden', 'audit'].includes(command) && compactRequested(input, ['handoffDir'])) {
    validateCompactChoice(input, ['handoffDir'], ['candidate', 'manifest', 'witnesses', 'seal'], command);
    return { ...input, ...await loadHandoff(inputDirectory, input.handoffDir) };
  }
  if (command === 'join' && compactRequested(input, ['handoffDir', 'hiddenDir', 'auditorDir'])) {
    validateCompactChoice(
      input,
      ['handoffDir', 'hiddenDir', 'auditorDir'],
      ['candidate', 'manifest', 'witnesses', 'seal', 'hidden', 'audit'],
      command,
    );
    const [handoff, hiddenArtifacts, auditArtifacts] = await Promise.all([
      loadHandoff(inputDirectory, input.handoffDir),
      loadDirectoryArtifacts(inputDirectory, input.hiddenDir, {
        qualification: 'qualification-pending.json',
        access: 'hidden-access.json',
        receipt: 'hidden-receipt.json',
      }),
      loadDirectoryArtifacts(inputDirectory, input.auditorDir, {
        fragment: 'qualification-source-fragment.json',
        access: 'auditor-access.json',
        receipt: 'audit-receipt.json',
      }),
    ]);
    return { ...input, ...handoff, hidden: hiddenArtifacts, audit: auditArtifacts };
  }
  if (command === 'accept' && compactRequested(input, ['handoffDir', 'joinedDir'])) {
    validateCompactChoice(
      input,
      ['handoffDir', 'joinedDir'],
      ['candidate', 'manifest', 'witnesses', 'seal', 'join'],
      command,
    );
    const [handoff, joined] = await Promise.all([
      loadHandoff(inputDirectory, input.handoffDir),
      loadDirectoryArtifacts(inputDirectory, input.joinedDir, {
        qualification: 'qualification-joined-pending.json',
        request: 'acceptance-request.json',
        receipt: 'join-receipt.json',
      }),
    ]);
    return { ...input, ...handoff, join: joined };
  }
  if (command === 'release' && compactRequested(input, ['handoffDir', 'acceptedDir', 'analyzeRequestPath', 'releasedPath'])) {
    validateCompactChoice(
      input,
      ['handoffDir', 'acceptedDir', 'analyzeRequestPath', 'releasedPath'],
      ['candidate', 'manifest', 'witnesses', 'seal', 'acceptedQualification', 'acceptanceReceipt', 'analyzeRequest', 'released'],
      command,
    );
    const [handoff, accepted, analyzeRequest, released] = await Promise.all([
      loadHandoff(inputDirectory, input.handoffDir),
      loadDirectoryArtifacts(inputDirectory, input.acceptedDir, {
        acceptedQualification: 'qualification-accepted.json',
        acceptanceReceipt: 'acceptance-receipt.json',
      }),
      readHydratedJson(inputDirectory, input.analyzeRequestPath, 'final analyze request'),
      readHydratedJson(inputDirectory, input.releasedPath, 'final analyze response'),
    ]);
    return { ...input, ...handoff, ...accepted, analyzeRequest, released };
  }
  return input;
}

async function atomicWriteDirectory(outputPath, files) {
  assert(nonBlank(outputPath), '--output needs a path.', { exitCode: EXIT.USAGE });
  try {
    await access(outputPath, constants.F_OK);
    throw new HandoffError('Output path already exists.', { exitCode: EXIT.IO });
  } catch (error) {
    if (error instanceof HandoffError) throw error;
    if (error.code !== 'ENOENT') throw new HandoffError(`Cannot inspect output path: ${error.message}`, { exitCode: EXIT.IO });
  }
  const parent = dirname(outputPath);
  try {
    const parentStat = await stat(parent);
    if (!parentStat.isDirectory()) throw new Error('parent is not a directory');
  } catch (error) {
    throw new HandoffError(`Output parent must already exist: ${error.message}`, { exitCode: EXIT.IO });
  }
  let staging;
  try {
    staging = await mkdtemp(join(parent, `.${basename(outputPath)}.staging-`));
    for (const [name, value] of Object.entries(files)) {
      assert(!name.includes('/') && !name.includes('..'), `Unsafe artifact name ${name}.`, { exitCode: EXIT.SOFTWARE });
      await writeFile(join(staging, name), canonicalJson(value, { pretty: true }), { flag: 'wx' });
    }
    await rename(staging, outputPath);
  } catch (error) {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (error instanceof HandoffError) throw error;
    throw new HandoffError(`Failed to write output directory: ${error.message}`, { exitCode: EXIT.IO });
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') return { command: 'help' };
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    assert(['--input', '--output'].includes(flag) && value, `Invalid argument ${flag ?? ''}.`, { exitCode: EXIT.USAGE });
    assert(!Object.hasOwn(options, flag), `Duplicate argument ${flag}.`, { exitCode: EXIT.USAGE });
    options[flag] = value;
  }
  return { command, inputPath: options['--input'], outputPath: options['--output'] };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, inputPath, outputPath } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${HANDOFF_SCHEMA.invocation}\nRun the schema subcommand for contracts and exit codes.\n`);
    return EXIT.OK;
  }
  if (command === 'schema') {
    assert(!inputPath, 'schema does not accept --input.', { exitCode: EXIT.USAGE });
    if (outputPath) await atomicWriteDirectory(outputPath, { 'schema.json': HANDOFF_SCHEMA });
    else process.stdout.write(canonicalJson(HANDOFF_SCHEMA, { pretty: true }));
    return EXIT.OK;
  }
  assert(inputPath && outputPath, `${command} requires --input and --output.`, { exitCode: EXIT.USAGE });
  let input;
  try {
    input = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (error) {
    const exitCode = error instanceof SyntaxError ? EXIT.DATA : EXIT.IO;
    throw new HandoffError(`Cannot read input JSON: ${error.message}`, { exitCode });
  }
  const hydrated = await hydrateCommandInput(command, input, dirname(resolve(inputPath)));
  const result = commandResult(command, hydrated);
  await atomicWriteDirectory(outputPath, result.files);
  process.stdout.write(canonicalJson({ command, output: outputPath, files: Object.keys(result.files) }, { pretty: true }));
  return EXIT.OK;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    const code = error instanceof HandoffError ? error.exitCode : EXIT.SOFTWARE;
    process.stderr.write(canonicalJson({
      error: error.message,
      exitCode: code,
      ...(error.details === undefined ? {} : { details: error.details }),
    }, { pretty: true }));
    process.exitCode = code;
  });
}

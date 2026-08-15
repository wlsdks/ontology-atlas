import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import {
  constructionPlanDigest,
  proposalCoverageRefs,
} from '../mcp/src/construction-lifecycle.mjs';
import { WRITE_RELATION_TYPE_VALUES } from '../mcp/src/ontology-engine.mjs';

/**
 * Internal-only Q17 held-out trial evaluator.
 *
 * This module deliberately consumes a caller-provided trial packet and has no
 * MCP registration, CLI command, vault write, or automatic admission path.
 * It turns one exact baseline/current trial into categorical evidence; it does
 * not create an aggregate quality score or decide ontology truth.
 */
export const Q17_QUALIFICATION_CONTRACT = 'atlasQ17Qualification:v1';

export const Q17_QUALITY_AXES = Object.freeze([
  'concept',
  'meaning',
  'relations',
  'citations',
  'source_hidden',
  'hallucination',
  'determinism',
  'performance',
]);

const ADMISSION_TIERS = new Set([
  'self_qualified',
  'partial_visible_gap',
  'human_review_required',
  'hard_block',
]);
const CLAIM_STATUSES = new Set(['supported', 'partial', 'unsupported']);
const SOURCE_HIDDEN_STATUSES = new Set(['answered', 'partial', 'refused']);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const MAX_RSS_BYTES = 1024 * 1024 * 1024;

/** A canonical SHA-256 receipt for internal trial artifacts. */
export function q17ArtifactDigest(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex')}`;
}

/** Reuse the lifecycle's exact proposal-ref grammar rather than inventing one. */
export function proposalClaimRefs(reviewPlan) {
  return proposalCoverageRefs(reviewPlan);
}

/**
 * Evaluate a Q17 packet without side effects.
 *
 * `pass` means every categorical gate passed. `partial` is reserved for an
 * honest visible gap. A single critical finding returns `fail`; no metric can
 * average it away.
 */
export function evaluateQ17Qualification(packet) {
  const findings = [];
  const add = (axis, code, severity, message, artifact = null, details = {}) => {
    findings.push({ axis, code, severity, message, ...(artifact ? { artifact } : {}), ...details });
  };

  if (!isRecord(packet)) {
    add('determinism', 'invalid-q17-packet', 'critical', 'Q17 packet must be an object.');
    return renderResult(findings);
  }
  if (packet.contract !== Q17_QUALIFICATION_CONTRACT) {
    add('determinism', 'invalid-q17-contract', 'critical', 'Packet must declare the internal Q17 contract.');
  }

  const artifacts = new Map();
  for (const name of ['baseline', 'current']) {
    artifacts.set(name, validateArtifact(name, packet[name], add));
  }
  for (const [name, artifact] of artifacts) {
    validateCitationAudit(name, packet.citationAudit?.[name], artifact, add);
    validateSourceHidden(name, packet.sourceHidden?.[name], artifact, add);
  }
  validateMetrics(packet.metrics, artifacts, add);

  return renderResult(findings);
}

function validateArtifact(name, artifact, add) {
  if (!isRecord(artifact)) {
    add('concept', 'missing-artifact', 'critical', `Missing ${name} artifact.`, name);
    return emptyArtifact();
  }
  const { proposal, analysis, reviewPlan, sourceDigest } = artifact;
  if (!isRecord(proposal) || !isRecord(analysis) || !isRecord(reviewPlan)) {
    add('concept', 'invalid-artifact-shape', 'critical', `${name} must carry proposal, analysis, and reviewPlan objects.`, name);
    return emptyArtifact();
  }
  if (!validDigest(sourceDigest)) {
    add('determinism', 'invalid-source-digest', 'critical', `${name} sourceDigest must be an exact SHA-256 receipt.`, name);
  }
  if (artifact.proposalDigest !== q17ArtifactDigest(proposal)) {
    add('determinism', 'proposal-digest-mismatch', 'critical', `${name} proposalDigest does not bind its proposal.`, name);
  }
  if (artifact.analysisDigest !== q17ArtifactDigest(analysis)) {
    add('determinism', 'analysis-digest-mismatch', 'critical', `${name} analysisDigest does not bind its analysis.`, name);
  }
  if (artifact.reviewPlanDigest !== constructionPlanDigest(reviewPlan)) {
    add('determinism', 'review-plan-digest-mismatch', 'critical', `${name} reviewPlanDigest does not bind its exact review plan.`, name);
  }
  if (artifact.artifactDigest !== q17ArtifactDigest({ proposal, analysis, reviewPlan, sourceDigest })) {
    add('determinism', 'artifact-digest-mismatch', 'critical', `${name} artifactDigest does not bind its complete trial artifact.`, name);
  }

  const proposalRefs = refsFromProposal(proposal, add, name);
  const reviewRefs = proposalClaimRefs(reviewPlan);
  compareRefSets({
    expected: proposalRefs,
    actual: reviewRefs,
    missingCode: 'omitted-proposal-claim',
    unexpectedCode: 'unexpected-review-plan-claim',
    axis: 'concept',
    name,
    subject: 'review plan',
    add,
  });

  validateConceptBodies(name, reviewPlan, add);
  const claims = validateAnalysisClaims(name, analysis, reviewRefs, add);
  validateRelations(name, reviewPlan, analysis, add);
  validateWriteBoundary(name, analysis, add);

  return {
    name,
    proposal,
    analysis,
    reviewPlan,
    sourceDigest,
    proposalDigest: artifact.proposalDigest,
    reviewPlanDigest: artifact.reviewPlanDigest,
    artifactDigest: artifact.artifactDigest,
    reviewRefs,
    claims,
  };
}

function refsFromProposal(proposal, add, name) {
  const concepts = [
    proposal.project,
    ...(Array.isArray(proposal.domains) ? proposal.domains : []),
    ...(Array.isArray(proposal.capabilities) ? proposal.capabilities : []),
    ...(Array.isArray(proposal.elements) ? proposal.elements : []),
  ];
  if (!isRecord(proposal.project) || !concepts.every(({ slug } = {}) => nonBlank(slug))) {
    add('concept', 'invalid-proposal-concepts', 'critical', `${name} proposal must name project and every concept slug.`, name);
  }
  const relations = Array.isArray(proposal.relations) ? proposal.relations : [];
  const competencyAnswers = isRecord(proposal.competencyAnswers) ? proposal.competencyAnswers : {};
  if (!Array.isArray(proposal.relations) || !isRecord(proposal.competencyAnswers)) {
    add('concept', 'invalid-proposal-claims', 'critical', `${name} proposal must carry relation and competency claim collections.`, name);
  }
  const refs = [
    ...concepts.filter(isRecord).map(({ slug }) => `concept:${slug}`),
    ...relations.filter(isRecord).map(relationRef),
    ...Object.keys(competencyAnswers).map((id) => `competency:${id}`),
    ...relations.filter(({ type } = {}) => type === 'depends_on').map((relation) => `impact:${relationRef(relation)}`),
    ...Object.keys(competencyAnswers)
      .filter((id) => id === 'impact' || id.toLowerCase().includes('impact'))
      .map((id) => `impact:competency:${id}`),
  ];
  return unique(refs);
}

function validateConceptBodies(name, reviewPlan, add) {
  if (!Array.isArray(reviewPlan.concepts) || reviewPlan.concepts.length === 0) {
    add('meaning', 'missing-review-plan-concepts', 'critical', `${name} review plan contains no concepts.`, name);
    return;
  }
  for (const [index, concept] of reviewPlan.concepts.entries()) {
    if (!isRecord(concept) || !nonBlank(concept.slug)) {
      add('concept', 'invalid-review-plan-concept', 'critical', `${name} review plan concept ${index} has no slug.`, name);
      continue;
    }
    if (!nonBlank(concept.body) || !/^## Definition\s*\n/im.test(concept.body)) {
      add('meaning', 'missing-concept-definition', 'critical', `${name} concept ${concept.slug} lacks a definition body.`, name, { ref: `concept:${concept.slug}` });
    }
  }
}

function validateAnalysisClaims(name, analysis, reviewRefs, add) {
  if (!Array.isArray(analysis.claims)) {
    add('concept', 'missing-analysis-claims', 'critical', `${name} analysis must enumerate exact proposal claims.`, name);
    return [];
  }
  const byRef = new Map();
  for (const [index, claim] of analysis.claims.entries()) {
    if (!isRecord(claim) || !nonBlank(claim.ref)) {
      add('concept', 'invalid-analysis-claim', 'critical', `${name} analysis claim ${index} has no ref.`, name);
      continue;
    }
    if (byRef.has(claim.ref)) {
      add('concept', 'duplicate-analysis-claim', 'critical', `${name} analysis repeats ${claim.ref}.`, name, { ref: claim.ref });
      continue;
    }
    byRef.set(claim.ref, claim);
    if (!CLAIM_STATUSES.has(claim.status)) {
      add('meaning', 'invalid-claim-status', 'critical', `${name} claim ${claim.ref} has an invalid status.`, name, { ref: claim.ref });
    }
    if (!Number.isFinite(claim.confidence) || claim.confidence < 0 || claim.confidence > 1) {
      add('meaning', 'invalid-claim-confidence', 'critical', `${name} claim ${claim.ref} has invalid confidence.`, name, { ref: claim.ref });
    }
    if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0) {
      add('citations', 'missing-claim-evidence', 'critical', `${name} claim ${claim.ref} has no evidence refs.`, name, { ref: claim.ref });
    }
    if (claim.status === 'unsupported' && claim.confidence >= 0.8) {
      add('hallucination', 'unsupported-high-confidence-claim', 'critical', `${name} claim ${claim.ref} is unsupported at high confidence.`, name, { ref: claim.ref });
    } else if (claim.status === 'unsupported') {
      add('meaning', 'unsupported-visible-gap', 'warning', `${name} claim ${claim.ref} is an honest visible gap.`, name, { ref: claim.ref });
    }
    if (claim.status === 'unsupported' && claim.presentedAsFact === true) {
      add('hallucination', 'unsupported-claim-presented-as-fact', 'critical', `${name} presents unsupported claim ${claim.ref} as fact.`, name, { ref: claim.ref });
    }
  }
  compareRefSets({
    expected: reviewRefs,
    actual: [...byRef.keys()],
    missingCode: 'omitted-proposal-claim',
    unexpectedCode: 'unexpected-analysis-claim',
    axis: 'concept',
    name,
    subject: 'analysis claims',
    add,
  });
  return [...byRef.values()];
}

function validateRelations(name, reviewPlan, analysis, add) {
  const relations = Array.isArray(reviewPlan.relations) ? reviewPlan.relations : [];
  if (!Array.isArray(reviewPlan.relations)) {
    add('relations', 'missing-review-plan-relations', 'critical', `${name} review plan must carry relations array.`, name);
    return;
  }
  const witnesses = new Map();
  for (const witness of analysis.relationWitnesses ?? []) {
    if (isRecord(witness) && nonBlank(witness.ref)) witnesses.set(witness.ref, witness);
  }
  for (const relation of relations) {
    const ref = relationRef(relation);
    if (!isRecord(relation) || !nonBlank(relation.from) || !nonBlank(relation.to)) {
      add('relations', 'invalid-relation-endpoints', 'critical', `${name} relation has invalid endpoints.`, name, { ref });
      continue;
    }
    if (!WRITE_RELATION_TYPE_VALUES.includes(relation.type)) {
      add('relations', 'invalid-relation-type', 'critical', `${name} relation ${ref} uses unsupported type ${relation.type ?? ''}.`, name, { ref });
      continue;
    }
    const witness = witnesses.get(ref);
    if (!witness) {
      add('relations', 'missing-relation-witness', 'critical', `${name} relation ${ref} has no exact direction witness.`, name, { ref });
      continue;
    }
    if (witness.supported !== true) {
      add('relations', 'unsupported-relation-witness', 'critical', `${name} relation ${ref} has unsupported witness.`, name, { ref });
    }
    if (witness.from !== relation.from || witness.to !== relation.to || witness.type !== relation.type) {
      add('relations', 'invalid-relation-direction', 'critical', `${name} witness does not match the exact direction of ${ref}.`, name, { ref });
    }
  }
}

function validateWriteBoundary(name, analysis, add) {
  const validation = analysis.proposalValidation;
  const lifecycle = validation?.constructionLifecycle ?? analysis.constructionLifecycle;
  if (!isRecord(lifecycle)) {
    add('meaning', 'missing-construction-lifecycle', 'critical', `${name} analysis has no lifecycle disposition.`, name);
    return;
  }
  const tier = lifecycle.admission?.tier;
  if (!ADMISSION_TIERS.has(tier)) {
    add('meaning', 'missing-admission-tier', 'critical', `${name} lifecycle has no valid admission tier.`, name);
  }
  const canWrite = validation?.canWrite === true || lifecycle.canWrite === true;
  if (canWrite && lifecycle.qualificationStatus !== 'qualified') {
    add('meaning', 'can-write-before-qualification', 'critical', `${name} exposes canWrite before qualification completes.`, name);
  }
  if (lifecycle.writeEligibility === 'executable' && lifecycle.qualificationStatus !== 'qualified') {
    add('meaning', 'write-eligibility-before-qualification', 'critical', `${name} exposes executable writing before qualification completes.`, name);
  }
}

function validateCitationAudit(name, audit, artifact, add) {
  if (!isRecord(audit)) {
    add('citations', 'missing-citation-audit', 'critical', `${name} has no citation/path audit.`, name);
    return;
  }
  if (audit.artifact !== name) {
    add('citations', 'citation-audit-artifact-mismatch', 'critical', `${name} citation audit is bound to ${audit.artifact ?? 'no artifact'}.`, name);
  }
  validateBoundDigests('citation-audit', name, audit, artifact, 'citations', add);
  if (audit.packetDigest !== q17ArtifactDigest(withoutKey(audit, 'packetDigest'))) {
    add('citations', 'citation-audit-packet-digest-mismatch', 'critical', `${name} citation audit receipt was altered.`, name);
  }
  if (!Array.isArray(audit.entries)) {
    add('citations', 'invalid-citation-audit', 'critical', `${name} citation audit entries must be an array.`, name);
    return;
  }
  const entriesByClaim = new Map();
  for (const entry of audit.entries) {
    if (!isRecord(entry) || !nonBlank(entry.claimRef)) {
      add('citations', 'invalid-citation-audit-entry', 'critical', `${name} citation audit has an invalid entry.`, name);
      continue;
    }
    if (entriesByClaim.has(entry.claimRef)) {
      add('citations', 'duplicate-citation-audit-entry', 'critical', `${name} citation audit repeats ${entry.claimRef}.`, name, { ref: entry.claimRef });
      continue;
    }
    entriesByClaim.set(entry.claimRef, entry);
  }
  for (const claim of artifact.claims) {
    const entry = entriesByClaim.get(claim.ref);
    if (!entry) {
      add('citations', 'missing-citation', 'critical', `${name} claim ${claim.ref} has no citation audit.`, name, { ref: claim.ref });
      continue;
    }
    if (!nonBlank(entry.citation) || isPrivatePath(entry.citation)) {
      add('citations', 'invalid-citation-path', 'critical', `${name} citation for ${claim.ref} is not a portable relative path.`, name, { ref: claim.ref });
    }
    if (!claim.evidenceRefs?.includes(entry.citation)) {
      add('citations', 'citation-outside-claim-evidence', 'critical', `${name} citation for ${claim.ref} is not declared by that claim.`, name, { ref: claim.ref });
    }
    if (entry.pathExists !== true) {
      add('citations', 'missing-citation-path', 'critical', `${name} citation path for ${claim.ref} was not found.`, name, { ref: claim.ref });
    }
    if (entry.supportsClaim !== true) {
      add('citations', 'unsupported-citation', 'critical', `${name} citation does not support ${claim.ref}.`, name, { ref: claim.ref });
    }
  }
  for (const claimRef of entriesByClaim.keys()) {
    if (!artifact.claims.some(({ ref }) => ref === claimRef)) {
      add('citations', 'citation-for-unknown-claim', 'critical', `${name} citation audit names unknown claim ${claimRef}.`, name, { ref: claimRef });
    }
  }
}

function validateSourceHidden(name, summary, artifact, add) {
  if (!isRecord(summary)) {
    add('source_hidden', 'missing-source-hidden-summary', 'critical', `${name} has no source-hidden summary.`, name);
    return;
  }
  if (containsPrivatePath(summary)) {
    add('source_hidden', 'source-hidden-private-path', 'critical', `${name} source-hidden packet leaks a clone or private absolute path.`, name);
  }
  if (summary.artifact !== name) {
    add('source_hidden', 'source-hidden-artifact-mismatch', 'critical', `${name} source-hidden packet is bound to ${summary.artifact ?? 'no artifact'}.`, name);
  }
  validateBoundDigests('source-hidden', name, summary, artifact, 'source_hidden', add);
  if (summary.packetDigest !== q17ArtifactDigest(withoutKey(summary, 'packetDigest'))) {
    add('source_hidden', 'source-hidden-packet-digest-mismatch', 'critical', `${name} source-hidden receipt was altered.`, name);
  }
  if (
    summary.evaluationStatus === 'fixture_only'
    || summary.qualificationStatus === 'not_assessed'
    || summary.packetKind === 'fixture'
  ) {
    add('source_hidden', 'fixture-only-source-hidden', 'critical', `${name} fixture-only source-hidden evidence cannot qualify a real trial.`, name);
  }
  if (summary.packetKind !== 'independent-persisted-vault' || summary.sourceAccess !== false) {
    add('source_hidden', 'invalid-source-hidden-boundary', 'critical', `${name} source-hidden evaluator must independently use the persisted vault without source access.`, name);
  }
  if (!Array.isArray(summary.answers) || summary.answers.length !== 20) {
    add('source_hidden', 'source-hidden-question-count-mismatch', 'critical', `${name} source-hidden packet must carry the fixed 20-question assessment.`, name);
  } else {
    for (const answer of summary.answers) {
      const hasEvidence = Array.isArray(answer?.evidenceRefs) && answer.evidenceRefs.length > 0;
      const hasNextAction = nonBlank(answer?.nextAction);
      if (!nonBlank(answer?.id) || !SOURCE_HIDDEN_STATUSES.has(answer?.status) || (!hasEvidence && !hasNextAction)) {
        add('source_hidden', 'invalid-source-hidden-answer', 'critical', `${name} source-hidden answer needs status plus evidence or a next action.`, name, { questionId: answer?.id ?? null });
      }
    }
  }
  if (!Array.isArray(summary.claimRefs)) {
    add('source_hidden', 'missing-source-hidden-claim-coverage', 'critical', `${name} source-hidden packet must name covered proposal claims.`, name);
  } else {
    compareRefSets({
      expected: artifact.reviewRefs,
      actual: summary.claimRefs,
      missingCode: 'source-hidden-omitted-proposal-claim',
      unexpectedCode: 'source-hidden-unknown-proposal-claim',
      axis: 'source_hidden',
      name,
      subject: 'source-hidden claim coverage',
      add,
    });
  }
}

function validateBoundDigests(prefix, name, row, artifact, axis, add) {
  for (const [field, expected, code] of [
    ['proposalDigest', artifact.proposalDigest, `${prefix}-proposal-digest-mismatch`],
    ['reviewPlanDigest', artifact.reviewPlanDigest, `${prefix}-review-plan-digest-mismatch`],
    ['sourceDigest', artifact.sourceDigest, `${prefix}-source-digest-mismatch`],
  ]) {
    if (row[field] !== expected) {
      add(axis, code, 'critical', `${name} ${prefix} does not bind the exact ${field}.`, name);
    }
  }
}

function validateMetrics(metrics, artifacts, add) {
  if (!isRecord(metrics)) {
    add('performance', 'missing-q17-metrics', 'critical', 'Q17 packet must carry baseline and current metrics.');
    return;
  }
  for (const name of ['baseline', 'current']) {
    const rows = metrics[name];
    if (!isRecord(rows)) {
      add('performance', 'missing-artifact-metrics', 'critical', `Missing ${name} metrics.`, name);
      continue;
    }
    validateMetricThresholds(name, rows, artifacts.get(name), add);
  }
  const baselineMedian = metrics.baseline?.performance?.medianMs;
  const currentMedian = metrics.current?.performance?.medianMs;
  if (Number.isFinite(baselineMedian) && Number.isFinite(currentMedian) && currentMedian > baselineMedian * 1.2) {
    add('performance', 'performance-regression-exceeded', 'critical', 'Current median analysis time regressed more than 20% from baseline.');
  }
  if (!Array.isArray(metrics.improvements) || !metrics.improvements.some((row) => (
    isRecord(row) && Number.isFinite(row.baseline) && Number.isFinite(row.current) && row.current < row.baseline
  ))) {
    add('concept', 'no-verified-improvement', 'critical', 'Q17 needs at least one measured false-negative or visible-gap reduction.');
  }
}

function validateMetricThresholds(name, rows, artifact, add) {
  const { concept, meaning, relations, citations, sourceHidden, hallucination, determinism, performance } = rows;
  if (!atLeast(concept?.precision, 0.85) || !atLeast(concept?.recall, 0.8)) {
    add('concept', 'concept-threshold-not-met', 'critical', `${name} concept precision/recall is below the Q17 threshold.`, name);
  }
  if (meaning?.definitionCoverage !== 1 || meaning?.boundaryCoverage !== 1) {
    add('meaning', 'meaning-coverage-incomplete', 'critical', `${name} definition or boundary coverage is incomplete.`, name);
  }
  if (relations?.precision !== 1 || relations?.directionErrorCount !== 0) {
    add('relations', 'relation-metric-failed', 'critical', `${name} relation precision or direction metric failed.`, name);
  }
  if (citations?.pathAccuracy !== 1 || citations?.supportAccuracy !== 1 || !atLeast(citations?.recall, 0.9)) {
    add('citations', 'citation-metric-failed', 'critical', `${name} citation metric failed.`, name);
  }
  if (sourceHidden?.questionCount !== 20 || sourceHidden?.completeCount < 16) {
    add('source_hidden', 'source-hidden-metric-failed', 'critical', `${name} source-hidden metric requires 20 classified questions and 16 complete answers.`, name);
  }
  if (hallucination?.unsupportedPresentedAsFact !== 0) {
    add('hallucination', 'hallucination-metric-failed', 'critical', `${name} reported unsupported claims as facts.`, name);
  }
  if (
    determinism?.runs !== 3
    || determinism?.identical !== 3
    || !Array.isArray(determinism?.digests)
    || determinism.digests.length !== 3
    || new Set(determinism.digests).size !== 1
    || determinism.digests[0] !== artifact?.artifactDigest
  ) {
    add('determinism', `non-deterministic-${name}-artifact`, 'critical', `${name} proposal artifact was not identical in all three deterministic runs.`, name);
  }
  if (
    performance?.nodeMajor !== 24
    || performance?.runs !== 5
    || !atMost(performance?.medianMs, 10_000)
    || !atMost(performance?.maxMs, 30_000)
    || !atMost(performance?.peakRssBytes, MAX_RSS_BYTES)
  ) {
    add('performance', 'performance-max-exceeded', 'critical', `${name} performance evidence misses the Node 24/Q17 time or memory limits.`, name);
  }
}

function compareRefSets({ expected, actual, missingCode, unexpectedCode, axis, name, subject, add }) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const ref of expectedSet) {
    if (!actualSet.has(ref)) {
      add(axis, missingCode, 'critical', `${name} ${subject} omits ${ref}.`, name, { ref });
    }
  }
  for (const ref of actualSet) {
    if (!expectedSet.has(ref)) {
      add(axis, unexpectedCode, 'critical', `${name} ${subject} adds foreign ref ${ref}.`, name, { ref });
    }
  }
}

function renderResult(findings) {
  const axes = Object.fromEntries(Q17_QUALITY_AXES.map((axis) => {
    const axisFindings = findings.filter((finding) => finding.axis === axis);
    const status = axisFindings.some(({ severity }) => severity === 'critical')
      ? 'fail'
      : axisFindings.length > 0
        ? 'partial'
        : 'pass';
    return [axis, { status, findings: axisFindings }];
  }));
  return {
    contract: Q17_QUALIFICATION_CONTRACT,
    status: findings.some(({ severity }) => severity === 'critical')
      ? 'fail'
      : findings.length > 0
        ? 'partial'
        : 'pass',
    axes,
    findings,
  };
}

function relationRef({ from, to, type } = {}) {
  return `relation:${type}:${from}->${to}`;
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function emptyArtifact() {
  return {
    proposal: {},
    analysis: {},
    reviewPlan: {},
    sourceDigest: null,
    proposalDigest: null,
    reviewPlanDigest: null,
    artifactDigest: null,
    reviewRefs: [],
    claims: [],
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function containsPrivatePath(value) {
  return stringsWithin(value).some(isPrivatePath);
}

function stringsWithin(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((row) => stringsWithin(row, output));
  else if (isRecord(value)) Object.values(value).forEach((row) => stringsWithin(row, output));
  return output;
}

function isPrivatePath(value) {
  return typeof value !== 'string'
    || isAbsolute(value)
    || value.startsWith('file://')
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes('/Users/')
    || value.includes('\\Users\\');
}

function validDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function unique(values) {
  return [...new Set(values)].sort();
}

function atLeast(value, threshold) {
  return Number.isFinite(value) && value >= threshold;
}

function atMost(value, threshold) {
  return Number.isFinite(value) && value <= threshold;
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

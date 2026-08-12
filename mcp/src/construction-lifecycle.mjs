import { createHash } from 'node:crypto';

import {
  CONSTRUCTION_QUALITY_AXES,
  evaluateConstructionQualification,
} from './construction-qualification.mjs';

export const CONSTRUCTION_LIFECYCLE_CONTRACT = 'ontologyConstructionLifecycle:v1';

export const CONSTRUCTION_LIFECYCLE_PHASES = Object.freeze([
  'purpose_authority',
  'approved_cqs',
  'evidence_reuse',
  'small_conceptual_slice',
  'semantic_structural_tests',
  'independent_source_hidden',
  'human_plan_approval',
  'prior_cq_regression',
]);

export const CONSTRUCTION_LIFECYCLE_EN = `## Ontology construction lifecycle — review before write

Ontology construction uses one public read tool in two phases; there is no
separate approval tool or writer token.

1. Call \`analyze_repo_structure\` with the complete proposal and no
   \`qualification\`. A valid proposal returns a non-writing \`reviewPlan\`,
   \`planDigest\`, \`planRevision\`, \`sourceDigest\`, and exact
   \`requiredGapIds\`. \`canWrite\` remains false and \`writePlan\` is absent.
2. A separately identified evaluator must run the approved competency questions,
   verify current portable witnesses and citations, execute the complete
   source-hidden task, report every quality axis, and run the prior-CQ regression.
   Builder-only evaluation, \`not_measured\`, stale evidence, or a red mandatory
   axis blocks writing.
3. Show the exact review plan and every required gap to the person. If they
   accept, record declared human provenance bound to the returned plan digest,
   revision, and exact accepted gap ids. This records an assertion; Atlas does
   not authenticate the person's identity or certify the claims as truth.
4. Call the same tool again with the unchanged proposal and the complete
   \`constructionQualification:v1\` packet. Write only when it returns
   \`canWrite:true\`, lifecycle \`writeEligibility:"executable"\`, and an exact
   \`writePlan\`. Any source or plan change invalidates the acceptance.
5. Pass those rows unchanged to the batch writers, then run \`validate_vault\`,
   \`compile_ontology({summary:true})\`, and \`finalize_project_meaning\` after
   connecting the project source. A post-write failure is repaired forward; it
   is never concealed as a successful construction.

Always obtain explicit user approval for the exact plan and visible gaps.
Unknown is a valid result; invented completeness is not.`;

const MANDATORY_AXES = Object.freeze([
  'semantic',
  'structural',
  'evidence_provenance',
  'maintainability',
  'interoperability',
]);
const GAP_ELIGIBLE_PROPOSAL_WARNING_CODES = new Set([
  'partial-competency-answer',
  'visible-competency-gap',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

export function constructionPlanDigest(reviewPlan) {
  if (reviewPlan == null) return null;
  const payload = JSON.stringify(canonical(reviewPlan));
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

function phase(id, status, diagnosticCodes = []) {
  return { id, status, diagnosticCodes: [...new Set(diagnosticCodes)].sort() };
}

function addDiagnostic(diagnostics, code, phaseId, message) {
  diagnostics.push({ code, phase: phaseId, message });
}

function invalidFindingPhase(code) {
  if (code.includes('purpose-authority')) return 'purpose_authority';
  if (code.includes('regression')) return 'prior_cq_regression';
  if (code.includes('cq-') || code.includes('scenario') || code.includes('builder') || code.includes('evaluator') || code.includes('maker-self-evaluation')) {
    return 'approved_cqs';
  }
  if (code.includes('claim') || code.includes('citation') || code.includes('witness')) return 'evidence_reuse';
  if (code.includes('example') || code.includes('counterexample')) return 'small_conceptual_slice';
  if (code.includes('source-hidden')) return 'independent_source_hidden';
  if (code.includes('acceptance') || code.includes('approval')) return 'human_plan_approval';
  return 'semantic_structural_tests';
}

function proposalGapIds(proposalFindings) {
  return [...new Set(proposalFindings
    .filter(({ code, severity }) => (
      severity === 'warning' && GAP_ELIGIBLE_PROPOSAL_WARNING_CODES.has(code)
    ))
    .map(({ code, path }) => `proposal:${code}:${path}`))].sort();
}

function blockedProposalWarnings(proposalFindings) {
  return proposalFindings.filter(({ code, severity }) => (
    severity === 'warning' && !GAP_ELIGIBLE_PROPOSAL_WARNING_CODES.has(code)
  ));
}

function gapIds(qualificationResult, proposalFindings) {
  const ids = proposalGapIds(proposalFindings);
  for (const axis of ['functional', 'pragmatic']) {
    if (qualificationResult.axes[axis]?.status !== 'passed') ids.push(`axis:${axis}`);
  }
  for (const cq of qualificationResult.competencyQuestions) {
    if (cq.status !== 'passed') ids.push(`cq:${cq.id}`);
  }
  return [...new Set(ids)].sort();
}

function allAccepted(required, accepted) {
  const acceptedSet = new Set(accepted ?? []);
  return required.every((id) => acceptedSet.has(id));
}

function phasesWithoutQualification() {
  return CONSTRUCTION_LIFECYCLE_PHASES.map((id, index) => phase(
    id,
    index === 6 ? 'awaiting_approval' : 'blocked',
    index === 0 ? ['missing-qualification'] : [],
  ));
}

/**
 * Turn a validated candidate plan plus the existing qualification packet into
 * a write eligibility decision. This function is side-effect free: it returns
 * exact writer rows only after the packet and declared human acceptance bind
 * to the same plan and source digest.
 */
export function evaluateConstructionLifecycle({
  reviewPlan,
  sourceDigest,
  expectedProjectSlug,
  qualification,
  proposalFindings = [],
} = {}) {
  const planDigest = constructionPlanDigest(reviewPlan);
  const planRevision = 1;
  if (reviewPlan == null) {
    const hasProposalErrors = proposalFindings.length > 0;
    const firstBlockingPhase = hasProposalErrors
      ? 'semantic_structural_tests'
      : 'purpose_authority';
    return {
      contract: CONSTRUCTION_LIFECYCLE_CONTRACT,
      qualificationStatus: 'not_qualified',
      writeEligibility: 'blocked',
      planDigest: null,
      sourceDigest: sourceDigest ?? null,
      planRevision,
      firstBlockingPhase,
      phases: CONSTRUCTION_LIFECYCLE_PHASES.map((id) => phase(
        id,
        id === 'human_plan_approval' ? 'awaiting_approval' : 'blocked',
        id === firstBlockingPhase
          ? proposalFindings.map(({ code }) => code).filter(Boolean)
          : [],
      )),
      diagnostics: proposalFindings.map((finding) => ({
        code: finding.code,
        phase: 'semantic_structural_tests',
        message: finding.message,
      })),
      requiredGapIds: [],
      nextAction: hasProposalErrors
        ? 'Repair the proposal findings before construction qualification.'
        : 'Submit a complete evidence-backed proposal to produce a non-writing review plan.',
    };
  }
  if (qualification == null) {
    const requiredGaps = proposalGapIds(proposalFindings);
    return {
      contract: CONSTRUCTION_LIFECYCLE_CONTRACT,
      qualificationStatus: 'not_qualified',
      writeEligibility: 'reviewable',
      planDigest,
      sourceDigest: sourceDigest ?? null,
      planRevision,
      firstBlockingPhase: 'purpose_authority',
      phases: phasesWithoutQualification(),
      diagnostics: [{
        code: 'missing-qualification',
        phase: 'purpose_authority',
        message: 'Complete the digest-bound construction qualification before any write.',
      }],
      requiredGapIds: requiredGaps,
      reviewPlan: clone(reviewPlan),
      nextAction: 'Complete the constructionQualification:v1 packet for this exact review plan.',
    };
  }

  const result = evaluateConstructionQualification(qualification);
  const diagnostics = result.findings.map((finding) => ({
    code: finding.code,
    phase: invalidFindingPhase(finding.code),
    message: finding.message,
  }));
  if (qualification.subject?.graphDigest !== planDigest) {
    addDiagnostic(diagnostics, 'plan-digest-mismatch', 'human_plan_approval', 'Qualification graph digest does not match the current review plan.');
  }
  if (expectedProjectSlug && qualification.subject?.projectSlug !== expectedProjectSlug) {
    addDiagnostic(diagnostics, 'project-digest-subject-mismatch', 'purpose_authority', 'Qualification subject does not match the proposed project.');
  }
  if (qualification.subject?.sourceDigest !== sourceDigest) {
    addDiagnostic(diagnostics, 'source-digest-mismatch', 'evidence_reuse', 'Qualification source digest does not match the current analyzed source.');
  }
  if (qualification.acceptance?.planDigest !== planDigest) {
    addDiagnostic(diagnostics, 'acceptance-plan-digest-mismatch', 'human_plan_approval', 'Recorded acceptance does not bind the current review plan.');
  }
  if (qualification.acceptance?.planRevision !== planRevision) {
    addDiagnostic(diagnostics, 'acceptance-plan-revision-mismatch', 'human_plan_approval', 'Recorded acceptance uses a different plan revision.');
  }

  const nonApprovableWarnings = blockedProposalWarnings(proposalFindings);
  for (const warning of nonApprovableWarnings) {
    addDiagnostic(
      diagnostics,
      `proposal-warning-not-gap-eligible:${warning.code}:${warning.path}`,
      warning.code.includes('evidence') || warning.code.includes('citation')
        ? 'evidence_reuse'
        : 'semantic_structural_tests',
      `Proposal warning ${warning.code} must be resolved; human gap acceptance cannot override it.`,
    );
  }

  const requiredGaps = gapIds(result, proposalFindings);
  const missingGapApprovals = requiredGaps.filter((id) => !qualification.acceptance?.acceptedGapIds?.includes(id));
  if (missingGapApprovals.length > 0) {
    addDiagnostic(
      diagnostics,
      'unaccepted-lifecycle-gaps',
      'human_plan_approval',
      `Acceptance is missing these exact gap ids: ${missingGapApprovals.join(', ')}.`,
    );
  }

  const mandatoryRed = MANDATORY_AXES.filter((axis) => result.axes[axis]?.status !== 'passed');
  for (const axis of mandatoryRed) {
    addDiagnostic(diagnostics, `mandatory-axis-not-passed:${axis}`, 'semantic_structural_tests', `Mandatory axis ${axis} did not pass.`);
  }
  const sourceHiddenMissing = !qualification.sourceHiddenTask
    || qualification.sourceHiddenTask.status === 'not_measured';
  if (sourceHiddenMissing) {
    addDiagnostic(diagnostics, 'source-hidden-not-measured', 'independent_source_hidden', 'The independent source-hidden task was not measured.');
  }
  const regressionReady = qualification.regression?.status === 'passed'
    || qualification.regression?.status === 'not_applicable';
  if (!regressionReady) {
    addDiagnostic(diagnostics, 'prior-cq-regression-not-passed', 'prior_cq_regression', 'Prior-CQ pre-write regression did not pass.');
  }
  const accepted = qualification.acceptance?.decision === 'accepted';
  if (!accepted) {
    addDiagnostic(diagnostics, 'plan-not-accepted', 'human_plan_approval', 'The exact review plan has no recorded human acceptance.');
  }

  const invalid = result.status === 'invalid';
  const digestMismatch = diagnostics.some(({ code }) => code.includes('digest-mismatch') || code.includes('revision-mismatch') || code.includes('digest-subject-mismatch'));
  const executable = !invalid
    && nonApprovableWarnings.length === 0
    && mandatoryRed.length === 0
    && !sourceHiddenMissing
    && regressionReady
    && accepted
    && !digestMismatch
    && allAccepted(requiredGaps, qualification.acceptance?.acceptedGapIds);
  const gapAccepted = executable && requiredGaps.length > 0;

  const phaseStatuses = new Map(CONSTRUCTION_LIFECYCLE_PHASES.map((id) => [id, 'passed']));
  for (const diagnostic of diagnostics) {
    if (diagnostic.phase === 'human_plan_approval' && !accepted) {
      phaseStatuses.set(diagnostic.phase, 'awaiting_approval');
    } else {
      phaseStatuses.set(diagnostic.phase, 'blocked');
    }
  }
  if (gapAccepted) {
    phaseStatuses.set('independent_source_hidden', 'gap_accepted');
    phaseStatuses.set('human_plan_approval', 'gap_accepted');
  }
  if (executable) phaseStatuses.set('prior_cq_regression', 'pending_post_write');

  const phases = CONSTRUCTION_LIFECYCLE_PHASES.map((id) => phase(
    id,
    phaseStatuses.get(id),
    diagnostics.filter(({ phase: phaseId }) => phaseId === id).map(({ code }) => code),
  ));
  const firstBlockingPhase = phases.find(({ status }) => ['blocked', 'awaiting_approval'].includes(status))?.id ?? null;

  return {
    contract: CONSTRUCTION_LIFECYCLE_CONTRACT,
    qualificationStatus: result.status,
    writeEligibility: executable ? 'executable' : 'blocked',
    planDigest,
    sourceDigest: sourceDigest ?? null,
    planRevision,
    firstBlockingPhase,
    phases,
    diagnostics,
    requiredGapIds: requiredGaps,
    reviewPlan: clone(reviewPlan),
    ...(executable ? { writePlan: clone(reviewPlan) } : {}),
    nextAction: executable
      ? 'Write only the returned writePlan rows, then validate, compile, and finalize the persisted project.'
      : firstBlockingPhase === 'human_plan_approval'
        ? 'Record declared human acceptance for this exact plan digest, revision, and every required gap id.'
        : `Repair the first blocked lifecycle phase: ${firstBlockingPhase ?? 'unknown'}.`,
  };
}

export const CONSTRUCTION_LIFECYCLE_MANDATORY_AXES = Object.freeze(
  CONSTRUCTION_QUALITY_AXES.filter((axis) => MANDATORY_AXES.includes(axis)),
);

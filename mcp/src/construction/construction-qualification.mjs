/**
 * Re-executable ontology-construction qualification contract. Not a score: a red
 * semantic, functional, provenance or pragmatic axis cannot be averaged away. It
 * validates an evaluator packet and derives categorical output; it never writes
 * the vault or approves the meaning it evaluates.
 */

export {
  CONSTRUCTION_QUALIFICATION_AUDIENCES,
  CONSTRUCTION_QUALIFICATION_CONTRACT,
  CONSTRUCTION_QUALIFICATION_REQUIRED_AUDIENCES,
  CONSTRUCTION_QUALITY_AXES,
  FDE_AUDIENCE_AUTHORITY_DECISION,
  FDE_AUDIENCE_AUTHORITY_WITNESS_KIND,
} from './qualification-vocabulary.mjs';
export { CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA } from './qualification-input-schema.mjs';

import {
  CONSTRUCTION_QUALIFICATION_CONTRACT,
  CONSTRUCTION_QUALITY_AXES,
  CLAIM_STATUSES,
  CITATION_STATUSES,
} from './qualification-vocabulary.mjs';
import {
  addFinding,
  countBy,
  isRecord,
  nonBlank,
} from './qualification-field-rules.mjs';
import {
  validateRoot,
  validatePurposeAuthority,
  validateScenarios,
  validateQuestions,
} from './qualification-scenario-review.mjs';
import {
  validateWitnesses,
  validateClaims,
  validateCitationChecks,
  validateDiagnostics,
} from './qualification-evidence-review.mjs';
import {
  validateAxisResults,
  validateCqResults,
  normalizedAxes,
} from './qualification-result-review.mjs';
import {
  validateSourceHiddenTask,
  validateResourceUse,
  validateAcceptance,
  validateRegression,
} from './qualification-acceptance-review.mjs';

function accuracy(correct, total) {
  return {
    correct,
    total,
    rate: total === 0 ? null : correct / total,
  };
}

/** Validates and categorically evaluates a packet; unknown or red evidence stays visible. */
export function evaluateConstructionQualification(packet) {
  const findings = [];
  validateRoot(packet, findings);
  if (!isRecord(packet)) {
    return {
      contract: CONSTRUCTION_QUALIFICATION_CONTRACT,
      status: 'invalid',
      axes: Object.fromEntries(CONSTRUCTION_QUALITY_AXES.map((axis) => [
        axis,
        { status: 'not_measured', evidenceRefs: [], diagnostics: [] },
      ])),
      competencyQuestions: [],
      claimLedger: {
        counts: countBy([], CLAIM_STATUSES),
        citationChecks: countBy([], CITATION_STATUSES),
      },
      resourceUse: null,
      metrics: {
        claimAccuracy: accuracy(0, 0),
        citationAccuracy: accuracy(0, 0),
        resourceUse: null,
      },
      findings,
    };
  }

  const purposeAuthority = validatePurposeAuthority(packet, findings);
  const scenarios = validateScenarios(packet, findings);
  const questions = validateQuestions(packet, scenarios, findings);
  const witnesses = validateWitnesses(packet, findings);
  const claims = validateClaims(packet, witnesses, findings);
  const citationChecks = validateCitationChecks(packet, claims, witnesses, findings);
  const diagnostics = validateDiagnostics(packet, witnesses, findings);
  const axisRows = validateAxisResults(packet, witnesses, diagnostics, findings);
  const cqResults = validateCqResults(packet, questions, witnesses, claims, findings);
  const sourceHiddenTask = validateSourceHiddenTask(packet, claims, findings);
  const resourceUse = validateResourceUse(packet, findings);
  const acceptance = validateAcceptance(packet, findings);
  const regression = validateRegression(packet, questions, witnesses, axisRows, findings);
  const axes = normalizedAxes(
    axisRows,
    witnesses,
    diagnostics,
    cqResults,
    claims,
    citationChecks,
    sourceHiddenTask,
    findings,
  );

  for (const [id, claim] of claims) {
    if (claim.status === 'supported') continue;
    addFinding(
      findings,
      'claim-not-supported',
      `claims.${id}`,
      `Claim ${id} is ${claim.status}.`,
      { severity: 'failure', category: 'evidence', refs: claim.witnessRefs },
    );
  }
  for (const [index, check] of citationChecks.entries()) {
    if (check.status === 'verified') continue;
    addFinding(
      findings,
      'citation-not-verified',
      `citationChecks[${index}]`,
      `Citation for ${check.claimId} is ${check.status}.`,
      {
        severity: 'failure',
        category: 'evidence',
        refs: check.witnessRef ? [check.witnessRef] : [],
      },
    );
  }

  const invalid = findings.some(({ severity }) => severity === 'error');
  const allAxesPass = Object.values(axes).every(({ status }) => status === 'passed');
  const allCqsPass = cqResults.length === questions.size
    && cqResults.every(({ status }) => status === 'passed');
  const allClaimsSupported = [...claims.values()].every(({ status }) => status === 'supported');
  const allCitationsVerified = citationChecks.length > 0
    && citationChecks.every(({ status }) => status === 'verified');
  const accepted = acceptance?.decision === 'accepted';
  const qualified = !invalid
    && allAxesPass
    && allCqsPass
    && allClaimsSupported
    && allCitationsVerified
    && sourceHiddenTask.status === 'passed'
    && accepted;
  const supportedClaims = [...claims.values()].filter((claim) => (
    claim.status === 'supported'
    && claim.witnessRefs.length > 0
    && claim.witnessRefs.every((ref) => witnesses.get(ref)?.current === true)
  )).length;
  const claimsWithVerifiedCitation = new Set(citationChecks
    .filter((check) => (
      check.status === 'verified'
      && witnesses.get(check.witnessRef)?.current === true
    ))
    .map(({ claimId }) => claimId));

  return {
    contract: CONSTRUCTION_QUALIFICATION_CONTRACT,
    qualificationId: nonBlank(packet.qualificationId) ? packet.qualificationId : null,
    status: invalid ? 'invalid' : qualified ? 'qualified' : 'not_qualified',
    axes,
    competencyQuestions: cqResults,
    claimLedger: {
      counts: countBy([...claims.values()], CLAIM_STATUSES),
      citationChecks: countBy(citationChecks, CITATION_STATUSES),
    },
    resourceUse,
    metrics: {
      claimAccuracy: accuracy(supportedClaims, claims.size),
      citationAccuracy: accuracy(claimsWithVerifiedCitation.size, claims.size),
      resourceUse,
    },
    purposeAuthority,
    sourceHiddenTask,
    regression,
    acceptance,
    findings,
  };
}

import {
  CONSTRUCTION_QUALITY_AXES,
  CONSTRUCTION_QUALIFICATION_MIN_CASES,
  FDE_AUDIENCE_AUTHORITY_WITNESS_KIND,
  AXIS_STATUSES,
  CQ_STATUSES,
} from './qualification-vocabulary.mjs';
import {
  addFinding,
  mapUnique,
  nonBlank,
  uniqueStrings,
} from './qualification-field-rules.mjs';

export function validateAxisResults(packet, witnesses, diagnostics, findings) {
  const axes = mapUnique(packet.axisResults, 'axis', findings, 'axisResults');
  for (const axis of CONSTRUCTION_QUALITY_AXES) {
    const row = axes.get(axis);
    if (!row) {
      addFinding(findings, 'missing-quality-axis', 'axisResults', `Missing quality axis: ${axis}`);
      continue;
    }
    if (
      !AXIS_STATUSES.has(row.status)
      || !uniqueStrings(row.evidenceRefs)
      || !uniqueStrings(row.findingIds)
    ) {
      addFinding(findings, 'invalid-quality-axis', `axisResults.${axis}`, 'Axis result shape is invalid.');
      continue;
    }
    for (const ref of row.evidenceRefs) {
      if (!witnesses.has(ref)) {
        addFinding(findings, 'unknown-witness-ref', `axisResults.${axis}.evidenceRefs`, `Unknown witness: ${ref}`);
      }
    }
    if (row.status === 'passed' && row.evidenceRefs.length === 0) {
      addFinding(
        findings,
        'unproven-passing-axis',
        `axisResults.${axis}`,
        'A passing axis needs evidence.',
      );
    }
    if (
      row.status === 'passed'
      && row.evidenceRefs.some((ref) => witnesses.get(ref)?.current !== true)
    ) {
      addFinding(
        findings,
        'stale-passing-axis-evidence',
        `axisResults.${axis}.evidenceRefs`,
        'A passing quality axis cannot depend on stale evidence.',
        { severity: 'failure', category: 'evidence', refs: row.evidenceRefs },
      );
    }
    if (row.status !== 'passed' && row.findingIds.length === 0) {
      addFinding(
        findings,
        'unclassified-quality-axis',
        `axisResults.${axis}`,
        'Every non-passing axis needs an explicit classified diagnostic.',
      );
    }
    for (const id of row.findingIds) {
      const diagnostic = diagnostics.get(id);
      if (!diagnostic || diagnostic.axis !== axis) {
        addFinding(
          findings,
          'axis-diagnostic-mismatch',
          `axisResults.${axis}.findingIds`,
          `Diagnostic ${id} is missing or belongs to another axis.`,
        );
      }
    }
  }
  if (axes.size !== CONSTRUCTION_QUALITY_AXES.length) {
    addFinding(
      findings,
      'unexpected-quality-axis',
      'axisResults',
      'Qualification must report each canonical quality axis exactly once.',
    );
  }
  return axes;
}

export function validateCqResults(packet, questions, witnesses, claims, findings) {
  const results = mapUnique(packet.cqResults, 'cqId', findings, 'cqResults');
  if (
    Array.isArray(packet.cqResults)
    && packet.cqResults.length < CONSTRUCTION_QUALIFICATION_MIN_CASES
  ) {
    addFinding(
      findings,
      'insufficient-cq-results',
      'cqResults',
      `Qualification needs at least ${CONSTRUCTION_QUALIFICATION_MIN_CASES} CQ results.`,
    );
  }
  const normalized = [];
  const purposeSourceRefs = new Set(packet.purposeAuthority?.sourceRefs ?? []);
  for (const [id, question] of questions) {
    const row = results.get(id);
    if (!row) {
      addFinding(findings, 'missing-cq-result', 'cqResults', `Missing result for ${id}.`);
      normalized.push({ id, status: 'unknown', coveredTargets: [], uncoveredTargets: [] });
      continue;
    }
    if (
      !CQ_STATUSES.has(row.status)
      || !uniqueStrings(row.witnessRefs)
      || !uniqueStrings(row.claimIds)
      || !Array.isArray(row.targetResults)
    ) {
      addFinding(findings, 'invalid-cq-result', `cqResults.${id}`, 'CQ result shape is invalid.');
      normalized.push({ id, status: 'unknown', coveredTargets: [], uncoveredTargets: [] });
      continue;
    }
    const targets = question.expectedAnswer?.targets ?? [];
    const targetSet = new Set(targets);
    const targetResults = mapUnique(
      row.targetResults,
      'target',
      findings,
      `cqResults.${id}.targetResults`,
    );
    const covered = [];
    for (const [target, targetResult] of targetResults) {
      const resultPath = `cqResults.${id}.targetResults.${target}`;
      if (!targetSet.has(target)) {
        addFinding(
          findings,
          'unknown-cq-target',
          `${resultPath}.target`,
          'CQ result covers a target outside its approved expected answer.',
        );
        continue;
      }
      if (!uniqueStrings(targetResult.witnessRefs) || !uniqueStrings(targetResult.claimIds)) {
        addFinding(
          findings,
          'invalid-cq-target-result',
          resultPath,
          'Every target result needs witnessRefs and claimIds arrays.',
        );
        continue;
      }
      if (
        targetResult.witnessRefs.some((ref) => !row.witnessRefs.includes(ref))
        || targetResult.claimIds.some((claimId) => !row.claimIds.includes(claimId))
      ) {
        addFinding(
          findings,
          'cq-target-result-outside-answer',
          resultPath,
          'Target evidence must be included in the CQ answer evidence.',
        );
        continue;
      }
      const targetWitnessesCurrent = targetResult.witnessRefs.length > 0
        && targetResult.witnessRefs.every((ref) => witnesses.get(ref)?.current === true);
      const targetClaimsSupported = targetResult.claimIds.length > 0
        && targetResult.claimIds.every((claimId) => claims.get(claimId)?.status === 'supported');
      if (targetWitnessesCurrent && targetClaimsSupported) covered.push(target);
    }
    const uncovered = targets.filter((target) => !covered.includes(target));
    const witnessKinds = new Set();
    for (const ref of row.witnessRefs) {
      const witness = witnesses.get(ref);
      if (!witness) {
        addFinding(findings, 'unknown-witness-ref', `cqResults.${id}.witnessRefs`, `Unknown witness: ${ref}`);
      } else if (witness.current) {
        witnessKinds.add(witness.kind);
      }
    }
    for (const claimId of row.claimIds) {
      if (!claims.has(claimId)) {
        addFinding(findings, 'unknown-claim-ref', `cqResults.${id}.claimIds`, `Unknown claim: ${claimId}`);
      }
    }
    const requiredWitnessesPresent = (question.requiredWitnessKinds ?? []).every(
      (kind) => witnessKinds.has(kind),
    );
    const claimsSupported = row.claimIds.length > 0
      && row.claimIds.every((claimId) => claims.get(claimId)?.status === 'supported');
    const quantifier = question.expectedAnswer?.quantifier;
    const coverageSatisfied = quantifier === 'none'
      ? covered.length === 0
      : quantifier === 'exists'
        ? covered.length > 0
        : uncovered.length === 0;
    let audienceAuthorityReady = true;
    if (question.audience === 'fde') {
      if (!(question.requiredWitnessKinds ?? []).includes(FDE_AUDIENCE_AUTHORITY_WITNESS_KIND)) {
        audienceAuthorityReady = false;
        addFinding(
          findings,
          'fde-audience-authority-not-required',
          `competencyQuestions.${id}.requiredWitnessKinds`,
          `Every FDE CQ must require ${FDE_AUDIENCE_AUTHORITY_WITNESS_KIND}.`,
        );
      }
      const carriedAuthorityRefs = row.witnessRefs.filter(
        (ref) => witnesses.get(ref)?.kind === FDE_AUDIENCE_AUTHORITY_WITNESS_KIND,
      );
      if (carriedAuthorityRefs.length === 0) {
        audienceAuthorityReady = false;
        addFinding(
          findings,
          'fde-audience-authority-not-carried',
          `cqResults.${id}.witnessRefs`,
          'An FDE CQ result must carry project-owned audience authority evidence.',
        );
      }
      const currentAuthorityRefs = carriedAuthorityRefs.filter(
        (ref) => witnesses.get(ref)?.current === true,
      );
      if (carriedAuthorityRefs.length > 0 && currentAuthorityRefs.length === 0) {
        audienceAuthorityReady = false;
        addFinding(
          findings,
          'fde-audience-authority-not-current',
          `cqResults.${id}.witnessRefs`,
          'FDE audience authority must be current.',
        );
      }
      const projectOwnedAuthorityRefs = currentAuthorityRefs.filter(
        (ref) => purposeSourceRefs.has(witnesses.get(ref)?.provenance?.sourceRef),
      );
      if (currentAuthorityRefs.length > 0 && projectOwnedAuthorityRefs.length === 0) {
        audienceAuthorityReady = false;
        addFinding(
          findings,
          'fde-audience-authority-source-unbound',
          `cqResults.${id}.witnessRefs`,
          'FDE audience authority must come from a source declared by project purpose authority.',
        );
      }
      const authorityClaimIds = row.claimIds.filter((claimId) => {
        const claim = claims.get(claimId);
        return claim?.status === 'supported'
          && claim.witnessRefs.some((ref) => projectOwnedAuthorityRefs.includes(ref));
      });
      if (projectOwnedAuthorityRefs.length > 0 && authorityClaimIds.length === 0) {
        audienceAuthorityReady = false;
        addFinding(
          findings,
          'fde-audience-authority-claim-missing',
          `cqResults.${id}.claimIds`,
          'An FDE CQ needs a supported claim carrying the exact audience-authority witness.',
        );
      }
      const citationVerified = authorityClaimIds.some((claimId) => (
        packet.citationChecks.some((check) => (
          check.claimId === claimId
          && projectOwnedAuthorityRefs.includes(check.witnessRef)
          && check.status === 'verified'
        ))
      ));
      if (authorityClaimIds.length > 0 && !citationVerified) {
        audienceAuthorityReady = false;
        addFinding(
          findings,
          'fde-audience-authority-citation-missing',
          'citationChecks',
          'FDE audience authority must have an exact verified claim citation.',
        );
      }
    }
    let status;
    if (row.status === 'answered') {
      status = coverageSatisfied
        && requiredWitnessesPresent
        && claimsSupported
        && audienceAuthorityReady
        ? 'passed'
        : 'failed';
    } else if (row.status === 'partial') {
      status = nonBlank(row.gap) ? 'partial' : 'failed';
      if (!nonBlank(row.gap)) {
        addFinding(findings, 'missing-cq-gap', `cqResults.${id}.gap`, 'Partial result needs a gap.');
      }
    } else {
      const allowedUnknown = question.unknownPolicy?.allowed && nonBlank(row.gap);
      status = allowedUnknown
        ? (row.status === 'refused' ? 'refused' : 'unknown')
        : 'failed';
      if (status === 'failed') {
        addFinding(
          findings,
          'invalid-cq-unknown',
          `cqResults.${id}`,
          'Unknown/refused result needs approved behavior and an explicit gap.',
        );
      }
    }
    normalized.push({
      id,
      status,
      coveredTargets: covered,
      uncoveredTargets: uncovered,
      ...(nonBlank(row.gap) ? { gap: row.gap } : {}),
    });
  }
  if (results.size !== questions.size) {
    addFinding(
      findings,
      'unexpected-cq-result',
      'cqResults',
      'Qualification needs exactly one result for every approved CQ.',
    );
  }
  return normalized;
}

export function normalizedAxes(
  axisRows,
  witnesses,
  diagnostics,
  cqResults,
  claims,
  citationChecks,
  sourceHiddenTask,
  findings,
) {
  const result = Object.fromEntries(CONSTRUCTION_QUALITY_AXES.map((axis) => {
    const row = axisRows.get(axis);
    return [axis, {
      status: row?.status ?? 'not_measured',
      evidenceRefs: [...(row?.evidenceRefs ?? [])],
      diagnostics: (row?.findingIds ?? [])
        .map((id) => diagnostics.get(id))
        .filter(Boolean)
        .map((diagnostic) => ({ ...diagnostic })),
    }];
  }));

  const failedCqs = cqResults.filter(({ status }) => status === 'failed');
  const unresolvedCqs = cqResults.filter(({ status }) => status !== 'passed');
  if (failedCqs.length > 0) {
    result.functional.status = 'failed';
  } else if (unresolvedCqs.length > 0) {
    result.functional.status = 'unknown';
  }
  if (unresolvedCqs.length > 0) {
    result.functional.diagnostics.push({
      id: 'derived:functional:cq-not-passed',
      axis: 'functional',
      category: 'evidence',
      message: 'One or more approved competency questions did not pass.',
      evidenceRefs: [],
      cqIds: unresolvedCqs.map(({ id }) => id),
    });
  }
  const evidenceFailed = [...claims.values()].some(({ status }) => status !== 'supported')
    || citationChecks.some(({ status }) => status !== 'verified')
    || findings.some(({ severity, category }) => severity === 'failure' && category === 'evidence');
  if (evidenceFailed) {
    result.evidence_provenance.status = 'failed';
    result.evidence_provenance.diagnostics.push({
      id: 'derived:evidence-provenance:not-current-or-supported',
      axis: 'evidence_provenance',
      category: 'evidence',
      message: 'A claim, citation, or required witness is missing, stale, or unsupported.',
      evidenceRefs: [],
    });
  }
  if (sourceHiddenTask.status !== 'passed') {
    result.pragmatic.status = sourceHiddenTask.status === 'failed' ? 'failed' : 'unknown';
    result.pragmatic.diagnostics.push({
      id: 'derived:pragmatic:source-hidden-not-passed',
      axis: 'pragmatic',
      category: 'evidence',
      message: 'The independent source-hidden task did not pass every qualification claim.',
      evidenceRefs: [],
      missingClaimIds: sourceHiddenTask.missingClaimIds ?? [],
    });
  }
  for (const axis of CONSTRUCTION_QUALITY_AXES) {
    const staleRefs = (axisRows.get(axis)?.evidenceRefs ?? [])
      .filter((ref) => witnesses.get(ref)?.current !== true);
    if (staleRefs.length === 0) continue;
    result[axis].status = 'failed';
    result[axis].diagnostics.push({
      id: `derived:${axis}:stale-evidence`,
      axis,
      category: 'evidence',
      message: 'This axis cites evidence that is no longer current.',
      evidenceRefs: staleRefs,
    });
  }
  return result;
}

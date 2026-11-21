import {
  CONSTRUCTION_QUALIFICATION_AUDIENCES,
  CONSTRUCTION_QUALIFICATION_CONTRACT,
  CONSTRUCTION_QUALIFICATION_MIN_CASES,
  CONSTRUCTION_QUALIFICATION_REQUIRED_AUDIENCES,
  FDE_AUDIENCE_AUTHORITY_DECISION,
  CQ_STATUSES,
  QUANTIFIERS,
} from './qualification-vocabulary.mjs';
import {
  addFinding,
  digest,
  isRecord,
  mapUnique,
  nonBlank,
  portableSourceRef,
  uniqueStrings,
  validTimestamp,
} from './qualification-field-rules.mjs';

export function validateRoot(packet, findings) {
  if (!isRecord(packet)) {
    addFinding(findings, 'invalid-packet', '$', 'Qualification packet must be an object.');
    return;
  }
  if (packet.contract !== CONSTRUCTION_QUALIFICATION_CONTRACT) {
    addFinding(
      findings,
      'invalid-contract',
      'contract',
      `Expected ${CONSTRUCTION_QUALIFICATION_CONTRACT}.`,
    );
  }
  if (!nonBlank(packet.qualificationId, 300)) {
    addFinding(findings, 'invalid-qualification-id', 'qualificationId', 'qualificationId is required.');
  }
  if (
    !isRecord(packet.subject)
    || !nonBlank(packet.subject.projectSlug, 300)
    || !digest(packet.subject.graphDigest)
    || !digest(packet.subject.sourceDigest)
  ) {
    addFinding(
      findings,
      'invalid-subject-provenance',
      'subject',
      'Subject needs projectSlug plus graph and source digests.',
    );
  }
  const builder = packet.actors?.builder;
  const evaluator = packet.actors?.evaluator;
  if (!isRecord(builder) || !nonBlank(builder.id) || !nonBlank(builder.authority)) {
    addFinding(findings, 'invalid-builder', 'actors.builder', 'A named builder is required.');
  }
  if (!isRecord(evaluator) || !nonBlank(evaluator.id) || !nonBlank(evaluator.authority)) {
    addFinding(findings, 'invalid-evaluator', 'actors.evaluator', 'A named evaluator is required.');
  }
  if (nonBlank(builder?.id) && builder.id === evaluator?.id) {
    addFinding(
      findings,
      'maker-self-evaluation',
      'actors',
      'Builder and evaluator must be independently identified.',
    );
  }
}

export function validatePurposeAuthority(packet, findings) {
  const purpose = packet.purposeAuthority;
  const owners = purpose?.owners;
  if (
    !isRecord(purpose)
    || !nonBlank(purpose.outcome, 2000)
    || !uniqueStrings(purpose.decisions)
    || purpose.decisions.length === 0
    || !nonBlank(purpose.scope, 2000)
    || !uniqueStrings(purpose.nonGoals)
    || purpose.nonGoals.length === 0
    || !Array.isArray(owners)
    || owners.length === 0
    || owners.some((owner) => !isRecord(owner) || !nonBlank(owner.id) || owner.authority !== 'human')
    || new Set(owners.map(({ id }) => id)).size !== owners.length
    || !uniqueStrings(purpose.sourceRefs)
    || purpose.sourceRefs.length === 0
    || purpose.sourceRefs.some((sourceRef) => !portableSourceRef(sourceRef))
  ) {
    addFinding(
      findings,
      'invalid-purpose-authority',
      'purposeAuthority',
      'Purpose needs an outcome, decisions, scope, non-goals, portable source refs, and named human meaning owners.',
    );
    return null;
  }
  return structuredClone(purpose);
}

export function validateScenarios(packet, findings) {
  const scenarios = mapUnique(packet.scenarios, 'id', findings, 'scenarios');
  if (
    Array.isArray(packet.scenarios)
    && packet.scenarios.length < CONSTRUCTION_QUALIFICATION_MIN_CASES
  ) {
    addFinding(
      findings,
      'insufficient-scenarios',
      'scenarios',
      `Qualification needs at least ${CONSTRUCTION_QUALIFICATION_MIN_CASES} decision scenarios.`,
    );
  }
  const observedAudiences = new Set();
  for (const [id, row] of scenarios) {
    if (!CONSTRUCTION_QUALIFICATION_AUDIENCES.includes(row.audience)) {
      addFinding(findings, 'invalid-audience', `scenarios.${id}.audience`, 'Unknown audience.');
      continue;
    }
    observedAudiences.add(row.audience);
    for (const key of ['trigger', 'decision', 'expectedOutcome']) {
      if (!nonBlank(row[key])) {
        addFinding(findings, 'incomplete-scenario', `scenarios.${id}.${key}`, `${key} is required.`);
      }
    }
  }
  for (const audience of CONSTRUCTION_QUALIFICATION_REQUIRED_AUDIENCES) {
    if (!observedAudiences.has(audience)) {
      addFinding(
        findings,
        'missing-audience-scenario',
        'scenarios',
        `Qualification is missing the ${audience} decision scenario.`,
      );
    }
  }
  return scenarios;
}

export function validateQuestions(packet, scenarios, findings) {
  const questions = mapUnique(
    packet.competencyQuestions,
    'id',
    findings,
    'competencyQuestions',
  );
  if (
    Array.isArray(packet.competencyQuestions)
    && packet.competencyQuestions.length < CONSTRUCTION_QUALIFICATION_MIN_CASES
  ) {
    addFinding(
      findings,
      'insufficient-competency-questions',
      'competencyQuestions',
      `Qualification needs at least ${CONSTRUCTION_QUALIFICATION_MIN_CASES} competency questions.`,
    );
  }
  const audienceCoverage = new Set();
  const purposeDecisions = new Set(packet.purposeAuthority?.decisions ?? []);
  const purposeOwnerIds = new Set(
    (packet.purposeAuthority?.owners ?? []).map(({ id }) => id),
  );
  for (const [id, row] of questions) {
    const path = `competencyQuestions.${id}`;
    const scenario = scenarios.get(row.scenarioId);
    if (!scenario || row.audience !== scenario.audience) {
      addFinding(
        findings,
        'cq-scenario-mismatch',
        `${path}.scenarioId`,
        'Every CQ must point to a scenario for the same audience.',
      );
    } else {
      audienceCoverage.add(row.audience);
    }
    if (!nonBlank(row.question)) {
      addFinding(findings, 'invalid-cq-question', `${path}.question`, 'CQ question is required.');
    }
    if (!isRecord(row.owner) || !nonBlank(row.owner.id) || row.owner.authority !== 'human') {
      addFinding(
        findings,
        'cq-owner-not-human',
        `${path}.owner`,
        'Every CQ needs a named human meaning owner.',
      );
    }
    if (row.audience === 'fde') {
      if (!purposeDecisions.has(FDE_AUDIENCE_AUTHORITY_DECISION)) {
        addFinding(
          findings,
          'fde-audience-authority-decision-missing',
          'purposeAuthority.decisions',
          `Using an FDE audience requires the exact project-owned ${FDE_AUDIENCE_AUTHORITY_DECISION} decision.`,
        );
      }
      if (!purposeOwnerIds.has(row.owner?.id)) {
        addFinding(
          findings,
          'fde-audience-authority-owner-unbound',
          `${path}.owner`,
          'Every FDE CQ must be owned by a named project meaning owner.',
        );
      }
    }
    if (
      !isRecord(row.revision)
      || !Number.isInteger(row.revision.version)
      || row.revision.version < 1
      || row.revision.approvedBy !== row.owner?.id
      || !validTimestamp(row.revision.approvedAt)
    ) {
      addFinding(
        findings,
        'invalid-cq-revision',
        `${path}.revision`,
        'CQ revision needs a positive version and approval by its human owner.',
      );
    }
    const expected = row.expectedAnswer;
    if (
      !isRecord(expected)
      || !nonBlank(expected.shape)
      || !QUANTIFIERS.has(expected.quantifier)
      || !uniqueStrings(expected.targets)
      || (expected.quantifier !== 'none' && expected.targets.length === 0)
      || (expected.quantifier === 'one' && expected.targets.length !== 1)
    ) {
      addFinding(
        findings,
        'invalid-expected-answer',
        `${path}.expectedAnswer`,
        'Expected answer needs a shape, quantifier, and a compatible target set.',
      );
    }
    if (!uniqueStrings(row.requiredWitnessKinds) || row.requiredWitnessKinds.length === 0) {
      addFinding(
        findings,
        'invalid-required-witness-kinds',
        `${path}.requiredWitnessKinds`,
        'Every CQ must name one or more required witness kinds.',
      );
    }
    if (
      !isRecord(row.unknownPolicy)
      || typeof row.unknownPolicy.allowed !== 'boolean'
      || !nonBlank(row.unknownPolicy.response)
    ) {
      addFinding(
        findings,
        'invalid-unknown-policy',
        `${path}.unknownPolicy`,
        'Every CQ needs explicit unknown/refusal behavior.',
      );
    }
    if (!Array.isArray(row.examples) || row.examples.length === 0) {
      addFinding(findings, 'missing-cq-example', `${path}.examples`, 'Every CQ needs an exemplar.');
    } else {
      const examples = mapUnique(row.examples, 'id', findings, `${path}.examples`);
      for (const [exampleId, example] of examples) {
        if (!CQ_STATUSES.has(example.expectedStatus)) {
          addFinding(
            findings,
            'invalid-cq-example',
            `${path}.examples.${exampleId}`,
            'CQ exemplars need an expected answer status.',
          );
        }
      }
    }
    if (!Array.isArray(row.counterexamples) || row.counterexamples.length === 0) {
      addFinding(
        findings,
        'missing-cq-counterexample',
        `${path}.counterexamples`,
        'Every CQ needs a counterexample.',
      );
    } else {
      const counterexamples = mapUnique(
        row.counterexamples,
        'id',
        findings,
        `${path}.counterexamples`,
      );
      for (const [counterexampleId, counterexample] of counterexamples) {
        if (!nonBlank(counterexample.mustReject)) {
          addFinding(
            findings,
            'invalid-cq-counterexample',
            `${path}.counterexamples.${counterexampleId}`,
            'CQ counterexamples need an explicit claim to reject.',
          );
        }
      }
    }
  }
  const requiredQuestionAudiences = new Set([
    ...CONSTRUCTION_QUALIFICATION_REQUIRED_AUDIENCES,
    ...[...scenarios.values()].map(({ audience }) => audience),
  ]);
  for (const audience of requiredQuestionAudiences) {
    if (!audienceCoverage.has(audience)) {
      addFinding(
        findings,
        'missing-audience-cq',
        'competencyQuestions',
        `Qualification is missing a CQ for the ${audience} scenario.`,
      );
    }
  }
  return questions;
}

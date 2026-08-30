/**
 * Re-executable ontology-construction qualification contract.
 *
 * This is deliberately not a score. A red semantic, functional, provenance,
 * or pragmatic axis cannot be averaged away by clean structure or cheap tool
 * use. The module validates an evaluator packet and derives categorical output;
 * it neither writes the vault nor approves the meaning it evaluates.
 */

export const CONSTRUCTION_QUALIFICATION_CONTRACT = 'constructionQualification:v1';

export const CONSTRUCTION_QUALIFICATION_AUDIENCES = Object.freeze([
  'executive',
  'employee',
  'fde',
  'agent',
]);

export const CONSTRUCTION_QUALITY_AXES = Object.freeze([
  'semantic',
  'structural',
  'functional',
  'evidence_provenance',
  'pragmatic',
  'maintainability',
  'interoperability',
]);

const CONSTRUCTION_FAILURE_CATEGORIES = Object.freeze([
  'evidence',
  'prompt',
  'ui',
  'missing_primitive',
]);

const SCHEMA_STRING = Object.freeze({ type: 'string', minLength: 1, maxLength: 2000 });
const SCHEMA_ID = Object.freeze({ type: 'string', minLength: 1, maxLength: 500 });
const SCHEMA_DIGEST = Object.freeze({
  type: 'string',
  pattern: '^sha256:[a-f0-9]{64}$',
});
const SCHEMA_STRING_ARRAY = Object.freeze({
  type: 'array',
  maxItems: 500,
  uniqueItems: true,
  items: SCHEMA_ID,
});
const ACTOR_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: SCHEMA_ID,
    authority: SCHEMA_ID,
  },
  required: ['id', 'authority'],
  additionalProperties: false,
});

/**
 * Public MCP input contract. Cross-row semantics and provenance currentness are
 * still evaluated by evaluateConstructionQualification; this schema keeps the
 * transport shape explicit so clients never have to guess an opaque JSON blob.
 */
export const CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Independent construction qualification bound to the exact review-plan and source digests. Human authority and acceptance are declared provenance, not authenticated identity.',
  properties: {
    contract: { type: 'string', enum: [CONSTRUCTION_QUALIFICATION_CONTRACT] },
    qualificationId: SCHEMA_ID,
    subject: {
      type: 'object',
      properties: {
        projectSlug: SCHEMA_ID,
        graphDigest: SCHEMA_DIGEST,
        sourceDigest: SCHEMA_DIGEST,
      },
      required: ['projectSlug', 'graphDigest', 'sourceDigest'],
      additionalProperties: false,
    },
    actors: {
      type: 'object',
      properties: { builder: ACTOR_SCHEMA, evaluator: ACTOR_SCHEMA },
      required: ['builder', 'evaluator'],
      additionalProperties: false,
    },
    purposeAuthority: {
      type: 'object',
      properties: {
        outcome: SCHEMA_STRING,
        decisions: SCHEMA_STRING_ARRAY,
        scope: SCHEMA_STRING,
        nonGoals: SCHEMA_STRING_ARRAY,
        owners: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              id: SCHEMA_ID,
              authority: { type: 'string', enum: ['human'] },
            },
            required: ['id', 'authority'],
            additionalProperties: false,
          },
        },
        sourceRefs: SCHEMA_STRING_ARRAY,
      },
      required: ['outcome', 'decisions', 'scope', 'nonGoals', 'owners', 'sourceRefs'],
      additionalProperties: false,
    },
    scenarios: {
      type: 'array',
      minItems: 4,
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          id: SCHEMA_ID,
          audience: { type: 'string', enum: CONSTRUCTION_QUALIFICATION_AUDIENCES },
          trigger: SCHEMA_STRING,
          decision: SCHEMA_STRING,
          expectedOutcome: SCHEMA_STRING,
        },
        required: ['id', 'audience', 'trigger', 'decision', 'expectedOutcome'],
        additionalProperties: false,
      },
    },
    competencyQuestions: {
      type: 'array',
      minItems: 4,
      maxItems: 200,
      items: {
        type: 'object',
        properties: {
          id: SCHEMA_ID,
          scenarioId: SCHEMA_ID,
          audience: { type: 'string', enum: CONSTRUCTION_QUALIFICATION_AUDIENCES },
          question: SCHEMA_STRING,
          owner: {
            type: 'object',
            properties: {
              id: SCHEMA_ID,
              authority: { type: 'string', enum: ['human'] },
            },
            required: ['id', 'authority'],
            additionalProperties: false,
          },
          revision: {
            type: 'object',
            properties: {
              version: { type: 'integer', minimum: 1 },
              approvedBy: SCHEMA_ID,
              approvedAt: { type: 'string', format: 'date-time' },
            },
            required: ['version', 'approvedBy', 'approvedAt'],
            additionalProperties: false,
          },
          expectedAnswer: {
            type: 'object',
            properties: {
              shape: SCHEMA_ID,
              quantifier: { type: 'string', enum: ['one', 'each', 'all', 'exists', 'none'] },
              targets: SCHEMA_STRING_ARRAY,
            },
            required: ['shape', 'quantifier', 'targets'],
            additionalProperties: false,
          },
          requiredWitnessKinds: SCHEMA_STRING_ARRAY,
          unknownPolicy: {
            type: 'object',
            properties: { allowed: { type: 'boolean' }, response: SCHEMA_STRING },
            required: ['allowed', 'response'],
            additionalProperties: false,
          },
          examples: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              properties: {
                id: SCHEMA_ID,
                expectedStatus: { type: 'string', enum: ['answered', 'partial', 'unknown', 'refused'] },
              },
              required: ['id', 'expectedStatus'],
              additionalProperties: false,
            },
          },
          counterexamples: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              properties: { id: SCHEMA_ID, mustReject: SCHEMA_STRING },
              required: ['id', 'mustReject'],
              additionalProperties: false,
            },
          },
        },
        required: [
          'id',
          'scenarioId',
          'audience',
          'question',
          'owner',
          'revision',
          'expectedAnswer',
          'requiredWitnessKinds',
          'unknownPolicy',
          'examples',
          'counterexamples',
        ],
        additionalProperties: false,
      },
    },
    witnesses: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        type: 'object',
        properties: {
          id: SCHEMA_ID,
          kind: SCHEMA_ID,
          current: { type: 'boolean' },
          provenance: {
            type: 'object',
            properties: { sourceRef: SCHEMA_STRING, digest: SCHEMA_DIGEST },
            required: ['sourceRef', 'digest'],
            additionalProperties: false,
          },
        },
        required: ['id', 'kind', 'current', 'provenance'],
        additionalProperties: false,
      },
    },
    cqResults: {
      type: 'array',
      minItems: 4,
      maxItems: 200,
      items: {
        type: 'object',
        properties: {
          cqId: SCHEMA_ID,
          status: { type: 'string', enum: ['answered', 'partial', 'unknown', 'refused'] },
          witnessRefs: SCHEMA_STRING_ARRAY,
          claimIds: SCHEMA_STRING_ARRAY,
          targetResults: {
            type: 'array',
            maxItems: 500,
            items: {
              type: 'object',
              properties: {
                target: SCHEMA_ID,
                witnessRefs: SCHEMA_STRING_ARRAY,
                claimIds: SCHEMA_STRING_ARRAY,
              },
              required: ['target', 'witnessRefs', 'claimIds'],
              additionalProperties: false,
            },
          },
          gap: SCHEMA_STRING,
        },
        required: ['cqId', 'status', 'witnessRefs', 'claimIds', 'targetResults'],
        additionalProperties: false,
      },
    },
    claims: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        type: 'object',
        properties: {
          id: SCHEMA_ID,
          statement: SCHEMA_STRING,
          status: { type: 'string', enum: ['supported', 'partial', 'unsupported', 'conflict'] },
          witnessRefs: SCHEMA_STRING_ARRAY,
          proposalRefs: {
            ...SCHEMA_STRING_ARRAY,
            minItems: 1,
          },
        },
        required: ['id', 'statement', 'status', 'witnessRefs', 'proposalRefs'],
        additionalProperties: false,
      },
    },
    citationChecks: {
      type: 'array',
      minItems: 1,
      maxItems: 2000,
      items: {
        type: 'object',
        properties: {
          claimId: SCHEMA_ID,
          witnessRef: { anyOf: [SCHEMA_ID, { type: 'null' }] },
          status: { type: 'string', enum: ['verified', 'mismatch', 'missing'] },
        },
        required: ['claimId', 'witnessRef', 'status'],
        additionalProperties: false,
      },
    },
    sourceHiddenTask: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['passed', 'failed', 'unknown', 'not_measured'] },
        evaluatorId: SCHEMA_ID,
        claimIds: SCHEMA_STRING_ARRAY,
      },
      required: ['status', 'evaluatorId', 'claimIds'],
      additionalProperties: false,
    },
    axisResults: {
      type: 'array',
      minItems: 7,
      maxItems: 7,
      items: {
        type: 'object',
        properties: {
          axis: { type: 'string', enum: CONSTRUCTION_QUALITY_AXES },
          status: { type: 'string', enum: ['passed', 'failed', 'unknown', 'not_measured'] },
          evidenceRefs: SCHEMA_STRING_ARRAY,
          findingIds: SCHEMA_STRING_ARRAY,
        },
        required: ['axis', 'status', 'evidenceRefs', 'findingIds'],
        additionalProperties: false,
      },
    },
    diagnostics: {
      type: 'array',
      maxItems: 1000,
      items: {
        type: 'object',
        properties: {
          id: SCHEMA_ID,
          axis: { type: 'string', enum: CONSTRUCTION_QUALITY_AXES },
          category: { type: 'string', enum: CONSTRUCTION_FAILURE_CATEGORIES },
          message: SCHEMA_STRING,
          evidenceRefs: SCHEMA_STRING_ARRAY,
        },
        required: ['id', 'axis', 'category', 'message', 'evidenceRefs'],
        additionalProperties: false,
      },
    },
    regression: {
      type: 'object',
      properties: {
        baselineQualificationId: { anyOf: [SCHEMA_ID, { type: 'null' }] },
        status: { type: 'string', enum: ['passed', 'failed', 'not_applicable'] },
        priorCqIds: SCHEMA_STRING_ARRAY,
        rerunCqIds: SCHEMA_STRING_ARRAY,
        evidenceRefs: SCHEMA_STRING_ARRAY,
      },
      required: ['baselineQualificationId', 'status', 'priorCqIds', 'rerunCqIds', 'evidenceRefs'],
      additionalProperties: false,
    },
    resourceUse: {
      type: 'object',
      properties: {
        durationMs: { type: 'integer', minimum: 0 },
        toolCalls: { type: 'integer', minimum: 0 },
        inputTokens: { type: 'integer', minimum: 0 },
        outputTokens: { type: 'integer', minimum: 0 },
        estimatedCostUsd: { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] },
      },
      required: ['durationMs', 'toolCalls', 'inputTokens', 'outputTokens', 'estimatedCostUsd'],
      additionalProperties: false,
    },
    acceptance: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['accepted', 'rejected', 'pending'] },
        decidedBy: SCHEMA_ID,
        authority: { type: 'string', enum: ['human'] },
        decidedAt: { type: 'string', format: 'date-time' },
        planDigest: SCHEMA_DIGEST,
        planRevision: { type: 'integer', minimum: 1 },
        acceptedGapIds: SCHEMA_STRING_ARRAY,
      },
      required: [
        'decision',
        'decidedBy',
        'authority',
        'decidedAt',
        'planDigest',
        'planRevision',
        'acceptedGapIds',
      ],
      additionalProperties: false,
    },
  },
  required: [
    'contract',
    'qualificationId',
    'subject',
    'actors',
    'purposeAuthority',
    'scenarios',
    'competencyQuestions',
    'witnesses',
    'cqResults',
    'claims',
    'citationChecks',
    'sourceHiddenTask',
    'axisResults',
    'diagnostics',
    'regression',
    'resourceUse',
    'acceptance',
  ],
  additionalProperties: false,
});

const CQ_STATUSES = new Set(['answered', 'partial', 'unknown', 'refused']);
const QUANTIFIERS = new Set(['one', 'each', 'all', 'exists', 'none']);
const AXIS_STATUSES = new Set(['passed', 'failed', 'unknown', 'not_measured']);
const CLAIM_STATUSES = new Set(['supported', 'partial', 'unsupported', 'conflict']);
const CITATION_STATUSES = new Set(['verified', 'mismatch', 'missing']);
const SOURCE_HIDDEN_STATUSES = new Set(['passed', 'failed', 'unknown', 'not_measured']);
const ACCEPTANCE_DECISIONS = new Set(['accepted', 'rejected', 'pending']);
const REGRESSION_STATUSES = new Set(['passed', 'failed', 'not_applicable']);
const FAILURE_CATEGORIES = new Set(CONSTRUCTION_FAILURE_CATEGORIES);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlank(value, maxLength = 1000) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value;
}

function validTimestamp(value) {
  if (!nonBlank(value, 100)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every((item) => nonBlank(item, 500))
    && new Set(value).size === value.length;
}

function portableSourceRef(value) {
  return nonBlank(value, 1000)
    && !value.startsWith('/')
    && !value.startsWith('~')
    && !value.startsWith('file:')
    && !/^[A-Za-z]:[\\/]/.test(value);
}

function digest(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function addFinding(findings, code, path, message, options = {}) {
  findings.push({
    code,
    severity: options.severity ?? 'error',
    path,
    message,
    ...(options.category ? { category: options.category } : {}),
    ...(options.refs?.length ? { refs: [...options.refs] } : {}),
  });
}

function countBy(rows, statuses) {
  return Object.fromEntries([...statuses].map((status) => [
    status,
    rows.filter((row) => row?.status === status).length,
  ]));
}

function mapUnique(rows, key, findings, path) {
  const result = new Map();
  if (!Array.isArray(rows)) {
    addFinding(findings, 'invalid-array', path, `${path} must be an array.`);
    return result;
  }
  rows.forEach((row, index) => {
    const value = row?.[key];
    if (!nonBlank(value) || result.has(value)) {
      addFinding(
        findings,
        'invalid-or-duplicate-id',
        `${path}[${index}].${key}`,
        `${path} rows need unique non-empty ${key} values.`,
      );
      return;
    }
    result.set(value, row);
  });
  return result;
}

function validateRoot(packet, findings) {
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

function validatePurposeAuthority(packet, findings) {
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

function validateScenarios(packet, findings) {
  const scenarios = mapUnique(packet.scenarios, 'id', findings, 'scenarios');
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
  for (const audience of CONSTRUCTION_QUALIFICATION_AUDIENCES) {
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

function validateQuestions(packet, scenarios, findings) {
  const questions = mapUnique(
    packet.competencyQuestions,
    'id',
    findings,
    'competencyQuestions',
  );
  const audienceCoverage = new Set();
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
  for (const audience of CONSTRUCTION_QUALIFICATION_AUDIENCES) {
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

function validateWitnesses(packet, findings) {
  const witnesses = mapUnique(packet.witnesses, 'id', findings, 'witnesses');
  for (const [id, row] of witnesses) {
    if (
      !nonBlank(row.kind)
      || typeof row.current !== 'boolean'
      || !isRecord(row.provenance)
      || !portableSourceRef(row.provenance.sourceRef)
      || !digest(row.provenance.digest)
    ) {
      addFinding(
        findings,
        'invalid-witness',
        `witnesses.${id}`,
        'Witnesses need a kind, explicit currentness, and portable digest-bound provenance.',
      );
    }
  }
  return witnesses;
}

function validateClaims(packet, witnesses, findings) {
  const claims = mapUnique(packet.claims, 'id', findings, 'claims');
  for (const [id, row] of claims) {
    if (
      !CLAIM_STATUSES.has(row.status)
      || !nonBlank(row.statement, 2000)
      || !uniqueStrings(row.witnessRefs)
      || !uniqueStrings(row.proposalRefs)
      || row.proposalRefs.length === 0
    ) {
      addFinding(findings, 'invalid-claim', `claims.${id}`, 'Claim status, witness refs, and proposal refs are invalid.');
      continue;
    }
    for (const ref of row.witnessRefs) {
      if (!witnesses.has(ref)) {
        addFinding(findings, 'unknown-witness-ref', `claims.${id}.witnessRefs`, `Unknown witness: ${ref}`);
      }
    }
    if (row.status === 'supported' && row.witnessRefs.length === 0) {
      addFinding(
        findings,
        'unsupported-supported-claim',
        `claims.${id}`,
        'A supported claim needs at least one witness.',
      );
    }
    if (
      row.status === 'supported'
      && row.witnessRefs.some((ref) => witnesses.get(ref)?.current !== true)
    ) {
      addFinding(
        findings,
        'stale-supported-claim',
        `claims.${id}`,
        'A supported claim cannot depend on a stale witness.',
        { severity: 'failure', category: 'evidence', refs: row.witnessRefs },
      );
    }
  }
  return claims;
}

function validateCitationChecks(packet, claims, witnesses, findings) {
  if (!Array.isArray(packet.citationChecks)) {
    addFinding(findings, 'invalid-array', 'citationChecks', 'citationChecks must be an array.');
    return [];
  }
  packet.citationChecks.forEach((row, index) => {
    const path = `citationChecks[${index}]`;
    const claim = claims.get(row?.claimId);
    if (!claim || !CITATION_STATUSES.has(row?.status)) {
      addFinding(findings, 'invalid-citation-check', path, 'Citation check must name a claim and status.');
      return;
    }
    if (row.status === 'missing') {
      if (row.witnessRef !== null) {
        addFinding(findings, 'invalid-missing-citation', `${path}.witnessRef`, 'Missing citation uses null.');
      }
    } else if (!witnesses.has(row.witnessRef)) {
      addFinding(findings, 'unknown-witness-ref', `${path}.witnessRef`, 'Citation witness is unknown.');
    } else if (!claim.witnessRefs.includes(row.witnessRef)) {
      addFinding(
        findings,
        'citation-outside-claim',
        `${path}.witnessRef`,
        'A citation check must verify a witness carried by the exact claim.',
      );
    } else if (row.status === 'verified' && witnesses.get(row.witnessRef)?.current !== true) {
      addFinding(
        findings,
        'stale-verified-citation',
        `${path}.witnessRef`,
        'A verified citation must point to a current witness.',
        { severity: 'failure', category: 'evidence', refs: [row.witnessRef] },
      );
    }
  });
  for (const id of claims.keys()) {
    if (!packet.citationChecks.some(({ claimId }) => claimId === id)) {
      addFinding(
        findings,
        'missing-claim-citation-check',
        'citationChecks',
        `Claim ${id} has no citation check.`,
        { severity: 'failure', category: 'evidence' },
      );
    }
  }
  return packet.citationChecks;
}

function validateDiagnostics(packet, witnesses, findings) {
  const diagnostics = mapUnique(packet.diagnostics, 'id', findings, 'diagnostics');
  for (const [id, row] of diagnostics) {
    if (
      !CONSTRUCTION_QUALITY_AXES.includes(row.axis)
      || !FAILURE_CATEGORIES.has(row.category)
      || !nonBlank(row.message)
      || !uniqueStrings(row.evidenceRefs)
    ) {
      addFinding(
        findings,
        'invalid-diagnostic',
        `diagnostics.${id}`,
        'Diagnostic needs an axis, supported category, message, and evidence refs.',
      );
      continue;
    }
    for (const ref of row.evidenceRefs) {
      if (!witnesses.has(ref)) {
        addFinding(findings, 'unknown-witness-ref', `diagnostics.${id}.evidenceRefs`, `Unknown witness: ${ref}`);
      }
    }
  }
  return diagnostics;
}

function validateAxisResults(packet, witnesses, diagnostics, findings) {
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

function validateCqResults(packet, questions, witnesses, claims, findings) {
  const results = mapUnique(packet.cqResults, 'cqId', findings, 'cqResults');
  const normalized = [];
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
    let status;
    if (row.status === 'answered') {
      status = coverageSatisfied && requiredWitnessesPresent && claimsSupported
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

function validateSourceHiddenTask(packet, claims, findings) {
  const task = packet.sourceHiddenTask;
  if (
    !isRecord(task)
    || !SOURCE_HIDDEN_STATUSES.has(task.status)
    || !nonBlank(task.evaluatorId)
    || !uniqueStrings(task.claimIds)
    || task.evaluatorId !== packet.actors?.evaluator?.id
  ) {
    addFinding(
      findings,
      'invalid-source-hidden-task',
      'sourceHiddenTask',
      'Source-hidden task must use the named evaluator and a categorical status.',
    );
    return { status: 'not_measured', claimIds: [] };
  }
  for (const id of task.claimIds) {
    if (!claims.has(id)) {
      addFinding(findings, 'unknown-claim-ref', 'sourceHiddenTask.claimIds', `Unknown claim: ${id}`);
    }
  }
  if (task.status === 'passed' && task.claimIds.length === 0) {
    addFinding(
      findings,
      'empty-source-hidden-task',
      'sourceHiddenTask.claimIds',
      'A passing source-hidden task must evaluate at least one claim.',
    );
  }
  const missingClaimIds = [...claims.keys()].filter((id) => !task.claimIds.includes(id));
  if (task.status === 'passed' && missingClaimIds.length > 0) {
    addFinding(
      findings,
      'incomplete-source-hidden-claim-coverage',
      'sourceHiddenTask.claimIds',
      'A passing source-hidden task must evaluate every qualification claim.',
      { severity: 'failure', category: 'evidence' },
    );
    return { ...task, status: 'failed', missingClaimIds };
  }
  return { ...task, missingClaimIds };
}

function validateResourceUse(packet, findings) {
  const resourceUse = packet.resourceUse;
  const integerKeys = ['durationMs', 'toolCalls', 'inputTokens', 'outputTokens'];
  if (
    !isRecord(resourceUse)
    || integerKeys.some((key) => !Number.isInteger(resourceUse[key]) || resourceUse[key] < 0)
    || !(
      resourceUse.estimatedCostUsd === null
      || (Number.isFinite(resourceUse.estimatedCostUsd) && resourceUse.estimatedCostUsd >= 0)
    )
  ) {
    addFinding(
      findings,
      'invalid-resource-use',
      'resourceUse',
      'Time, calls, tokens, and optional cost must be explicit non-negative measurements.',
    );
    return null;
  }
  return { ...resourceUse };
}

function validateAcceptance(packet, findings) {
  const acceptance = packet.acceptance;
  if (
    !isRecord(acceptance)
    || !ACCEPTANCE_DECISIONS.has(acceptance.decision)
    || !nonBlank(acceptance.decidedBy)
    || acceptance.authority !== 'human'
    || !validTimestamp(acceptance.decidedAt)
    || !digest(acceptance.planDigest)
    || !Number.isInteger(acceptance.planRevision)
    || acceptance.planRevision < 1
    || !uniqueStrings(acceptance.acceptedGapIds)
  ) {
    addFinding(
      findings,
      'invalid-human-acceptance',
      'acceptance',
      'Acceptance needs declared human provenance, a timestamp, an exact plan digest/revision, and explicit accepted gap ids.',
    );
    return null;
  }
  if (acceptance.decidedBy === packet.actors?.builder?.id) {
    addFinding(
      findings,
      'maker-self-approval',
      'acceptance.decidedBy',
      'The builder cannot accept its own qualification.',
    );
  }
  return { ...acceptance };
}

function validateRegression(packet, questions, witnesses, axisRows, findings) {
  const regression = packet.regression;
  if (
    !isRecord(regression)
    || !(regression.baselineQualificationId === null || nonBlank(regression.baselineQualificationId))
    || !REGRESSION_STATUSES.has(regression.status)
    || !uniqueStrings(regression.priorCqIds)
    || !uniqueStrings(regression.rerunCqIds)
    || !uniqueStrings(regression.evidenceRefs)
    || regression.evidenceRefs.length === 0
  ) {
    addFinding(
      findings,
      'invalid-prior-cq-regression',
      'regression',
      'Regression needs a baseline or explicit cold start, a categorical result, CQ sets, and current regression evidence.',
    );
    return null;
  }

  const evidenceValid = regression.evidenceRefs.every((ref) => {
    const witness = witnesses.get(ref);
    return witness?.kind === 'regression' && witness.current === true;
  });
  if (!evidenceValid) {
    addFinding(
      findings,
      'invalid-prior-cq-regression-evidence',
      'regression.evidenceRefs',
      'Regression evidence must reference current witnesses whose kind is regression.',
    );
  }

  if (regression.baselineQualificationId === null) {
    if (
      regression.status !== 'not_applicable'
      || regression.priorCqIds.length > 0
      || regression.rerunCqIds.length > 0
    ) {
      addFinding(
        findings,
        'invalid-cold-start-regression',
        'regression',
        'A cold start uses not_applicable with empty prior and rerun CQ sets.',
      );
    }
  } else {
    const prior = new Set(regression.priorCqIds);
    const rerun = new Set(regression.rerunCqIds);
    if (
      regression.status === 'not_applicable'
      || prior.size === 0
      || [...prior].some((id) => !questions.has(id) || !rerun.has(id))
      || [...rerun].some((id) => !prior.has(id))
    ) {
      addFinding(
        findings,
        'incomplete-prior-cq-regression',
        'regression',
        'Every prior CQ must still exist in the approved CQ set and be rerun exactly once.',
      );
    }
  }

  if (regression.status === 'failed' && axisRows.get('maintainability')?.status === 'passed') {
    addFinding(
      findings,
      'regression-axis-conflict',
      'axisResults.maintainability',
      'Maintainability cannot pass while the prior-CQ regression failed.',
    );
  }
  return structuredClone(regression);
}

function normalizedAxes(
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

function accuracy(correct, total) {
  return {
    correct,
    total,
    rate: total === 0 ? null : correct / total,
  };
}

/**
 * Validate and categorically evaluate a construction-qualification packet.
 * Unknown or red evidence stays visible; no weighted or aggregate score exists.
 */
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

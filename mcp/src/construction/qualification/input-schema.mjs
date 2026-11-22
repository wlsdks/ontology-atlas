import {
  CONSTRUCTION_FAILURE_CATEGORIES,
  CONSTRUCTION_QUALIFICATION_AUDIENCES,
  CONSTRUCTION_QUALIFICATION_CONTRACT,
  CONSTRUCTION_QUALIFICATION_MIN_CASES,
  CONSTRUCTION_QUALITY_AXES,
} from './vocabulary.mjs';

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
 * Public MCP input contract: the transport shape explicit, so clients never guess
 * an opaque blob. Cross-row semantics are checked by evaluateConstructionQualification.
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
        decisions: { ...SCHEMA_STRING_ARRAY, minItems: 1 },
        scope: SCHEMA_STRING,
        nonGoals: { ...SCHEMA_STRING_ARRAY, minItems: 1 },
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
        sourceRefs: { ...SCHEMA_STRING_ARRAY, minItems: 1 },
      },
      required: ['outcome', 'decisions', 'scope', 'nonGoals', 'owners', 'sourceRefs'],
      additionalProperties: false,
    },
    scenarios: {
      type: 'array',
      description:
        'At least four decision scenarios across the required executive, employee, and agent audiences. FDE is optional and usable only when purpose authority declares audience:fde and current project-owned audience-authority:fde evidence is carried through its CQ, claim, and verified citation.',
      minItems: CONSTRUCTION_QUALIFICATION_MIN_CASES,
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
      description:
        'At least four human-approved CQs. Every present FDE CQ must be owned by a named project meaning owner and require current audience-authority:fde evidence from a declared purpose source with an exact verified claim citation.',
      minItems: CONSTRUCTION_QUALIFICATION_MIN_CASES,
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
      minItems: CONSTRUCTION_QUALIFICATION_MIN_CASES,
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

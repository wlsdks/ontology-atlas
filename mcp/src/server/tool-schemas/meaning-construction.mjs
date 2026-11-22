import { WRITE_RELATION_TYPE_VALUES } from '../../ontology-engine.mjs';
import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';

const MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES = Object.freeze({
  slug: NON_BLANK_STRING_SCHEMA,
  title: NON_BLANK_STRING_SCHEMA,
  definition: NON_BLANK_STRING_SCHEMA,
  path: NON_BLANK_STRING_SCHEMA,
  includes: {
    type: 'array',
    maxItems: 20,
    uniqueItems: true,
    items: NON_BLANK_STRING_SCHEMA,
  },
  excludes: {
    type: 'array',
    maxItems: 20,
    uniqueItems: true,
    items: NON_BLANK_STRING_SCHEMA,
  },
  uncertainty: NON_BLANK_STRING_SCHEMA,
  evidence: {
    type: 'array',
    minItems: 1,
    maxItems: 20,
    uniqueItems: true,
    items: NON_BLANK_STRING_SCHEMA,
  },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
});
const MEANING_PROPOSAL_ELEMENT_INPUT_PROPERTIES = Object.freeze({
  ...MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
  evidence: {
    ...MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES.evidence,
    description:
      'May append reviewed navigation:<primary|supporting|test>:<path>#<symbol> strings (limits 1/1/3) to an ordinary citation; they are current structural navigation, never behavior proof.',
  },
  domain: NON_BLANK_STRING_SCHEMA,
});
const COMPETENCY_RELATION_WITNESS_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    from: NON_BLANK_STRING_SCHEMA,
    to: NON_BLANK_STRING_SCHEMA,
    type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
  },
  required: ['from', 'to', 'type'],
  additionalProperties: false,
});
const COMPETENCY_WITNESSES_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      maxItems: 200,
      uniqueItems: true,
      items: NON_BLANK_STRING_SCHEMA,
    },
    relations: {
      type: 'array',
      maxItems: 200,
      items: COMPETENCY_RELATION_WITNESS_SCHEMA,
    },
    evidence: {
      type: 'array',
      maxItems: 100,
      uniqueItems: true,
      items: NON_BLANK_STRING_SCHEMA,
    },
    paths: {
      type: 'array',
      maxItems: 100,
      uniqueItems: true,
      items: NON_BLANK_STRING_SCHEMA,
    },
  },
  required: ['concepts', 'relations', 'evidence', 'paths'],
  additionalProperties: false,
});
const COMPETENCY_ANSWER_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    answer: NON_BLANK_STRING_SCHEMA,
    status: {
      type: 'string',
      enum: ['answered', 'partial', 'visible-gap'],
    },
    gap: NON_BLANK_STRING_SCHEMA,
    witnesses: COMPETENCY_WITNESSES_SCHEMA,
  },
  required: ['answer', 'status', 'witnesses'],
  additionalProperties: false,
});
const COMPETENCY_ANSWERS_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    scope: COMPETENCY_ANSWER_SCHEMA,
    domains: COMPETENCY_ANSWER_SCHEMA,
    abilities: COMPETENCY_ANSWER_SCHEMA,
    evidence: COMPETENCY_ANSWER_SCHEMA,
    impact: COMPETENCY_ANSWER_SCHEMA,
  },
  required: ['scope', 'domains', 'abilities', 'evidence', 'impact'],
  additionalProperties: false,
});
const MEANING_PROPOSAL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    project: {
      type: 'object',
      properties: MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
      required: ['slug', 'title', 'definition', 'evidence', 'confidence'],
      additionalProperties: false,
    },
    domains: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        properties: MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
        required: ['slug', 'title', 'definition', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    capabilities: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          ...MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
          domain: NON_BLANK_STRING_SCHEMA,
        },
        required: ['slug', 'title', 'definition', 'evidence', 'confidence', 'domain'],
        additionalProperties: false,
      },
    },
    elements: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: MEANING_PROPOSAL_ELEMENT_INPUT_PROPERTIES,
        required: [
          'slug',
          'title',
          'definition',
          'evidence',
          'confidence',
          'domain',
          'path',
        ],
        additionalProperties: false,
      },
    },
    relations: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        properties: {
          from: NON_BLANK_STRING_SCHEMA,
          to: NON_BLANK_STRING_SCHEMA,
          type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
          why: { type: 'string', minLength: 1, maxLength: 300 },
          evidence: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            items: NON_BLANK_STRING_SCHEMA,
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['from', 'to', 'type', 'why', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    competencyAnswers: COMPETENCY_ANSWERS_SCHEMA,
  },
  required: ['project', 'domains', 'capabilities', 'elements', 'relations', 'competencyAnswers'],
  additionalProperties: false,
});
const EXTRACTION_CONTRACT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    standard: NON_BLANK_STRING_SCHEMA,
    status: {
      type: 'string',
      enum: [
        'grounded-in-existing-ontology',
        'evidence-gathering',
        'scope-discovery-required',
      ],
    },
    assertionPolicy: {
      type: 'object',
      properties: {
        sourceFacts: { type: 'string', enum: ['observed'] },
        readmeAndFolderMeanings: { type: 'string', enum: ['proposed'] },
        persistedOntologyMeanings: { type: 'string', enum: ['shared'] },
        automaticBusinessAssertions: { type: 'integer', enum: [0] },
        humanApprovalRequired: { type: 'boolean', enum: [true] },
      },
      required: [
        'sourceFacts',
        'readmeAndFolderMeanings',
        'persistedOntologyMeanings',
        'automaticBusinessAssertions',
        'humanApprovalRequired',
      ],
      additionalProperties: false,
    },
    competencyQuestions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            enum: ['scope', 'domains', 'abilities', 'evidence', 'impact'],
          },
          type: {
            type: 'string',
            enum: ['scoping', 'validation', 'relationship'],
          },
          question: NON_BLANK_STRING_SCHEMA,
          priority: { type: 'string', enum: ['core'] },
          requiredWitnesses: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['concepts', 'relations', 'evidence', 'paths'],
            },
          },
        },
        required: ['id', 'type', 'question', 'priority', 'requiredWitnesses'],
        additionalProperties: false,
      },
    },
    qualityGates: {
      type: 'object',
      properties: {
        scopeCandidateAvailable: { type: 'boolean' },
        sharedBusinessConceptsAvailable: { type: 'boolean' },
        proposedBusinessConcepts: { type: 'integer', minimum: 0 },
        implementationEvidenceAvailable: { type: 'boolean' },
        semanticEvidenceAvailable: { type: 'boolean' },
        semanticEvidenceReviewRequired: { type: 'integer', minimum: 0 },
        typedRelationsProposed: { type: 'integer', minimum: 0 },
        provenanceAttached: { type: 'boolean' },
        uncertaintyExplicit: { type: 'boolean', enum: [true] },
        approvalRequired: { type: 'boolean', enum: [true] },
      },
      required: [
        'scopeCandidateAvailable',
        'sharedBusinessConceptsAvailable',
        'proposedBusinessConcepts',
        'implementationEvidenceAvailable',
        'semanticEvidenceAvailable',
        'semanticEvidenceReviewRequired',
        'typedRelationsProposed',
        'provenanceAttached',
        'uncertaintyExplicit',
        'approvalRequired',
      ],
      additionalProperties: false,
    },
    limitations: {
      type: 'array',
      minItems: 1,
      items: NON_BLANK_STRING_SCHEMA,
    },
    nextStep: NON_BLANK_STRING_SCHEMA,
  },
  required: [
    'standard',
    'status',
    'assertionPolicy',
    'competencyQuestions',
    'qualityGates',
    'limitations',
    'nextStep',
  ],
  additionalProperties: false,
});

const MEANING_ASSESSMENT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['meaningAssessment:v1'] },
    projectSlug: { type: ['string', 'null'] },
    status: {
      type: 'string',
      enum: ['verified_current', 'review_required', 'needs_evidence', 'invalid'],
    },
    dimensions: {
      type: 'object',
      properties: {
        structure: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ready', 'needs_structure', 'invalid'] },
            basis: { type: 'string', enum: ['structure_only'] },
          },
          required: ['status', 'basis'],
          additionalProperties: false,
        },
        competency: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['answered', 'needs_evidence'] },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: NON_BLANK_STRING_SCHEMA,
                  status: { type: 'string', enum: ['answered', 'partial', 'visible-gap', 'unassessed'] },
                  witnessStatus: { type: 'string', enum: ['resolved', 'missing', 'unavailable'] },
                },
                required: ['id', 'status', 'witnessStatus'],
                additionalProperties: false,
              },
            },
          },
          required: ['status', 'questions'],
          additionalProperties: false,
        },
        source: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['not_measured', 'needs_evidence', 'review_required', 'invalid', 'verified_current'],
            },
            currentness: { type: 'string', enum: ['current', 'stale', 'unavailable'] },
          },
          required: ['status', 'currentness'],
          additionalProperties: false,
        },
      },
      required: ['structure', 'competency', 'source'],
      additionalProperties: false,
    },
    topGap: {
      type: ['object', 'null'],
      properties: {
        dimension: NON_BLANK_STRING_SCHEMA,
        id: NON_BLANK_STRING_SCHEMA,
        questionId: NON_BLANK_STRING_SCHEMA,
      },
      required: ['dimension', 'id'],
      additionalProperties: false,
    },
    nextAction: {
      type: 'object',
      properties: {
        id: NON_BLANK_STRING_SCHEMA,
        target: NON_BLANK_STRING_SCHEMA,
      },
      required: ['id'],
      additionalProperties: false,
    },
    provenance: {
      type: 'object',
      properties: {
        evaluator: NON_BLANK_STRING_SCHEMA,
        graphHash: { type: ['string', 'null'] },
        competencyContract: { type: ['string', 'null'] },
        competencyEvaluator: { type: ['string', 'null'] },
        competencyGraphHash: { type: ['string', 'null'] },
        witnessInventoryContract: { type: ['string', 'null'] },
        witnessInventoryGraphHash: { type: ['string', 'null'] },
        witnessInventorySourceFingerprint: { type: ['string', 'null'] },
        sourceGraphHash: { type: ['string', 'null'] },
        sourceReceiptContractVersion: { type: ['integer', 'null'] },
        sourceId: { type: ['string', 'null'] },
        sourceRevision: { type: ['string', 'null'] },
        sourceFingerprint: { type: ['string', 'null'] },
        sourceMeasuredAt: { type: ['string', 'null'] },
        sourceGapId: { type: ['string', 'null'] },
      },
      required: [
        'evaluator',
        'graphHash',
        'competencyContract',
        'competencyEvaluator',
        'competencyGraphHash',
        'witnessInventoryContract',
        'witnessInventoryGraphHash',
        'witnessInventorySourceFingerprint',
        'sourceGraphHash',
        'sourceReceiptContractVersion',
        'sourceId',
        'sourceRevision',
        'sourceFingerprint',
        'sourceMeasuredAt',
        'sourceGapId',
      ],
      additionalProperties: false,
    },
  },
  required: ['contract', 'projectSlug', 'status', 'dimensions', 'topGap', 'nextAction', 'provenance'],
  additionalProperties: false,
});

export {
  MEANING_PROPOSAL_INPUT_SCHEMA,
  EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
  MEANING_ASSESSMENT_OUTPUT_SCHEMA,
};

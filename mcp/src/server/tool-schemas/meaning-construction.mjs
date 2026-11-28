import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';

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
  MEANING_ASSESSMENT_OUTPUT_SCHEMA,
};

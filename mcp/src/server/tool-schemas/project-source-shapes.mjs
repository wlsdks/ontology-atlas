import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';

const PROJECT_SOURCE_GAP_SCHEMA = Object.freeze({
  type: ['object', 'null'],
  properties: {
    id: {
      type: 'string',
      enum: [
        'source_unbound',
        'multiple_active_sources',
        'receipt_missing',
        'receipt_malformed',
        'source_role_evidence_missing',
        'declared_source_path_missing',
        'source_inventory_truncated',
        'ontology_changed',
        'source_changed',
      ],
    },
    nodeSlug: { type: 'string' },
  },
  required: ['id'],
  additionalProperties: false,
});
const PROJECT_SOURCE_ACTION_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: {
      type: 'string',
      enum: [
        'connect_source',
        'repair_source_binding',
        'measure_source',
        'record_source_role',
        'repair_source_path',
        'review_inventory_limit',
        'remeasure_source',
        'use_current_evidence',
      ],
    },
    target: { type: 'string' },
  },
  required: ['id'],
  additionalProperties: false,
});
const PROJECT_SOURCE_WITNESS_SUMMARY_SCHEMA = Object.freeze({
  type: 'object',
  description: 'How many of the project\'s declared `path:` claims the folder holds: `supported` of `total`.',
  properties: {
    total: { type: 'integer', minimum: 0 },
    supported: { type: 'integer', minimum: 0 },
    missing: { type: 'integer', minimum: 0 },
  },
  required: ['total', 'supported', 'missing'],
  additionalProperties: false,
});
const PROJECT_SOURCE_BINDING_VIEW_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    rootPath: NON_BLANK_STRING_SCHEMA,
    kind: { type: 'string', enum: ['git', 'folder'] },
    sourceId: NON_BLANK_STRING_SCHEMA,
    dirty: { type: ['boolean', 'null'] },
    truncated: { type: 'boolean' },
    inventoryFiles: { type: 'integer', minimum: 0 },
  },
  required: ['rootPath', 'kind', 'sourceId', 'dirty', 'truncated', 'inventoryFiles'],
  additionalProperties: false,
});
const PROJECT_SOURCE_NEXT_CALL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    tool: { type: 'string', enum: ['connect_project_source', 'disconnect_project_source'] },
    arguments: { type: 'object', additionalProperties: true },
  },
  required: ['tool', 'arguments'],
  additionalProperties: false,
});

export {
  PROJECT_SOURCE_ACTION_SCHEMA,
  PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
  PROJECT_SOURCE_GAP_SCHEMA,
  PROJECT_SOURCE_NEXT_CALL_SCHEMA,
  PROJECT_SOURCE_WITNESS_SUMMARY_SCHEMA,
};

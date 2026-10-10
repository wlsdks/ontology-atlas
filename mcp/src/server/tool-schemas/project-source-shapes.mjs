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
const PROJECT_SOURCE_RECEIPT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contractVersion: { type: 'integer', enum: [1] },
    projectSlug: NON_BLANK_STRING_SCHEMA,
    sourceId: NON_BLANK_STRING_SCHEMA,
    sourceKind: { type: 'string', enum: ['git', 'folder'] },
    sourceRevision: NON_BLANK_STRING_SCHEMA,
    sourceFingerprint: NON_BLANK_STRING_SCHEMA,
    graphHash: NON_BLANK_STRING_SCHEMA,
    measuredAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['needs_evidence', 'review_required', 'verified_current'] },
    currentness: { type: 'string', enum: ['current'] },
    topGap: PROJECT_SOURCE_GAP_SCHEMA,
    nextAction: PROJECT_SOURCE_ACTION_SCHEMA,
    witnessSummary: {
      type: 'object',
      properties: {
        total: { type: 'integer', minimum: 0 },
        supported: { type: 'integer', minimum: 0 },
        missing: { type: 'integer', minimum: 0 },
      },
      required: ['total', 'supported', 'missing'],
      additionalProperties: false,
    },
    witnesses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: NON_BLANK_STRING_SCHEMA,
          nodeSlug: NON_BLANK_STRING_SCHEMA,
          role: NON_BLANK_STRING_SCHEMA,
          path: NON_BLANK_STRING_SCHEMA,
          supported: { type: 'boolean' },
        },
        required: ['id', 'nodeSlug', 'role', 'path', 'supported'],
        additionalProperties: false,
      },
    },
    diagnostics: {
      type: 'object',
      properties: {
        dirty: { type: ['boolean', 'null'] },
        truncated: { type: 'boolean' },
      },
      required: ['dirty', 'truncated'],
      additionalProperties: false,
    },
  },
  required: [
    'contractVersion', 'projectSlug', 'sourceId', 'sourceKind',
    'sourceRevision', 'sourceFingerprint', 'graphHash', 'measuredAt',
    'status', 'currentness', 'topGap', 'nextAction', 'witnessSummary',
    'witnesses', 'diagnostics',
  ],
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
const PROJECT_SOURCE_VIEW_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contractVersion: { type: 'integer', enum: [1] },
    projectSlug: NON_BLANK_STRING_SCHEMA,
    status: { type: 'string', enum: ['not_measured', 'invalid', 'review_required', 'needs_evidence', 'verified_current'] },
    currentness: { type: 'string', enum: ['unavailable', 'stale', 'current'] },
    measuredAt: { type: ['string', 'null'], format: 'date-time' },
    topGap: PROJECT_SOURCE_GAP_SCHEMA,
    nextAction: PROJECT_SOURCE_ACTION_SCHEMA,
    bindingCardinality: { type: 'integer', minimum: 0 },
    receipt: { anyOf: [PROJECT_SOURCE_RECEIPT_SCHEMA, { type: 'null' }] },
  },
  required: [
    'contractVersion', 'projectSlug', 'status', 'currentness', 'measuredAt',
    'topGap', 'nextAction', 'bindingCardinality', 'receipt',
  ],
  additionalProperties: false,
});
const PROJECT_SOURCE_TOOL_CALL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    name: NON_BLANK_STRING_SCHEMA,
    arguments: { type: 'object', additionalProperties: true },
  },
  required: ['name', 'arguments'],
  additionalProperties: false,
});
const PROJECT_SOURCE_CLI_CALL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    command: NON_BLANK_STRING_SCHEMA,
    args: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
  },
  required: ['command', 'args'],
  additionalProperties: false,
});
const PROJECT_SOURCE_UNDO_SCHEMA = Object.freeze({
  type: ['object', 'null'],
  properties: {
    tool: PROJECT_SOURCE_TOOL_CALL_SCHEMA,
    cli: PROJECT_SOURCE_CLI_CALL_SCHEMA,
  },
  required: ['tool', 'cli'],
  additionalProperties: false,
});
const PROJECT_SOURCE_REMEDY_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['projectSourceRemedy:v1'] },
    actionId: { type: ['string', 'null'] },
    resolvable: { type: 'boolean' },
    automatable: { type: 'boolean' },
    requiresHuman: { type: 'string', enum: ['none', 'path_choice', 'authoring'] },
    requiresConfirm: { type: 'boolean' },
    inferRoot: { type: 'boolean' },
    tool: { anyOf: [PROJECT_SOURCE_TOOL_CALL_SCHEMA, { type: 'null' }] },
    cli: { anyOf: [PROJECT_SOURCE_CLI_CALL_SCHEMA, { type: 'null' }] },
    undo: PROJECT_SOURCE_UNDO_SCHEMA,
  },
  required: [
    'contract', 'actionId', 'resolvable', 'automatable', 'requiresHuman',
    'requiresConfirm', 'inferRoot', 'tool', 'cli', 'undo',
  ],
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
  PROJECT_SOURCE_RECEIPT_SCHEMA,
  PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
  PROJECT_SOURCE_VIEW_SCHEMA,
  PROJECT_SOURCE_REMEDY_SCHEMA,
  PROJECT_SOURCE_NEXT_CALL_SCHEMA,
};

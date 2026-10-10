import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../../ontology-engine.mjs';
import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';
import { RELATION_ARRAY_PATCH_SCHEMA } from './vault-node-shapes.mjs';

const POST_WRITE_MAINTENANCE_GUIDANCE =
  'compact `postWriteMaintenance` (maintenance_plan) with count-safe `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page `nextExecutableAction` / `nextReviewAction` pointers';
const COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS = Object.freeze(['add_concept', 'add_relation', 'patch_concept']);
const COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object',
      properties: {
        slug: NON_BLANK_STRING_SCHEMA,
        kind: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
        title: NON_BLANK_STRING_SCHEMA,
      },
      required: ['slug', 'kind', 'title'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        from: NON_BLANK_STRING_SCHEMA,
        to: NON_BLANK_STRING_SCHEMA,
        type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
        why: {
          type: 'string',
          maxLength: 300,
          description:
            'One-line rationale for this relation ("A leans on B because ..."). Stored in the SAME frontmatter write as the ref (relation_notes map) — write it whenever you know the reason; a graph edge without a why is a mind-map line, not an ontology claim.',
        },
      },
      required: ['from', 'to', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        slug: NON_BLANK_STRING_SCHEMA,
        frontmatter: RELATION_ARRAY_PATCH_SCHEMA,
        expected_mtime: { type: 'number', minimum: 0 },
      },
      required: ['slug', 'frontmatter', 'expected_mtime'],
      additionalProperties: false,
    },
  ],
});
const COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    kind: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
    title: NON_BLANK_STRING_SCHEMA,
  },
  required: ['slug', 'kind', 'title'],
  additionalProperties: false,
});
const COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA = Object.freeze({
  type: ['object', 'null'],
  properties: {
    tool: { ...NON_BLANK_STRING_SCHEMA, enum: COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS },
    args: COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA,
  },
  required: ['tool', 'args'],
  additionalProperties: false,
});
const COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: NON_BLANK_STRING_SCHEMA,
    phase: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_PHASE_VALUES },
    kind: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_KIND_VALUES },
    severity: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_SEVERITY_VALUES },
    score: { type: 'number', minimum: 0 },
    executable: { type: 'boolean' },
    reason: NON_BLANK_STRING_SCHEMA,
    proposedAction: COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA,
    node: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
    nodes: {
      type: ['array', 'object'],
      items: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
      additionalProperties: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
    },
  },
  required: ['id', 'phase', 'kind', 'severity', 'score', 'executable', 'reason'],
  allOf: [{
    if: { properties: { executable: { const: true } }, required: ['executable'] },
    then: {
      required: ['proposedAction'],
      properties: {
        proposedAction: { ...COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA, type: 'object' },
      },
    },
  }],
  additionalProperties: false,
});
const NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA = Object.freeze({
  ...COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
  type: ['object', 'null'],
});
const POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Compact maintenance_plan summary for post-write follow-up. Bucket maps describe the remaining queue after the write.',
  properties: {
    operation: { type: 'string', enum: ['maintenance_plan'] },
    sideEffect: { type: 'boolean' },
    graphHash: { type: 'string' },
    summary: {
      type: 'object',
      properties: {
        totalActions: { type: 'integer', minimum: 0 },
        filteredActions: { type: 'integer', minimum: 0 },
        remainingActions: { type: 'integer', minimum: 0 },
        executableActions: { type: 'integer', minimum: 0 },
        reviewActions: { type: 'integer', minimum: 0 },
        compileIssues: { type: 'integer', minimum: 0 },
        dependencyCycles: { type: 'integer', minimum: 0 },
        canonicalizationActions: { type: 'integer', minimum: 0 },
        danglingReferences: { type: 'integer', minimum: 0 },
        relationRecommendations: { type: 'integer', minimum: 0 },
        externalElementRefs: { type: 'integer', minimum: 0 },
        externalElementRefsIgnored: { type: 'integer', minimum: 0 },
        unassignedNodes: { type: 'integer', minimum: 0 },
        emptyDomains: { type: 'integer', minimum: 0 },
        capabilitiesWithoutEvidence: { type: 'integer', minimum: 0 },
      },
      required: [
        'totalActions',
        'filteredActions',
        'remainingActions',
        'executableActions',
        'reviewActions',
        'compileIssues',
        'dependencyCycles',
        'canonicalizationActions',
        'danglingReferences',
        'relationRecommendations',
        'externalElementRefs',
        'externalElementRefsIgnored',
        'unassignedNodes',
        'emptyDomains',
        'capabilitiesWithoutEvidence',
      ],
      additionalProperties: false,
    },
    filters: {
      type: 'object',
      properties: {
        executableOnly: { type: 'boolean' },
        phases: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_PHASE_VALUES } },
        severities: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_SEVERITY_VALUES } },
        kinds: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_KIND_VALUES } },
      },
      required: ['executableOnly', 'phases', 'severities', 'kinds'],
      additionalProperties: false,
    },
    cursor: {
      type: 'object',
      properties: {
        afterActionId: { type: ['string', 'null'] },
        found: { type: 'boolean' },
        reason: { type: ['string', 'null'] },
        startIndex: { type: ['integer', 'null'], minimum: 0 },
        nextAfterActionId: { type: ['string', 'null'] },
        hasMore: { type: 'boolean' },
      },
      required: ['afterActionId', 'found', 'reason', 'startIndex', 'nextAfterActionId', 'hasMore'],
      additionalProperties: false,
    },
    byPhase: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    bySeverity: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    byKind: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    limited: { type: 'boolean' },
    nextExecutableAction: {
      ...NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
      description: 'First executable action in the current compact page, or null.',
    },
    nextReviewAction: {
      ...NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
      description: 'First review action in the current compact page, or null.',
    },
    actions: { type: 'array', items: COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA },
  },
  required: [
    'operation',
    'sideEffect',
    'graphHash',
    'summary',
    'filters',
    'cursor',
    'byPhase',
    'bySeverity',
    'byKind',
    'limited',
    'nextExecutableAction',
    'nextReviewAction',
    'actions',
  ],
  additionalProperties: false,
});

export {
  POST_WRITE_MAINTENANCE_GUIDANCE,
  POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
};

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
  '`postWriteMaintenance` (nextAction, stepsAboutTouched)';
const COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS = Object.freeze(['add_concepts', 'add_relations', 'patch_concept']);
const COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object',
      properties: {
        concepts: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              kind: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
              title: NON_BLANK_STRING_SCHEMA,
              domain: NON_BLANK_STRING_SCHEMA,
              path: NON_BLANK_STRING_SCHEMA,
            },
            required: ['slug', 'kind', 'title'],
            additionalProperties: false,
          },
        },
      },
      required: ['concepts'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            properties: {
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
              why: {
                type: 'string',
                maxLength: 300,
                description:
                  'One-line rationale ("A leans on B because ..."), stored in relation_notes in the same write. Required for a new depends_on.',
              },
            },
            required: ['from', 'to', 'type'],
            additionalProperties: false,
          },
        },
      },
      required: ['relations'],
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
    'What the write leaves to do about the nodes it touched, and only them. The whole vault\'s queue is `validate_vault` and `query_ontology({operation:"maintenance_plan"})`.',
  properties: {
    nextAction: {
      ...NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
      description:
        'The step to take next about the touched nodes: the first one a call settles (`proposedAction`), else the first judgement left; null when there is none.',
    },
    stepsAboutTouched: {
      type: 'integer',
      minimum: 0,
      description: 'How many steps the maintenance plan has about the touched nodes.',
    },
  },
  required: ['nextAction', 'stepsAboutTouched'],
  additionalProperties: false,
});

export {
  POST_WRITE_MAINTENANCE_GUIDANCE,
  POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
};

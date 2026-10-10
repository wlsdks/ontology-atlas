// Vault node, edge, backlink and warning shapes.

import { RELATION_TYPE_VALUES } from '../../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../schema.mjs';
import { VAULT_ISSUE_CODE_VALUES } from '../../validate.mjs';
import { GRAPH_ARRAY_KEYS } from '../../vault.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from './array-limits.mjs';
import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';

const BACKLINK_REWRITE_VALUE_OUTPUT_SCHEMA = Object.freeze({
  type: ['array', 'object', 'string'],
  minLength: NON_BLANK_STRING_SCHEMA.minLength,
  minItems: 1,
  minProperties: 1,
  pattern: NON_BLANK_STRING_SCHEMA.pattern,
  items: NON_BLANK_STRING_SCHEMA,
  propertyNames: NON_BLANK_STRING_SCHEMA,
  additionalProperties: NON_BLANK_STRING_SCHEMA,
});
const RELATION_ARRAY_PATCH_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.fromEntries(
    GRAPH_ARRAY_KEYS.map((key) => [
      key,
      { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA },
    ]),
  ),
  additionalProperties: false,
});
const BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    key: NON_BLANK_STRING_SCHEMA,
    before: BACKLINK_REWRITE_VALUE_OUTPUT_SCHEMA,
    after: BACKLINK_REWRITE_VALUE_OUTPUT_SCHEMA,
  },
  required: ['key'],
  additionalProperties: false,
});
const BACKLINK_REWRITE_UPDATE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    title: NON_BLANK_STRING_SCHEMA,
    beforeKeys: { type: 'array', items: BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA },
    afterKeys: { type: 'array', items: BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA },
    bodyChanged: { type: 'boolean' },
  },
  required: ['slug', 'title', 'beforeKeys', 'afterKeys', 'bodyChanged'],
  additionalProperties: false,
});
const BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    updates: { type: 'array', items: BACKLINK_REWRITE_UPDATE_OUTPUT_SCHEMA },
    totalUpdated: { type: 'integer', minimum: 0 },
  },
  required: ['updates', 'totalUpdated'],
  additionalProperties: false,
});
const BACKLINK_ROW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    uid: {
      ...NON_BLANK_STRING_SCHEMA,
      pattern: NODE_UID_PATTERN,
      description: 'The referring node\'s permanent UID. Absent when that node has no valid `uid:` (validate_vault reports it) and on every non-node row.',
    },
    slug: NON_BLANK_STRING_SCHEMA,
    kind: NON_BLANK_STRING_SCHEMA,
    isNode: {
      type: 'boolean',
      description: 'True when the referrer is a graph node (has `kind:`). False for a wiki page or other Markdown that links to the target; such a row carries neither `uid` nor `kind`.',
    },
    title: NON_BLANK_STRING_SCHEMA,
    domain: { type: 'string' },
    mtime: { type: 'number', minimum: 0 },
    matchedKeys: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    matchedInBody: { type: 'boolean' },
    ambiguousTail: { type: 'boolean' },
  },
  required: ['slug', 'isNode', 'title', 'mtime'],
  oneOf: [
    {
      properties: { isNode: { const: true } },
      required: ['kind'],
    },
    {
      properties: { isNode: { const: false } },
      not: { anyOf: [{ required: ['uid'] }, { required: ['kind'] }] },
    },
  ],
  additionalProperties: false,
});
const CAPTURED_DOC_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    frontmatter: { type: 'object', additionalProperties: true },
    body: { type: 'string' },
    bodyExcerpt: { type: 'string' },
  },
  required: ['frontmatter'],
  additionalProperties: false,
});
const VAULT_WARNING_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    code: { ...NON_BLANK_STRING_SCHEMA, enum: VAULT_ISSUE_CODE_VALUES },
    severity: { ...NON_BLANK_STRING_SCHEMA, enum: ['error', 'warning'] },
    message: NON_BLANK_STRING_SCHEMA,
  },
  required: ['code', 'severity', 'message'],
  additionalProperties: false,
});
const CONCEPT_NEIGHBORS_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    domains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    domain: { type: ['string', 'null'] },
    capabilities: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    elements: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    dependencies: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    relates: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    contains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    describes: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
  },
  required: ['domains', 'domain', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes'],
  additionalProperties: false,
});
// Omitted, never null, when no note is stored: absence reads as "no claim".
const EDGE_RATIONALE_OUTPUT_SCHEMA = Object.freeze({
  ...NON_BLANK_STRING_SCHEMA,
  description:
    'One-line rationale stored with this relation in the source document\'s `relation_notes` map (written by `add_relation(why)`). Omitted when no note is stored for the target.',
});
const OUTGOING_EDGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    to: NON_BLANK_STRING_SCHEMA,
    via: NON_BLANK_STRING_SCHEMA,
    rationale: EDGE_RATIONALE_OUTPUT_SCHEMA,
  },
  required: ['to', 'via'],
  additionalProperties: false,
});
// `excerpt` (<=800 chars) is the default for payload size; evidence lives in the `full` body.
const BODY_DELIVERY_MODES = Object.freeze(['excerpt', 'full']);

// Always present: `truncated: false` guarantees nothing was cut.
const BODY_INFO_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['excerpt', 'full'] },
    totalChars: { type: 'integer', minimum: 0, description: 'Full markdown body length in characters.' },
    returnedChars: { type: 'integer', minimum: 0, description: 'Characters actually returned in this response.' },
    truncated: { type: 'boolean', description: 'True when part of the body was not returned.' },
    omittedChars: { type: 'integer', minimum: 0, description: 'Only present when truncated.' },
    hint: { type: 'string', description: 'Only present when truncated — the exact call that returns the rest.' },
  },
  required: ['mode', 'totalChars', 'returnedChars', 'truncated'],
  additionalProperties: false,
});

// Attached only to an empty or unresolved read, never to a success; filled from real vault data.
const GROWTH_HINT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    reason: NON_BLANK_STRING_SCHEMA,
    suggestion: NON_BLANK_STRING_SCHEMA,
    exampleCall: {
      type: 'object',
      properties: {
        tool: NON_BLANK_STRING_SCHEMA,
        // Open on purpose: the example is a repair hint for several tools.
        args: { type: 'object', additionalProperties: true },
      },
      required: ['tool', 'args'],
      additionalProperties: false,
    },
  },
  required: ['reason', 'suggestion', 'exampleCall'],
  additionalProperties: false,
});
const RELATION_RESULT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    to: NON_BLANK_STRING_SCHEMA,
    type: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
    key: NON_BLANK_STRING_SCHEMA,
  },
  required: ['to', 'type', 'key'],
  additionalProperties: false,
});

const CONCEPT_REVIEW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    state: {},
    note: {},
    reviewedBy: {},
    reviewedAt: {},
    currentness: { type: 'string', enum: ['not-confirmed', 'unknown', 'current', 'changed-since-review'] },
    agentGuidance: NON_BLANK_STRING_SCHEMA,
  },
  required: ['state', 'currentness'],
  additionalProperties: false,
});

export {
  RELATION_ARRAY_PATCH_SCHEMA,
  BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
  BACKLINK_ROW_OUTPUT_SCHEMA,
  CAPTURED_DOC_OUTPUT_SCHEMA,
  VAULT_WARNING_OUTPUT_SCHEMA,
  CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
  EDGE_RATIONALE_OUTPUT_SCHEMA,
  OUTGOING_EDGE_OUTPUT_SCHEMA,
  BODY_DELIVERY_MODES,
  BODY_INFO_OUTPUT_SCHEMA,
  GROWTH_HINT_OUTPUT_SCHEMA,
  RELATION_RESULT_SCHEMA,
  CONCEPT_REVIEW_OUTPUT_SCHEMA,
};

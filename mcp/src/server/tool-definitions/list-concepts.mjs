import { NODE_KIND_VALUES } from '../../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../schema.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';

export const LIST_CONCEPTS_TOOL = {
  name: 'list_concepts',
  description:
    'List every ontology node in the vault (each .md file with a frontmatter `kind:`); AI agents call this first to grasp the codebase\'s mental model. Every page also carries `census`, the whole vault\'s kind counts, so `limit: 1` sizes up a vault; it replaces list_kinds. Filter by `kind`, `domain` and `since`; page with `offset` + `limit`, following `pagination.nextOffset` while `hasMore` is true. For a predicate such as "capabilities with no elements" use `query_concepts`.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: nonBlankStringSchema(
        'Filter to one canonical ontology kind. Invalid kind typos fail closed with nearest-value hints.',
        { enum: NODE_KIND_VALUES },
      ),
      domain: nonBlankStringSchema(
        'Domain slug (not title) in the node\'s `domain:`, e.g. "auth".',
      ),
      since: {
        type: 'number',
        minimum: 0,
        description:
          'Return nodes with `mtime > since` (ms) for incremental sync from an earlier `mtime`; strict, so re-passing the max does not double-fetch.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description:
          'Offset after filters, in deterministic slug order; resume at pagination.nextOffset.',
      },
      summary: {
        type: 'boolean',
        description:
          'Add a prose `summary` (max 200 chars, first paragraph) to each row, without a follow-up `get_concepts` call. Default false.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Default 100.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      total: {
        type: 'integer',
        minimum: 0,
        description: 'Total number of matching ontology nodes before the limit is applied.',
      },
      census: {
        type: 'object',
        description: 'Whole-vault kind counts, unaffected by the filters and the page.',
        properties: {
          total: { type: 'integer', minimum: 0 },
          byKind: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
          referencedOnlyTotal: { type: 'integer', minimum: 0, description: 'Names used only in a relation, with no file of their own.' },
        },
        required: ['total', 'byKind', 'referencedOnlyTotal'],
        additionalProperties: false,
      },
      returned: {
        type: 'integer',
        minimum: 0,
        description: 'Number of rows returned in this page.',
      },
      limited: {
        type: 'boolean',
        description: 'True when this page does not contain every matching row.',
      },
      pagination: {
        type: 'object',
        properties: {
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1 },
          total: { type: 'integer', minimum: 0 },
          returned: { type: 'integer', minimum: 0 },
          hasMore: { type: 'boolean' },
          nextOffset: { type: ['integer', 'null'], minimum: 0 },
        },
        required: ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset'],
        additionalProperties: false,
      },
      vaultRoot: {
        type: 'string',
        minLength: 1,
        description: 'Resolved vault root path used for the listing.',
      },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uid: {
              ...NON_BLANK_STRING_SCHEMA,
              pattern: NODE_UID_PATTERN,
              description: 'Permanent immutable node identity. Slug remains the current human-readable address.',
            },
            slug: NON_BLANK_STRING_SCHEMA,
            kind: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            domain: { type: 'string' },
            capabilities: {
              type: 'array',
              items: NON_BLANK_STRING_SCHEMA,
            },
            elements: {
              type: 'array',
              items: NON_BLANK_STRING_SCHEMA,
            },
            mtime: {
              type: 'number',
              minimum: 0,
            },
            summary: { type: 'string' },
            summaryTruncated: {
              type: 'boolean',
              description: 'Only present (and always true) when the body carries more than this summary shows.',
            },
          },
          required: ['uid', 'slug', 'kind', 'title', 'mtime'],
          additionalProperties: false,
        },
      },
      summaryHint: {
        type: 'string',
        description: 'Only present when at least one row carries a partial summary — names the follow-up call that returns the full bodies.',
      },
      vaultWarnings: {
        type: 'object',
        properties: {
          errorCount: { type: 'integer', minimum: 0 },
          warningCount: { type: 'integer', minimum: 0 },
        },
        required: ['errorCount', 'warningCount'],
        additionalProperties: false,
      },
    },
    required: ['total', 'vaultRoot', 'nodes', 'returned', 'limited', 'pagination'],
    additionalProperties: false,
  },
};

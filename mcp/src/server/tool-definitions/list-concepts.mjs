import { NODE_KIND_VALUES } from '../../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../schema.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import { GROWTH_HINT_OUTPUT_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';

export const LIST_CONCEPTS_TOOL = {
  name: 'list_concepts',
  description:
    'List every ontology node in the vault (each .md file with a frontmatter `kind:`); AI agents call this first to grasp the codebase\'s mental model. Every page also carries `census`, the whole vault\'s kind counts, so `limit: 1` sizes up a vault. Narrow by `kind`, `domain` and `since`, by a predicate with `filter` (such as "capabilities with no elements"), or by text with `mentions`, which ranks the nodes whose title, relations or body say it, then plain Markdown pages that say it (`isNode: false`), and adds `matchedIn`, `score` and an `excerpt` to each row. Page with `offset` + `limit`, following `pagination.nextOffset` while `hasMore` is true.',
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
      mentions: nonBlankStringSchema(
        'Text to find, case-insensitive. Keeps the documents whose title, capability or element names, or body contain it, best match first (title, then relations, then body, nodes before plain Markdown pages, then slug). A plain Markdown page has no `kind:` and answers with `isNode: false`; pass `kind` to see nodes only. Zero rows names the nearest titles.',
      ),
      filter: nonBlankStringSchema(
        'Predicate over frontmatter, case-insensitive keywords: `key=value`, `key!=value` (keys kind, domain, slug, title, created_by; quote a value holding spaces or a colon) and `has(key)` for a relation key such as elements or depends_on. Combine with AND, OR, NOT and parentheses: `(kind=domain OR kind=capability) AND NOT has(elements)`. Joins `kind`, `domain`, `since` and `mentions` as AND.',
      ),
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
      filter: { type: 'string', description: 'The `filter` as sent; only with a filter.' },
      parsedAs: { type: 'string', description: 'The filter as the server read it; only with a filter.' },
      query: { type: 'string', description: 'The `mentions` text as sent; only with mentions.' },
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
            isNode: {
              type: 'boolean',
              description: 'Only with `mentions`. False for a plain Markdown page that lives beside the nodes: it has no `uid` or `kind` and is not part of the graph.',
            },
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
            matchedIn: {
              type: 'string',
              enum: ['frontmatter', 'body'],
              description: 'Only with `mentions`: where the text was found.',
            },
            score: { type: 'number', description: 'Only with `mentions`: relevance, higher first.' },
            excerpt: { type: 'string', description: 'Only with `mentions`: the first prose of the body, at most 200 characters.' },
            excerptTruncated: {
              type: 'boolean',
              description: 'Only present (and always true) when the body carries more than this excerpt shows, possibly the matched text.',
            },
            bodyChars: {
              type: 'integer',
              minimum: 0,
              description: 'Only alongside excerptTruncated: the full body length.',
            },
            summary: { type: 'string' },
            summaryTruncated: {
              type: 'boolean',
              description: 'Only present (and always true) when the body carries more than this summary shows.',
            },
          },
          required: ['slug', 'title', 'mtime'],
          oneOf: [
            { required: ['uid', 'kind'] },
            {
              properties: { isNode: { const: false } },
              required: ['isNode'],
              not: { anyOf: [{ required: ['uid'] }, { required: ['kind'] }] },
            },
          ],
          additionalProperties: false,
        },
      },
      summaryHint: {
        type: 'string',
        description: 'Only present when at least one row carries a partial summary — names the follow-up call that returns the full bodies.',
      },
      nonNodeHint: {
        type: 'string',
        description: 'Only with `mentions`, when a row is a plain Markdown page: says so and how to see nodes only.',
      },
      excerptHint: {
        type: 'string',
        description: 'Only with `mentions`, when a row carries a partial excerpt: names the call that returns the full bodies.',
      },
      growthHint: {
        ...GROWTH_HINT_OUTPUT_SCHEMA,
        description: 'Only on zero rows from `filter` or `mentions`: why nothing matched, the nearest titles to check, and the call to try next.',
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

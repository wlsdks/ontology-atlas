import { NODE_KIND_VALUES } from '../../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../schema.mjs';
import {
  NODE_KIND_DESCRIPTION,
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas.mjs';

export const LIST_CONCEPTS_TOOL = {
  name: 'list_concepts',
  description:
    'List every ontology node in the vault (each .md file with a frontmatter `kind:`). ' +
    'Filter by `kind`, `domain`, and/or `since` (mtime-based incremental sync). ' +
    'Large vaults are resumable with `offset` + `limit`; always follow `pagination.nextOffset` while `hasMore` is true. ' +
    "AI agents call this first to grasp the codebase's mental model.",
  inputSchema: {
    type: 'object',
    properties: {
      kind: nonBlankStringSchema(
        `Filter to one canonical ontology kind (${NODE_KIND_DESCRIPTION}). Omit to return all. Invalid kind typos fail closed with nearest-value hints instead of returning an empty list.`,
        { enum: NODE_KIND_VALUES },
      ),
      domain: nonBlankStringSchema(
        'Filter to nodes whose frontmatter `domain:` matches this slug (e.g. "auth"). Combine with `kind` for "all capabilities under auth" in one call. Use the domain *slug*, not the title.',
      ),
      since: {
        type: 'number',
        minimum: 0,
        description:
          'Non-negative mtime threshold. Filter to nodes with `mtime > since` (ms). Pair with the `mtime` returned in earlier `list_concepts` / `get_concept` responses for incremental sync — "what changed since I last looked". Strict greater-than (mtime === since is excluded) so re-passing the max from a previous response does not double-fetch.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description:
          'Zero-based page offset applied after kind/domain/since filters. Resume at pagination.nextOffset until hasMore is false; ordering is deterministic by canonical slug.',
      },
      summary: {
        type: 'boolean',
        description:
          'When true, each node row includes a `summary` (max 200 chars, prose-only — heading / table / code block / image / divider / list / quote are skipped and only the first paragraph is kept, same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`). Useful for "scan + overview" without N follow-up `get_concept` calls. Default false to keep payload small.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Positive integer max rows to return. Defaults to 100, max 500.',
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

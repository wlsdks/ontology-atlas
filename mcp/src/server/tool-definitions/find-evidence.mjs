import { NODE_UID_PATTERN } from '../../schema.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import { GROWTH_HINT_OUTPUT_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';

export const FIND_EVIDENCE_TOOL = {
  name: 'find_evidence',
  description:
    'Find vault docs that mention a given concept by title, to see where a capability is realized. Each match includes a prose `excerpt`, readable without an extra get_concept call, and is ranked best-first by `score`. Plain markdown without `kind:` is marked `isNode: false`; do not cite it as graph evidence without saying so. Zero matches return a `growthHint`.',
  inputSchema: {
    type: 'object',
    properties: {
      title: nonBlankStringSchema('Title to find (case-insensitive substring match).'),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Default 50.',
      },
      nodesOnly: {
        type: 'boolean',
        description:
          'Return only graph nodes (docs with `kind:`). Default false.',
      },
    },
    required: ['title'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      query: NON_BLANK_STRING_SCHEMA,
      total: {
        type: 'integer',
        minimum: 0,
        description: 'Every document that matched, before `limit`.',
      },
      limited: {
        type: 'boolean',
        description: 'True when `matches` holds fewer rows than `total`.',
      },
      limitHint: {
        type: 'string',
        description: 'Only present when `limited`: how to narrow the search or raise `limit`.',
      },
      nonNodeHint: { type: 'string' },
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uid: {
              ...NON_BLANK_STRING_SCHEMA,
              pattern: NODE_UID_PATTERN,
            },
            slug: NON_BLANK_STRING_SCHEMA,
            kind: NON_BLANK_STRING_SCHEMA,
            isNode: {
              type: 'boolean',
              description:
                'True when this doc is a graph node (has `kind:`). False for ordinary markdown that lives in the same folder — still searchable, but not part of the graph.',
            },
            title: NON_BLANK_STRING_SCHEMA,
            domain: { type: 'string' },
            mtime: { type: 'number', minimum: 0 },
            matchedIn: {
              type: 'string',
              enum: ['frontmatter', 'body'],
            },
            score: {
              type: 'number',
              minimum: 0,
              description: 'Relevance score (higher = better). matches are sorted by this descending.',
            },
            excerpt: { type: 'string' },
            excerptTruncated: {
              type: 'boolean',
              description: 'Only present (and always true) when the body carries more than this excerpt shows — including, possibly, the text that matched.',
            },
            bodyChars: {
              type: 'integer',
              minimum: 0,
              description: 'Only present alongside excerptTruncated — the full body length.',
            },
          },
          required: ['slug', 'isNode', 'title', 'mtime', 'matchedIn', 'score', 'excerpt'],
          oneOf: [
            {
              properties: { isNode: { const: true } },
              required: ['uid', 'kind'],
            },
            {
              properties: { isNode: { const: false } },
              not: { anyOf: [{ required: ['uid'] }, { required: ['kind'] }] },
            },
          ],
          additionalProperties: false,
        },
      },
      bodyHint: {
        type: 'string',
        description: 'Only present when at least one match returned a partial excerpt — names the get_concepts({ body: "full" }) call that returns the rest.',
      },
      growthHint: {
        ...GROWTH_HINT_OUTPUT_SCHEMA,
        description: 'Only present when matches is empty — near-titled vault node(s) to check, or an add_concept scaffold, derived from the real vault title set.',
      },
    },
    required: ['query', 'matches'],
    additionalProperties: false,
  },
};

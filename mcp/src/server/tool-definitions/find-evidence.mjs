import { NODE_UID_PATTERN } from '../../schema.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import { GROWTH_HINT_OUTPUT_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';

export const FIND_EVIDENCE_TOOL = {
  name: 'find_evidence',
  description:
    "Find vault docs that mention a given concept by title. Useful when an AI agent asks where a capability is realized in code or docs. Each match includes a prose `excerpt` (max 200 chars, headings/tables/code skipped) so agents see *what the matching doc says* without an extra get_concept call. Matches are RANKED by a deterministic relevance `score` (title match > frontmatter ref > body, plus a title token-overlap tiebreaker), then by whether the doc is a graph node, then slug — best-first. **A vault holds ordinary markdown too** (meeting notes, memos, drafts have no `kind:` and are not graph nodes); every row says which it is via `isNode`, non-nodes rank below nodes of equal relevance, and `nodesOnly: true` filters them out. Do not cite a non-node as graph evidence without saying so. Returns the best 50 by default (`limit` up to 500), with `total` matches and `limited` when more matched. When zero docs mention the title, the response includes a `growthHint` — near-titled vault nodes to check first, or an add_concept scaffold if the concept looks genuinely new.",
  inputSchema: {
    type: 'object',
    properties: {
      title: nonBlankStringSchema('Concept title to search for (case-insensitive substring match).'),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Return only the top-N highest-scoring matches. Defaults 50; `total` and `limited` say whether more matched.',
      },
      nodesOnly: {
        type: 'boolean',
        description:
          'Return only graph nodes (docs with a `kind:`). Default false — ordinary markdown in the same folder is included and marked `isNode: false`.',
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

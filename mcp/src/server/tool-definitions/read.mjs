import { CONSTRUCTION_GUIDE_TOPICS } from '../../construction/construction-card.mjs';
import { NODE_KIND_VALUES, RELATION_TYPE_VALUES } from '../../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../schema.mjs';
import { READ_SOURCE_DEFAULT_LIMIT, READ_SOURCE_MAX_LIMIT } from '../../library/source-text.mjs';
import {
  NON_BLANK_MULTILINE_TEXT_SCHEMA,
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import {
  BACKLINK_ROW_OUTPUT_SCHEMA,
  BODY_DELIVERY_MODES,
  BODY_INFO_OUTPUT_SCHEMA,
  CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
  CONCEPT_REVIEW_OUTPUT_SCHEMA,
  EDGE_RATIONALE_OUTPUT_SCHEMA,
  GROWTH_HINT_OUTPUT_SCHEMA,
  OUTGOING_EDGE_OUTPUT_SCHEMA,
  VAULT_WARNING_OUTPUT_SCHEMA,
} from '../tool-schemas/vault-node-shapes.mjs';

export const CONNECTION_INFO_TOOL = {
  name: 'connection_info',
  description:
    'Return the active vault root and code-repository root this MCP process uses and how each was resolved; call first when configuration may be stale or several workspaces exist. Root changes need an MCP restart. Always returns `guide.card`, the construction card, and `guide.topics`; pass `guide` to get that topic\'s full text in `guideText`, because a host may truncate the server instructions.',
  inputSchema: {
    type: 'object',
    properties: {
      guide: {
        type: 'string',
        enum: [...CONSTRUCTION_GUIDE_TOPICS],
        description:
          'Topic for `guideText`: `meta_model` (kinds, is_a boundary), `construction` (naming, body, depends_on and element rules), `write_safety` (dry-run/confirm, expected_mtime), `workflows` (handoff for a known coding task), `competency` (the five `answers` rows of finalize_project_meaning, with an example).',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      vaultRoot: NON_BLANK_STRING_SCHEMA,
      repoRoot: NON_BLANK_STRING_SCHEMA,
      vaultResolution: { type: 'string', enum: ['OATLAS_VAULT', 'process.cwd'] },
      repoResolution: {
        type: 'string',
        enum: ['OATLAS_REPO_ROOT', 'git.rev-parse', 'process.cwd'],
      },
      sameRoot: { type: 'boolean' },
      restartRequiredForRootChange: { type: 'boolean' },
      server: {
        type: 'object',
        properties: {
          name: NON_BLANK_STRING_SCHEMA,
          version: NON_BLANK_STRING_SCHEMA,
          readOnly: { type: 'boolean' },
          toolCount: { type: 'integer', minimum: 1 },
          toolNames: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          toolsetHash: NON_BLANK_STRING_SCHEMA,
        },
        required: ['name', 'version', 'readOnly', 'toolCount', 'toolNames', 'toolsetHash'],
        additionalProperties: false,
      },
      guide: {
        type: 'object',
        properties: {
          card: NON_BLANK_MULTILINE_TEXT_SCHEMA,
          topics: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
        },
        required: ['card', 'topics'],
        additionalProperties: false,
      },
      guideText: NON_BLANK_MULTILINE_TEXT_SCHEMA,
    },
    required: ['vaultRoot', 'repoRoot', 'vaultResolution', 'repoResolution', 'sameRoot', 'restartRequiredForRootChange', 'server', 'guide'],
    additionalProperties: false,
  },
};

export const GET_CONCEPT_TOOL = {
  name: 'get_concept',
  description:
    'Fetch one node to read what it says, by exactly one selector: `slug` (canonical slug or unique alias) or immutable `uid`. Returns frontmatter, body, neighbours, outgoingEdges and mtime, with permanent `uid` plus current canonical `slug`; graph-operation inputs remain slug-based. The default `excerpt` is the first paragraph: pass `body: "full"` to answer from the node, since its definition, Includes, Excludes and Uncertainty live there. For several nodes use `get_concepts`.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema(
        'Slug, unique tail slug or `slug` alias; omit the .md extension.',
      ),
      uid: {
        ...NON_BLANK_STRING_SCHEMA,
        pattern: NODE_UID_PATTERN,
        description: 'Exact permanent node UID; never together with `slug`.',
      },
      body: {
        type: 'string',
        enum: BODY_DELIVERY_MODES,
        description:
          '`excerpt` (default): first prose paragraph. `full`: the whole body; use it when the answer depends on what the node says.',
      },
    },
    // A top-level `oneOf` makes Claude Code drop the tool; getConcept enforces exactly-one.
  },
  outputSchema: {
    type: 'object',
    properties: {
      uid: {
        ...NON_BLANK_STRING_SCHEMA,
        pattern: NODE_UID_PATTERN,
        description: 'Permanent immutable node identity.',
      },
      slug: NON_BLANK_STRING_SCHEMA,
      isNode: { type: 'boolean' },
      frontmatter: {
        type: 'object',
        description: 'Resolved markdown frontmatter.',
        additionalProperties: true,
      },
      excerpt: {
        type: 'string',
        description: 'First prose paragraph. Present only when `body` is `excerpt` (the default).',
      },
      body: {
        type: 'string',
        description: 'Entire markdown body. Present only when the caller passed `body: "full"`.',
      },
      bodyInfo: {
        ...BODY_INFO_OUTPUT_SCHEMA,
        description: 'How much of the body this response carries — always present, so truncation is never silent.',
      },
      neighbors: {
        ...CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
        description: 'Direct graph neighbor buckets.',
      },
      outgoingEdges: {
        type: 'array',
        items: OUTGOING_EDGE_OUTPUT_SCHEMA,
      },
      review: CONCEPT_REVIEW_OUTPUT_SCHEMA,
      mtime: {
        type: 'number',
        minimum: 0,
      },
      warnings: {
        type: 'array',
        items: VAULT_WARNING_OUTPUT_SCHEMA,
      },
    },
    required: ['uid', 'slug', 'isNode', 'frontmatter', 'bodyInfo', 'neighbors', 'outgoingEdges', 'review', 'mtime'],
    additionalProperties: false,
  },
};

export const GET_CONCEPTS_TOOL = {
  name: 'get_concepts',
  description:
    'Fetch several nodes in one call by exactly one selector array: `slugs` or immutable `uids`. Rows match `get_concept` in input order, each with permanent `uid` plus current canonical `slug`; a bad row returns `{ok:false, error}` so later valid slugs still resolve. Graph-operation inputs remain slug-based.',
  inputSchema: {
    type: 'object',
    properties: {
      slugs: {
        type: 'array',
        maxItems: 50,
        items: NON_BLANK_STRING_SCHEMA,
        description: 'Slugs, unique tail slugs or frontmatter `slug` aliases; omit .md. Max 50 per call, 20 with body `full`.',
      },
      uids: {
        type: 'array',
        maxItems: 50,
        items: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        description: 'Permanent node UIDs; never together with `slugs`. Max 50, 20 with body `full`.',
      },
      body: {
        type: 'string',
        enum: BODY_DELIVERY_MODES,
        description:
          '`excerpt` (default) or `full` for every row; `full` caps the batch at 20.',
      },
    },
    // Flat like get_concept; getConceptsBatch enforces exactly-one.
  },
  outputSchema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ok: {
              type: 'boolean',
              description: 'True for resolved concept rows; false for missing or invalid input rows.',
            },
            uid: {
              ...NON_BLANK_STRING_SCHEMA,
              pattern: NODE_UID_PATTERN,
              description: 'Canonical permanent UID for successful rows; requested UID for UID-selector error rows.',
            },
            slug: {
              ...NON_BLANK_STRING_SCHEMA,
              description:
                'Canonical slug for successful rows; the original input value for invalid partial rows.',
            },
            isNode: { type: 'boolean' },
            frontmatter: {
              type: 'object',
              description: 'Resolved markdown frontmatter for successful rows.',
              additionalProperties: true,
            },
            excerpt: {
              type: 'string',
              description: 'First prose paragraph — successful rows in `excerpt` mode (the default).',
            },
            body: {
              type: 'string',
              description: 'Entire markdown body — successful rows in `full` mode.',
            },
            bodyInfo: BODY_INFO_OUTPUT_SCHEMA,
            neighbors: {
              ...CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
              description: 'Direct graph neighbor buckets for successful rows.',
            },
            outgoingEdges: {
              type: 'array',
              items: OUTGOING_EDGE_OUTPUT_SCHEMA,
            },
            review: CONCEPT_REVIEW_OUTPUT_SCHEMA,
            mtime: {
              type: 'number',
              minimum: 0,
            },
            warnings: {
              type: 'array',
              items: VAULT_WARNING_OUTPUT_SCHEMA,
            },
            error: {
              type: 'string',
              description: 'Human-readable error for partial rows.',
            },
            errorCode: { type: 'string' },
            missingSubject: { type: 'string' },
            missingSlug: { type: 'string' },
            missingUid: { type: 'string', pattern: NODE_UID_PATTERN },
            similarSlugs: { type: 'array', items: { type: 'string' } },
            recoveryTools: { type: 'array', items: { type: 'string' } },
            createTool: { type: 'string' },
            growthHint: GROWTH_HINT_OUTPUT_SCHEMA,
          },
          required: ['ok'],
          additionalProperties: false,
        },
      },
    },
    required: ['concepts'],
    additionalProperties: false,
  },
};

export const FIND_BACKLINKS_TOOL = {
  name: 'find_backlinks',
  description:
    'Return every node that points to the target slug; call it before a rename, merge or delete. Scans both frontmatter graph keys and wikilinks / markdown links in the body, to walk the graph from a node to its dependents.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema('Target vault-relative slug (omit the .md extension).'),
    },
    required: ['slug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      target: NON_BLANK_STRING_SCHEMA,
      total: { type: 'integer', minimum: 0 },
      matches: { type: 'array', items: BACKLINK_ROW_OUTPUT_SCHEMA },
    },
    required: ['target', 'total', 'matches'],
    additionalProperties: false,
  },
};

export const FIND_NEIGHBORS_TOOL = {
  name: 'find_neighbors',
  description:
    'Return the one-hop graph neighborhood of a node, outgoing, incoming or both, from frontmatter relations only: canonical edges plus neighbour summaries in one call.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema(
        'Slug, tail slug or alias.',
      ),
      direction: {
        type: 'string',
        enum: ['outgoing', 'incoming', 'both'],
        description: 'Edge direction to include. Defaults to both.',
      },
      types: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description:
          'Relation types or keys. Public add_relation types are normalized to stored graph keys.',
      },
      includeNodes: {
        type: 'boolean',
        description:
          'Neighbour summaries, default true.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Edges, defaults to 100.',
      },
    },
    required: ['slug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      center: NON_BLANK_STRING_SCHEMA,
      requested: NON_BLANK_STRING_SCHEMA,
      direction: {
        type: 'string',
        enum: ['outgoing', 'incoming', 'both'],
      },
      types: {
        type: 'array',
        items: NON_BLANK_STRING_SCHEMA,
      },
      totalEdges: { type: 'integer', minimum: 0 },
      limited: { type: 'boolean' },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['outgoing', 'incoming'],
            },
            from: NON_BLANK_STRING_SCHEMA,
            to: NON_BLANK_STRING_SCHEMA,
            via: NON_BLANK_STRING_SCHEMA,
            ref: NON_BLANK_STRING_SCHEMA,
            resolved: { type: 'boolean' },
            unresolvedReason: { type: 'string' },
          },
          required: ['direction', 'from', 'to', 'via', 'ref', 'resolved'],
          additionalProperties: false,
        },
      },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
            slug: NON_BLANK_STRING_SCHEMA,
            kind: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            domain: { type: 'string' },
            mtime: { type: 'number', minimum: 0 },
          },
          required: ['uid', 'slug', 'kind', 'title', 'mtime'],
          additionalProperties: false,
        },
      },
    },
    required: ['center', 'requested', 'direction', 'totalEdges', 'limited', 'edges'],
    additionalProperties: false,
  },
};

export const FIND_PATH_TOOL = {
  name: 'find_path',
  description:
    'Find the shortest path between two nodes, to see how A and B are related. Each edge\'s `via` names the frontmatter key that linked them and `rationale` the stored `relation_notes` sentence. No path returns `{found: false}` with a `growthHint`.',
  inputSchema: {
    type: 'object',
    properties: {
      from: NON_BLANK_STRING_SCHEMA,
      to: NON_BLANK_STRING_SCHEMA,
      maxHops: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'Default 5.',
      },
    },
    required: ['from', 'to'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      from: NON_BLANK_STRING_SCHEMA,
      to: NON_BLANK_STRING_SCHEMA,
      found: { type: 'boolean' },
      reason: { type: 'string' },
      hopCount: { type: 'integer', minimum: 0 },
      hops: {
        type: 'array',
        items: NON_BLANK_STRING_SCHEMA,
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: NON_BLANK_STRING_SCHEMA,
            to: NON_BLANK_STRING_SCHEMA,
            via: NON_BLANK_STRING_SCHEMA,
            rationale: EDGE_RATIONALE_OUTPUT_SCHEMA,
          },
          required: ['from', 'to', 'via'],
          additionalProperties: false,
        },
      },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
            slug: NON_BLANK_STRING_SCHEMA,
            kind: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            domain: { type: 'string' },
          },
          required: ['uid', 'slug', 'kind', 'title'],
          additionalProperties: false,
        },
      },
      growthHint: {
        ...GROWTH_HINT_OUTPUT_SCHEMA,
        description:
          'Only present when found=false — a candidate add_relation (both endpoints exist) or add_concept (an endpoint is missing) suggestion, derived from the real vault, not invented.',
      },
    },
    required: ['from', 'to', 'found'],
    additionalProperties: false,
  },
};

export const LIST_KINDS_TOOL = {
  name: 'list_kinds',
  description:
    'Vault kind distribution ({ total, byKind }): a quick census to size up the vault without paging through list_concepts.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  outputSchema: {
    type: 'object',
    properties: {
      total: {
        type: 'integer',
        minimum: 0,
        description: 'Total number of vault docs that declare a kind.',
      },
      byKind: {
        type: 'object',
        additionalProperties: {
          type: 'integer',
          minimum: 0,
        },
        description: 'Node counts keyed by frontmatter kind.',
      },
      referencedOnlyTotal: {
        type: 'integer',
        minimum: 0,
        description: 'Number of slugs referenced by graph relations without a corresponding node document.',
      },
      conceptsIncludingReferenced: {
        type: 'integer',
        minimum: 0,
        description: 'Documented nodes plus referenced-only slugs, matching the graph-visible concept census.',
      },
    },
    required: ['total', 'byKind', 'referencedOnlyTotal', 'conceptsIncludingReferenced'],
    additionalProperties: false,
  },
};

export const FIND_ORPHANS_TOOL = {
  name: 'find_orphans',
  description:
    'List orphan nodes, docs that no other node references via any frontmatter array key: a cleanup starting point. Matches like find_backlinks; root/sentinel kinds like project and vault-readme are excluded by default.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: nonBlankStringSchema(
        'Restrict to one kind. Omit for all kinds.',
        { enum: NODE_KIND_VALUES },
      ),
      excludeKinds: {
        type: 'array',
        maxItems: NODE_KIND_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
        description:
          'Kinds to exclude, default [\'project\', \'vault-readme\']; [] includes every kind.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      total: { type: 'integer', minimum: 0 },
      orphans: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
            slug: NON_BLANK_STRING_SCHEMA,
            kind: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            domain: { type: 'string' },
            mtime: { type: 'number', minimum: 0 },
          },
          required: ['uid', 'slug', 'kind', 'title', 'mtime'],
          additionalProperties: false,
        },
      },
    },
    required: ['total', 'orphans'],
    additionalProperties: false,
  },
};

export const QUERY_CONCEPTS_TOOL = {
  name: 'query_concepts',
  description:
    'Typed filter DSL: find vault nodes by predicate, for questions a path search cannot answer, such as capabilities with zero elements.\n' +
    'Grammar (case-insensitive): filter := atom (AND|OR atom)* ; atom := NOT? predicate ; predicate := key=value | key!=value | has(key)\n' +
    'Keys: kind, domain, slug, title for equality; any graph frontmatter array key for has(...). Example: `kind=capability AND domain=auth AND NOT has(elements)`. No match returns a `growthHint`.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: nonBlankStringSchema(
        'e.g. kind=capability AND has(elements). Supports NOT / AND / OR. Wrap values containing whitespace or special characters in quotes.',
      ),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Default 100.',
      },
    },
    required: ['filter'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      filter: NON_BLANK_STRING_SCHEMA,
      parsedAs: NON_BLANK_STRING_SCHEMA,
      total: { type: 'integer', minimum: 0 },
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
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
            mtime: { type: 'number', minimum: 0 },
          },
          required: ['uid', 'slug', 'kind', 'title', 'mtime'],
          additionalProperties: false,
        },
      },
      limited: { type: 'boolean' },
      growthHint: {
        ...GROWTH_HINT_OUTPUT_SCHEMA,
        description: 'Only present when total=0 — flags a referenced kind/domain with 0 nodes in this vault census, or a generic loosen-the-filter nudge otherwise.',
      },
    },
    required: ['filter', 'parsedAs', 'total', 'matches', 'limited'],
    additionalProperties: false,
  },
};

export const READ_SOURCE_TOOL = {
  name: 'read_source',
  description:
    'Read one raw vault source under `sources/` (DOCX, XLSX, CSV, text, HTML) as citable units, each with the anchor for `[[src:sources/<file>#<anchor>]]`; repository code is read through analyze_repo_structure `sourceReads`. A PDF returns no text: read it natively and cite `#p<n>`. Follow `next` while `truncated`. side effect 0.',
  inputSchema: {
    type: 'object',
    properties: {
      path: nonBlankStringSchema('Path under `sources/` (`sources/plan.docx`).'),
      from: { type: 'integer', minimum: 1, description: 'First unit, 1-based.' },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: READ_SOURCE_MAX_LIMIT,
        description: `Units to return at most. Default ${READ_SOURCE_DEFAULT_LIMIT}.`,
      },
      sheet: { type: 'integer', minimum: 1, description: 'XLSX: one sheet by number.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      format: { type: 'string', enum: ['docx', 'xlsx', 'csv', 'text', 'html', 'pdf', 'binary'] },
      unitCount: { type: 'integer', minimum: 0 },
      from: { type: 'integer', minimum: 1 },
      units: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            anchor: { type: 'string' },
            text: { type: 'string' },
            kind: { type: 'string' },
            heading: { type: ['string', 'null'] },
            sheet: { type: 'string' },
          },
          required: ['anchor', 'text', 'kind'],
        },
      },
      truncated: { type: 'boolean' },
      next: { type: 'integer', minimum: 1 },
      sha256: { type: 'string' },
      note: { type: 'string' },
    },
    required: ['path', 'format', 'unitCount', 'from', 'units', 'truncated', 'sha256'],
  },
};

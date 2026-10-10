import { CONSTRUCTION_GUIDE_TOPICS } from '../../construction-card.mjs';
import { NODE_KIND_VALUES, RELATION_TYPE_VALUES } from '../../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../schema.mjs';
import { READ_SOURCE_DEFAULT_LIMIT, READ_SOURCE_MAX_LIMIT } from '../../source-text.mjs';
import {
  BACKLINK_ROW_OUTPUT_SCHEMA,
  BODY_DELIVERY_MODES,
  BODY_INFO_OUTPUT_SCHEMA,
  CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
  CONCEPT_REVIEW_OUTPUT_SCHEMA,
  EDGE_RATIONALE_OUTPUT_SCHEMA,
  GROWTH_HINT_OUTPUT_SCHEMA,
  NON_BLANK_MULTILINE_TEXT_SCHEMA,
  NON_BLANK_STRING_SCHEMA,
  OUTGOING_EDGE_OUTPUT_SCHEMA,
  VAULT_WARNING_OUTPUT_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas.mjs';

export const CONNECTION_INFO_TOOL = {
  name: 'connection_info',
  description:
    'Return the exact active vault root and code-repository root used by this MCP process, including how each root was resolved. Call first when a client may have stale configuration or multiple workspaces. Root changes require restarting the MCP process. '
    + 'Always returns `guide.card`, the construction card, plus `guide.topics`. Pass `guide` to also receive `guideText`, the full text of that topic, because a host may truncate the server `instructions` while tool results arrive whole.',
  inputSchema: {
    type: 'object',
    properties: {
      guide: {
        type: 'string',
        enum: [...CONSTRUCTION_GUIDE_TOPICS],
        description:
          'Return the long-form rules for one topic in `guideText`: `meta_model` (the five authorable kinds and the is_a boundary), `construction` (the rules to read before add_concept), `lifecycle` (review before write), `write_safety` (the dry-run/confirm and expected_mtime patterns), `workflows` (the three starting workflows), or `competency` (the exact `## Competency answers` section `finalize_project_meaning` parses).',
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
    'Fetch one node by exactly one selector: `slug` (canonical slug or unique alias) or immutable `uid`. Successful responses always carry both the permanent `uid` and current canonical `slug`; graph relations and graph-operation inputs remain slug-based. Returns frontmatter, body, direct graph neighbors, outgoingEdges (each `{to, via, rationale?}`, the rationale being the stored `relation_notes` sentence when one exists), and mtime. **By default you get `excerpt` — the first prose paragraph only. The node body is where the construction rules put definition, evidence, confidence, and in-scope/out-of-scope, so pass `body: "full"` whenever you are reading a node to answer a question rather than just to identify it.** `bodyInfo` always reports `totalChars` / `returnedChars` / `truncated`, so a partial read is never silent. **For K specific selectors in one call use `get_concepts({slugs: [...]})` or `get_concepts({uids: [...]})`.** When a slug does not resolve, structured growth guidance remains available.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema(
        'Vault-relative slug (e.g. projects/auth-platform), unique tail slug, or frontmatter `slug` alias. Omit the .md extension.',
      ),
      uid: {
        ...NON_BLANK_STRING_SCHEMA,
        pattern: NODE_UID_PATTERN,
        description: 'Exact permanent node UID. Use instead of `slug`, never together with it.',
      },
      body: {
        type: 'string',
        enum: BODY_DELIVERY_MODES,
        description:
          '`excerpt` (default) returns the first prose paragraph as `excerpt`. `full` returns the entire markdown body as `body` and omits `excerpt`. Use `full` when the answer depends on what the node actually says — evidence paths, confidence, scope boundaries.',
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
    'Fetch multiple nodes by exactly one selector array: `slugs` (canonical slugs or unique aliases) or immutable `uids`. Same per-row shape as `get_concept`; successful rows always return permanent `uid` plus current canonical `slug`. Order matches the selected input array. Missing or invalid slug rows return partial `{slug, ok:false, error, ...repairFields}` rows, so later valid slugs still resolve; UID misses likewise return `{uid, ok:false, error, ...repairFields}` without aborting the batch. Graph relations and graph-operation inputs remain slug-based.',
  inputSchema: {
    type: 'object',
    properties: {
      slugs: {
        type: 'array',
        maxItems: 50,
        items: NON_BLANK_STRING_SCHEMA,
        description: 'Vault-relative slugs, unique tail slugs, or frontmatter `slug` aliases (e.g. ["capabilities/x", "elements/y"]). Omit the .md extension. Max 50 per call (max 20 when body is `full`).',
      },
      uids: {
        type: 'array',
        maxItems: 50,
        items: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        description: 'Exact permanent node UIDs. Use instead of `slugs`, never together with it. Max 50 (max 20 with body `full`).',
      },
      body: {
        type: 'string',
        enum: BODY_DELIVERY_MODES,
        description:
          'Applies to every row. `excerpt` (default) returns the first prose paragraph per row; `full` returns the entire markdown body per row and caps the batch at 20 slugs.',
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
    'Return every node that points to the target slug. Scans both frontmatter ' +
    'array keys (capabilities / elements / dependencies / relates / contains / ' +
    'describes etc.) and the wikilinks / markdown links in the body. Used by ' +
    'AI agents to walk the graph from a node to its dependents.',
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
    'Return the one-hop graph neighborhood around a node. Unlike find_backlinks, ' +
    'this is graph-frontmatter only and can include outgoing, incoming, or both ' +
    'directions. Returns canonical edges plus neighbor node summaries so agents ' +
    'can inspect a local subgraph in one call.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema(
        'Center node slug, unique tail slug, or frontmatter `slug` alias.',
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
          'Optional relation types/frontmatter keys to include, e.g. ["domain", "depends_on", "contains"]. Public add_relation types are normalized to stored graph keys.',
      },
      includeNodes: {
        type: 'boolean',
        description:
          'When true (default), include neighbor node summaries for resolved edges.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Positive integer max edges to return. Defaults to 100, max 500.',
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
    'Shortest path between two nodes (undirected BFS). Returns ' +
    '`{ from, to, hops: [slug...], nodes: [{uid, slug, kind, title, domain?}], edges: [{from, to, via, rationale?}] }` where each ' +
    '`via` is the frontmatter key (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / ' +
    '`relates` / `contains` / `describes`) that linked the two slugs and `rationale` is the one-line ' +
    '`relation_notes` sentence the declaring document stores for that pair (present only when one is stored) — so the ' +
    'agent sees not just *that* A and B are connected but by which key and, when someone wrote it down, *why*. ' +
    'Returns `{ found: false }` when no path is found within maxHops, plus a `growthHint` — a concrete add_relation (both endpoints exist) or add_concept (an endpoint is missing) example so the unanswered question becomes a vault-growth signal instead of a dead end. maxHops defaults to 5 and is capped at 20.',
  inputSchema: {
    type: 'object',
    properties: {
      from: nonBlankStringSchema('Source slug.'),
      to: nonBlankStringSchema('Target slug.'),
      maxHops: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'Non-negative integer maximum hop count (default 5, max 20).',
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
    "Vault kind distribution — { total, byKind: { capability: N, ... } }. " +
    'A quick census so AI agents can size up the vault without paging through ' +
    'list_concepts.',
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
    'List orphan nodes — docs that no other node references via any frontmatter ' +
    'array key. Useful as a cleanup starting point or to answer "which nodes ' +
    'are unused?". Same matching policy as find_backlinks (full slug or final ' +
    'segment). Root/sentinel kinds like project and vault-readme are excluded by default.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: nonBlankStringSchema(
        'Restrict to one kind (e.g. capability). Omit for all kinds.',
        { enum: NODE_KIND_VALUES },
      ),
      excludeKinds: {
        type: 'array',
        maxItems: NODE_KIND_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
        description:
          "Kinds to exclude from results. Defaults to ['project', 'vault-readme']. Pass [] to include every kind. Typos fail with nearest-value hints.",
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
    'Typed filter DSL — search vault nodes by predicate. Built for saved-filter / ' +
    'smart-list cases that find_path (BFS) cannot answer, such as "which ' +
    'capabilities have zero elements?", "stub-only nodes in domain=auth", or ' +
    '"has(depends_on) excluding vault-readme".\n\n' +
    'Grammar (case-insensitive keywords, whitespace-tolerant):\n' +
    '  filter    := atom (AND|OR atom)*\n' +
    '  atom      := NOT? predicate\n' +
    '  predicate := key=value | key!=value | has(key)\n\n' +
    'Keys: kind / domain / slug / title for equality, plus any graph frontmatter array key for has(...). kind and has(...) keys are enum-validated with nearest-value hints.\n' +
    'Example: `kind=capability AND domain=auth AND NOT has(elements)` — ' +
    'capabilities under domain auth that have zero elements (= unfinished caps). ' +
    'When total=0, the response includes a `growthHint` — it names any referenced kind/domain that has 0 nodes in this vault, or nudges you to loosen the filter.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: nonBlankStringSchema(
        'Filter expression. Example: kind=capability AND has(elements). Supports NOT / AND / OR. ' +
          "Wrap values containing whitespace or special characters with \"...\" or '...'.",
      ),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Positive integer max rows to return. Defaults to 100, max 500.',
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
    'Vault source documents only; repository code is read through analyze_repo_structure `sourceReads`. ' +
    'Read the text of one raw source under `sources/`, cut into the units a wiki citation names ' +
    '(`docs/ONTOLOGY-ATLAS-SPEC.md` §11): a DOCX by heading (`h:<slug>`; paragraphs before the first ' +
    'heading are `p1`), an XLSX by sheet and row (`s<n>r<m>`), a CSV by row (`r<n>`), a text or HTML file by ' +
    'line (`l<n>`). Each unit carries the exact anchor to write into `[[src:sources/<file>#<anchor>]]`, so a ' +
    'page cites what it quotes. A PDF returns no text: the agent runtime reads PDFs natively, page by page, ' +
    'and cites `#p<n>`. Nothing is converted and kept — the file is read on request and the text returned ' +
    'once. Paging: `from` (1-based unit index) and `limit` (default ' +
    `${READ_SOURCE_DEFAULT_LIMIT}, max ${READ_SOURCE_MAX_LIMIT}` +
    '); when `truncated` is true, `next` is the `from` to continue with. `sheet` narrows a workbook to one ' +
    'sheet number. Returns `{ path, format, unitCount, from, units: [{anchor, text, kind, heading?, sheet?}], ' +
    'truncated, next?, sha256, note? }`. side effect 0. Use it in place of a shell command when a Compile, ' +
    'Check or ask turn needs what a DOCX or XLSX says.',
  inputSchema: {
    type: 'object',
    properties: {
      path: nonBlankStringSchema('Vault-relative path under `sources/` (`sources/plan.docx`).'),
      from: { type: 'integer', minimum: 1, description: '1-based index of the first unit to return. Default 1.' },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: READ_SOURCE_MAX_LIMIT,
        description: `Units to return at most. Default ${READ_SOURCE_DEFAULT_LIMIT}.`,
      },
      sheet: { type: 'integer', minimum: 1, description: 'XLSX only: return one sheet, by its number in workbook order.' },
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

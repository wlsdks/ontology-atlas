import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
} from '../../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../schema.mjs';
import { GRAPH_ARRAY_KEYS } from '../../vault/graph/relation-refs.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
  paginationOutputSchema,
} from '../tool-schemas/field-primitives.mjs';
import {
  EDGE_RATIONALE_OUTPUT_SCHEMA,
  RELATION_ARRAY_PATCH_SCHEMA,
} from '../tool-schemas/vault-node-shapes.mjs';

export const COMPILE_ONTOLOGY_TOOL = {
  name: 'compile_ontology',
  description:
    'Compile the whole vault into a deterministic graph artifact (nodes, edges, aliases, issues, optional indexes) with a stable semantic graphHash and maxMtime, before export, indexing or whole-graph reasoning; for one question about the graph use query_ontology. side effect 0. Large vaults (100+ nodes) can exceed the MCP token cap: no argument returns a bounded summary plus `delivery`; `summary: true` counts only; `full: true` every array; `nodesLimit/nodesOffset`, `edgesLimit/edgesOffset` slice.',
  inputSchema: {
    type: 'object',
    properties: {
      includeIndexes: {
        type: 'boolean',
        description:
          'Include adjacency, kind, domain and alias/UID `indexes`.',
      },
      summary: {
        type: 'boolean',
        description:
          'Counts, graphHash and maxMtime only: cheap polling for cache invalidation. Wins over every other argument.',
      },
      full: {
        type: 'boolean',
        description:
          'Every array, however large; page arguments still slice.',
      },
      nodesLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Nodes per page with `nodesOffset`.',
      },
      nodesOffset: {
        type: 'integer',
        minimum: 0,
        description: 'Start index in sorted nodes.',
      },
      edgesLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Edges per page with `edgesOffset`.',
      },
      edgesOffset: {
        type: 'integer',
        minimum: 0,
        description: 'Start index in sorted edges.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      version: { type: 'integer', minimum: 1 },
      graphHash: NON_BLANK_STRING_SCHEMA,
      maxMtime: { type: 'number', minimum: 0 },
      nodeCount: { type: 'integer', minimum: 0 },
      skippedNonNodeCount: {
        type: 'integer',
        minimum: 0,
        description: 'Summary answers only: `.md` files passed over for having no `kind:`.',
      },
      edgeCount: { type: 'integer', minimum: 0 },
      resolvedEdgeCount: { type: 'integer', minimum: 0 },
      externalEdgeCount: { type: 'integer', minimum: 0 },
      unresolvedEdgeCount: { type: 'integer', minimum: 0 },
      referencedOnlyCount: { type: 'integer', minimum: 0 },
      aliasCount: { type: 'integer', minimum: 0 },
      ambiguousAliasCount: { type: 'integer', minimum: 0 },
      issueCount: { type: 'integer', minimum: 0 },
      canonicalizationActionCount: { type: 'integer', minimum: 0 },
      delivery: {
        type: 'object',
        description:
          'Present when no argument asked for arrays: this is the bounded summary, and these arguments return the rest.',
        properties: {
          selection: { type: 'string', enum: ['summary_default'] },
          reason: NON_BLANK_STRING_SCHEMA,
          fullArguments: {
            type: 'object',
            properties: { full: { type: 'boolean', enum: [true] } },
            required: ['full'],
            additionalProperties: false,
          },
          pageArguments: {
            type: 'object',
            properties: {
              nodesLimit: { type: 'integer', minimum: 1 },
              edgesLimit: { type: 'integer', minimum: 1 },
            },
            required: ['nodesLimit', 'edgesLimit'],
            additionalProperties: false,
          },
        },
        required: ['selection', 'reason', 'fullArguments', 'pageArguments'],
        additionalProperties: false,
      },
      byKind: {
        type: 'object',
        additionalProperties: { type: 'integer', minimum: 0 },
      },
      byDomain: {
        type: 'object',
        additionalProperties: { type: 'integer', minimum: 0 },
      },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
            merged_uids: {
              type: 'array',
              items: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
            },
            slug: NON_BLANK_STRING_SCHEMA,
            kind: { type: 'string' },
            title: { type: 'string' },
            domain: { type: 'string' },
            path: NON_BLANK_STRING_SCHEMA,
            mtime: { type: 'number' },
            outDegree: { type: 'integer', minimum: 0 },
            inDegree: { type: 'integer', minimum: 0 },
          },
          required: ['uid', 'slug', 'kind', 'title', 'mtime', 'outDegree', 'inDegree'],
          additionalProperties: false,
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: NON_BLANK_STRING_SCHEMA,
            from: NON_BLANK_STRING_SCHEMA,
            to: NON_BLANK_STRING_SCHEMA,
            via: NON_BLANK_STRING_SCHEMA,
            ref: NON_BLANK_STRING_SCHEMA,
            resolved: { type: 'boolean' },
            external: { type: 'boolean' },
            rationale: EDGE_RATIONALE_OUTPUT_SCHEMA,
          },
          required: ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external'],
          additionalProperties: false,
        },
      },
      nodesPagination: paginationOutputSchema(),
      edgesPagination: paginationOutputSchema(),
      aliases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            alias: NON_BLANK_STRING_SCHEMA,
            slug: NON_BLANK_STRING_SCHEMA,
          },
          required: ['alias', 'slug'],
          additionalProperties: false,
        },
      },
      ambiguousAliases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            alias: NON_BLANK_STRING_SCHEMA,
            slugs: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          },
          required: ['alias', 'slugs'],
          additionalProperties: false,
        },
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { ...NON_BLANK_STRING_SCHEMA, enum: ['ambiguous-alias', 'dangling-graph-reference'] },
            severity: { ...NON_BLANK_STRING_SCHEMA, enum: ['warning'] },
            message: NON_BLANK_STRING_SCHEMA,
            alias: NON_BLANK_STRING_SCHEMA,
            slugs: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
            slug: NON_BLANK_STRING_SCHEMA,
            via: NON_BLANK_STRING_SCHEMA,
            ref: NON_BLANK_STRING_SCHEMA,
          },
          required: ['code', 'severity', 'message'],
          additionalProperties: false,
        },
      },
      canonicalizationActions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: NON_BLANK_STRING_SCHEMA,
            keys: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: GRAPH_ARRAY_KEYS } },
            frontmatter: RELATION_ARRAY_PATCH_SCHEMA,
            expected_mtime: { type: 'number', minimum: 0 },
          },
          required: ['slug', 'keys', 'frontmatter', 'expected_mtime'],
          additionalProperties: false,
        },
      },
      indexes: {
        type: 'object',
        properties: {
          out: {
            type: 'object',
            additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          },
          in: {
            type: 'object',
            additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          },
          byKind: {
            type: 'object',
            additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          },
          byDomain: {
            type: 'object',
            additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          },
          edgeById: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                id: NON_BLANK_STRING_SCHEMA,
                from: NON_BLANK_STRING_SCHEMA,
                to: NON_BLANK_STRING_SCHEMA,
                via: NON_BLANK_STRING_SCHEMA,
                ref: NON_BLANK_STRING_SCHEMA,
                resolved: { type: 'boolean' },
                external: { type: 'boolean' },
              },
              required: ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external'],
              additionalProperties: false,
            },
          },
          aliasToSlug: {
            type: 'object',
            additionalProperties: NON_BLANK_STRING_SCHEMA,
          },
          uidToSlug: {
            type: 'object',
            additionalProperties: NON_BLANK_STRING_SCHEMA,
          },
          slugToUid: {
            type: 'object',
            additionalProperties: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
          },
          mergedUidToSlug: {
            type: 'object',
            additionalProperties: NON_BLANK_STRING_SCHEMA,
          },
        },
        additionalProperties: false,
      },
      summary: {
        type: 'object',
        properties: {
          nodes: { type: 'integer', minimum: 0 },
          edges: { type: 'integer', minimum: 0 },
          graphHash: NON_BLANK_STRING_SCHEMA,
          maxMtime: { type: 'number', minimum: 0 },
          resolvedEdges: { type: 'integer', minimum: 0 },
          externalEdges: { type: 'integer', minimum: 0 },
          unresolvedEdges: { type: 'integer', minimum: 0 },
          aliases: { type: 'integer', minimum: 0 },
          ambiguousAliases: { type: 'integer', minimum: 0 },
          issues: { type: 'integer', minimum: 0 },
        },
        required: ['nodes', 'edges', 'graphHash', 'maxMtime', 'resolvedEdges', 'externalEdges', 'unresolvedEdges', 'aliases', 'ambiguousAliases', 'issues'],
        additionalProperties: false,
      },
    },
    required: [
      'version',
      'graphHash',
      'maxMtime',
      'nodeCount',
      'edgeCount',
      'resolvedEdgeCount',
      'externalEdgeCount',
      'unresolvedEdgeCount',
      'referencedOnlyCount',
      'aliasCount',
      'ambiguousAliasCount',
      'issueCount',
      'canonicalizationActionCount',
      'byKind',
      'byDomain',
    ],
    additionalProperties: false,
  },
};

export const QUERY_ONTOLOGY_TOOL = {
  name: 'query_ontology',
  description:
    'Answer one graph question over the freshly compiled vault (impact, paths, neighbourhoods, health, repair queue, first-contact brief) without the full compile_ontology payload. Read-only; side effect 0. Nodes are canonical slugs or unique aliases. `path` is how two nodes connect and `neighbors` one hop around a node (`includeUnresolved: true` adds dangling refs); who points at a node, body links included, is find_backlinks; a predicate filter is list_concepts `filter`; nodes with no incoming relation are `match_nodes` with `hasIncoming: false`.\n' +
    'impact (what depends on a node, declared `depends_on` only); blast_radius (impact by kind and domain); similar_nodes (duplicates before a write: `candidateSlug` or `title`); relation_check (preflight before add_relations: `from`, `to`, `type`); growth_plan (the reads each `## Uncertainty` asks for); maintenance_plan (ordered repair actions); workspace_brief (first-contact status and next actions); agent_brief (the project brief; `project` when the vault has more than one); query_plan (cost estimate of `targetOperation`); analysis_record (a saved analysis by `recordId`). ' +
    'The operation list, the `slug`, `from`/`to` and `pattern` each one needs, and the rules are `connection_info({guide:"query"})`.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        ...NON_BLANK_STRING_SCHEMA,
        enum: QUERY_ONTOLOGY_OPERATIONS,
      },
      targetOperation: {
        ...NON_BLANK_STRING_SCHEMA,
        enum: QUERY_PLAN_TARGET_OPERATIONS,
        description: 'query_plan: operation to estimate.',
      },
      recordId: nonBlankStringSchema('analysis_record: run or review UUID.'),
      slug: nonBlankStringSchema('Center or root node.'),
      candidateSlug: nonBlankStringSchema('similar_nodes: slug not yet written.'),
      title: nonBlankStringSchema('similar_nodes: title not yet written.'),
      from: NON_BLANK_STRING_SCHEMA,
      to: NON_BLANK_STRING_SCHEMA,
      project: nonBlankStringSchema('Project for project_scope, project_map, agent_brief; optional with one project.'),
      direction: {
        type: 'string',
        enum: ['incoming', 'outgoing', 'both', 'undirected'],
        description: 'undirected: path, explain_relation, reachability.',
      },
      types: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description: 'Relation types to include.',
      },
      pattern: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description: 'pattern_walk: relation sequence, e.g. ["domains", "capabilities"].',
      },
      type: {
        ...nonBlankStringSchema('relation_check: the relation to preflight.'),
        enum: RELATION_TYPE_VALUES,
      },
      kind: {
        ...nonBlankStringSchema('match_nodes filter; recommend_relations takes capability or element.'),
        enum: NODE_KIND_VALUES,
      },
      domain: nonBlankStringSchema('match_nodes filter.'),
      hasIncoming: { type: 'boolean', description: 'match_nodes.' },
      hasOutgoing: { type: 'boolean', description: 'match_nodes.' },
      sort: {
        type: 'string',
        enum: ['degree', 'inDegree', 'outDegree', 'slug'],
        description: 'match_nodes only. Default degree.',
      },
      depth: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'Default 3 reachability, 2 impact/blast_radius/subgraph, 20 lineage.',
      },
      maxHops: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'Default 5 path/explain_relation, 8 cycles.',
      },
      searchBudget: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description: 'cycles: default 5000. With truncatedByBudget counts are lower bounds; zero cycles does NOT mean acyclic.',
      },
      includeExternal: { type: 'boolean', description: 'neighbors: include external element refs.' },
      includeUnresolved: { type: 'boolean', description: 'neighbors: include dangling refs.' },
      includeOrphans: { type: 'boolean', description: 'containment_tree: include nodes no project reaches.' },
      executableOnly: { type: 'boolean', description: 'maintenance_plan: only actions with a proposed call.' },
      phases: {
        type: 'array',
        maxItems: MAINTENANCE_PHASE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_PHASE_VALUES },
        description: 'maintenance_plan only.',
      },
      severities: {
        type: 'array',
        maxItems: MAINTENANCE_SEVERITY_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_SEVERITY_VALUES },
        description: 'maintenance_plan only.',
      },
      kinds: {
        type: 'array',
        maxItems: MAINTENANCE_KIND_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_KIND_VALUES },
        description: 'maintenance_plan only.',
      },
      afterActionId: nonBlankStringSchema(
        'maintenance_plan: resume after this id; pass cursor.nextAfterActionId while cursor.hasMore. An unknown id returns an empty page with cursor.found=false.',
      ),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Rows, default 100.',
      },
      itemLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'project_map: per domain, default 20.',
      },
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: QUERY_ONTOLOGY_OPERATIONS },
          compiledSummary: { type: 'object', additionalProperties: true },
    },
    required: ['operation'],
    // Each operation owns its payload contract; the envelope only fixes the discriminator.
    additionalProperties: true,
  },
};

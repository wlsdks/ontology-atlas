import { AGENT_BRIEF_TASK_MAX_CHARS } from '../../agent-brief/agent-brief-compact.mjs';
import {
  EDGE_TARGET_KIND_VALUES,
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
    'Compile the whole markdown vault into a deterministic graph artifact: canonical nodes, edges, aliases, graph issues, graph-array canonicalization actions, and optional adjacency indexes. ' +
    'This is the compiler-style read path for graph-database-like use: call it before advanced reasoning, indexing, export, or non-developer-friendly graph views. Includes a stable semantic graphHash and maxMtime for cache invalidation. side effect 0. ' +
    'Large vaults (100+ nodes) can exceed the MCP token cap with the full payload. `summary: true` returns counts + graphHash + byKind/byDomain aggregates with no arrays, for cheap polling, and a call with no argument that asks for arrays returns the same bounded summary plus `delivery`, which names the two ways to the rest: `full: true` for every array, or `nodesLimit/nodesOffset` / `edgesLimit/edgesOffset` to slice them. The response includes `nodesPagination` / `edgesPagination` meta with `{offset, limit, total, returned, hasMore, nextOffset}` when sliced.',
  inputSchema: {
    type: 'object',
    properties: {
      includeIndexes: {
        type: 'boolean',
        description:
          'When true, include indexes `{out, in, byKind, byDomain, edgeById, aliasToSlug, uidToSlug, slugToUid, mergedUidToSlug}`. Graph traversal remains slug-based; UID indexes provide exact identity resolution. Defaults false to keep payload smaller.',
      },
      summary: {
        type: 'boolean',
        description:
          'When true, omit `nodes` / `edges` / `aliases` / `ambiguousAliases` / `canonicalizationActions` / `indexes` arrays — return only `graphHash`, `maxMtime`, counts (`nodeCount`/`edgeCount`/`aliasCount`/...), and aggregate `byKind`/`byDomain` as counts. Cheap polling for cache invalidation and graph-size assessment. Wins over every other argument.',
      },
      full: {
        type: 'boolean',
        description:
          'When true, return every array however large the vault is (the answer without arguments is the bounded summary). Page arguments still slice nodes and edges.',
      },
      nodesLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Positive integer max nodes to return. Pair with `nodesOffset` to paginate. Max 500; `full: true` without it returns every node.',
      },
      nodesOffset: {
        type: 'integer',
        minimum: 0,
        description: 'Non-negative integer starting index in the sorted nodes array. Defaults 0.',
      },
      edgesLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Positive integer max edges to return. Pair with `edgesOffset` to paginate. Max 500.',
      },
      edgesOffset: {
        type: 'integer',
        minimum: 0,
        description: 'Non-negative integer starting index in the sorted edges array. Defaults 0.',
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
    'Read-only graph queries over the freshly compiled vault, for graph-database answers without the full compile_ontology payload. Nodes are canonical slugs or unique aliases. side effect 0.\n' +
    'Operations: neighbors; path (one route); all_paths (bounded simple paths); explain_relation (direct edges, shortest path, shared neighbours); reachability; pattern_walk (follow a relation sequence); subgraph (N-hop slice); lineage; containment_tree; impact (what depends on a node); blast_radius (impact grouped by kind and domain); centrality; communities; components; cycles; topological_order; similar_nodes (duplicates before a write); relation_check (preflight before add_relation); recommend_relations; overview; schema (kind-relation-kind patterns); facets; match_nodes; match_edges; node_profile; domain_profile; domain_matrix; project_scope; project_map; builder_context (saved Workshop focus and layout); growth_plan (expansion candidates and the reads each `## Uncertainty` asks for); maintenance_plan (ordered repair actions); health; workspace_brief (first-contact status and next actions); agent_brief (coding-task handoff); meaning_repair_review (evidence pages for a meaningRepair); query_plan (cost estimate for targetOperation); analysis_history and analysis_record (the immutable analysis archive).\n' +
    'Required: `slug` for neighbors, reachability, pattern_walk, impact, blast_radius, subgraph, builder_context, lineage, node_profile and domain_profile; `from` and `to` for path, all_paths and explain_relation; `pattern` for pattern_walk; `targetOperation` for query_plan; `recordId` for analysis_record; `project`, `reviewRevision` and, on the first page, `expectedGraphHash` and `expectedSourceFingerprint` for meaning_repair_review; `task` for agent_brief with detail:"compact". Every other argument names the operations it applies to.\n' +
    'Rules: impact and blast_radius follow declared `depends_on` only; use reachability or subgraph for structure, and treat blast_radius risk as unknown until relation-level source receipts exist. A missing `depends_on` that relation_check finds is schema-only: `proposedAction` is null and its `approvalGate` writes nothing until the agent explains the observable ability and rationale and the human explicitly approves. For a known coding task call agent_brief with detail:"compact" and `task` right after connection_info, not after workspace_brief or a full inventory; pass `project` when the vault has more than one. Read its meaningRepair before repair step 2. Task matching selects persisted evidence only: it never searches the repository, never proves source behavior, never persists the task, never approves meaning and never writes. analysis_history and analysis_record return records, not approved facts; follow their pagination even past an empty filtered page.',
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
        description: 'query_plan only: the operation to estimate.',
      },
      recordId: nonBlankStringSchema('analysis_record only: the run or review UUID.'),
      analysisMode: { type: 'string', enum: ['meaning', 'architecture'], description: 'analysis_history only.' },
      analysisCursor: nonBlankStringSchema('analysis_history only: the previous page\'s nextCursor.'),
      iterations: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'centrality and communities only. Default 20.',
      },
      slug: nonBlankStringSchema(
        'The center or root node. builder_context also takes its Workshop focusParam (domain:auth); containment_tree takes it as an optional root.',
      ),
      seed: nonBlankStringSchema('subgraph and builder_context: another name for slug.'),
      candidateSlug: nonBlankStringSchema('similar_nodes only: the slug of a concept not yet written.'),
      title: nonBlankStringSchema('similar_nodes only: the title of a concept not yet written.'),
      from: NON_BLANK_STRING_SCHEMA,
      project: nonBlankStringSchema(
        'Project root for domain_matrix, project_scope, project_map, agent_brief and meaning_repair_review; optional with exactly one project, except for meaning_repair_review.',
      ),
      detail: {
        type: 'string',
        enum: ['compact', 'full'],
        description:
          'agent_brief only: "compact" is a task-scoped handoff of at most 12000 UTF-8 bytes; "full", the default, is the complete diagnostic contract.',
      },
      task: {
        ...NON_BLANK_STRING_SCHEMA,
        maxLength: AGENT_BRIEF_TASK_MAX_CHARS,
        description:
          'agent_brief detail:"compact" only: the coding task that selects persisted evidence. Never persisted, never behavior proof or approval.',
      },
      expectedGraphHash: nonBlankStringSchema(
        'meaning_repair_review first page: graphHash from the meaningRepair provenance.',
      ),
      expectedSourceFingerprint: nonBlankStringSchema(
        'meaning_repair_review first page: sourceFingerprint from the meaningRepair provenance.',
      ),
      reviewRevision: nonBlankStringSchema('meaning_repair_review only: the sha256 revision from meaningRepair.'),
      cursor: nonBlankStringSchema('meaning_repair_review only: pagination.nextCursor; omit on the first page.'),
      to: NON_BLANK_STRING_SCHEMA,
      direction: {
        type: 'string',
        enum: ['incoming', 'outgoing', 'both', 'undirected'],
        description: 'undirected applies to path, all_paths, explain_relation and reachability.',
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
        description: 'pattern_walk only: the relation sequence, e.g. ["domains", "capabilities", "elements"].',
      },
      type: {
        ...nonBlankStringSchema('relation_check and match_edges.'),
        enum: RELATION_TYPE_VALUES,
      },
      kind: {
        ...nonBlankStringSchema('match_nodes filter; recommend_relations takes capability or element.'),
        enum: NODE_KIND_VALUES,
      },
      domain: nonBlankStringSchema('match_nodes: exact domain filter. domain_profile: the domain.'),
      slugContains: nonBlankStringSchema('match_nodes only: case-insensitive slug substring.'),
      minDegree: { type: 'integer', minimum: 0, description: 'match_nodes only.' },
      maxDegree: { type: 'integer', minimum: 0, description: 'match_nodes only.' },
      minInDegree: { type: 'integer', minimum: 0, description: 'match_nodes only.' },
      minOutDegree: { type: 'integer', minimum: 0, description: 'match_nodes only.' },
      hasIncoming: { type: 'boolean', description: 'match_nodes only.' },
      hasOutgoing: { type: 'boolean', description: 'match_nodes only.' },
      sort: {
        type: 'string',
        enum: ['degree', 'inDegree', 'outDegree', 'slug'],
        description: 'match_nodes only. Default degree.',
      },
      fromKind: {
        ...nonBlankStringSchema('match_edges only: source kind, always a real node.'),
        enum: NODE_KIND_VALUES,
      },
      toKind: {
        ...nonBlankStringSchema('match_edges only: target kind; external and unresolved select refs that are not nodes.'),
        enum: EDGE_TARGET_KIND_VALUES,
      },
      relation: {
        ...nonBlankStringSchema('relation_check: another name for type.'),
        enum: RELATION_TYPE_VALUES,
      },
      depth: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'Traversal depth: default 3 for reachability, 2 for impact, blast_radius and subgraph, 20 for lineage and containment_tree.',
      },
      maxHops: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'Hop cap: default 5 for path, all_paths and explain_relation, 8 for cycles.',
      },
      searchBudget: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description:
          'all_paths, query_plan(all_paths) and cycles: search states to expand, default 5000. When truncatedByBudget is true the counts are lower bounds and zero cycles does NOT mean acyclic.',
      },
      includeExternal: { type: 'boolean', description: 'neighbors only: include external path-like element refs.' },
      includeUnresolved: { type: 'boolean', description: 'neighbors only: include dangling refs.' },
      includeIsolated: { type: 'boolean', description: 'topological_order only: include nodes the selected types leave unconnected.' },
      includeOrphans: { type: 'boolean', description: 'containment_tree only: include nodes no project root reaches.' },
      executableOnly: { type: 'boolean', description: 'maintenance_plan only: just the actions with a proposed tool call.' },
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
        'maintenance_plan only: resume after this action id; pass cursor.nextAfterActionId while cursor.hasMore. An unknown id returns an empty page with cursor.found=false.',
      ),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Rows to return, default 100; analysis_history scans 1-100 files, default 30.',
      },
      nodeLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Node summaries per group: components and communities (default 25), health/workspace_brief/agent_brief (default 10).',
      },
      itemLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'project_map only: summaries per domain. Default 20.',
      },
      componentLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: components to inspect. Default 5.',
      },
      cycleLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: dependency cycles to inspect. Default 5.',
      },
      recommendationLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: relation recommendations to inspect. Default 20.',
      },
      orderLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: topological-order rows to inspect. Default 20.',
      },
      dependencyTypes: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description: 'health/workspace_brief/agent_brief: types for the cycle and order checks. Default ["dependencies"].',
      },
      componentTypes: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description: 'health/workspace_brief/agent_brief: types for the component check. Default all.',
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

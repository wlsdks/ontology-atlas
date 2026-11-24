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
    'Answer one graph question over the freshly compiled vault (impact, paths, neighbourhoods, health, repair queue, first-contact and coding-task briefs) without the full compile_ontology payload. Read-only; side effect 0. Nodes are canonical slugs or unique aliases. Use `path` for how two nodes connect and `neighbors` for one hop around a node; who points at a node, body links included, is find_backlinks; a predicate filter is query_concepts.\n' +
    'Operations, besides the self-describing ones: impact (what depends on a node); blast_radius (impact by kind and domain); similar_nodes (duplicates before a write); relation_check (preflight before add_relation); growth_plan (the reads each `## Uncertainty` asks for); maintenance_plan (ordered repair actions); workspace_brief (first-contact status and next actions); agent_brief (coding-task handoff); query_plan (cost estimate).\n' +
    'Required: `slug` for neighbors, reachability, pattern_walk, impact, blast_radius, subgraph, builder_context, lineage, node_profile and domain_profile; `from` and `to` for path, all_paths and explain_relation; `pattern` for pattern_walk; `targetOperation` for query_plan; `recordId` for analysis_record; `project`, `reviewRevision` and, on the first page, `expectedGraphHash` and `expectedSourceFingerprint` for meaning_repair_review; `task` for agent_brief with detail:"compact".\n' +
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
        description: 'query_plan: operation to estimate.',
      },
      recordId: nonBlankStringSchema('analysis_record: run or review UUID.'),
      analysisMode: { type: 'string', enum: ['meaning', 'architecture'], description: 'analysis_history only.' },
      analysisCursor: nonBlankStringSchema('analysis_history: nextCursor.'),
      iterations: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'centrality, communities; default 20.',
      },
      slug: nonBlankStringSchema(
        'Center or root node; builder_context also takes a focusParam (domain:auth).',
      ),
      seed: nonBlankStringSchema('subgraph, builder_context: alias of slug.'),
      candidateSlug: nonBlankStringSchema('similar_nodes: slug not yet written.'),
      title: nonBlankStringSchema('similar_nodes: title not yet written.'),
      from: NON_BLANK_STRING_SCHEMA,
      project: nonBlankStringSchema(
        'Project for domain_matrix, project_scope, project_map, agent_brief, meaning_repair_review; optional with one project.',
      ),
      detail: {
        type: 'string',
        enum: ['compact', 'full'],
        description:
          'agent_brief: "compact" task handoff (≤12000 UTF-8 bytes) or "full" (default).',
      },
      task: {
        ...NON_BLANK_STRING_SCHEMA,
        maxLength: AGENT_BRIEF_TASK_MAX_CHARS,
        description:
          'agent_brief compact: the coding task; selects persisted evidence, never persisted.',
      },
      expectedGraphHash: nonBlankStringSchema(
        'meaning_repair_review first page: meaningRepair graphHash.',
      ),
      expectedSourceFingerprint: nonBlankStringSchema(
        'meaning_repair_review first page: meaningRepair sourceFingerprint.',
      ),
      reviewRevision: nonBlankStringSchema('meaning_repair_review: meaningRepair revision.'),
      cursor: nonBlankStringSchema('meaning_repair_review: pagination.nextCursor after the first page.'),
      to: NON_BLANK_STRING_SCHEMA,
      direction: {
        type: 'string',
        enum: ['incoming', 'outgoing', 'both', 'undirected'],
        description: 'undirected: path, all_paths, explain_relation, reachability.',
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
        ...nonBlankStringSchema('relation_check and match_edges.'),
        enum: RELATION_TYPE_VALUES,
      },
      kind: {
        ...nonBlankStringSchema('match_nodes filter; recommend_relations takes capability or element.'),
        enum: NODE_KIND_VALUES,
      },
      domain: nonBlankStringSchema('match_nodes filter; domain_profile target.'),
      slugContains: nonBlankStringSchema('match_nodes: slug substring.'),
      minDegree: { type: 'integer', minimum: 0, description: 'match_nodes.' },
      maxDegree: { type: 'integer', minimum: 0, description: 'match_nodes.' },
      minInDegree: { type: 'integer', minimum: 0, description: 'match_nodes.' },
      minOutDegree: { type: 'integer', minimum: 0, description: 'match_nodes.' },
      hasIncoming: { type: 'boolean', description: 'match_nodes.' },
      hasOutgoing: { type: 'boolean', description: 'match_nodes.' },
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
        ...nonBlankStringSchema('relation_check: alias of type.'),
        enum: RELATION_TYPE_VALUES,
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
        description: 'Default 5 path/all_paths/explain_relation, 8 cycles.',
      },
      searchBudget: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description: 'all_paths, cycles: default 5000. With truncatedByBudget counts are lower bounds; zero cycles does NOT mean acyclic.',
      },
      includeExternal: { type: 'boolean', description: 'neighbors: include external element refs.' },
      includeUnresolved: { type: 'boolean', description: 'neighbors: include dangling refs.' },
      includeIsolated: { type: 'boolean', description: 'topological_order: include unconnected nodes.' },
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
        description: 'Rows, default 100; analysis_history files 1-100, default 30.',
      },
      nodeLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Node summaries per group; default 25 for components/communities, 10 for health/workspace_brief/agent_brief.',
      },
      itemLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'project_map: per domain, default 20.',
      },
      componentLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: components, default 5.',
      },
      cycleLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: cycles, default 5.',
      },
      recommendationLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: recommendations, default 20.',
      },
      orderLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'health/workspace_brief/agent_brief: order rows, default 20.',
      },
      dependencyTypes: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description: 'health/workspace_brief/agent_brief: cycle and order types, default ["dependencies"].',
      },
      componentTypes: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description: 'health/workspace_brief/agent_brief: component types, default all.',
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

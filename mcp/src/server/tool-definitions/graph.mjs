import { AGENT_BRIEF_TASK_MAX_CHARS } from '../../agent-brief-compact.mjs';
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
import { GRAPH_ARRAY_KEYS } from '../../vault.mjs';
import {
  EDGE_RATIONALE_OUTPUT_SCHEMA,
  EDGE_TARGET_KIND_DESCRIPTION,
  NODE_KIND_DESCRIPTION,
  NON_BLANK_STRING_SCHEMA,
  RELATION_ARRAY_PATCH_SCHEMA,
  nonBlankStringSchema,
  paginationOutputSchema,
} from '../tool-schemas.mjs';

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
    'Analysis archive: `analysis_history` reads immutable diagnostic Markdown summaries without compiling the graph; use analysisMode, project, limit (1–100 scanned files, default 30), and analysisCursor. `analysis_record` reads one exact run or review with recordId (UUID). Records retain raw answers, full-body evidence when available, request scope and uncertainty. They are not approved ontology facts; stored qualification describes captured evidence, never current source validity. Reviews are joined to their exact run/finding id. Follow pagination even if a filtered page is empty. These archive operations do not support query_plan. ' +
    'Run graph-engine queries over the freshly compiled ontology artifact. Operations: `neighbors` (local graph neighborhood), `path` (one compiled-edge route between two nodes with aligned `nodes[]` summaries), `all_paths` (bounded simple paths between two nodes with per-path `nodes[]` summaries plus limit/searchBudget/exhaustive/truncatedByBudget/totalPathsExact metadata and evidence guidance), `query_plan` (EXPLAIN-style side-effect-free cost/index estimate plus execution advice before a target operation, filter-preserving suggestedQuery, and filter-aware estimate.totalMatches for match_nodes/match_edges), `centrality` (PageRank-style core-node ranking plus bridge/authority/hub lists), `communities` (label-propagation clusters inside the graph), `similar_nodes` (duplicate/overlap candidates before writes), `explain_relation` (direct edges, shortest path, and shared-neighbor explanation between two nodes), `reachability` (transitive graph closure from a start node), `pattern_walk` (explicit relation-sequence paths such as project → domains → capabilities), `impact` (incoming by default: what depends on this node), `blast_radius` (impact grouped by kind/domain with cross-domain edge risk), `subgraph` (bounded N-hop graph slice for UI/agent views), `builder_context` (persisted Workshop focus, layout positions, direct graph slice, and safe write handoff; unsaved UI drafts are explicitly excluded; operation name retained for compatibility), `overview` (counts, relation distribution, and hubs), `schema` (kind-relation-kind patterns), `facets` (filter/dashboard aggregates), `match_nodes` (graph DB-style node rows with degree filters plus a followUp packet for the first returned row), `match_edges` (graph DB-style edge pattern rows plus a followUp packet for the first returned real edge), `node_profile` (single node detail dashboard), `domain_profile` (domain detail dashboard), `domain_matrix` (domain-to-domain coupling), `project_scope` (project-contained graph slice), `project_map` (domain-by-domain project map), `relation_check` (schema-aware preflight before add_relation), `components` (connected graph islands), `lineage` and `containment_tree` (project/domain/capability containment), `cycles` (directed dependency-cycle checks), `topological_order` (prerequisite-first dependency ordering), `recommend_relations` (safe domain-containment suggestions), `growth_plan` (side-effect-free ontology expansion candidates, plus a `nextReads` group that turns the `## Uncertainty` section of each node into the reads it asks for: kind, the statement as written, the paths and line ranges it names, and a one-sentence proposed read plus `patch_concept`, ordered cheapest-first and reporting `reason: no_bodies` when no node bodies were loaded), `maintenance_plan` (ordered post-write graph cleanup/repair actions with stable action `id`, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, ready cursor `cursor.found=true` / `cursor.reason=null`, cursor `nextAfterActionId`/`hasMore` pagination metadata, afterActionId resume, unknown-cursor empty page with `cursor.nextAfterActionId=null` / `cursor.hasMore=false`, kind filters, executable graph-array canonicalization, `executable` flags, and current-page `nextExecutableAction` / `nextReviewAction` pointers), `agent_brief` (Claude Code/Codex handoff prompt, structured businessOntologyLens with business-first outcome → domain → capability → element read order, graphDbQueryPack for facets, schema, match_nodes, match_edges, domain_matrix, centrality, all_paths, explain_relation, and business_questions scans for outcome / domain boundary / capability claim nodes / implementation evidence edges, structured cliFallbackCommands, recipes, graph entrypoints, graph_traversal playbook, traversalStrategy plan_before_enumeration/bounded_path_evidence/containment_cross_check guidance, playbook evidence/stopWhen checklists, write guardrails, relationDecisionGuide, resultContracts for all_paths completeness and match_nodes/match_edges followUp evidence, and read-first write policy), `meaning_repair_review` (provenance-bound, byte-bounded typed evidence pages and literal full-body read calls for the compact meaning repair manifest), `workspace_brief` (first-contact status + next actions), and `health` (one-shot graph integrity dashboard whose `relationCensus` labels compiler declaration counts and the nonnumeric canonical app-map comparison unit). ' +
    'For `agent_brief`, select `project` explicitly when the vault has more than one project. Omitted `detail` and `detail:"full"` return the complete project-scoped diagnostic contract. For a known coding task, call `detail:"compact"` directly after `connection_info`; do not precede it with `workspace_brief` or a full inventory unless the question needs whole-vault health. Compact v2 requires a nonblank request-local `task` (max 2000 characters) and returns at most 12000 UTF-8 JSON bytes: final source/meaning currentness, claim-compatible broad capability selection, persisted element/path evidence, explicit unknown impact and verification, exact full-body next reads, and a `detail:"full"` follow-up. Definition and Includes support desired work; Excludes may align with explicit non-goals, while a desired/negative boundary conflict, an unsupported claim, or a tied top claim returns no capability. Its `content[0].text` is the bounded handoff prompt while `structuredContent` carries the typed facts once. When the selected element Markdown contains reviewed Primary implementation / Supporting implementation / Focused test coordinates and the bound source is current, taskNavigation verifies only those named files and returns exact current lines plus the reviewed non-exhaustive IN/OUT boundary. After those reads, Atlas rechecks the same source identity, fingerprint, revision, and graph hash; any mismatch removes the exact target and downgrades the complete outer currentness contract. A ready prompt reads primary, supporting, focused tests, and a verified manifest together; requires named positive and negative regression tests with exact observable output; and runs the focused check once followed by one non-overlapping full check. Missing, ambiguous, stale, unsafe, or unrecorded coordinates emit no exact target. Task matching selects evidence only; it never searches the repository, never proves source behavior, never persists task text, never approves meaning, and never writes the vault. ' +
    'For `impact` and `blast_radius`, only declared `depends_on` is allowed; use reachability/subgraph for structure. Blast radius reports unknown risk/completeness plus review_required or declared_with_rationale edge qualification until relation-level source receipts exist. A missing `depends_on` preflight is schema-only: `relation_check` returns `proposedAction:null` plus a non-writing `approvalGate` until the agent explains the observable ability and semantic rationale and receives explicit human approval. ' +
    'Accepts canonical slugs or unique aliases. side effect 0. Use this when you need graph-database-like answers without pulling the full compile_ontology payload.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        ...NON_BLANK_STRING_SCHEMA,
        enum: QUERY_ONTOLOGY_OPERATIONS,
        description: 'Query operation to run.',
      },
      targetOperation: {
        ...NON_BLANK_STRING_SCHEMA,
        enum: QUERY_PLAN_TARGET_OPERATIONS,
        description:
          'query_plan only: read-only graph operation to explain before execution. Excludes query_plan, meaning_repair_review, analysis_history and analysis_record.',
      },
      recordId: nonBlankStringSchema('analysis_record only: immutable analysis or diagnostic-review UUID.'),
      analysisMode: { type: 'string', enum: ['meaning', 'architecture'], description: 'analysis_history only: optional analysis subject filter.' },
      analysisCursor: nonBlankStringSchema('analysis_history only: nextCursor from the preceding scanned-file page.'),
      iterations: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description:
          'centrality/communities only: positive integer PageRank or label-propagation iteration count. Defaults to 20, max 100.',
      },
      slug: nonBlankStringSchema(
        'Center/root node slug or unique alias. builder_context also accepts its own canonical Workshop focusParam (for example domain:auth). Required for neighbors, reachability, pattern_walk, impact, blast_radius, subgraph, builder_context, lineage, node_profile, and domain_profile; optional root for containment_tree.',
      ),
      seed: nonBlankStringSchema('Alias for slug when operation is subgraph or builder_context.'),
      candidateSlug: nonBlankStringSchema(
        'similar_nodes only: proposed slug for a not-yet-written concept candidate.',
      ),
      title: nonBlankStringSchema(
        'similar_nodes only: proposed title for a not-yet-written concept candidate.',
      ),
      from: nonBlankStringSchema(
        'Source node slug or unique alias. Required for path, all_paths, and explain_relation.',
      ),
      project: nonBlankStringSchema(
        'domain_matrix/project_scope/project_map/agent_brief/meaning_repair_review: project root slug or unique alias. Required for meaning_repair_review; optional when exactly one kind: project node exists for the other operations.',
      ),
      detail: {
        type: 'string',
        enum: ['compact', 'full'],
        description:
          'agent_brief only: compact v2 returns a task-scoped, selected-project handoff capped at 12000 UTF-8 JSON bytes, including exact reviewed taskNavigation only when the bound source is current; full returns the complete diagnostic manuals and graph packs. Omit to keep the current full response while compact is being qualified.',
      },
      task: {
        ...NON_BLANK_STRING_SCHEMA,
        maxLength: AGENT_BRIEF_TASK_MAX_CHARS,
        description:
          'agent_brief detail:"compact" only: request-local coding task used to select persisted capability, element, and reviewed navigation evidence after Definition/Includes/Excludes compatibility. Conflicting, unsupported, or tied claims return no capability. Never persisted, never used to invent a coordinate, and never treated as behavior proof or semantic approval.',
      },
      expectedGraphHash: nonBlankStringSchema(
        'meaning_repair_review first page: exact graphHash from meaningRepair:v2 provenance. Later nextCall values are revision-bound and omit it.',
      ),
      expectedSourceFingerprint: nonBlankStringSchema(
        'meaning_repair_review first page: exact current sourceFingerprint from meaningRepair:v2 provenance. Later nextCall values are revision-bound and omit it.',
      ),
      reviewRevision: nonBlankStringSchema(
        'meaning_repair_review only: sha256 revision from meaningRepair:v2, binding graph/source/typed rows/target mtimes.',
      ),
      cursor: nonBlankStringSchema(
        'meaning_repair_review only: opaque stateless cursor returned as pagination.nextCursor. Omit for the first page.',
      ),
      to: nonBlankStringSchema(
        'Target node slug or unique alias. Required for path, all_paths, and explain_relation.',
      ),
      direction: {
        type: 'string',
        enum: ['incoming', 'outgoing', 'both', 'undirected'],
        description:
          'neighbors/reachability/impact/blast_radius/subgraph/builder_context: incoming, outgoing, or both. path/all_paths/explain_relation/reachability also accepts undirected.',
      },
      types: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description:
          'Optional relation types to include, e.g. ["dependencies"] or ["depends_on"].',
      },
      pattern: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description:
          'pattern_walk only: required relation sequence to follow, e.g. ["domains", "capabilities", "elements"]. depends_on is normalized to dependencies.',
      },
      type: {
        ...nonBlankStringSchema(
          'Relation type for relation_check/match_edges, e.g. depends_on, relates, contains, describes, domains, capabilities, elements, or domain.',
        ),
        enum: RELATION_TYPE_VALUES,
      },
      kind: {
        ...nonBlankStringSchema(
          `match_nodes: optional node kind filter (${NODE_KIND_DESCRIPTION}). recommend_relations currently supports capability or element.`,
        ),
        enum: NODE_KIND_VALUES,
      },
      domain: nonBlankStringSchema(
        'match_nodes: optional exact domain filter. domain_profile: domain root slug or unique alias.',
      ),
      slugContains: nonBlankStringSchema(
        'match_nodes only: optional case-insensitive substring filter on canonical slug.',
      ),
      minDegree: {
        type: 'integer',
        minimum: 0,
        description: 'match_nodes only: non-negative integer minimum total graph degree.',
      },
      maxDegree: {
        type: 'integer',
        minimum: 0,
        description: 'match_nodes only: non-negative integer maximum total graph degree.',
      },
      minInDegree: {
        type: 'integer',
        minimum: 0,
        description: 'match_nodes only: non-negative integer minimum incoming graph degree.',
      },
      minOutDegree: {
        type: 'integer',
        minimum: 0,
        description: 'match_nodes only: non-negative integer minimum outgoing graph degree.',
      },
      hasIncoming: {
        type: 'boolean',
        description: 'match_nodes only: require presence or absence of incoming graph edges.',
      },
      hasOutgoing: {
        type: 'boolean',
        description: 'match_nodes only: require presence or absence of outgoing graph edges.',
      },
      sort: {
        type: 'string',
        enum: ['degree', 'inDegree', 'outDegree', 'slug'],
        description:
          'match_nodes only: sort rows by degree, inDegree, outDegree, or slug. Defaults to degree.',
      },
      fromKind: {
        ...nonBlankStringSchema(
          `match_edges only: optional source node kind filter (${NODE_KIND_DESCRIPTION}). Source must be a real ontology node, not external/unresolved.`,
        ),
        enum: NODE_KIND_VALUES,
      },
      toKind: {
        ...nonBlankStringSchema(
          `match_edges only: optional target kind filter (${EDGE_TARGET_KIND_DESCRIPTION}). Use external or unresolved for non-node refs.`,
        ),
        enum: EDGE_TARGET_KIND_VALUES,
      },
      relation: {
        ...nonBlankStringSchema('Alias for type when operation is relation_check.'),
        enum: RELATION_TYPE_VALUES,
      },
      depth: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'reachability/impact/blast_radius/subgraph/lineage/containment_tree traversal depth. Defaults to 3 for reachability, 2 for impact/blast_radius/subgraph, and 20 for lineage/containment_tree; capped at 20.',
      },
      maxHops: {
        type: 'integer',
        minimum: 0,
        maximum: 20,
        description: 'path/all_paths/explain_relation traversal hop cap or cycles max depth. Defaults to 5 for path/all_paths/explain_relation and 8 for cycles; capped at 20.',
      },
      searchBudget: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description:
          'all_paths, query_plan(all_paths), and cycles: maximum DFS states to expand before returning partial results. Defaults to 5000. For cycles, `limit` trims only the listed rows and this budget is the one bound that can cut the count short — when truncatedByBudget is true, totalCycles is a lower bound and zero cycles does NOT mean acyclic (check totalCyclesExact).',
      },
      includeExternal: {
        type: 'boolean',
        description:
          'neighbors only: include external path-like element refs. Defaults false.',
      },
      includeUnresolved: {
        type: 'boolean',
        description:
          'neighbors only: include dangling unresolved refs. Defaults false.',
      },
      includeIsolated: {
        type: 'boolean',
        description:
          'topological_order only: include nodes that are not connected by the selected relation types. Defaults false.',
      },
      includeOrphans: {
        type: 'boolean',
        description:
          'containment_tree only: include ancestorless nodes not reached from project roots. Defaults false.',
      },
      executableOnly: {
        type: 'boolean',
        description:
          'maintenance_plan only: when true, return only actions with a proposed tool call.',
      },
      phases: {
        type: 'array',
        maxItems: MAINTENANCE_PHASE_VALUES.length,
        items: {
          ...NON_BLANK_STRING_SCHEMA,
          enum: MAINTENANCE_PHASE_VALUES,
        },
        description:
          'maintenance_plan only: optional phase filter, e.g. ["repair", "link", "materialize"].',
      },
      severities: {
        type: 'array',
        maxItems: MAINTENANCE_SEVERITY_VALUES.length,
        items: {
          ...NON_BLANK_STRING_SCHEMA,
          enum: MAINTENANCE_SEVERITY_VALUES,
        },
        description:
          'maintenance_plan only: optional severity filter, e.g. ["fail", "warn"].',
      },
      kinds: {
        type: 'array',
        maxItems: MAINTENANCE_KIND_VALUES.length,
        items: {
          ...NON_BLANK_STRING_SCHEMA,
          enum: MAINTENANCE_KIND_VALUES,
        },
        description:
          'maintenance_plan only: optional action-kind filter, e.g. ["add_missing_relation", "canonicalize_graph_arrays"].',
      },
      afterActionId: nonBlankStringSchema(
        'maintenance_plan only: stable action id cursor; return actions after this id. Without afterActionId the ready page reports cursor.found=true and cursor.reason=null; cursor.nextAfterActionId matches the last returned action id (or null for an empty page), and cursor.hasMore matches whether more remaining actions exist after this page. nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity. Bucket totals (byPhase, bySeverity, byKind) match remainingActions for the returned cursor. Unknown cursors return an empty page with cursor.found=false, cursor.reason, zero remaining actions, cursor.nextAfterActionId=null, cursor.hasMore=false, and no next actions.',
      ),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Positive integer max rows/components/order entries to return. Defaults to 100, capped at 500.',
      },
      nodeLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description:
          'components/communities/health/workspace_brief/agent_brief only: positive integer max node summaries per component/community group. Defaults to 25 for components/communities and 10 for health, capped at 500.',
      },
      itemLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description:
          'project_map only: positive integer max capability/element/hotspot summaries per domain. Defaults to 20, capped at 500.',
      },
      componentLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description:
          'health/workspace_brief/agent_brief only: positive integer max connected components to inspect. Defaults to 5, capped at 500.',
      },
      cycleLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description:
          'health/workspace_brief/agent_brief only: positive integer max dependency cycles to inspect. Defaults to 5, capped at 500.',
      },
      recommendationLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description:
          'health/workspace_brief/agent_brief only: positive integer max relation recommendations to inspect. Defaults to 20, capped at 500.',
      },
      orderLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description:
          'health/workspace_brief/agent_brief only: positive integer max topological-order rows to inspect. Defaults to 20, capped at 500.',
      },
      dependencyTypes: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description:
          'health/workspace_brief/agent_brief only: dependency relation types used for cycle and topological-order checks. Defaults to ["dependencies"].',
      },
      componentTypes: {
        type: 'array',
        maxItems: RELATION_TYPE_VALUES.length,
        items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
        description:
          'health/workspace_brief/agent_brief only: relation types used for connected-component checks. Defaults to the full graph relation set.',
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

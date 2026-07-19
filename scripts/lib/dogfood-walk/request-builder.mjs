// Builds the ordered JSON-RPC request batch the dogfood MCP walk sends to the
// stdio server (initialize, tools/list, and one tools/call per surface).
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import { ROOT } from "./rpc-client.mjs";
import {
  DOGFOOD_TUNED_HEALTH_ARGS,
  DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
} from "./summaries.mjs";

const init = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "dogfood-walk", version: "0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
];

function call(id, name, args = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

export function buildDogfoodRequests() {
  return [
    ...init,
    { jsonrpc: "2.0", id: 55, method: "tools/list", params: {} },
    call(2, "list_kinds"),
    call(3, "list_concepts", { limit: 30 }),
    call(48, "list_concepts", { kind: "project", limit: 1 }),
    call(16, "get_concepts", {
      slugs: ["project", "capabilities/mcp-server", "missing-dogfood-slug"],
    }),
    call(81, "get_concepts", {
      slugs: Array.from({ length: 51 }, (_, index) => `dogfood-slug-${index}`),
    }),
    call(4, "find_evidence", { title: "vault" }),
    call(5, "find_path", {
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
    }),
    call(6, "find_backlinks", { slug: "capabilities/mcp-server" }),
    call(7, "find_orphans", {}),
    call(56, "query_concepts", { filter: "kind=capability AND domain=ai-agent-partner", limit: 5 }),
    call(60, "query_concepts", { filter: "slug!=project", limit: 1 }),
    call(57, "analyze_repo_structure", { rootPath: ROOT, maxDepth: 2 }),
    call(58, "infer_imports", { rootPath: ROOT, maxFiles: 5000 }),
    call(63, "rename_concept", {
      oldSlug: "capabilities/mcp-server",
      newSlug: "capabilities/mcp-server-dogfood-dry-run",
    }),
    call(64, "merge_concepts", {
      fromSlug: "capabilities/mcp-server",
      intoSlug: "domains/ai-agent-partner",
    }),
    call(65, "delete_concept", { slug: "capabilities/mcp-server" }),
    call(82, "add_concepts", {
      concepts: Array.from({ length: 51 }, (_, index) => ({
        slug: `capabilities/dogfood-batch-cap-${index}`,
        kind: "capability",
        title: `Dogfood Batch Cap ${index}`,
        domain: "ai-agent-partner",
      })),
    }),
    call(83, "add_relations", {
      relations: Array.from({ length: 51 }, (_, index) => ({
        from: "capabilities/mcp-server",
        to: `capabilities/dogfood-batch-cap-${index}`,
        type: "relates",
      })),
    }),
    call(85, "add_concepts", {
      concepts: [
        null,
        {
          slug: "dogfood-row-repair-multi",
          kind: "capability",
          title: "Dogfood Row Repair Multi",
          titel: "typo",
          domian: "ai-agent-partner",
        },
        {
          slug: "verify-duplicate-slug",
          kind: "capabilty",
          title: "Dogfood Row Repair Duplicate Seed",
        },
        {
          slug: "verify-duplicate-slug",
          kind: "capability",
          title: "Dogfood Row Repair Duplicate Later",
          domain: "ai-agent-partner",
        },
        {
          slug: "dogfood-row-repair-single",
          kind: "capability",
          title: "Dogfood Row Repair Single",
          titel: "typo",
        },
      ],
    }),
    call(86, "add_relations", {
      relations: [
        null,
        {
          from: "capabilities/mcp-server",
          to: "domains/ai-agent-partner",
          type: "relates",
          relation: "relates",
          frm: "capabilities/mcp-server",
        },
        {
          from: "capabilities/mcp-server",
          to: "domains/ai-agent-partner",
          type: "depend_on",
        },
        {
          from: "capabilities/mcp-server",
          to: "domains/ai-agent-partner",
          type: "relates",
          relation: "relates",
        },
      ],
    }),
    call(8, "validate_vault", {}),
    call(9, "query_ontology", { operation: "workspace_brief", limit: 5 }),
    call(10, "query_ontology", { operation: "health" }),
    call(49, "query_ontology", {
      operation: "health",
      ...DOGFOOD_TUNED_HEALTH_ARGS,
    }),
    call(50, "query_ontology", {
      operation: "workspace_brief",
      limit: 5,
      ...DOGFOOD_TUNED_HEALTH_ARGS,
      nodeLimit: DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
    }),
    call(11, "compile_ontology", { summary: true }),
    call(62, "compile_ontology", { nodesLimit: 1, edgesLimit: 1, includeIndexes: true }),
    call(12, "query_ontology", {
      operation: "pattern_walk",
      slug: "project",
      pattern: ["domains", "capabilities"],
      limit: 5,
    }),
    call(13, "query_ontology", {
      operation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
      limit: 3,
    }),
    call(14, "query_ontology", {
      operation: "query_plan",
      targetOperation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
    }),
    call(15, "query_ontology", { operation: "overview" }),
    call(17, "query_ontology", {
      operation: "query_plan",
      targetOperation: "project_map",
    }),
    call(18, "query_ontology", {
      operation: "project_map",
      itemLimit: 5,
    }),
    call(19, "query_ontology", {
      operation: "domain_profile",
      slug: "domains/ai-agent-partner",
      itemLimit: 5,
      limit: 5,
    }),
    call(20, "query_ontology", {
      operation: "domain_matrix",
      project: "project",
      limit: 10,
    }),
    call(21, "query_ontology", {
      operation: "components",
      limit: 5,
      nodeLimit: 5,
    }),
    call(22, "query_ontology", {
      operation: "relation_check",
      from: "capabilities/mcp-server",
      to: "domains/ai-agent-partner",
      type: "domain",
    }),
    call(23, "query_ontology", {
      operation: "maintenance_plan",
      limit: 5,
    }),
    call(54, "query_ontology", {
      operation: "maintenance_plan",
      afterActionId: "maint_missing",
      limit: 5,
    }),
    call(51, "query_ontology", {
      operation: "maintenance_plan",
      phases: ["repiar"],
    }),
    call(52, "query_ontology", {
      operation: "maintenance_plan",
      severities: ["fatal"],
    }),
    call(53, "query_ontology", {
      operation: "maintenance_plan",
      kinds: ["add_mising_relation"],
    }),
    call(61, "query_ontology", {
      operation: "health",
      dependencyTypes: ["depend_on"],
    }),
    call(66, "query_ontology", {
      operation: "relation_check",
      from: "missing-relation-check-source",
      to: "missing-relation-check-target",
      type: "depend_on",
    }),
    call(70, "add_relation", {
      from: "missing-add-relation-source",
      to: "missing-add-relation-target",
      type: "depend_on",
    }),
    call(67, "query_ontology", {
      operation: "match_nodes",
      kind: "capabilty",
    }),
    call(71, "query_ontology", {
      operation: "recommend_relations",
      kind: "capabilty",
    }),
    call(72, "query_ontology", {
      operation: "recommend_relations",
      kind: "domain",
    }),
    call(73, "query_ontology", {
      operation: "match_nodes",
      sort: "outDegre",
    }),
    call(74, "query_ontology", {
      operation: "match_edges",
      type: "depend_on",
    }),
    call(75, "find_neighbors", {
      slug: "missing-find-neighbors-type-source",
      types: ["depend_on"],
    }),
    call(76, "find_orphans", {
      kind: "capabilty",
    }),
    call(77, "find_orphans", {
      excludeKinds: ["capabilty"],
    }),
    call(78, "query_concepts", {
      filter: "kind=capabilty",
    }),
    call(79, "query_concepts", {
      filter: "has(capabilties)",
    }),
    call(80, "list_concepts", {
      kind: "capabilty",
    }),
    call(68, "query_ontology", {
      operation: "match_edges",
      fromKind: "capabilty",
    }),
    call(69, "query_ontology", {
      operation: "match_edges",
      toKind: "externl",
    }),
    call(24, "query_ontology", {
      operation: "growth_plan",
      limit: 5,
    }),
    call(25, "query_ontology", {
      operation: "recommend_relations",
      limit: 5,
    }),
    call(26, "query_ontology", {
      operation: "cycles",
      limit: 5,
    }),
    call(27, "query_ontology", {
      operation: "topological_order",
      limit: 10,
    }),
    call(28, "query_ontology", {
      operation: "lineage",
      slug: "capabilities/mcp-server",
      depth: 3,
      limit: 10,
    }),
    call(29, "query_ontology", {
      operation: "containment_tree",
      slug: "project",
      depth: 3,
      limit: 30,
    }),
    call(30, "query_ontology", {
      operation: "reachability",
      slug: "capabilities/mcp-server",
      direction: "outgoing",
      depth: 2,
      limit: 10,
    }),
    call(31, "query_ontology", {
      operation: "impact",
      slug: "capabilities/mcp-server",
      direction: "incoming",
      depth: 2,
      limit: 10,
    }),
    call(32, "query_ontology", {
      operation: "blast_radius",
      slug: "capabilities/mcp-server",
      direction: "incoming",
      depth: 2,
      limit: 10,
    }),
    call(33, "query_ontology", {
      operation: "subgraph",
      slug: "capabilities/mcp-server",
      direction: "both",
      depth: 1,
      limit: 12,
    }),
    call(34, "query_ontology", {
      operation: "schema",
      limit: 12,
    }),
    call(35, "query_ontology", {
      operation: "facets",
      limit: 8,
    }),
    call(36, "query_ontology", {
      operation: "match_nodes",
      kind: "capability",
      slugContains: "mcp",
      sort: "degree",
      limit: 8,
    }),
    call(37, "query_ontology", {
      operation: "match_edges",
      from: "capabilities/mcp-server",
      includeExternal: true,
      limit: 8,
    }),
    call(38, "query_ontology", {
      operation: "node_profile",
      slug: "capabilities/mcp-server",
      limit: 8,
    }),
    call(39, "query_ontology", {
      operation: "centrality",
      limit: 8,
    }),
    call(40, "query_ontology", {
      operation: "communities",
      limit: 6,
      nodeLimit: 6,
    }),
    call(41, "query_ontology", {
      operation: "similar_nodes",
      candidateSlug: "capabilities/mcp-server-v2",
      title: "MCP Server",
      kind: "capability",
      domain: "domains/ai-agent-partner",
      limit: 5,
    }),
    call(42, "query_ontology", {
      operation: "explain_relation",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
      limit: 5,
    }),
    call(43, "query_ontology", {
      operation: "neighbors",
      slug: "capabilities/mcp-server",
      limit: 8,
    }),
    call(44, "query_ontology", {
      operation: "path",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
    }),
    call(45, "query_ontology", {
      operation: "project_scope",
      project: "project",
      limit: 12,
    }),
    call(46, "list_concepts", { lmit: 1 }),
    call(59, "list_concepts", { lmit: 1, summry: true }),
    call(47, "query_ontology", { operation: "overveiw" }),
    call(84, "list_concept", { limit: 1 }),
  ];
}

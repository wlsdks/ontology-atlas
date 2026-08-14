// Builds the ordered JSON-RPC request batch the dogfood MCP walk sends to the
// stdio server. A small discovery batch first selects real project/domain/
// capability targets from the current vault; the main walk then exercises every
// surface against those targets instead of repository-specific fixture slugs.
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

const discoveryInit = [
  {
    jsonrpc: "2.0",
    id: 901,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "dogfood-walk-discovery", version: "0" },
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

export function buildDogfoodDiscoveryRequests() {
  return [
    ...discoveryInit,
    call(902, "list_concepts", { kind: "project", limit: 500 }),
    call(903, "list_concepts", { kind: "domain", limit: 500 }),
    call(904, "list_concepts", { kind: "capability", limit: 500 }),
  ];
}

export function selectDogfoodTargets({ projects, domains, capabilities }) {
  const projectSlug = firstNodeSlug(projects, "project");
  const domainSlugs = new Set(nodeRows(domains, "domain").map((node) => node.slug));
  const capabilityRows = nodeRows(capabilities, "capability");
  const capability = capabilityRows.find(
    (node) => typeof node.domain === "string" && domainSlugs.has(node.domain),
  );
  const mergeTarget = capabilityRows.find((node) => node.slug !== capability?.slug);

  if (!projectSlug || !capability || !mergeTarget) {
    throw new Error(
      "dogfood target discovery needs a project plus a capability with a resolved domain and a second merge target",
    );
  }

  const slugNeedle = capability.slug.split("/").filter(Boolean).at(-1);
  return {
    projectSlug,
    domainSlug: capability.domain,
    capabilitySlug: capability.slug,
    capabilityTitle: capability.title,
    mergeTargetSlug: mergeTarget.slug,
    pathTargetSlug: capability.domain,
    patternStartSlug: capability.slug,
    pattern: ["domain"],
    relationType: "domain",
    slugNeedle,
    similarCandidateSlug: `${capability.slug}-dogfood-candidate`,
  };
}

function nodeRows(payload, kind) {
  return Array.isArray(payload?.nodes)
    ? payload.nodes.filter(
      (node) => node?.kind === kind && typeof node.slug === "string" && node.slug.length > 0,
    )
    : [];
}

function firstNodeSlug(payload, kind) {
  return nodeRows(payload, kind)[0]?.slug ?? null;
}

function assertDogfoodTargets(targets) {
  const required = [
    "projectSlug",
    "domainSlug",
    "capabilitySlug",
    "capabilityTitle",
    "mergeTargetSlug",
    "pathTargetSlug",
    "patternStartSlug",
    "relationType",
    "slugNeedle",
    "similarCandidateSlug",
  ];
  const missing = required.filter(
    (key) => typeof targets?.[key] !== "string" || targets[key].length === 0,
  );
  if (!Array.isArray(targets?.pattern) || targets.pattern.length === 0) missing.push("pattern");
  if (missing.length > 0) {
    throw new Error(`dogfood targets missing: ${missing.join(", ")}`);
  }
}

export function buildDogfoodRequests(targets) {
  assertDogfoodTargets(targets);
  const {
    projectSlug,
    domainSlug,
    capabilitySlug,
    capabilityTitle,
    mergeTargetSlug,
    pathTargetSlug,
    patternStartSlug,
    pattern,
    relationType,
    slugNeedle,
    similarCandidateSlug,
  } = targets;
  return [
    ...init,
    { jsonrpc: "2.0", id: 55, method: "tools/list", params: {} },
    call(2, "list_kinds"),
    call(3, "list_concepts", { limit: 30 }),
    call(48, "list_concepts", { kind: "project", limit: 1 }),
    call(16, "get_concepts", {
      slugs: [projectSlug, capabilitySlug, "missing-dogfood-slug"],
    }),
    call(81, "get_concepts", {
      slugs: Array.from({ length: 51 }, (_, index) => `dogfood-slug-${index}`),
    }),
    call(4, "find_evidence", { title: "vault" }),
    call(5, "find_path", {
      from: capabilitySlug,
      to: pathTargetSlug,
    }),
    call(6, "find_backlinks", { slug: capabilitySlug }),
    call(7, "find_orphans", {}),
    call(56, "query_concepts", { filter: `kind=capability AND domain=${domainSlug}`, limit: 5 }),
    call(60, "query_concepts", { filter: `slug!=${projectSlug}`, limit: 1 }),
    call(57, "analyze_repo_structure", { rootPath: ROOT, maxDepth: 2 }),
    // reviewMode 없는 기본 호출은 128 KiB 를 넘는 순간 압축 리뷰 패킷
    // (inferImportsReview:v1, 원시 배열 없음)으로 자동 전환된다 — 이 저장소는
    // 이미 그 문턱을 넘어서, 전체 배열 모양을 단언하는 게이트가 2026-08-13 에
    // 빨개졌다. 게이트가 재는 것은 전체 응답 계약이므로 mcp/scripts/verify.mjs
    // 의 같은 스모크와 동일하게 명시적으로 전체를 요청한다.
    call(58, "infer_imports", {
      rootPath: ROOT,
      maxFiles: 5000,
      reviewMode: "full",
      allowLargeResponse: true,
    }),
    call(63, "rename_concept", {
      oldSlug: capabilitySlug,
      newSlug: `${capabilitySlug}-dogfood-dry-run`,
    }),
    call(64, "merge_concepts", {
      fromSlug: capabilitySlug,
      intoSlug: mergeTargetSlug,
    }),
    call(65, "delete_concept", { slug: capabilitySlug }),
    call(82, "add_concepts", {
      concepts: Array.from({ length: 51 }, (_, index) => ({
        slug: `capabilities/dogfood-batch-cap-${index}`,
        kind: "capability",
        title: `Dogfood Batch Cap ${index}`,
        domain: domainSlug,
      })),
    }),
    call(83, "add_relations", {
      relations: Array.from({ length: 51 }, (_, index) => ({
        from: capabilitySlug,
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
          domian: domainSlug,
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
          domain: domainSlug,
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
          from: capabilitySlug,
          to: domainSlug,
          type: "relates",
          relation: "relates",
          frm: capabilitySlug,
        },
        {
          from: capabilitySlug,
          to: domainSlug,
          type: "depend_on",
        },
        {
          from: capabilitySlug,
          to: domainSlug,
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
      slug: patternStartSlug,
      pattern,
      limit: 5,
    }),
    call(13, "query_ontology", {
      operation: "all_paths",
      from: capabilitySlug,
      to: pathTargetSlug,
      maxHops: 4,
      limit: 3,
    }),
    call(14, "query_ontology", {
      operation: "query_plan",
      targetOperation: "all_paths",
      from: capabilitySlug,
      to: pathTargetSlug,
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
      slug: domainSlug,
      itemLimit: 5,
      limit: 5,
    }),
    call(20, "query_ontology", {
      operation: "domain_matrix",
      project: projectSlug,
      limit: 10,
    }),
    call(21, "query_ontology", {
      operation: "components",
      limit: 5,
      nodeLimit: 5,
    }),
    call(22, "query_ontology", {
      operation: "relation_check",
      from: capabilitySlug,
      to: domainSlug,
      type: relationType,
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
      slug: capabilitySlug,
      depth: 3,
      limit: 10,
    }),
    call(29, "query_ontology", {
      operation: "containment_tree",
      slug: projectSlug,
      depth: 3,
      limit: 30,
    }),
    call(30, "query_ontology", {
      operation: "reachability",
      slug: capabilitySlug,
      direction: "outgoing",
      depth: 2,
      limit: 10,
    }),
    call(31, "query_ontology", {
      operation: "impact",
      slug: capabilitySlug,
      direction: "incoming",
      depth: 2,
      limit: 10,
    }),
    call(32, "query_ontology", {
      operation: "blast_radius",
      slug: capabilitySlug,
      direction: "incoming",
      depth: 2,
      limit: 10,
    }),
    call(33, "query_ontology", {
      operation: "subgraph",
      slug: capabilitySlug,
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
      slugContains: slugNeedle,
      sort: "degree",
      limit: 8,
    }),
    call(37, "query_ontology", {
      operation: "match_edges",
      from: capabilitySlug,
      includeExternal: true,
      limit: 8,
    }),
    call(38, "query_ontology", {
      operation: "node_profile",
      slug: capabilitySlug,
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
      candidateSlug: similarCandidateSlug,
      title: capabilityTitle,
      kind: "capability",
      domain: domainSlug,
      limit: 5,
    }),
    call(42, "query_ontology", {
      operation: "explain_relation",
      from: capabilitySlug,
      to: pathTargetSlug,
      maxHops: 4,
      limit: 5,
    }),
    call(43, "query_ontology", {
      operation: "neighbors",
      slug: capabilitySlug,
      limit: 8,
    }),
    call(44, "query_ontology", {
      operation: "path",
      from: capabilitySlug,
      to: pathTargetSlug,
      maxHops: 4,
    }),
    call(45, "query_ontology", {
      operation: "project_scope",
      project: projectSlug,
      limit: 12,
    }),
    call(46, "list_concepts", { lmit: 1 }),
    call(59, "list_concepts", { lmit: 1, summry: true }),
    call(47, "query_ontology", { operation: "overveiw" }),
    call(84, "list_concept", { limit: 1 }),
  ];
}

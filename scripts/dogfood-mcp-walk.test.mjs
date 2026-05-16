#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDogfoodRequests,
  DOGFOOD_RESPONSE_LABELS,
  evaluateDogfoodGate,
  expectedResponseIds,
  missingResponseLabels,
  parseDogfoodTimeoutMs,
  parseRpcResponses,
  recordResult,
  rpcTimeoutFailure,
  shouldFinishRpc,
  stderrWarningFailures,
} from "./dogfood-mcp-walk.mjs";

const okShape = {
  kinds: { total: 1, byKind: { project: 1 } },
  list: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }],
  },
  batch: {
    concepts: [
      {
        ok: true,
        slug: "project",
        frontmatter: { kind: "project", title: "Project" },
        mtime: 1,
      },
      {
        ok: true,
        slug: "capabilities/mcp-server",
        frontmatter: { kind: "capability", title: "MCP Server" },
        mtime: 1,
      },
      {
        ok: false,
        slug: "missing-dogfood-slug",
        error: "Doc not found: missing-dogfood-slug",
      },
    ],
  },
  ev: { matches: [] },
  path: { found: true, hopCount: 1, hops: ["a", "b"] },
  bl: {
    total: 1,
    matches: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
  },
  orph: { total: 0, orphans: [] },
  validation: {
    scanned: 1,
    problems: [],
    summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} },
  },
  brief: {
    operation: "workspace_brief",
    status: "healthy",
    summary: { nodes: 1, edges: 0, issues: 0 },
    nextActions: [],
    health: { checks: [{ id: "compile_issues", status: "pass", count: 0 }] },
  },
  health: {
    operation: "health",
    status: "healthy",
    summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 },
    checks: [{ id: "compile_issues", status: "pass", count: 0 }],
  },
  compiled: {
    version: 1,
    graphHash: "abc123",
    maxMtime: 1,
    nodeCount: 1,
    edgeCount: 2,
    resolvedEdgeCount: 1,
    externalEdgeCount: 1,
    unresolvedEdgeCount: 0,
    aliasCount: 1,
    ambiguousAliasCount: 0,
    issueCount: 0,
    canonicalizationActionCount: 0,
    byKind: { project: 1 },
    byDomain: {},
  },
  overview: {
    operation: "overview",
    graph: {
      nodes: 1,
      edges: 2,
      resolvedEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
      aliases: 1,
      ambiguousAliases: 0,
      issues: 0,
      graphHash: "abc123",
      maxMtime: 1,
    },
    byKind: { project: 1 },
    byRelation: {},
    hubs: [],
  },
  patternWalk: {
    operation: "pattern_walk",
    start: "project",
    pattern: ["domains", "capabilities"],
    layers: [
      {
        step: 1,
        relation: "domains",
        totalPaths: 1,
        totalNodes: 1,
        nodes: [{ slug: "domains/auth", kind: "domain", title: "Auth" }],
      },
    ],
    endNodes: [{ slug: "capabilities/login", kind: "capability", title: "Login" }],
    paths: {
      total: 1,
      limited: false,
      rows: [
        {
          end: "capabilities/login",
          path: ["project", "domains/auth", "capabilities/login"],
          edges: [],
        },
      ],
    },
  },
  allPaths: {
    operation: "all_paths",
    from: "capabilities/mcp-server",
    to: "domains/vault-local-first",
    found: true,
    direction: "undirected",
    maxHops: 4,
    totalPaths: 2,
    limited: false,
    shortestHopCount: 2,
    byLength: { 2: 2 },
    paths: [
      {
        hopCount: 2,
        hops: ["capabilities/mcp-server", "domains/ai-agent-partner", "domains/vault-local-first"],
        edges: [],
      },
      {
        hopCount: 2,
        hops: ["capabilities/mcp-server", "capabilities/vault-validator", "domains/vault-local-first"],
        edges: [],
      },
    ],
  },
  allPathsPlan: {
    operation: "query_plan",
    targetOperation: "all_paths",
    sideEffect: false,
    normalized: {
      targetOperation: "all_paths",
      types: null,
      limit: 25,
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      direction: "undirected",
      maxHops: 4,
    },
    indexesUsed: ["aliasToSlug", "in", "out"],
    estimate: {
      strategy: "bounded_path_enumeration",
      edgeScans: 20,
      reachableWithinDepth: 8,
      frontierByDepth: [],
      potentialPathUpperBound: 40,
      resultUpperBound: 25,
      costClass: "medium",
    },
    warnings: ["all_paths may be truncated by limit; reduce maxHops or add relation types."],
  },
  projectMapPlan: {
    operation: "query_plan",
    targetOperation: "project_map",
    sideEffect: false,
    normalized: {
      targetOperation: "project_map",
      types: null,
      limit: 100,
    },
    indexesUsed: ["compiled_artifact"],
    estimate: {
      strategy: "aggregate_scan",
      nodeScans: 1,
      edgeScans: 2,
      costClass: "low",
    },
    warnings: [],
  },
  projectMap: {
    operation: "project_map",
    project: "project",
    node: { slug: "project", kind: "project", title: "Project" },
    summary: {
      nodes: 3,
      domains: 1,
      capabilities: 1,
      elements: 0,
      unassignedNodes: 0,
      internalEdges: 2,
      boundaryEdges: 0,
      externalEdges: 0,
      unresolvedEdges: 0,
    },
    limited: false,
    domains: [
      {
        slug: "domains/auth",
        kind: "domain",
        title: "Auth",
        summary: {
          nodes: 2,
          capabilities: 1,
          elements: 0,
          internalEdges: 1,
          boundaryEdges: 0,
          externalEdges: 0,
          unresolvedEdges: 0,
        },
        capabilities: {
          total: 1,
          limited: false,
          nodes: [{ slug: "capabilities/login", kind: "capability", title: "Login" }],
        },
        elements: { total: 0, limited: false, nodes: [] },
      },
    ],
    unassigned: { total: 0, limited: false, nodes: [] },
    hotspots: [],
  },
  domainProfile: {
    operation: "domain_profile",
    domain: "domains/ai-agent-partner",
    node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
    parents: {
      projects: [{ slug: "project", via: "domains", node: { slug: "project", kind: "project", title: "Project" } }],
    },
    summary: {
      nodes: 3,
      capabilities: 1,
      elements: 1,
      internalEdges: 2,
      boundaryEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
    },
    capabilities: {
      total: 1,
      limited: false,
      nodes: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
    },
    elements: {
      total: 1,
      limited: false,
      nodes: [{ slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" }],
    },
    hotspots: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
    edges: {
      boundary: {
        total: 1,
        limited: false,
        byRelation: { relates: 1 },
        edges: [{ from: "capabilities/mcp-server", to: "domains/vault-local-first", via: "relates" }],
      },
      external: {
        total: 1,
        limited: false,
        byRelation: { elements: 1 },
        edges: [{ from: "capabilities/mcp-server", to: "mcp/src/index.js", via: "elements" }],
      },
      unresolved: { total: 0, limited: false, byRelation: {}, edges: [] },
    },
  },
  domainMatrix: {
    operation: "domain_matrix",
    project: "project",
    summary: {
      domains: 2,
      nodes: 5,
      assignedNodes: 4,
      unassignedNodes: 1,
      crossDomainEdges: 1,
      selfDomainEdges: 2,
      externalEdges: 1,
      unresolvedEdges: 0,
    },
    domains: [
      {
        slug: "domains/ai-agent-partner",
        node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
        nodes: 3,
        outgoing: 1,
        incoming: 0,
        selfEdges: 2,
        externalEdges: 1,
        unresolvedEdges: 0,
      },
      {
        slug: "domains/vault-local-first",
        node: { slug: "domains/vault-local-first", kind: "domain", title: "Vault Local First" },
        nodes: 1,
        outgoing: 0,
        incoming: 1,
        selfEdges: 0,
        externalEdges: 0,
        unresolvedEdges: 0,
      },
    ],
    connections: {
      total: 1,
      limited: false,
      rows: [
        {
          from: "domains/ai-agent-partner",
          to: "domains/vault-local-first",
          count: 1,
          byRelation: { relates: 1 },
          examples: [{ from: "capabilities/mcp-server", to: "domains/vault-local-first", via: "relates" }],
        },
      ],
    },
  },
  components: {
    operation: "components",
    totalComponents: 2,
    largestSize: 4,
    singletonCount: 1,
    limited: false,
    components: [
      {
        id: 1,
        size: 4,
        kinds: { project: 1, domain: 1, capability: 2 },
        nodeLimited: false,
        nodes: [
          { slug: "project", kind: "project", title: "Project" },
          { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
          { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
          { slug: "capabilities/ontology-sync-skill", kind: "capability", title: "Ontology Sync Skill" },
        ],
      },
      {
        id: 2,
        size: 1,
        kinds: { capability: 1 },
        nodeLimited: false,
        nodes: [{ slug: "capabilities/orphan", kind: "capability", title: "Orphan" }],
      },
    ],
  },
  relationCheck: {
    operation: "relation_check",
    from: "capabilities/mcp-server",
    to: "domains/ai-agent-partner",
    relation: "domain",
    fromKind: "capability",
    toKind: "domain",
    exists: true,
    verdict: "already_exists",
    matchingEdges: [
      {
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        via: "domain",
      },
    ],
    schemaPattern: {
      fromKind: "capability",
      relation: "domain",
      toKind: "domain",
      count: 1,
    },
  },
  maintenancePlan: {
    operation: "maintenance_plan",
    sideEffect: false,
    graphHash: "abc123",
    summary: {
      totalActions: 2,
      filteredActions: 2,
      remainingActions: 2,
      executableActions: 1,
      reviewActions: 1,
      compileIssues: 0,
      dependencyCycles: 0,
      canonicalizationActions: 0,
      danglingReferences: 0,
      relationRecommendations: 1,
      externalElementRefs: 0,
      externalElementRefsIgnored: 0,
      unassignedNodes: 1,
      emptyDomains: 0,
    },
    filters: {
      executableOnly: false,
      phases: [],
      severities: [],
      kinds: [],
    },
    cursor: {
      afterActionId: null,
      found: true,
      startIndex: 0,
      nextAfterActionId: "maint_review",
      hasMore: false,
    },
    byPhase: { link: 1, review: 1 },
    bySeverity: { warn: 1, info: 1 },
    byKind: { add_missing_relation: 1, unassigned_node: 1 },
    limited: false,
    nextExecutableAction: {
      id: "maint_link",
      phase: "link",
      kind: "add_missing_relation",
      severity: "warn",
      score: 1,
      reason: "Missing containment relation.",
      executable: true,
      proposedAction: {
        tool: "add_relation",
        args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
      },
    },
    nextReviewAction: {
      id: "maint_review",
      phase: "review",
      kind: "unassigned_node",
      severity: "info",
      score: 0.5,
      reason: "Node has no project assignment.",
      executable: false,
    },
    actions: [
      {
        id: "maint_link",
        phase: "link",
        kind: "add_missing_relation",
        severity: "warn",
        score: 1,
        reason: "Missing containment relation.",
        executable: true,
        proposedAction: {
          tool: "add_relation",
          args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
        },
      },
      {
        id: "maint_review",
        phase: "review",
        kind: "unassigned_node",
        severity: "info",
        score: 0.5,
        reason: "Node has no project assignment.",
        executable: false,
      },
    ],
  },
  growthPlan: {
    operation: "growth_plan",
    summary: {
      relationRecommendations: 1,
      externalElementRefs: 1,
      externalElementRefsIgnored: 0,
      danglingReferences: 1,
      unassignedNodes: 1,
      emptyDomains: 1,
      totalActions: 3,
    },
    relationRecommendations: {
      operation: "recommend_relations",
      mode: "domain_containment",
      totalRecommendations: 1,
      limited: false,
      recommendations: [
        {
          kind: "missing_domain_containment",
          score: 1,
          from: "domains/ai-agent-partner",
          to: "capabilities/mcp-server",
          relation: "capabilities",
          reason: "Missing containment relation.",
          proposedAction: {
            tool: "add_relation",
            args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
          },
        },
      ],
    },
    externalElementRefs: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "materialize_external_element",
          score: 0.8,
          from: "capabilities/mcp-server",
          ref: "mcp/src/index.js",
          suggestedSlug: "elements/mcp-src-index",
          reason: "Materialize external element.",
          proposedAction: {
            tool: "add_concept",
            args: { slug: "elements/mcp-src-index", kind: "element", title: "Index" },
          },
        },
      ],
    },
    danglingReferences: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "resolve_dangling_reference",
          score: 0.7,
          from: "capabilities/mcp-server",
          ref: "capabilities/missing",
          relation: "dependencies",
          reason: "Resolve dangling reference.",
          proposedAction: {
            tool: "add_concept",
            args: { slug: "capabilities/missing", kind: "capability", title: "Missing" },
          },
        },
      ],
    },
    unassignedNodes: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "unassigned_node",
          score: 0.5,
          slug: "capabilities/orphan",
          reason: "Assign it to a domain.",
        },
      ],
    },
    emptyDomains: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "empty_domain",
          score: 0.4,
          slug: "domains/empty",
          reason: "Domain has no contained capability or element nodes yet.",
        },
      ],
    },
  },
  relationRecommendations: {
    operation: "recommend_relations",
    mode: "domain_containment",
    totalRecommendations: 1,
    limited: false,
    recommendations: [
      {
        kind: "missing_domain_containment",
        score: 1,
        from: "domains/ai-agent-partner",
        to: "capabilities/mcp-server",
        relation: "capabilities",
        reason: "Missing containment relation.",
        proposedAction: {
          tool: "add_relation",
          args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
        },
      },
    ],
  },
  cycles: {
    operation: "cycles",
    relationTypes: ["dependencies"],
    maxDepth: 8,
    totalCycles: 1,
    limited: false,
    cycles: [
      {
        id: "capabilities/a>capabilities/b>capabilities/a",
        length: 2,
        nodes: ["capabilities/a", "capabilities/b", "capabilities/a"],
        edges: [
          { from: "capabilities/a", to: "capabilities/b", via: "dependencies" },
          { from: "capabilities/b", to: "capabilities/a", via: "dependencies" },
        ],
      },
    ],
  },
  topologicalOrder: {
    operation: "topological_order",
    relationTypes: ["dependencies"],
    prerequisiteFirst: true,
    includeIsolated: false,
    acyclic: true,
    totalNodes: 3,
    orderedCount: 3,
    selectedEdges: 2,
    limited: false,
    order: [
      { rank: 0, slug: "capabilities/storage", node: { slug: "capabilities/storage", kind: "capability", title: "Storage" } },
      { rank: 1, slug: "capabilities/auth", node: { slug: "capabilities/auth", kind: "capability", title: "Auth" } },
      { rank: 2, slug: "capabilities/app", node: { slug: "capabilities/app", kind: "capability", title: "App" } },
    ],
    layers: [
      { rank: 0, nodes: [{ slug: "capabilities/storage", kind: "capability", title: "Storage" }] },
      { rank: 1, nodes: [{ slug: "capabilities/auth", kind: "capability", title: "Auth" }] },
      { rank: 2, nodes: [{ slug: "capabilities/app", kind: "capability", title: "App" }] },
    ],
    blocked: [],
  },
};

describe("recordResult", () => {
  it("records missing, error, and non-JSON responses", () => {
    const failures = [];
    assert.equal(recordResult(failures, "missing", null), false);
    assert.equal(recordResult(failures, "error", { error: { message: "bad" } }), false);
    assert.equal(recordResult(failures, "raw", { rawText: "not json" }), false);
    assert.deepEqual(failures, [
      "missing: missing response",
      "error: bad",
      "raw: non-JSON response",
    ]);
  });

  it("passes parsed JSON result objects", () => {
    const failures = [];
    assert.equal(recordResult(failures, "ok", { total: 1 }), true);
    assert.deepEqual(failures, []);
  });
});

describe("rpc response completion helpers", () => {
  it("parses dogfood timeout env as a strict positive integer", () => {
    assert.equal(parseDogfoodTimeoutMs(undefined), 5000);
    assert.equal(parseDogfoodTimeoutMs(""), 5000);
    assert.equal(parseDogfoodTimeoutMs("12000"), 12000);
    assert.equal(parseDogfoodTimeoutMs("1000ms"), false);
    assert.equal(parseDogfoodTimeoutMs("0"), false);
  });

  it("derives response ids from requests with JSON-RPC ids", () => {
    assert.deepEqual(
      [...expectedResponseIds([{ id: 1 }, { method: "notifications/initialized" }, { id: 2 }])],
      [1, 2],
    );
  });

  it("parses newline-delimited JSON-RPC responses", () => {
    assert.deepEqual(
      parseRpcResponses('{"id":1,"result":{}}\nnot-json\n{"id":2,"error":{"message":"bad"}}\n'),
      [
        { id: 1, result: {} },
        { id: 2, error: { message: "bad" } },
      ],
    );
  });

  it("finishes after all expected responses or any error response", () => {
    const expectedIds = new Set([1, 2]);
    assert.equal(shouldFinishRpc('{"id":1,"result":{}}\n', expectedIds), false);
    assert.equal(shouldFinishRpc('{"id":1,"result":{}}\n{"id":2,"result":{}}\n', expectedIds), true);
    assert.equal(shouldFinishRpc('{"id":1,"error":{"message":"bad"}}\n', expectedIds), true);
  });

  it("formats timeout failures with missing response labels", () => {
    const labels = new Map([
      [1, "initialize"],
      [2, "list_kinds"],
      [3, "list_concepts"],
    ]);
    const missing = missingResponseLabels([{ id: 1, result: {} }], labels);
    assert.deepEqual(missing, ["list_kinds", "list_concepts"]);
    assert.equal(
      rpcTimeoutFailure(5000, missing),
      "rpc: timed out after 5000ms waiting for list_kinds, list_concepts",
    );
  });

  it("keeps dogfood response labels aligned with the get_concepts smoke", () => {
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(16), "get_concepts");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(17), "project_map_query_plan");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(18), "project_map");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(19), "domain_profile");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(20), "domain_matrix");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(21), "components");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(22), "relation_check");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(23), "maintenance_plan");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(24), "growth_plan");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(25), "recommend_relations");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(26), "cycles");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(27), "topological_order");
    assert.deepEqual(
      [...expectedResponseIds(buildDogfoodRequests())].sort((a, b) => a - b),
      [...DOGFOOD_RESPONSE_LABELS.keys()].sort((a, b) => a - b),
    );
    const responsesWithoutGetConcepts = [...DOGFOOD_RESPONSE_LABELS.keys()]
      .filter((id) => id !== 16)
      .map((id) => ({ id, result: {} }));
    const missing = missingResponseLabels(responsesWithoutGetConcepts, DOGFOOD_RESPONSE_LABELS);
    assert.deepEqual(missing, ["get_concepts"]);
    assert.equal(
      rpcTimeoutFailure(5000, missing),
      "rpc: timed out after 5000ms waiting for get_concepts",
    );
  });

  it("flags stderr warnings without failing on normal connection logs", () => {
    assert.deepEqual(stderrWarningFailures("[oh-my-ontology-mcp] connected. vault=/tmp/x"), []);
    assert.deepEqual(
      stderrWarningFailures(
        "[oh-my-ontology-mcp] connected. vault=/tmp/x\n(node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected",
      ),
      ["stderr warning: (node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected"],
    );
  });
});

describe("evaluateDogfoodGate", () => {
  it("passes the healthy dogfood shape", () => {
    assert.deepEqual(evaluateDogfoodGate(okShape), []);
  });

  it("fails on malformed list_kinds payloads", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      kinds: { total: 2, byKind: { project: 1 } },
    });
    assert.deepEqual(failures, ["list_kinds response total mismatch — total 2, byKind 1"]);
  });

  it("fails on malformed list_concepts payloads", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      list: { total: 1, nodes: [] },
    });
    assert.deepEqual(failures, ["list_concepts response missing vaultRoot"]);
  });

  it("fails on malformed get_concepts dogfood payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, batch: {} }),
      ["get_concepts response missing concepts array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, batch: { concepts: [okShape.batch.concepts[0]] } }),
      ["get_concepts response row count mismatch — expected 3, got 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        batch: { concepts: [{ ...okShape.batch.concepts[0], ok: false }, okShape.batch.concepts[1], okShape.batch.concepts[2]] },
      }),
      ["get_concepts response expected success row at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        batch: { concepts: [okShape.batch.concepts[0], okShape.batch.concepts[1], { slug: "missing-dogfood-slug", ok: true }] },
      }),
      ["get_concepts response expected missing row to be ok:false"],
    );
  });

  it("fails on malformed find_evidence payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, ev: {} }),
      ["find_evidence response missing matches array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, ev: { matches: [{}] } }),
      ["find_evidence response missing row slug at index 0"],
    );
  });

  it("fails on malformed find_path payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { hopCount: 1, hops: ["a", "b"] } }),
      ["find_path response missing found flag"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hops: ["a", "b"] } }),
      ["find_path response missing hopCount"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 1 } }),
      ["find_path response missing hops array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 2, hops: ["a", "b"] } }),
      ["find_path response hop mismatch — hopCount 2, hops 2"],
    );
  });

  it("fails on malformed find_backlinks payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, bl: { matches: [] } }),
      ["find_backlinks response missing total count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, bl: { total: 0, matches: [{}] } }),
      ["find_backlinks response match count exceeds total — matches 1, total 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, bl: { total: 1, matches: [{}] } }),
      ["find_backlinks response missing row slug at index 0"],
    );
  });

  it("fails on malformed find_orphans payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, orph: { orphans: [] } }),
      ["find_orphans response missing total count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, orph: { total: 0 } }),
      ["find_orphans response missing orphans array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, orph: { total: 0, orphans: [{}] } }),
      ["find_orphans response orphan count exceeds total — orphans 1, total 0"],
    );
  });

  it("fails on malformed workspace_brief payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "health", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response operation mismatch — health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response operation mismatch — undefined"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", nextActions: [] } }),
      ["workspace_brief response missing summary"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response missing summary.edges"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 } } }),
      ["workspace_brief response missing nextActions array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response missing health block"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [], health: { checks: [] } } }),
      ["workspace_brief response missing health checks"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ id: "compile_issues" }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response missing nextAction severity at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ severity: "info" }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response missing nextAction identifier at index 0"],
    );
  });

  it("fails on malformed health payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "workspace_brief", status: "healthy", summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 }, checks: okShape.health.checks } }),
      ["health response operation mismatch — workspace_brief"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 }, checks: okShape.health.checks } }),
      ["health response operation mismatch — undefined"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", checks: okShape.health.checks } }),
      ["health response missing summary"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: { issues: 0, dependencyCycles: 0 }, checks: okShape.health.checks } }),
      ["health response missing summary.unresolvedEdges"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary } }),
      ["health response missing checks array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [] } }),
      ["health response missing health checks"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ status: "pass", count: 0 }] } }),
      ["health response missing check id at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ id: "compile_issues", count: 0 }] } }),
      ["health response missing check status: compile_issues"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ id: "compile_issues", status: "pass" }] } }),
      ["health response missing check count: compile_issues"],
    );
  });

  it("fails on malformed compile_ontology summary payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, version: 0 } }),
      ["compile_ontology response missing version"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, graphHash: "" } }),
      ["compile_ontology response missing graphHash"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, maxMtime: -1 } }),
      ["compile_ontology response missing maxMtime"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, nodeCount: undefined } }),
      ["compile_ontology response missing nodeCount"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, byKind: null } }),
      ["compile_ontology response missing byKind aggregate"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, byDomain: { "": 1 } } }),
      ["compile_ontology response has empty byDomain key"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, byKind: { project: 2 } } }),
      ["compile_ontology response byKind mismatch — nodeCount 1, byKind 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        compiled: { ...okShape.compiled, edgeCount: 2, resolvedEdgeCount: 1, externalEdgeCount: 0, unresolvedEdgeCount: 1 },
      }),
      [],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        compiled: { ...okShape.compiled, edgeCount: 3, resolvedEdgeCount: 1, externalEdgeCount: 1 },
      }),
      ["compile_ontology response edge count mismatch — edgeCount 3, resolved+external+unresolved 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        compiled: { ...okShape.compiled, edgeCount: 1, resolvedEdgeCount: 1, externalEdgeCount: 1 },
      }),
      ["compile_ontology response edge count mismatch — edgeCount 1, resolved+external+unresolved 2"],
    );
  });

  it("fails on malformed overview payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, operation: "health" } }),
      ["overview returned unexpected operation: health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, graph: { ...okShape.overview.graph, graphHash: "" } } }),
      ["overview response missing graphHash"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, graph: { ...okShape.overview.graph, edges: 3 } } }),
      ["overview response edge count mismatch — edges 3, resolved+external+unresolved 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, hubs: null } }),
      ["overview response missing hubs array"],
    );
  });

  it("fails on malformed pattern_walk payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, patternWalk: { ...okShape.patternWalk, operation: "path" } }),
      ["pattern_walk response operation mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, patternWalk: { ...okShape.patternWalk, paths: { total: 1, limited: false } } }),
      ["pattern_walk response missing paths.rows array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: { total: 0, limited: false, rows: [] },
        },
      }),
      ["pattern_walk response returned no rows"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: { total: 1, limited: false, rows: [{ end: "capabilities/login" }] },
        },
      }),
      ["pattern_walk response missing path at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: {
            total: 1,
            limited: true,
            rows: okShape.patternWalk.paths.rows,
          },
        },
      }),
      ["pattern_walk response limited without hidden row — rows 1, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: {
            total: 2,
            limited: false,
            rows: okShape.patternWalk.paths.rows,
          },
        },
      }),
      ["pattern_walk response total mismatch — rows 1, total 2"],
    );
  });

  it("fails on malformed all_paths payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, operation: "path" } }),
      ["all_paths response operation mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, paths: null } }),
      ["all_paths response missing paths array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, totalPaths: 1, limited: true, paths: [okShape.allPaths.paths[0]] } }),
      ["all_paths response limited without hidden path — rows 1, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, totalPaths: 3, limited: false, paths: [okShape.allPaths.paths[0]] } }),
      ["all_paths response total mismatch — rows 1, total 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPaths: {
          ...okShape.allPaths,
          totalPaths: 1,
          paths: [{ edges: [] }],
        },
      }),
      ["all_paths response missing hops at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPaths: {
          ...okShape.allPaths,
          totalPaths: 3,
          paths: [
            ...okShape.allPaths.paths,
            {
              ...okShape.allPaths.paths[0],
              hops: [...okShape.allPaths.paths[0].hops],
              edges: [...okShape.allPaths.paths[0].edges],
            },
          ],
        },
      }),
      ["all_paths response duplicate path signature at index 2"],
    );
  });

  it("fails on malformed all_paths query_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPathsPlan: { ...okShape.allPathsPlan, operation: "all_paths" } }),
      ["all_paths query_plan response operation mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPathsPlan: {
          ...okShape.allPathsPlan,
          normalized: { ...okShape.allPathsPlan.normalized, limit: 100 },
        },
      }),
      ["all_paths query_plan default limit mismatch — expected 25, got 100"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPathsPlan: {
          ...okShape.allPathsPlan,
          estimate: { ...okShape.allPathsPlan.estimate, resultUpperBound: 26 },
        },
      }),
      ["all_paths query_plan resultUpperBound exceeds limit — upper 26, limit 25"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPathsPlan: {
          ...okShape.allPathsPlan,
          warnings: null,
        },
      }),
      ["all_paths query_plan missing warnings array"],
    );
  });

  it("fails on malformed project_map query_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: { ...okShape.projectMapPlan, operation: "project_map" },
      }),
      ["project_map query_plan returned unexpected operation: project_map"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: { ...okShape.projectMapPlan, targetOperation: "overview" },
      }),
      ["project_map query_plan returned unexpected targetOperation: overview"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: {
          ...okShape.projectMapPlan,
          estimate: { ...okShape.projectMapPlan.estimate, strategy: "bounded_bfs" },
        },
      }),
      ["project_map query_plan missing aggregate_scan estimate"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: { ...okShape.projectMapPlan, indexesUsed: [] },
      }),
      ["project_map query_plan missing compiled_artifact index hint"],
    );
  });

  it("fails on malformed project_map payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, operation: "overview" } }),
      ["project_map response operation mismatch — overview"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, domains: [] } }),
      ["project_map response returned no domains"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMap: {
          ...okShape.projectMap,
          domains: [
            {
              ...okShape.projectMap.domains[0],
              capabilities: { total: 0, limited: false, nodes: okShape.projectMap.domains[0].capabilities.nodes },
            },
          ],
        },
      }),
      ["project_map capabilities: domains/auth nodes exceed total — nodes 1, total 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMap: {
          ...okShape.projectMap,
          domains: [
            {
              ...okShape.projectMap.domains[0],
              summary: { ...okShape.projectMap.domains[0].summary, capabilities: 2 },
            },
          ],
        },
      }),
      ["project_map capabilities total mismatch — domains/auth: summary 2, bucket 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMap: {
          ...okShape.projectMap,
          unassigned: { total: 1, limited: false, nodes: [] },
        },
      }),
      ["project_map unassigned node count mismatch — nodes 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, hotspots: null } }),
      ["project_map response missing hotspots array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, hotspots: [{}] } }),
      ["project_map hotspots response missing row slug at index 0"],
    );
  });

  it("fails on malformed domain_profile payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainProfile: { ...okShape.domainProfile, operation: "project_map" } }),
      ["domain_profile response operation mismatch — project_map"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainProfile: { ...okShape.domainProfile, domain: "domains/other" } }),
      ["domain_profile response domain mismatch — domains/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainProfile: {
          ...okShape.domainProfile,
          capabilities: { total: 0, limited: false, nodes: okShape.domainProfile.capabilities.nodes },
        },
      }),
      ["domain_profile capabilities nodes exceed total — nodes 1, total 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainProfile: {
          ...okShape.domainProfile,
          summary: { ...okShape.domainProfile.summary, elements: 2 },
        },
      }),
      ["domain_profile elements total mismatch — summary 2, bucket 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainProfile: {
          ...okShape.domainProfile,
          edges: {
            ...okShape.domainProfile.edges,
            boundary: { total: 1, limited: false, byRelation: {}, edges: [] },
          },
        },
      }),
      ["domain_profile boundary edges edge count mismatch — edges 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainProfile: { ...okShape.domainProfile, hotspots: [{}] } }),
      ["domain_profile hotspots response missing row slug at index 0"],
    );
  });

  it("fails on malformed domain_matrix payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainMatrix: { ...okShape.domainMatrix, operation: "project_map" } }),
      ["domain_matrix response operation mismatch — project_map"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainMatrix: { ...okShape.domainMatrix, domains: okShape.domainMatrix.domains.slice(0, 1) } }),
      ["domain_matrix response domain count mismatch — domains 1, summary 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          summary: { ...okShape.domainMatrix.summary, assignedNodes: 5 },
        },
      }),
      ["domain_matrix assigned node mismatch — summary 5, domains 4"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          domains: [{ ...okShape.domainMatrix.domains[0], outgoing: -1 }, okShape.domainMatrix.domains[1]],
        },
      }),
      ["domain_matrix domain missing outgoing: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          connections: { total: 1, limited: false, rows: [] },
        },
      }),
      ["domain_matrix connections row count mismatch — rows 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          connections: {
            ...okShape.domainMatrix.connections,
            rows: [{ ...okShape.domainMatrix.connections.rows[0], count: 0 }],
          },
        },
      }),
      ["domain_matrix connection missing count: domains/ai-agent-partner->domains/vault-local-first"],
    );
  });

  it("fails on malformed components payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, components: { ...okShape.components, operation: "health" } }),
      ["components response operation mismatch — health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, components: { ...okShape.components, components: okShape.components.components.slice(0, 1) } }),
      ["components row count mismatch — rows 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, components: { ...okShape.components, largestSize: 2 } }),
      ["components largestSize below returned component — largest 2, observed 4"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        components: {
          ...okShape.components,
          components: [{ ...okShape.components.components[0], kinds: { project: 1 } }, okShape.components.components[1]],
        },
      }),
      ["components component kind count mismatch: 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        components: {
          ...okShape.components,
          components: [{ ...okShape.components.components[0], nodes: okShape.components.components[0].nodes.slice(0, 1) }, okShape.components.components[1]],
        },
      }),
      ["components component node count mismatch: 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        components: {
          ...okShape.components,
          components: [
            {
              ...okShape.components.components[0],
              nodeLimited: true,
              nodes: [{ ...okShape.components.components[0].nodes[0], slug: "" }],
            },
            okShape.components.components[1],
          ],
        },
      }),
      ["components component missing node slug: 1/0"],
    );
  });

  it("fails on malformed relation_check payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, operation: "components" } }),
      ["relation_check response operation mismatch — components"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, exists: "yes" } }),
      ["relation_check response missing exists flag"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, verdict: "maybe" } }),
      ["relation_check response unknown verdict — maybe"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, matchingEdges: [] } }),
      ["relation_check exists without matchingEdges"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          exists: false,
          verdict: "new_schema_pattern",
        },
      }),
      ["relation_check new_schema_pattern should not include schemaPattern"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          exists: false,
          verdict: "matches_existing_schema",
          matchingEdges: [],
          schemaPattern: { ...okShape.relationCheck.schemaPattern, count: 0 },
        },
      }),
      ["relation_check schemaPattern missing count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          matchingEdges: [{ ...okShape.relationCheck.matchingEdges[0], via: "" }],
        },
      }),
      ["relation_check matching edge missing via at index 0"],
    );
  });

  it("fails on malformed maintenance_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, maintenancePlan: { ...okShape.maintenancePlan, operation: "growth_plan" } }),
      ["maintenance_plan response operation mismatch — growth_plan"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, maintenancePlan: { ...okShape.maintenancePlan, sideEffect: true } }),
      ["maintenance_plan must be side-effect free"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          summary: { ...okShape.maintenancePlan.summary, reviewActions: 2 },
        },
      }),
      ["maintenance_plan action count mismatch — executable 1, review 2, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          cursor: { ...okShape.maintenancePlan.cursor, hasMore: "false" },
        },
      }),
      ["maintenance_plan cursor missing hasMore flag"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          cursor: { ...okShape.maintenancePlan.cursor, nextAfterActionId: "maint_other" },
        },
      }),
      ["maintenance_plan cursor nextAfterActionId does not match last action"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          actions: [{ ...okShape.maintenancePlan.actions[0], proposedAction: null }, okShape.maintenancePlan.actions[1]],
        },
      }),
      ["maintenance_plan executable action missing proposedAction: maint_link"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          actions: [{ ...okShape.maintenancePlan.actions[0], score: Number.NaN }, okShape.maintenancePlan.actions[1]],
        },
      }),
      ["maintenance_plan action missing score: maint_link"],
    );
  });

  it("fails on malformed growth_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, growthPlan: { ...okShape.growthPlan, operation: "maintenance_plan" } }),
      ["growth_plan response operation mismatch — maintenance_plan"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          summary: { ...okShape.growthPlan.summary, totalActions: 2 },
        },
      }),
      ["growth_plan totalActions mismatch — summary 2, computed 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          relationRecommendations: { ...okShape.growthPlan.relationRecommendations, totalRecommendations: 2 },
        },
      }),
      ["growth_plan relationRecommendations total mismatch — summary 1, group 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          externalElementRefs: { ...okShape.growthPlan.externalElementRefs, rows: [] },
        },
      }),
      ["growth_plan.externalElementRefs row count mismatch — rows 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          externalElementRefs: { ...okShape.growthPlan.externalElementRefs, ignored: 1 },
        },
      }),
      ["growth_plan ignored external refs mismatch — summary 0, group 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          danglingReferences: {
            ...okShape.growthPlan.danglingReferences,
            rows: [{ ...okShape.growthPlan.danglingReferences.rows[0], proposedAction: { tool: "", args: {} } }],
          },
        },
      }),
      ["growth_plan.danglingReferences proposedAction missing tool: resolve_dangling_reference"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          unassignedNodes: {
            ...okShape.growthPlan.unassignedNodes,
            rows: [{ ...okShape.growthPlan.unassignedNodes.rows[0], score: -1 }],
          },
        },
      }),
      ["growth_plan.unassignedNodes row missing score: unassigned_node"],
    );
  });

  it("fails on malformed recommend_relations payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: { ...okShape.relationRecommendations, operation: "growth_plan" },
      }),
      ["recommend_relations operation mismatch — growth_plan"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: { ...okShape.relationRecommendations, totalRecommendations: 2 },
      }),
      ["recommend_relations row count mismatch — rows 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: { ...okShape.relationRecommendations, recommendations: [] },
      }),
      ["recommend_relations row count mismatch — rows 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: {
          ...okShape.relationRecommendations,
          recommendations: [{ ...okShape.relationRecommendations.recommendations[0], proposedAction: null }],
        },
      }),
      ["recommend_relations row missing proposedAction: missing_domain_containment"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: {
          ...okShape.relationRecommendations,
          recommendations: [{ ...okShape.relationRecommendations.recommendations[0], score: -1 }],
        },
      }),
      ["recommend_relations row missing score: missing_domain_containment"],
    );
  });

  it("fails on malformed cycles payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, cycles: { ...okShape.cycles, operation: "health" } }),
      ["cycles response operation mismatch — health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, cycles: { ...okShape.cycles, relationTypes: ["dependencies", ""] } }),
      ["cycles response missing relationTypes"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, cycles: { ...okShape.cycles, cycles: [] } }),
      ["cycles row count mismatch — rows 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        cycles: {
          ...okShape.cycles,
          cycles: [{ ...okShape.cycles.cycles[0], nodes: ["capabilities/a", "capabilities/b"] }],
        },
      }),
      ["cycles cycle node count mismatch: capabilities/a>capabilities/b>capabilities/a"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        cycles: {
          ...okShape.cycles,
          cycles: [{ ...okShape.cycles.cycles[0], nodes: ["capabilities/a", "capabilities/b", "capabilities/c"] }],
        },
      }),
      ["cycles cycle does not close: capabilities/a>capabilities/b>capabilities/a"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        cycles: {
          ...okShape.cycles,
          cycles: [{ ...okShape.cycles.cycles[0], edges: [{ ...okShape.cycles.cycles[0].edges[0], via: "" }, okShape.cycles.cycles[0].edges[1]] }],
        },
      }),
      ["cycles edge missing via: capabilities/a>capabilities/b>capabilities/a/0"],
    );
  });

  it("fails on malformed topological_order payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, operation: "cycles" } }),
      ["topological_order response operation mismatch — cycles"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, prerequisiteFirst: false } }),
      ["topological_order must be prerequisite-first"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, totalNodes: 4, orderedCount: 4 } }),
      ["topological_order order count mismatch — rows 3, ordered 4"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, blocked: [{ slug: "capabilities/a", remainingInDegree: 1 }] } }),
      ["topological_order acyclic result has blocked nodes"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        topologicalOrder: {
          ...okShape.topologicalOrder,
          order: [{ ...okShape.topologicalOrder.order[0], rank: -1 }, okShape.topologicalOrder.order[1], okShape.topologicalOrder.order[2]],
        },
      }),
      ["topological_order order row missing rank at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        topologicalOrder: {
          ...okShape.topologicalOrder,
          layers: [{ rank: 0, nodes: [{ kind: "capability", title: "Storage" }] }],
        },
      }),
      ["topological_order layer 0 row missing slug at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        topologicalOrder: {
          ...okShape.topologicalOrder,
          acyclic: false,
          blocked: [{ slug: "capabilities/a", remainingInDegree: 0 }],
        },
      }),
      ["topological_order blocked row missing remainingInDegree: capabilities/a"],
    );
  });

  it("fails when dogfood read surfaces disagree on counts", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, list: { ...okShape.list, total: 2 } }),
      ["dogfood count mismatch — list_kinds.total 1, list_concepts.total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, validation: { ...okShape.validation, scanned: 2 } }),
      ["dogfood count mismatch — list_kinds.total 1, validate_vault.scanned 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, nodeCount: 2, byKind: { project: 2 } } }),
      ["dogfood count mismatch — list_kinds.total 1, compile_ontology.nodeCount 2", "dogfood byKind mismatch — project: list_kinds 1, compile_ontology 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        overview: { ...okShape.overview, graph: { ...okShape.overview.graph, nodes: 2 }, byKind: { project: 2 } },
      }),
      ["dogfood count mismatch — list_kinds.total 1, overview.graph.nodes 2", "dogfood byKind mismatch — project: list_kinds 1, overview 2"],
    );
  });

  it("fails when list_kinds and graph summaries disagree by kind", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        kinds: { total: 1, byKind: { capability: 1 } },
        compiled: { ...okShape.compiled, byKind: { project: 1 } },
      }),
      [
        "dogfood byKind mismatch — capability: list_kinds 1, compile_ontology 0",
        "dogfood byKind mismatch — project: list_kinds 0, compile_ontology 1",
        "dogfood byKind mismatch — capability: list_kinds 1, overview 0",
        "dogfood byKind mismatch — project: list_kinds 0, overview 1",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        kinds: { total: 1, byKind: { capability: 1 } },
        compiled: { ...okShape.compiled, byKind: { capability: 1 } },
      }),
      [
        "dogfood byKind mismatch — capability: list_kinds 1, overview 0",
        "dogfood byKind mismatch — project: list_kinds 0, overview 1",
      ],
    );
  });

  it("fails on vault warnings", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      list: { ...okShape.list, vaultWarnings: { errorCount: 0, warningCount: 1 } },
    });
    assert.deepEqual(failures, ["list_concepts vaultWarnings present — errors 0, warnings 1"]);
  });

  it("fails on malformed vault warnings", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      list: { ...okShape.list, vaultWarnings: { warningCount: 0 } },
    });
    assert.deepEqual(failures, ["list_concepts vaultWarnings missing errorCount"]);
  });

  it("fails on validate_vault problem files", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: {
        scanned: 2,
        problems: [{ slug: "broken", issues: [{ code: "missing-kind", severity: "error" }] }],
        summary: {
          problemFiles: 1,
          errorFiles: 1,
          warningFiles: 0,
          byCode: {
            "missing-kind": { severity: "error", count: 1, files: ["broken"] },
          },
        },
      },
    });
    assert.deepEqual(failures, [
      "validate_vault found 1 problem file(s) — errors 1, warnings 0 — codes missing-kind:error:1",
    ]);
  });

  it("fails when validate_vault reports problems without byCode entries", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: {
        scanned: 2,
        problems: [{ slug: "broken", issues: [{ code: "missing-kind", severity: "error" }] }],
        summary: { problemFiles: 1, errorFiles: 1, warningFiles: 0, byCode: {} },
      },
    });
    assert.deepEqual(failures, [
      "validate_vault response missing byCode entries for problem files",
    ]);
  });

  it("fails on malformed validate_vault responses", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: { scanned: 2, problems: [] },
    });
    assert.deepEqual(failures, ["validate_vault response missing summary"]);
  });

  it("fails when validate_vault omits the scanned count", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: { problems: [], summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} } },
    });
    assert.deepEqual(failures, ["validate_vault response missing scanned count"]);
  });

  it("fails when validate_vault omits the problemFiles count", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: { scanned: 2, problems: [], summary: { errorFiles: 0, warningFiles: 0, byCode: {} } },
    });
    assert.deepEqual(failures, ["validate_vault response missing problemFiles count"]);
  });

  it("fails when validate_vault omits error/warning counts", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: { scanned: 2, problems: [], summary: { problemFiles: 0, warningFiles: 0, byCode: {} } },
      }),
      ["validate_vault response missing errorFiles count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: { scanned: 2, problems: [], summary: { problemFiles: 0, errorFiles: 0, byCode: {} } },
      }),
      ["validate_vault response missing warningFiles count"],
    );
  });

  it("fails when validate_vault omits byCode aggregate", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: {
          scanned: 2,
          problems: [],
          summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0 },
        },
      }),
      ["validate_vault response missing byCode aggregate"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: {
          scanned: 2,
          problems: [],
          summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: [] },
        },
      }),
      ["validate_vault response missing byCode aggregate"],
    );
  });

  it("fails on missing graph path", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      path: { found: false, reason: "not connected" },
    });
    assert.deepEqual(failures, ["find_path: expected mcp-server → vault-local-first path"]);
  });

  it("fails on unhealthy first-contact diagnosis", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: { ...okShape.brief, status: "needs_attention" },
      health: { ...okShape.health, status: "needs_attention" },
    });
    assert.deepEqual(failures, [
      "workspace_brief: status needs_attention",
      "health: status needs_attention",
    ]);
  });

  it("fails on failing health checks even when top-level status is healthy", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: {
        ...okShape.brief,
        health: { checks: [{ id: "dependency_cycles", status: "fail", count: 1 }] },
      },
      health: {
        ...okShape.health,
        checks: [{ id: "compile_issues", status: "fail", count: 1 }],
      },
    });
    assert.deepEqual(failures, [
      "workspace_brief: failing health checks dependency_cycles",
      "health: failing health checks compile_issues",
    ]);
  });

  it("fails when workspace brief leaves warn/fail next actions", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: {
        ...okShape.brief,
        nextActions: [
          { kind: "health_check", severity: "info", id: "components" },
          { kind: "materialize_external_elements", severity: "warn", count: 2 },
          { kind: "resolve_dangling_references", severity: "fail", count: 1 },
        ],
      },
    });
    assert.deepEqual(failures, [
      "workspace_brief: actionable nextActions materialize_external_elements, resolve_dangling_references",
    ]);
  });
});

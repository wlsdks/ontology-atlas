// The calls the dogfood walk makes, in the order a person follows after registering the server:
// discover real targets in the vault, then ask every read tool and every `query_ontology` operation
// about them, refuse what must be refused, and preview what would change without changing it.
// Each step names what its answer must be: `ok`, `refused` with the sentence it carries, or a
// `dryRun` preview.
export const DISCOVERY_IDS = Object.freeze({ projects: 902, domains: 903, capabilities: 904 });

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "dogfood-walk", version: "0" } },
};
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

export function discoveryRequests() {
  const list = (id, kind) => toolCall(id, "list_concepts", { kind, limit: 500 });
  return [
    { ...INITIALIZE, id: 901 },
    INITIALIZED,
    list(DISCOVERY_IDS.projects, "project"),
    list(DISCOVERY_IDS.domains, "domain"),
    list(DISCOVERY_IDS.capabilities, "capability"),
  ];
}

function toolCall(id, name, args = {}) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

function rowsOfKind(page, kind) {
  const rows = Array.isArray(page?.nodes) ? page.nodes : [];
  return rows.filter((node) => node?.kind === kind && typeof node.slug === "string" && node.slug !== "");
}

/** A project, and a capability whose domain exists, with a second capability to compare it with. */
export function selectTargets({ projects, domains, capabilities }) {
  const project = rowsOfKind(projects, "project")[0];
  const domainSlugs = new Set(rowsOfKind(domains, "domain").map((node) => node.slug));
  const capabilityRows = rowsOfKind(capabilities, "capability");
  const capability = capabilityRows.find((node) => domainSlugs.has(node.domain));
  const other = capabilityRows.find((node) => node.slug !== capability?.slug);
  if (!project || !capability || !other) {
    throw new Error("the walk needs a project, a capability with a domain that exists, and a second capability");
  }
  return {
    projectSlug: project.slug,
    domainSlug: capability.domain,
    capabilitySlug: capability.slug,
    otherCapabilitySlug: other.slug,
  };
}

const ok = { kind: "ok" };
const refused = (sentence) => ({ kind: "refused", sentence });
const dryRun = { kind: "dryRun" };

/** The `query_ontology` operations the walk asks, each with the arguments its answer needs. */
function queryWalk({ projectSlug, domainSlug, capabilitySlug, otherCapabilitySlug }) {
  const about = { slug: capabilitySlug };
  return {
    neighbors: about,
    path: { from: capabilitySlug, to: domainSlug },
    query_plan: { targetOperation: "project_map" },
    communities: { limit: 5 },
    similar_nodes: { candidateSlug: `${capabilitySlug}-candidate`, kind: "capability", domain: domainSlug, limit: 5 },
    explain_relation: { from: capabilitySlug, to: otherCapabilitySlug },
    reachability: { ...about, depth: 2, limit: 10 },
    pattern_walk: { ...about, pattern: ["domain"], limit: 5 },
    impact: { ...about, depth: 2 },
    blast_radius: { ...about, depth: 2 },
    subgraph: { ...about, depth: 1 },
    overview: {},
    schema: { limit: 8 },
    facets: { limit: 8 },
    match_nodes: { kind: "capability", sort: "degree", limit: 8 },
    node_profile: { ...about, limit: 8 },
    project_scope: { project: projectSlug, limit: 8 },
    project_map: { project: projectSlug, itemLimit: 5 },
    relation_check: { from: capabilitySlug, to: domainSlug, type: "domain" },
    components: { limit: 5 },
    lineage: { ...about, depth: 3, limit: 10 },
    containment_tree: { limit: 10 },
    cycles: { limit: 5 },
    recommend_relations: { limit: 5 },
    growth_plan: { limit: 5 },
    maintenance_plan: { limit: 5 },
    agent_brief: { project: projectSlug },
    workspace_brief: { limit: 5 },
    health: {},
  };
}

/** The operations the engine answers that the walk does not ask: a saved record needs an id from the app. */
export const OPERATIONS_NOT_WALKED = Object.freeze(["analysis_record"]);

export function walkOperationNames(targets) {
  return Object.keys(queryWalk(targets));
}

/** Every step of the walk: `{ id, label, expect, request }`, ids unique and stable. */
export function walkSteps(targets, { repositoryRoot }) {
  const { projectSlug, domainSlug, capabilitySlug, otherCapabilitySlug } = targets;
  const steps = [];
  const add = (label, tool, args, expect = ok) => {
    steps.push({ id: steps.length + 10, label, expect, tool, args });
  };
  add("list_concepts census", "list_concepts", { limit: 1 });
  add("list_concepts page", "list_concepts", { limit: 30 });
  add("list_concepts kind", "list_concepts", { kind: "project", limit: 1 });
  add("list_concepts filter", "list_concepts", { filter: `kind=capability AND domain=${domainSlug}`, limit: 5 });
  add("list_concepts mentions", "list_concepts", { mentions: "vault" });
  add("get_concepts", "get_concepts", { slugs: [projectSlug, capabilitySlug, "missing-dogfood-slug"] });
  add("find_backlinks", "find_backlinks", { slug: capabilitySlug });
  add("validate_vault", "validate_vault", {});
  add("compile_ontology", "compile_ontology", { summary: true });
  add("connection_info", "connection_info", {});
  add("analyze_repo_structure", "analyze_repo_structure", { rootPath: repositoryRoot });
  add("infer_imports", "infer_imports", { rootPath: repositoryRoot, maxFiles: 5000, reviewMode: "full", allowLargeResponse: true });
  for (const [operation, args] of Object.entries(queryWalk(targets))) {
    add(`query_ontology ${operation}`, "query_ontology", { operation, ...args });
  }
  add("rename_concept preview", "rename_concept", { oldSlug: capabilitySlug, newSlug: `${capabilitySlug}-dogfood-dry-run` }, dryRun);
  add("merge_concepts preview", "merge_concepts", { fromSlug: capabilitySlug, intoSlug: otherCapabilitySlug }, dryRun);
  add("delete_concept preview", "delete_concept", { slug: capabilitySlug }, dryRun);
  add("unknown tool", "no_such_tool", {}, refused("Unknown tool"));
  add("unknown argument", "list_concepts", { nope: 1 }, refused("Unknown argument"));
  add("misspelled sort", "query_ontology", { operation: "match_nodes", sort: "outDegre" }, refused("outDegree"));
  add("misspelled kind", "list_concepts", { kind: "capabilty" }, refused("capability"));
  add("retired operation", "query_ontology", { operation: "centrality" }, refused("retired"));
  add("get_concepts batch cap", "get_concepts", { slugs: Array.from({ length: 51 }, (_, index) => `dogfood-slug-${index}`) }, refused("50"));
  return steps;
}

/** The whole batch the walk sends: initialize, tools/list, then every step. */
export function walkRequests(steps) {
  return [
    INITIALIZE,
    INITIALIZED,
    { jsonrpc: "2.0", id: 5, method: "tools/list", params: {} },
    ...steps.map((step) => toolCall(step.id, step.tool, step.args)),
  ];
}

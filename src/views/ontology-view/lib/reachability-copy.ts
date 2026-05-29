import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { formatQueryOntologyCall as mcpCall } from "@/shared/lib/ontology-query-call";
import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  formatAgentPostChangeSyncPacket,
  type OntologyReachabilityDirection,
} from "@/shared/lib/ontology-tree";

const KIND_TO_CANONICAL_FOLDER: Record<string, string> = {
  domain: "domains",
  capability: "capabilities",
  element: "elements",
};

export function resolveReachabilityQuerySlug(node: KnowledgeGraphNode): string | null {
  const tail = node.id.split(":").slice(1).join(":").trim();
  if (!tail) return null;
  if (node.kind === "project") return tail;

  const folder = KIND_TO_CANONICAL_FOLDER[node.kind];
  if (!folder) return null;

  const expectedSlug = `${folder}/${tail}`;
  const sourceSlug = node.evidenceIds[0]?.replace(/^ontology\//, "");
  if (sourceSlug === expectedSlug) return expectedSlug;
  return null;
}

export function buildReachabilityMcpCall({
  slug,
  direction,
  depth,
  limit,
}: {
  slug: string;
  direction: OntologyReachabilityDirection;
  depth: 1 | 2 | 3;
  limit: number;
}): string {
  return mcpCall({
    operation: "reachability",
    slug,
    direction,
    depth,
    limit,
  });
}

export function buildReachabilityCliCommand({
  slug,
  direction,
  depth,
  limit,
}: {
  slug: string;
  direction: OntologyReachabilityDirection;
  depth: 1 | 2 | 3;
  limit: number;
}): string {
  return [
    "oh-my-ontology",
    "reachability",
    shellQuote(slug),
    "--direction",
    direction,
    "--depth",
    String(depth),
    "--limit",
    String(limit),
  ].join(" ");
}

export function buildNodeProfileMcpCall({
  slug,
  limit,
}: {
  slug: string;
  limit: number;
}): string {
  return mcpCall({
    operation: "node_profile",
    slug,
    limit,
  });
}

export function buildNodeProfileCliCommand({
  slug,
  limit,
}: {
  slug: string;
  limit: number;
}): string {
  return [
    "oh-my-ontology",
    "node",
    shellQuote(slug),
    "--limit",
    String(limit),
  ].join(" ");
}

export function buildBlastRadiusMcpCall({
  slug,
  depth,
  direction,
}: {
  slug: string;
  depth: 1 | 2 | 3;
  direction: "incoming" | "outgoing" | "both";
}): string {
  return mcpCall({
    operation: "blast_radius",
    slug,
    depth,
    direction,
  });
}

export function buildBlastRadiusCliCommand({
  slug,
  depth,
  direction,
}: {
  slug: string;
  depth: 1 | 2 | 3;
  direction: "incoming" | "outgoing" | "both";
}): string {
  return [
    "oh-my-ontology",
    "blast-radius",
    shellQuote(slug),
    "--depth",
    String(depth),
    "--direction",
    direction,
  ].join(" ");
}

export function buildAgentContextBundle({
  slug,
  direction,
  depth,
  reachabilityLimit,
  profileLimit,
}: {
  slug: string;
  direction: OntologyReachabilityDirection;
  depth: 1 | 2 | 3;
  reachabilityLimit: number;
  profileLimit: number;
}): string {
  const inOutEdgeLimit = 10;
  const blastDepth = Math.min(depth, 2) as 1 | 2;
  const targetSlug = "<target-slug>";
  const relationType = "<relation-type>";
  const pathLimit = 10;
  const pathMaxHops = 4;
  const pathSearchBudget = 1000;
  return [
    "# Selected ontology node proof",
    "",
    "Use oh-my-ontology for this selected node before editing frontmatter or trusting a scan row as proof.",
    "",
    `- Scope: selected node ${slug}`,
    "",
    "MCP:",
    `1. ${buildNodeProfileMcpCall({ slug, limit: profileLimit })}`,
    `2. ${buildBlastRadiusMcpCall({ slug, depth: blastDepth, direction: "incoming" })}`,
    `3. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", from: slug, limit: inOutEdgeLimit })}`,
    `4. ${mcpCall({ operation: "match_edges", from: slug, limit: inOutEdgeLimit })}`,
    `5. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", to: slug, limit: inOutEdgeLimit })}`,
    `6. ${mcpCall({ operation: "match_edges", to: slug, limit: inOutEdgeLimit })}`,
    `7. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", type: "depends_on", limit: inOutEdgeLimit })}`,
    `8. ${mcpCall({ operation: "match_edges", type: "depends_on", limit: inOutEdgeLimit })}`,
    `9. ${buildReachabilityMcpCall({ slug, direction, depth, limit: reachabilityLimit })}`,
    `10. ${mcpCall({ operation: "query_plan", targetOperation: "all_paths", from: slug, to: targetSlug, maxHops: pathMaxHops, searchBudget: pathSearchBudget, limit: pathLimit })}`,
    `11. ${mcpCall({ operation: "all_paths", from: slug, to: targetSlug, maxHops: pathMaxHops, searchBudget: pathSearchBudget, limit: pathLimit })}`,
    `12. ${mcpCall({ operation: "relation_check", from: slug, to: targetSlug, type: relationType })}`,
    `13. ${mcpCall({ operation: "health", limit: 5 })}`,
    `14. ${mcpCall({ operation: "query_plan", targetOperation: "pattern_walk", start: "<project-slug>", pattern: ["domains", "capabilities"], limit: 10 })}`,
    `15. ${mcpCall({ operation: "pattern_walk", start: "<project-slug>", pattern: ["domains", "capabilities"], limit: 10 })}`,
    `16. ${mcpCall({ operation: "query_plan", targetOperation: "project_map", project: "<project-slug>", limit: 10 })}`,
    `17. ${mcpCall({ operation: "project_map", project: "<project-slug>", limit: 10 })}`,
    "",
    "CLI fallback:",
    `1. ${buildNodeProfileCliCommand({ slug, limit: profileLimit })}`,
    `2. ${buildBlastRadiusCliCommand({ slug, depth: blastDepth, direction: "incoming" })}`,
    `3. oh-my-ontology match-edges [vault] --plan --from ${shellQuote(slug)} --limit ${inOutEdgeLimit}`,
    `4. oh-my-ontology match-edges [vault] --from ${shellQuote(slug)} --limit ${inOutEdgeLimit}`,
    `5. oh-my-ontology match-edges [vault] --plan --to ${shellQuote(slug)} --limit ${inOutEdgeLimit}`,
    `6. oh-my-ontology match-edges [vault] --to ${shellQuote(slug)} --limit ${inOutEdgeLimit}`,
    `7. oh-my-ontology match-edges [vault] --plan --type depends_on --limit ${inOutEdgeLimit}`,
    `8. oh-my-ontology match-edges [vault] --type depends_on --limit ${inOutEdgeLimit}`,
    `9. ${buildReachabilityCliCommand({ slug, direction, depth, limit: reachabilityLimit })}`,
    `10. oh-my-ontology all-paths ${shellQuote(slug)} ${shellQuote(targetSlug)} [vault] --plan --max-hops ${pathMaxHops} --limit ${pathLimit} --search-budget ${pathSearchBudget}`,
    `11. oh-my-ontology all-paths ${shellQuote(slug)} ${shellQuote(targetSlug)} [vault] --max-hops ${pathMaxHops} --limit ${pathLimit} --search-budget ${pathSearchBudget}`,
    `12. oh-my-ontology relation-check ${shellQuote(slug)} ${shellQuote(targetSlug)} ${shellQuote(relationType)} [vault]`,
    "13. oh-my-ontology health [vault] --limit 5",
    "14. oh-my-ontology pattern-walk <project-slug> [vault] --pattern domains,capabilities --limit 10",
    "15. oh-my-ontology project-map <project-slug> [vault] --limit 10",
    "",
    "Evidence checklist:",
    "1. Report direct relation counts from node_profile before making a write claim.",
    "2. Report totalMatches, limited, and returned row count for incoming/outgoing match_edges scans.",
    "3. For public relation scans, report relationType and via so depends_on is visibly backed by the dependencies frontmatter key.",
    "4. Treat scan rows as candidates until node_profile, blast_radius, path, explain, all_paths, or relation_check confirms the exact claim.",
    "5. For all_paths, report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete.",
    "6. Replace <project-slug> with the owning project root and report pattern_walk paths.total/paths.limited plus project_map summary.unresolvedEdges before treating the tree projection as complete ownership evidence.",
    `7. Run the post-change sync gate below after any frontmatter edit; it starts with ${AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT} runtime graph DB checks.`,
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  ].join("\n");
}


function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

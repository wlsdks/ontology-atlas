import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
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
  return [
    "# Selected ontology node proof",
    "",
    "Use oh-my-ontology for this selected node before editing frontmatter.",
    "",
    "MCP:",
    `1. ${buildNodeProfileMcpCall({ slug, limit: profileLimit })}`,
    `2. ${buildBlastRadiusMcpCall({ slug, depth: blastDepth, direction: "incoming" })}`,
    `3. ${mcpCall({ operation: "match_edges", from: slug, limit: inOutEdgeLimit })}`,
    `4. ${mcpCall({ operation: "match_edges", to: slug, limit: inOutEdgeLimit })}`,
    `5. ${buildReachabilityMcpCall({ slug, direction, depth, limit: reachabilityLimit })}`,
    `6. ${mcpCall({ operation: "health", limit: 5 })}`,
    "",
    "CLI fallback:",
    `1. ${buildNodeProfileCliCommand({ slug, limit: profileLimit })}`,
    `2. ${buildBlastRadiusCliCommand({ slug, depth: blastDepth, direction: "incoming" })}`,
    `3. oh-my-ontology match-edges [vault] --from ${shellQuote(slug)} --limit ${inOutEdgeLimit}`,
    `4. oh-my-ontology match-edges [vault] --to ${shellQuote(slug)} --limit ${inOutEdgeLimit}`,
    `5. ${buildReachabilityCliCommand({ slug, direction, depth, limit: reachabilityLimit })}`,
    "6. oh-my-ontology health [vault] --limit 5",
    "",
    "Evidence checklist:",
    "1. Report direct relation counts from node_profile before making a write claim.",
    "2. Report totalMatches, limited, and returned row count for incoming/outgoing match_edges scans.",
    "3. Treat scan rows as candidates until node_profile, blast_radius, path, explain, or relation_check confirms the exact claim.",
    "4. Run the post-change sync gate below after any frontmatter edit.",
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  ].join("\n");
}

function mcpCall(payload: Record<string, unknown>): string {
  return `query_ontology(${JSON.stringify(payload)})`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

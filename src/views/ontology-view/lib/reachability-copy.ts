import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyReachabilityDirection } from "@/shared/lib/ontology-tree";

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
  return `query_ontology(${JSON.stringify({
    operation: "reachability",
    slug,
    direction,
    depth,
    limit,
  })})`;
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
  return `query_ontology(${JSON.stringify({
    operation: "node_profile",
    slug,
    limit,
  })})`;
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
  return `query_ontology(${JSON.stringify({
    operation: "blast_radius",
    slug,
    depth,
    direction,
  })})`;
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
  return [
    "Use oh-my-ontology for this selected node before editing.",
    "",
    "MCP:",
    `1. ${buildNodeProfileMcpCall({ slug, limit: profileLimit })}`,
    `2. ${buildReachabilityMcpCall({ slug, direction, depth, limit: reachabilityLimit })}`,
    "",
    "CLI fallback:",
    `1. ${buildNodeProfileCliCommand({ slug, limit: profileLimit })}`,
    `2. ${buildReachabilityCliCommand({ slug, direction, depth, limit: reachabilityLimit })}`,
  ].join("\n");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

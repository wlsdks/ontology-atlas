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

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

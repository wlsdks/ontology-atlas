import {
  explainOntologyRelationKeyForGraphIds,
  inferOntologyRelationKeyForGraphIds,
} from "@/shared/lib/ontology-relation-key";
import { formatQueryOntologyCall } from "@/shared/lib/ontology-query-call";

export function shouldUsePathSelectionGesture({
  pathWorkflowActive,
  shiftKey,
}: {
  pathWorkflowActive: boolean;
  shiftKey: boolean;
}): boolean {
  return pathWorkflowActive || shiftKey;
}

const VAULT_FOLDER_TO_GRAPH_KIND: Record<string, string> = {
  projects: "project",
  domains: "domain",
  capabilities: "capability",
  elements: "element",
  documents: "document",
};

export function resolvePathGraphNodeId(
  candidate: string | null | undefined,
  hasNode: (nodeId: string) => boolean,
): string | null {
  const trimmed = candidate?.trim();
  if (!trimmed) return null;
  if (hasNode(trimmed)) return trimmed;

  const normalized = trimmed.replace(/^ontology\//, "");
  if (normalized !== trimmed && hasNode(normalized)) return normalized;

  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0) {
    const folder = normalized.slice(0, slashIndex);
    const tail = normalized.slice(slashIndex + 1).trim();
    const graphKind = VAULT_FOLDER_TO_GRAPH_KIND[folder];
    if (graphKind && tail) {
      const graphId = `${graphKind}:${tail}`;
      if (hasNode(graphId)) return graphId;
    }
  }

  return null;
}

export interface PathRelationStep {
  from: string;
  to: string;
  relation: string;
}

export function buildPathRelationSteps({
  slugs,
  getRelation,
}: {
  slugs: readonly string[];
  getRelation: (from: string, to: string) => string | null;
}): PathRelationStep[] {
  const steps: PathRelationStep[] = [];
  for (let index = 0; index < slugs.length - 1; index += 1) {
    const from = slugs[index];
    const to = slugs[index + 1];
    steps.push({
      from,
      to,
      relation: getRelation(from, to) ?? "related",
    });
  }
  return steps;
}

export interface PathEvidenceBriefLabels {
  title: string;
  hops: string;
  source: string;
  target: string;
  route: string;
  slugs: string;
  url: string;
  sourceOntologyUrl: string;
  targetOntologyUrl: string;
  sourceBuilderUrl: string;
  targetBuilderUrl: string;
  cliCheck: string;
  mcpCheck: string;
  relationPreflightReason: string;
  relationPreflightCliCheck: string;
  relationPreflightMcpCheck: string;
  explainRelationCliCheck: string;
  explainRelationMcpCheck: string;
  traversalCompleteness: string;
  traversalCompletenessPolicy: string;
  allPathsCliCheck: string;
  allPathsPlanMcpCheck: string;
  allPathsMcpCheck: string;
  allPathsCopyInstruction: string;
  postWriteSyncGate: string;
}

export function formatPathEvidenceBrief({
  slugs,
  steps,
  getLabel,
  labels,
  url,
  syncGatePacket,
}: {
  slugs: readonly string[];
  steps: readonly PathRelationStep[];
  getLabel: (slug: string) => string;
  labels: PathEvidenceBriefLabels;
  url?: string | null;
  syncGatePacket?: string | null;
}): string {
  const routeParts = slugs.map((slug, index) => {
    const label = getLabel(slug);
    const prefix = index === 0 ? "" : ` --${steps[index - 1]?.relation ?? "related"}--> `;
    return `${prefix}${label} (${slug})`;
  });
  const lines = [
    `# ${labels.title}`,
    `- ${labels.hops}: ${Math.max(0, slugs.length - 1)}`,
    `- ${labels.source}: ${formatPathEndpoint(slugs[0], getLabel)}`,
    `- ${labels.target}: ${formatPathEndpoint(slugs[slugs.length - 1], getLabel)}`,
    `- ${labels.route}: ${routeParts.join("")}`,
    `- ${labels.slugs}: ${slugs.map((slug) => `\`${slug}\``).join(" -> ")}`,
  ];

  if (url) {
    lines.push(`- ${labels.url}: ${url}`);
  }
  if (slugs.length >= 2) {
    lines.push(
      `- ${labels.sourceOntologyUrl}: ${formatPathOntologyHref(slugs[0])}`,
      `- ${labels.targetOntologyUrl}: ${formatPathOntologyHref(slugs[slugs.length - 1])}`,
      `- ${labels.sourceBuilderUrl}: ${formatPathBuilderHref(slugs[0])}`,
      `- ${labels.targetBuilderUrl}: ${formatPathBuilderHref(slugs[slugs.length - 1])}`,
    );
    lines.push(
      `- ${labels.cliCheck}: ${formatPathCliCheck(slugs[0], slugs[slugs.length - 1])}`,
      `- ${labels.mcpCheck}: ${formatPathMcpCheck(slugs[0], slugs[slugs.length - 1])}`,
      `- ${labels.relationPreflightReason}: ${explainOntologyRelationKeyForGraphIds(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.relationPreflightCliCheck}: ${formatPathRelationPreflightCliCheck(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.relationPreflightMcpCheck}: ${formatPathRelationPreflightMcpCheck(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.explainRelationCliCheck}: ${formatPathExplainRelationCliCheck(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.explainRelationMcpCheck}: ${formatPathExplainRelationMcpCheck(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.traversalCompleteness}: ${labels.traversalCompletenessPolicy}`,
      `- ${labels.allPathsCliCheck}: ${formatPathAllPathsCliCheck(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.allPathsPlanMcpCheck}: ${formatPathAllPathsPlanMcpCheck(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.allPathsMcpCheck}: ${formatPathAllPathsMcpCheck(
        slugs[0],
        slugs[slugs.length - 1],
      )}`,
      `- ${labels.allPathsCopyInstruction}: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence`,
      ...formatPathSyncGate(
        labels.postWriteSyncGate,
        syncGatePacket ?? "health -> cycles -> growth_plan -> maintenance_plan -> validate_vault",
      ),
    );
  }

  return lines.join("\n");
}

function formatPathSyncGate(label: string, syncGate: string): string[] {
  if (!syncGate.includes("\n")) {
    return [`- ${label}: ${syncGate}`];
  }

  return [
    `- ${label}:`,
    ...syncGate.split("\n").map((line) => (line ? `  ${line}` : "")),
  ];
}

export function formatPathCliCheck(from: string, to: string): string {
  return `oh-my-ontology path ${from} ${to} [vault] --max-hops 5`;
}

export function formatPathMcpCheck(from: string, to: string): string {
  return formatQueryOntologyCall({
    operation: "path",
    from,
    to,
    maxHops: 5,
  });
}

export function formatPathAllPathsCliCheck(from: string, to: string): string {
  return `oh-my-ontology all-paths ${from} ${to} [vault] --plan --max-hops 5 --limit 10 --search-budget 1000`;
}

export function formatPathAllPathsPlanMcpCheck(from: string, to: string): string {
  return formatQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "all_paths",
    from,
    to,
    maxHops: 5,
    limit: 10,
    searchBudget: 1000,
  });
}

export function formatPathAllPathsMcpCheck(from: string, to: string): string {
  return formatQueryOntologyCall({
    operation: "all_paths",
    from,
    to,
    maxHops: 5,
    limit: 10,
    searchBudget: 1000,
  });
}

export function formatPathRelationPreflightCliCheck(
  from: string,
  to: string,
  type = inferOntologyRelationKeyForGraphIds(from, to),
): string {
  return `oh-my-ontology relation-check ${from} ${to} ${type} [vault]`;
}

export function formatPathRelationPreflightReason(from: string, to: string): string {
  return explainOntologyRelationKeyForGraphIds(from, to);
}

export function inferPathRelationPreflightType(from: string, to: string): string {
  return inferOntologyRelationKeyForGraphIds(from, to);
}

export function formatPathRelationPreflightMcpCheck(
  from: string,
  to: string,
  type = inferOntologyRelationKeyForGraphIds(from, to),
): string {
  return formatQueryOntologyCall({
    operation: "relation_check",
    from,
    to,
    type,
  });
}

export function formatPathExplainRelationCliCheck(from: string, to: string): string {
  return `oh-my-ontology explain ${from} ${to} [vault] --direction undirected --max-hops 5 --limit 10`;
}

export function formatPathExplainRelationMcpCheck(from: string, to: string): string {
  return formatQueryOntologyCall({
    operation: "explain_relation",
    from,
    to,
    direction: "undirected",
    maxHops: 5,
    limit: 10,
  });
}


export function formatPathOntologyHref(slug: string): string {
  return `/ontology/?node=${encodeURIComponent(slug)}`;
}

export function formatPathBuilderHref(slug: string): string {
  return `/ontology/edit/?node=${encodeURIComponent(resolvePathBuilderNodeSlug(slug))}`;
}

function formatPathEndpoint(
  slug: string | undefined,
  getLabel: (slug: string) => string,
): string {
  if (!slug) return "";
  return `${getLabel(slug)} (${slug})`;
}

function resolvePathBuilderNodeSlug(slug: string): string {
  const normalized = slug.trim().replace(/^\/+/, "");
  if (!normalized) return normalized;
  if (normalized.includes("/")) return normalized;

  const [kind, ...tailParts] = normalized.split(":");
  const tail = tailParts.join(":").trim();
  if (!tail) return normalized;
  if (kind === "domain") return `domains/${tail}`;
  if (kind === "capability") return `capabilities/${tail}`;
  if (kind === "element") return `elements/${tail}`;
  if (kind === "project") return tail;

  return normalized;
}

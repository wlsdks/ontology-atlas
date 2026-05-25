import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildOntologyBuilderNodeHref,
  buildOntologyNodeHref,
} from "@/entities/knowledge-graph";
import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";

export interface InsightsOrphanNodeActions {
  ontologyHref: string;
  topologyHref: string;
  builderHref: string;
}

export interface FormatInsightsOrphanRepairPacketLabels {
  title: string;
  node: string;
  kind: string;
  ontology: string;
  topology: string;
  builder: string;
  agentChecks: string;
  nextSteps: string;
  inspectNode: string;
  chooseOwner: string;
  preflightRelation: string;
  verifyHealth: string;
  syncGate: string;
}

export interface FormatInsightsOrphanRepairMcpPacketLabels {
  title: string;
  inspectNode: string;
  preflightRelation: string;
  verifyHealth: string;
  syncGate: string;
}

export function buildInsightsOrphanNodeActions(
  node: KnowledgeGraphNode,
): InsightsOrphanNodeActions {
  return {
    ontologyHref: buildOntologyNodeHref(node.id),
    topologyHref: `/topology/?mode=health&p=${encodeURIComponent(node.id)}`,
    builderHref: buildOntologyBuilderNodeHref(node),
  };
}

export function formatInsightsOrphanRepairPacket({
  actions,
  labels,
  node,
}: {
  actions: InsightsOrphanNodeActions;
  labels: FormatInsightsOrphanRepairPacketLabels;
  node: KnowledgeGraphNode;
}): string {
  const relationTarget = resolveOrphanRelationTarget(node);

  return [
    `# ${labels.title}`,
    "",
    `- ${labels.node}: ${node.title} (${node.id})`,
    `- ${labels.kind}: ${node.kind}`,
    `- ${labels.ontology}: ${actions.ontologyHref}`,
    `- ${labels.topology}: ${actions.topologyHref}`,
    `- ${labels.builder}: ${actions.builderHref}`,
    "",
    `## ${labels.nextSteps}`,
    `1. ${labels.inspectNode}`,
    `2. ${labels.chooseOwner}`,
    `3. ${labels.preflightRelation}`,
    `4. ${labels.verifyHealth}`,
    `5. ${labels.syncGate}`,
    "",
    `## ${labels.agentChecks}`,
    `- oh-my-ontology node ${relationTarget} [vault] --limit 12`,
    `- oh-my-ontology relation-check <owner-slug> ${relationTarget} contains [vault]`,
    `- oh-my-ontology health [vault] --limit 5`,
    "",
    formatAgentPostChangeSyncPacket(),
  ].join("\n");
}

export function formatInsightsOrphanRepairMcpPacket({
  labels,
  node,
}: {
  labels: FormatInsightsOrphanRepairMcpPacketLabels;
  node: KnowledgeGraphNode;
}): string {
  const relationTarget = resolveOrphanRelationTarget(node);

  return [
    `# ${labels.title}`,
    "",
    `- ${labels.inspectNode}: ${JSON.stringify({
      operation: "node_profile",
      slug: relationTarget,
      depth: 2,
      limit: 12,
    })}`,
    `- ${labels.preflightRelation}: ${JSON.stringify({
      operation: "relation_check",
      from: "<owner-slug>",
      to: relationTarget,
      type: "contains",
    })}`,
    `- ${labels.verifyHealth}: ${JSON.stringify({
      operation: "health",
      limit: 5,
    })}`,
    "",
    `## ${labels.syncGate}`,
    formatAgentPostChangeSyncPacket(),
  ].join("\n");
}

function resolveOrphanRelationTarget(node: KnowledgeGraphNode): string {
  return (node.evidenceIds[0] ?? node.id).replace(/^\/+/, "");
}

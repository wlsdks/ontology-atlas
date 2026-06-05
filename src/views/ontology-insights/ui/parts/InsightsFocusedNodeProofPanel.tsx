import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  buildOntologyBuilderNodeHref,
  buildOntologyNodeHref,
  resolveOntologyBuilderNodeSlug,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  formatAgentPostChangeSyncPacket,
} from "@/shared/lib/ontology-tree";
import { formatQueryOntologyCall as formatInsightsQueryOntologyCall } from "@/shared/lib/ontology-query-call";
import { shellArg } from "@/shared/lib/shell-arg";
import { CopyAgentTextButton } from "./CopyAgentTextButton";

/**
 * 선택된 노드 한 개에 대한 "증거 패킷" 패널 — node_profile / blast_radius /
 * match_edges(in·out) / all_paths / relation_check / health MCP 호출 + CLI
 * fallback + evidence 체크리스트 + post-change sync gate 를 조립해 복사 제공.
 * OntologyInsightsPage 모놀리스에서 분리(node 만 props 로 받는 표시 컴포넌트).
 */
export function InsightsFocusedNodeProofPanel({ node }: { node: KnowledgeGraphNode }) {
  const t = useTranslations("ontologyPages.insights");
  const kindLabel = useOntologyKindLabel();
  const proofSlug = resolveOntologyBuilderNodeSlug(node);
  const nodeProfilePayload = formatInsightsQueryOntologyCall({
    operation: "node_profile",
    slug: proofSlug,
    depth: 2,
    limit: 12,
  });
  const blastRadiusPayload = formatInsightsQueryOntologyCall({
    operation: "blast_radius",
    slug: proofSlug,
    depth: 2,
    direction: "incoming",
    limit: 12,
  });
  const incomingEdgesPayload = formatInsightsQueryOntologyCall({
    operation: "match_edges",
    to: proofSlug,
    limit: 10,
  });
  const incomingEdgesPlanPayload = formatInsightsQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "match_edges",
    to: proofSlug,
    limit: 10,
  });
  const outgoingEdgesPayload = formatInsightsQueryOntologyCall({
    operation: "match_edges",
    from: proofSlug,
    limit: 10,
  });
  const outgoingEdgesPlanPayload = formatInsightsQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "match_edges",
    from: proofSlug,
    limit: 10,
  });
  const relationParityPlanPayload = formatInsightsQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "match_edges",
    type: "depends_on",
    limit: 10,
  });
  const relationParityPayload = formatInsightsQueryOntologyCall({
    operation: "match_edges",
    type: "depends_on",
    limit: 10,
  });
  const allPathsPlanPayload = formatInsightsQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "all_paths",
    from: proofSlug,
    to: "<target-slug>",
    maxHops: 4,
    searchBudget: 1000,
    limit: 10,
  });
  const allPathsPayload = formatInsightsQueryOntologyCall({
    operation: "all_paths",
    from: proofSlug,
    to: "<target-slug>",
    maxHops: 4,
    searchBudget: 1000,
    limit: 10,
  });
  const relationCheckPayload = formatInsightsQueryOntologyCall({
    operation: "relation_check",
    from: proofSlug,
    to: "<target-slug>",
    type: "<relation-type>",
  });
  const healthPayload = formatInsightsQueryOntologyCall({
    operation: "health",
    limit: 5,
  });
  const slugArg = shellArg(proofSlug);
  const targetArg = shellArg("<target-slug>");
  const relationTypeArg = shellArg("<relation-type>");
  const nodeProofPacket = [
    `# ${t("focusedProofPacketTitle")}`,
    `- ${t("focusedProofPacketNode")}: ${node.title} (${node.id})`,
    `- ${t("focusedProofPacketScope")}: ${proofSlug}`,
    `- ${t("focusedProofPacketKind")}: ${kindLabel(node.kind)}`,
    `- ${t("focusedProofPacketOntology")}: ${buildOntologyNodeHref(node.id)}`,
    `- ${t("focusedProofPacketBuilder")}: ${buildOntologyBuilderNodeHref(node)}`,
    "",
    "MCP checks:",
    `1. ${nodeProfilePayload}`,
    `2. ${blastRadiusPayload}`,
    `3. ${incomingEdgesPlanPayload}`,
    `4. ${incomingEdgesPayload}`,
    `5. ${outgoingEdgesPlanPayload}`,
    `6. ${outgoingEdgesPayload}`,
    `7. ${relationParityPlanPayload}`,
    `8. ${relationParityPayload}`,
    `9. ${allPathsPlanPayload}`,
    `10. ${allPathsPayload}`,
    `11. ${relationCheckPayload}`,
    `12. ${healthPayload}`,
    "",
    "CLI fallbacks:",
    `1. oh-my-ontology node ${slugArg} [vault] --limit 12`,
    `2. oh-my-ontology blast-radius ${slugArg} [vault] --depth 2 --direction incoming --limit 12`,
    `3. oh-my-ontology match-edges [vault] --plan --to ${slugArg} --limit 10`,
    `4. oh-my-ontology match-edges [vault] --to ${slugArg} --limit 10`,
    `5. oh-my-ontology match-edges [vault] --plan --from ${slugArg} --limit 10`,
    `6. oh-my-ontology match-edges [vault] --from ${slugArg} --limit 10`,
    "7. oh-my-ontology match-edges [vault] --plan --type depends_on --limit 10",
    "8. oh-my-ontology match-edges [vault] --type depends_on --limit 10",
    `9. oh-my-ontology all-paths ${slugArg} ${targetArg} [vault] --plan --max-hops 4 --limit 10 --search-budget 1000`,
    `10. oh-my-ontology all-paths ${slugArg} ${targetArg} [vault] --max-hops 4 --limit 10 --search-budget 1000`,
    `11. oh-my-ontology relation-check ${slugArg} ${targetArg} ${relationTypeArg} [vault]`,
    "12. oh-my-ontology health [vault] --limit 5",
    "",
    "Evidence checklist:",
    "1. Report totalMatches, limited, returned row count, and followUp for every match_edges scan.",
    "2. For public relation scans, report relationType and via so depends_on is visibly backed by the dependencies frontmatter key.",
    "3. Treat scan rows as candidates until node_profile, blast_radius, path, explain, or relation_check confirms the claim.",
    "4. For all_paths, report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete.",
    "5. Run the sync gate after a frontmatter write before handing the graph to another agent.",
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  ].join("\n");

  return (
    <section
      id="insights-focused-node-proof"
      aria-label={t("focusedProofAriaLabel")}
      className="md:col-span-2 rounded-2xl border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.07)] px-4 py-4"
      data-testid="insights-focused-node-proof"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("focusedProofEyebrow")}
          </p>
          <h2 className="mt-1 truncate text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {node.title}
          </h2>
          <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("focusedProofBody", { slug: proofSlug, kind: kindLabel(node.kind) })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Link
            href={buildOntologyNodeHref(node.id)}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-1 font-mono text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.34)] hover:text-[color:var(--color-text-primary)]"
          >
            {t("focusedProofOpenBrowse")}
          </Link>
          <Link
            href={buildOntologyBuilderNodeHref(node)}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.08)] px-2 py-1 font-mono text-[10px] text-[color:rgba(211,215,255,0.96)] transition-colors hover:border-[color:rgba(139,151,255,0.42)] hover:bg-[color:rgba(139,151,255,0.13)]"
          >
            {t("focusedProofOpenBuilder")}
          </Link>
          <CopyAgentTextButton
            label={t("focusedProofCopyPacket")}
            copiedLabel={t("agentCopied")}
            text={nodeProofPacket}
            compact
          />
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          {
            label: t("focusedProofProfileLabel"),
            body: nodeProfilePayload,
          },
          {
            label: t("focusedProofEdgeScanLabel"),
            body: `${incomingEdgesPayload} · ${outgoingEdgesPayload}`,
          },
          {
            label: t("focusedProofPathPlanLabel"),
            body: allPathsPlanPayload,
          },
          {
            label: t("focusedProofRelationCheckLabel"),
            body: relationCheckPayload,
          },
          {
            label: t("focusedProofSyncLabel"),
            body: t("focusedProofSyncBody", {
              count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
            }),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-lg border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(0,0,0,0.16)] px-3 py-2"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {item.label}
            </p>
            <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

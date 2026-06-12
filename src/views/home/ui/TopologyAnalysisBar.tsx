"use client";

import { useCallback, useState } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  Clipboard,
  GitBranch,
  HeartPulse,
  Network,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Tooltip } from "@/shared/ui";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";
import type { TopologyAnalysisMode } from "../model/url-state";
import type {
  TopologyAnalysisSummary,
  TopologyHealthActionTarget,
} from "../lib/topology-analysis";
import {
  buildTopologyHealthRepairHref,
  formatTopologyFocusBrief,
  formatTopologyHealthBrief,
  formatTopologyHealthImpactMcpCheck,
  formatTopologyHealthMcpCheck,
  formatTopologyOverviewBrief,
  formatTopologyPathAllPathsMcpCheck,
  formatTopologyPathAllPathsPlanMcpCheck,
  formatTopologyPathEvidenceBrief,
  formatTopologyPathExplainRelationMcpCheck,
  formatTopologyPathMcpCheck,
  formatTopologyPathRelationPreflightMcpCheck,
  getTopologyHealthNextAction,
} from "../lib/topology-analysis";
import { copyText } from "@/shared/lib/copy-text";

interface TopologyAnalysisBarLabels {
  title: string;
  overview: string;
  focus: string;
  path: string;
  health: string;
  metricNodes: string;
  metricRelations: string;
  metricIssues: string;
  healthStale: string;
  healthOrphan: string;
  healthPromotion: string;
  healthInspect: string;
  healthCopy: string;
  healthOpenOntology: string;
  healthRepair: string;
  healthCopied: string;
  actions: string;
  healthCopyTools: string;
  healthMcpCopy: string;
  healthMcpCopied: string;
  healthMcpImpactCopy: string;
  healthMcpImpactCopied: string;
  healthSyncGateCopy: string;
  healthSyncGateCopied: string;
  healthHandoffSummary: string;
  healthRepairOrderTitle: string;
  healthRepairOrderInspect: string;
  healthRepairOrderRepair: string;
  healthRepairOrderSync: string;
  healthRepairTargetLabel: string;
  overviewBriefCopy: string;
  overviewBriefCopied: string;
  overviewReanalyzeCopy: string;
  overviewReanalyzeCopied: string;
  overviewSyncCopy: string;
  overviewSyncCopied: string;
  overviewHandoffSummary: string;
  overviewWorkOrderTitle: string;
  overviewWorkOrderRead: string;
  overviewWorkOrderFocus: string;
  overviewWorkOrderPath: string;
  overviewWorkOrderHealth: string;
  overviewBriefCopyAriaLabel: string;
  overviewBriefCopiedAriaLabel: string;
  overviewReanalyzeCopyAriaLabel: string;
  overviewReanalyzeCopiedAriaLabel: string;
  overviewSyncCopyAriaLabel: string;
  overviewSyncCopiedAriaLabel: string;
  overviewBriefTitle: string;
  overviewBriefTotalNodes: string;
  overviewBriefTotalRelations: string;
  overviewBriefHealthSignals: string;
  overviewBriefHealthUrl: string;
  overviewBriefInsightsUrl: string;
  overviewBriefAgentCheck: string;
  overviewBriefMcpCheck: string;
  overviewBriefMcpQueryPlan: string;
  overviewBriefWorkspaceCheck: string;
  overviewBriefMcpWorkspaceCheck: string;
  overviewRelationVisibleCountSuffix: string;
  overviewRelationLodNotice: string;
  overviewRelationPreparingNotice: string;
  focusBriefCopy: string;
  focusBriefCopied: string;
  focusMcpCopy: string;
  focusMcpCopied: string;
  focusMcpImpactCopy: string;
  focusMcpImpactCopied: string;
  focusSyncGateCopy: string;
  focusSyncGateCopied: string;
  focusEnhanceCopy: string;
  focusEnhanceCopied: string;
  focusOpenOntology: string;
  focusOpenBuilder: string;
  focusHandoffSummary: string;
  focusReviewOrderTitle: string;
  focusReviewOrderProfile: string;
  focusReviewOrderImpact: string;
  focusReviewOrderRepair: string;
  focusReviewOrderSync: string;
  focusBriefCopyAriaLabel: string;
  focusBriefCopiedAriaLabel: string;
  focusMcpCopyAriaLabel: string;
  focusMcpCopiedAriaLabel: string;
  focusMcpImpactCopyAriaLabel: string;
  focusMcpImpactCopiedAriaLabel: string;
  focusSyncGateCopyAriaLabel: string;
  focusSyncGateCopiedAriaLabel: string;
  focusEnhanceCopyAriaLabel: string;
  focusEnhanceCopiedAriaLabel: string;
  focusBriefTitle: string;
  focusBriefNode: string;
  focusBriefUrl: string;
  focusBriefOntologyUrl: string;
  focusBriefBuilderUrl: string;
  focusBriefReviewFocus: string;
  focusBriefAgentCheck: string;
  focusBriefMcpCheck: string;
  focusBriefImpactCheck: string;
  focusBriefMcpImpactCheck: string;
  focusBriefSyncGate: string;
  healthMcpCopyAriaLabel: string;
  healthMcpCopiedAriaLabel: string;
  healthMcpImpactCopyAriaLabel: string;
  healthMcpImpactCopiedAriaLabel: string;
  healthSyncGateCopyAriaLabel: string;
  healthSyncGateCopiedAriaLabel: string;
  healthCopyAriaLabel: string;
  healthCopiedAriaLabel: string;
  healthEvidenceTitle: string;
  healthEvidenceTotal: string;
  healthEvidenceInspectUrl: string;
  healthEvidenceOntologyUrl: string;
  healthEvidenceRepairUrl: string;
  healthEvidenceNextAction: string;
  healthEvidenceAgentCheck: string;
  healthEvidenceMcpCheck: string;
  healthEvidenceRelationPreflight: string;
  healthEvidenceMcpRelationPreflight: string;
  healthEvidenceImpactCheck: string;
  healthEvidenceMcpImpactCheck: string;
  healthEvidenceSyncGate: string;
  healthEvidenceActionKindStale: string;
  healthEvidenceActionKindOrphan: string;
  healthEvidenceActionKindPromotion: string;
  healthEvidenceActionStale: string;
  healthEvidenceActionOrphan: string;
  healthEvidenceActionPromotion: string;
  healthEvidenceNone: string;
  healthEvidenceUrl: string;
  focusPrompt: string;
  focusSelected: string;
  pathPrompt: string;
  pathSelected: string;
  pathResolved: string;
  pathEvidenceCopy: string;
  pathEvidenceCopied: string;
  pathEvidenceCopyAriaLabel: string;
  pathEvidenceCopiedAriaLabel: string;
  pathMcpCopy: string;
  pathMcpCopied: string;
  pathMcpCopyAriaLabel: string;
  pathMcpCopiedAriaLabel: string;
  pathRelationPreflightCopy: string;
  pathRelationPreflightCopied: string;
  pathRelationPreflightCopyAriaLabel: string;
  pathRelationPreflightCopiedAriaLabel: string;
  pathExplainRelationCopy: string;
  pathExplainRelationCopied: string;
  pathExplainRelationCopyAriaLabel: string;
  pathExplainRelationCopiedAriaLabel: string;
  pathAllPathsPlanCopy: string;
  pathAllPathsPlanCopied: string;
  pathAllPathsPlanCopyAriaLabel: string;
  pathAllPathsPlanCopiedAriaLabel: string;
  pathAllPathsCopy: string;
  pathAllPathsCopied: string;
  pathAllPathsCopyAriaLabel: string;
  pathAllPathsCopiedAriaLabel: string;
  pathHandoffSummary: string;
  pathCopyTools: string;
  pathProofOrderTitle: string;
  pathProofOrderDesc: string;
  pathProofChecklist: string;
  pathProofVisiblePath: string;
  pathProofRelationPreflight: string;
  pathProofExplainRelation: string;
  pathProofBoundedTraversal: string;
  pathProofPostWriteSync: string;
  pathProofStatusReady: string;
  pathProofStatusRequired: string;
  pathProofStatusAfterWrite: string;
  pathEvidenceTitle: string;
  pathEvidenceSource: string;
  pathEvidenceTarget: string;
  pathEvidenceUrl: string;
  pathEvidenceSourceOntologyUrl: string;
  pathEvidenceTargetOntologyUrl: string;
  pathEvidenceSourceBuilderUrl: string;
  pathEvidenceTargetBuilderUrl: string;
  pathEvidenceCliCheck: string;
  pathEvidenceMcpCheck: string;
  pathEvidenceRelationPreflightReason: string;
  pathEvidenceRelationPreflightMcpCheck: string;
  pathEvidenceExplainRelationMcpCheck: string;
  pathEvidenceAllPathsPlanMcpCheck: string;
  pathEvidenceAllPathsMcpCheck: string;
  pathEvidenceAllPathsCopyInstruction: string;
  pathEvidencePostWriteSyncGate: string;
  pathSourceOntology: string;
  pathTargetOntology: string;
  pathSourceBuilder: string;
  pathTargetBuilder: string;
  healthPrompt: string;
  overviewPrompt: string;
}

interface TopologyAnalysisBarProps {
  mode: TopologyAnalysisMode;
  summary: TopologyAnalysisSummary;
  healthAction: TopologyHealthActionTarget | null;
  selectedSlug?: string | null;
  selectedTitle: string | null;
  pathSourceSlug?: string | null;
  pathTargetSlug?: string | null;
  pathSourceTitle?: string | null;
  pathTargetTitle?: string | null;
  overviewRelationVisibility?: {
    visible: number;
    total: number;
  } | null;
  rightPanelReserved?: boolean;
  leftPanelExpanded?: boolean;
  createPanelReserved?: boolean;
  labels: TopologyAnalysisBarLabels;
  onModeChange: (mode: TopologyAnalysisMode) => void;
  onHealthAction: (slug: string) => void;
}

const MODES = [
  { value: "overview", icon: Network, labelKey: "overview" },
  { value: "focus", icon: Activity, labelKey: "focus" },
  { value: "path", icon: GitBranch, labelKey: "path" },
  { value: "health", icon: HeartPulse, labelKey: "health" },
] as const;

function formatOntologyReanalysisAgentCommand(): string {
  return [
    "Ontology Atlas agent task: reanalyze and strengthen this codebase ontology.",
    "",
    "If Atlas MCP is connected, run these read-first calls:",
    '1. list_kinds({})',
    '2. analyze_repo_structure({ "rootPath": "[repo-root]", "maxDepth": 3 })',
    '3. query_ontology({ "operation": "growth_plan", "limit": 20 })',
    '4. query_ontology({ "operation": "maintenance_plan", "limit": 20 })',
    '5. validate_vault({ "repoRoot": "[repo-root]" })',
    "",
    "Then propose only confirmed domain/capability/element/relation updates.",
    "Before writing, compare against existing nodes with find_evidence/similar_nodes and avoid duplicates.",
    "",
    "CLI fallback:",
    "pnpm cli:mcp-verify docs/ontology --timeout-ms 15000",
    "node cli/src/index.mjs growth docs/ontology --limit 20",
    "node cli/src/index.mjs maintenance docs/ontology --limit 20",
    "node cli/src/index.mjs validate docs/ontology",
  ].join("\n");
}

function formatFocusedOntologyEnhancementAgentCommand(slug: string): string {
  return [
    `Ontology Atlas agent task: strengthen the ontology around ${slug}.`,
    "",
    "If Atlas MCP is connected, run these read-first calls:",
    `1. get_concept({ "slug": ${JSON.stringify(slug)} })`,
    `2. query_ontology({ "operation": "node_profile", "slug": ${JSON.stringify(slug)}, "depth": 2, "limit": 12 })`,
    `3. query_ontology({ "operation": "blast_radius", "slug": ${JSON.stringify(slug)}, "depth": 2, "direction": "incoming" })`,
    `4. query_ontology({ "operation": "similar_nodes", "slug": ${JSON.stringify(slug)}, "limit": 8 })`,
    '5. validate_vault({ "repoRoot": "[repo-root]" })',
    "",
    "Then propose narrowly scoped description, owner, evidence, or relation updates for this node only.",
    "Use patch_concept/add_relation only after confirming the proposed graph change.",
    "",
    "CLI fallback:",
    `node cli/src/index.mjs node ${slug} docs/ontology --neighbors`,
    `node cli/src/index.mjs blast-radius ${slug} docs/ontology --depth 2 --direction incoming`,
    `node cli/src/index.mjs similar ${slug} docs/ontology --limit 8`,
  ].join("\n");
}

export function TopologyAnalysisBar({
  mode,
  summary,
  healthAction,
  selectedSlug = null,
  selectedTitle,
  pathSourceSlug,
  pathTargetSlug,
  pathSourceTitle,
  pathTargetTitle,
  overviewRelationVisibility = null,
  rightPanelReserved = false,
  leftPanelExpanded = false,
  createPanelReserved = false,
  labels,
  onModeChange,
  onHealthAction,
}: TopologyAnalysisBarProps) {
  const [overviewBriefCopied, setOverviewBriefCopied] = useState(false);
  const [overviewReanalyzeCopied, setOverviewReanalyzeCopied] = useState(false);
  const [overviewSyncCopied, setOverviewSyncCopied] = useState(false);
  const [healthCopied, setHealthCopied] = useState(false);
  const [healthMcpCopied, setHealthMcpCopied] = useState(false);
  const [healthMcpImpactCopied, setHealthMcpImpactCopied] = useState(false);
  const [healthSyncGateCopied, setHealthSyncGateCopied] = useState(false);
  const [focusBriefCopied, setFocusBriefCopied] = useState(false);
  const [focusMcpCopied, setFocusMcpCopied] = useState(false);
  const [focusMcpImpactCopied, setFocusMcpImpactCopied] = useState(false);
  const [focusSyncGateCopied, setFocusSyncGateCopied] = useState(false);
  const [focusEnhanceCopied, setFocusEnhanceCopied] = useState(false);
  const [pathEvidenceCopied, setPathEvidenceCopied] = useState(false);
  const [pathMcpCopied, setPathMcpCopied] = useState(false);
  const [pathRelationPreflightCopied, setPathRelationPreflightCopied] =
    useState(false);
  const [pathExplainRelationCopied, setPathExplainRelationCopied] =
    useState(false);
  const [pathAllPathsPlanCopied, setPathAllPathsPlanCopied] = useState(false);
  const [pathAllPathsCopied, setPathAllPathsCopied] = useState(false);
  const displaySelectedTitle = selectedTitle ? compactAnalysisTitle(selectedTitle) : null;
  const displayPathSourceTitle = pathSourceTitle
    ? compactAnalysisTitle(pathSourceTitle)
    : null;
  const displayPathTargetTitle = pathTargetTitle
    ? compactAnalysisTitle(pathTargetTitle)
    : null;
  const postChangeSyncPacket = formatAgentPostChangeSyncPacket();
  const disclosureSummaryLabel =
    mode === "overview" ? labels.overviewHandoffSummary : labels.actions;
  const relationVisibilityPreparing =
    mode === "overview" &&
    overviewRelationVisibility &&
    overviewRelationVisibility.total >= 240 &&
    overviewRelationVisibility.visible === 0;
  const resolvedPathTitle =
    displayPathSourceTitle && displayPathTargetTitle
      ? labels.pathResolved
          .replace("{source}", displayPathSourceTitle)
          .replace("{target}", displayPathTargetTitle)
      : null;
  const prompt =
    mode === "focus"
      ? displaySelectedTitle
        ? labels.focusSelected.replace("{title}", displaySelectedTitle)
        : labels.focusPrompt
      : mode === "path"
        ? resolvedPathTitle
          ? resolvedPathTitle
          : displayPathSourceTitle || displaySelectedTitle
          ? labels.pathSelected.replace(
              "{title}",
              displayPathSourceTitle ?? displaySelectedTitle ?? "",
            )
          : labels.pathPrompt
        : mode === "health"
          ? labels.healthPrompt
          : labels.overviewPrompt;

  const primaryLabel =
    mode === "health" ? labels.metricIssues : labels.metricNodes;
  const healthNextAction = healthAction
    ? getTopologyHealthNextAction(healthAction.kind, {
        actionStale: labels.healthEvidenceActionStale,
        actionOrphan: labels.healthEvidenceActionOrphan,
        actionPromotion: labels.healthEvidenceActionPromotion,
      })
    : null;
  const healthActionKindLabel = healthAction
    ? healthAction.kind === "stale"
      ? labels.healthStale
      : healthAction.kind === "orphan"
        ? labels.healthOrphan
        : labels.healthPromotion
    : null;

  const copyOverviewBrief = useCallback(async () => {
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const healthUrl =
      typeof window === "undefined"
        ? "/topology/?mode=health"
        : buildOverviewModeUrl(window.location.href, "health");
    const ok = await copyText(
      formatTopologyOverviewBrief({
        summary,
        labels: {
          title: labels.overviewBriefTitle,
          totalNodes: labels.overviewBriefTotalNodes,
          totalRelations: labels.overviewBriefTotalRelations,
          healthSignals: labels.overviewBriefHealthSignals,
          stale: labels.healthStale,
          orphan: labels.healthOrphan,
          promotion: labels.healthPromotion,
          url: labels.healthEvidenceUrl,
          healthUrl: labels.overviewBriefHealthUrl,
          insightsUrl: labels.overviewBriefInsightsUrl,
          agentCheck: labels.overviewBriefAgentCheck,
          mcpCheck: labels.overviewBriefMcpCheck,
          mcpQueryPlan: labels.overviewBriefMcpQueryPlan,
          workspaceCheck: labels.overviewBriefWorkspaceCheck,
          mcpWorkspaceCheck: labels.overviewBriefMcpWorkspaceCheck,
        },
        url: currentUrl,
        healthUrl,
        insightsUrl: "/ontology/insights/",
      }),
    );
    if (!ok) return;
    setOverviewBriefCopied(true);
    window.setTimeout(() => setOverviewBriefCopied(false), 1600);
  }, [labels, summary]);

  const copyHealthEvidence = useCallback(async () => {
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const inspectUrl =
      typeof window === "undefined" || !healthAction
        ? null
        : buildHealthInspectUrl(window.location.href, healthAction.slug);
    const ok = await copyText(
      formatTopologyHealthBrief({
        summary,
        actionTarget: healthAction,
        labels: {
          title: labels.healthEvidenceTitle,
          total: labels.healthEvidenceTotal,
          stale: labels.healthStale,
          orphan: labels.healthOrphan,
          promotion: labels.healthPromotion,
          inspect: labels.healthInspect,
          inspectUrl: labels.healthEvidenceInspectUrl,
          ontologyUrl: labels.healthEvidenceOntologyUrl,
          repairUrl: labels.healthEvidenceRepairUrl,
          nextAction: labels.healthEvidenceNextAction,
          agentCheck: labels.healthEvidenceAgentCheck,
          mcpCheck: labels.healthEvidenceMcpCheck,
          relationPreflight: labels.healthEvidenceRelationPreflight,
          mcpRelationPreflight: labels.healthEvidenceMcpRelationPreflight,
          impactCheck: labels.healthEvidenceImpactCheck,
          mcpImpactCheck: labels.healthEvidenceMcpImpactCheck,
          syncGate: labels.healthEvidenceSyncGate,
          actionKindStale: labels.healthEvidenceActionKindStale,
          actionKindOrphan: labels.healthEvidenceActionKindOrphan,
          actionKindPromotion: labels.healthEvidenceActionKindPromotion,
          actionStale: labels.healthEvidenceActionStale,
          actionOrphan: labels.healthEvidenceActionOrphan,
          actionPromotion: labels.healthEvidenceActionPromotion,
          none: labels.healthEvidenceNone,
          url: labels.healthEvidenceUrl,
        },
        url: currentUrl,
        inspectUrl,
        syncGatePacket: postChangeSyncPacket,
      }),
    );
    if (!ok) return;
    setHealthCopied(true);
    window.setTimeout(() => setHealthCopied(false), 1600);
  }, [healthAction, labels, postChangeSyncPacket, summary]);

  const copyOverviewReanalysisCommand = useCallback(async () => {
    const ok = await copyText(formatOntologyReanalysisAgentCommand());
    if (!ok) return;
    setOverviewReanalyzeCopied(true);
    window.setTimeout(() => setOverviewReanalyzeCopied(false), 1600);
  }, []);

  const copyHealthMcpCheck = useCallback(async () => {
    if (!healthAction) return;
    const ok = await copyText(formatTopologyHealthMcpCheck(healthAction.slug));
    if (!ok) return;
    setHealthMcpCopied(true);
    window.setTimeout(() => setHealthMcpCopied(false), 1600);
  }, [healthAction]);

  const copyHealthImpactMcpCheck = useCallback(async () => {
    if (!healthAction) return;
    const ok = await copyText(formatTopologyHealthImpactMcpCheck(healthAction.slug));
    if (!ok) return;
    setHealthMcpImpactCopied(true);
    window.setTimeout(() => setHealthMcpImpactCopied(false), 1600);
  }, [healthAction]);

  const copyHealthSyncGate = useCallback(async () => {
    const ok = await copyText(postChangeSyncPacket);
    if (!ok) return;
    setHealthSyncGateCopied(true);
    window.setTimeout(() => setHealthSyncGateCopied(false), 1600);
  }, [postChangeSyncPacket]);

  const copyOverviewSyncGate = useCallback(async () => {
    const ok = await copyText(postChangeSyncPacket);
    if (!ok) return;
    setOverviewSyncCopied(true);
    window.setTimeout(() => setOverviewSyncCopied(false), 1600);
  }, [postChangeSyncPacket]);

  const copyFocusMcpCheck = useCallback(async () => {
    if (!selectedSlug) return;
    const ok = await copyText(formatTopologyHealthMcpCheck(selectedSlug));
    if (!ok) return;
    setFocusMcpCopied(true);
    window.setTimeout(() => setFocusMcpCopied(false), 1600);
  }, [selectedSlug]);

  const copyFocusBrief = useCallback(async () => {
    if (!selectedSlug || !selectedTitle) return;
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const focusUrl =
      typeof window === "undefined"
        ? null
        : buildFocusInspectUrl(window.location.href, selectedSlug);
    const ok = await copyText(
      formatTopologyFocusBrief({
        slug: selectedSlug,
        title: selectedTitle,
        labels: {
          title: labels.focusBriefTitle,
          node: labels.focusBriefNode,
          url: labels.focusBriefUrl,
          ontologyUrl: labels.focusBriefOntologyUrl,
          builderUrl: labels.focusBriefBuilderUrl,
          reviewFocus: labels.focusBriefReviewFocus,
          agentCheck: labels.focusBriefAgentCheck,
          mcpCheck: labels.focusBriefMcpCheck,
          impactCheck: labels.focusBriefImpactCheck,
          mcpImpactCheck: labels.focusBriefMcpImpactCheck,
          syncGate: labels.focusBriefSyncGate,
        },
        url: currentUrl,
        focusUrl,
        ontologyUrl: buildOntologyNodeHref(selectedSlug),
        builderUrl: buildTopologyHealthRepairHref(selectedSlug),
        syncGatePacket: postChangeSyncPacket,
      }),
    );
    if (!ok) return;
    setFocusBriefCopied(true);
    window.setTimeout(() => setFocusBriefCopied(false), 1600);
  }, [labels, postChangeSyncPacket, selectedSlug, selectedTitle]);

  const copyFocusMcpImpactCheck = useCallback(async () => {
    if (!selectedSlug) return;
    const ok = await copyText(formatTopologyHealthImpactMcpCheck(selectedSlug));
    if (!ok) return;
    setFocusMcpImpactCopied(true);
    window.setTimeout(() => setFocusMcpImpactCopied(false), 1600);
  }, [selectedSlug]);

  const copyFocusSyncGate = useCallback(async () => {
    if (!selectedSlug) return;
    const ok = await copyText(postChangeSyncPacket);
    if (!ok) return;
    setFocusSyncGateCopied(true);
    window.setTimeout(() => setFocusSyncGateCopied(false), 1600);
  }, [postChangeSyncPacket, selectedSlug]);

  const copyFocusEnhancementCommand = useCallback(async () => {
    if (!selectedSlug) return;
    const ok = await copyText(formatFocusedOntologyEnhancementAgentCommand(selectedSlug));
    if (!ok) return;
    setFocusEnhanceCopied(true);
    window.setTimeout(() => setFocusEnhanceCopied(false), 1600);
  }, [selectedSlug]);

  const copyPathEvidence = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug || !pathSourceTitle || !pathTargetTitle) {
      return;
    }
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const ok = await copyText(
      formatTopologyPathEvidenceBrief({
        sourceSlug: pathSourceSlug,
        targetSlug: pathTargetSlug,
        sourceTitle: pathSourceTitle,
        targetTitle: pathTargetTitle,
        labels: {
          title: labels.pathEvidenceTitle,
          source: labels.pathEvidenceSource,
          target: labels.pathEvidenceTarget,
          url: labels.pathEvidenceUrl,
          sourceOntologyUrl: labels.pathEvidenceSourceOntologyUrl,
          targetOntologyUrl: labels.pathEvidenceTargetOntologyUrl,
          sourceBuilderUrl: labels.pathEvidenceSourceBuilderUrl,
          targetBuilderUrl: labels.pathEvidenceTargetBuilderUrl,
          cliCheck: labels.pathEvidenceCliCheck,
          mcpCheck: labels.pathEvidenceMcpCheck,
          relationPreflightReason: labels.pathEvidenceRelationPreflightReason,
          relationPreflightMcpCheck:
            labels.pathEvidenceRelationPreflightMcpCheck,
          explainRelationMcpCheck: labels.pathEvidenceExplainRelationMcpCheck,
          allPathsPlanMcpCheck: labels.pathEvidenceAllPathsPlanMcpCheck,
          allPathsMcpCheck: labels.pathEvidenceAllPathsMcpCheck,
          allPathsEvidenceContract: labels.pathEvidenceAllPathsCopyInstruction,
          proofChecklist: labels.pathProofChecklist,
          proofVisiblePath: labels.pathProofVisiblePath,
          proofRelationPreflight: labels.pathProofRelationPreflight,
          proofExplainRelation: labels.pathProofExplainRelation,
          proofBoundedTraversal: labels.pathProofBoundedTraversal,
          proofPostWriteSync: labels.pathProofPostWriteSync,
          proofStatusReady: labels.pathProofStatusReady,
          proofStatusRequired: labels.pathProofStatusRequired,
          proofStatusAfterWrite: labels.pathProofStatusAfterWrite,
          syncGate: labels.pathEvidencePostWriteSyncGate,
        },
        url: currentUrl,
        syncGatePacket: postChangeSyncPacket,
      }),
    );
    if (!ok) return;
    setPathEvidenceCopied(true);
    window.setTimeout(() => setPathEvidenceCopied(false), 1600);
  }, [
    labels,
    pathSourceSlug,
    pathSourceTitle,
    pathTargetSlug,
    pathTargetTitle,
    postChangeSyncPacket,
  ]);

  const copyPathMcpCheck = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(formatTopologyPathMcpCheck(pathSourceSlug, pathTargetSlug));
    if (!ok) return;
    setPathMcpCopied(true);
    window.setTimeout(() => setPathMcpCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathRelationPreflight = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathRelationPreflightMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathRelationPreflightCopied(true);
    window.setTimeout(() => setPathRelationPreflightCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathExplainRelation = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathExplainRelationMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathExplainRelationCopied(true);
    window.setTimeout(() => setPathExplainRelationCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathAllPathsPlan = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathAllPathsPlanMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathAllPathsPlanCopied(true);
    window.setTimeout(() => setPathAllPathsPlanCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathAllPaths = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathAllPathsMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathAllPathsCopied(true);
    window.setTimeout(() => setPathAllPathsCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  return (
    <section
      aria-label={labels.title}
      className={`topology-ui-scale pointer-events-auto absolute inset-x-3 z-20 overflow-y-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5 shadow-[0_14px_34px_rgba(0,0,0,0.18)] md:hidden lg:inset-x-auto lg:block lg:-translate-x-0 ${
        createPanelReserved
          ? "top-[31.5rem] max-h-[calc(100dvh-33.5rem)]"
          : // 헤더 pill 아래 16px — 9.5rem 은 ~90px 공백, 5rem 은 헤더에
            // 밀착이었다 (사용자 보고 2회). 헤더 bottom ≈ 72px 기준.
            "top-[5.5rem] max-h-[calc(100dvh-7.5rem)]"
      } ${
        rightPanelReserved
          ? "lg:left-6 xl:left-8 lg:w-[min(280px,calc(100vw_-_460px))]"
          : "lg:left-6 xl:left-8 lg:w-[280px]"
      } ${leftPanelExpanded && !createPanelReserved ? "lg:top-[24rem]" : ""}`}
    >
      <div className="flex flex-col gap-2">
        <div className="grid w-full grid-cols-4 gap-0.5 rounded-md bg-[color:var(--color-overlay-1)] p-0.5">
          {MODES.map(({ value, icon: Icon, labelKey }) => {
            const active = value === mode;
            return (
              // 아이콘-전용 탭 — hover 즉시 라벨 tooltip (사용자: "마우스
              // 올리면 뭔지 나와야 선택을 하지").
              <Tooltip key={value} content={labels[labelKey]} side="bottom">
                <button
                  type="button"
                  onClick={() => onModeChange(value)}
                  aria-pressed={active}
                  aria-label={labels[labelKey]}
                  className={`inline-flex h-8 w-full items-center justify-center rounded px-1.5 transition-colors ${
                    active
                      ? "bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]"
                      : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  }`}
                >
                  <Icon size={14} aria-hidden />
                </button>
              </Tooltip>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
            {prompt}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            <span>
              <span className="text-[color:var(--color-text-secondary)]">
                {summary.primaryMetric}
              </span>{" "}
              {primaryLabel}
            </span>
            <span className="h-2 w-px bg-[color:var(--color-overlay-3)]" />
            <span>
              <span className="text-[color:var(--color-text-secondary)]">
                {summary.secondaryMetric}
              </span>{" "}
              {labels.metricRelations}
            </span>
          </div>
          {mode === "overview" ? (
            <p className="mt-1 line-clamp-2 break-keep text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
              {overviewRelationVisibility && overviewRelationVisibility.total > 0 ? (
                <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
                  {overviewRelationVisibility.visible}/{overviewRelationVisibility.total}{" "}
                  {labels.overviewRelationVisibleCountSuffix} ·
                </span>
              ) : null}
              {relationVisibilityPreparing
                ? labels.overviewRelationPreparingNotice
                : labels.overviewRelationLodNotice}
            </p>
          ) : null}
          {mode === "health" ? (
            <>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[color:var(--color-text-quaternary)]">
                <HealthBreakdownChip
                  count={summary.healthBreakdown.stale}
                  label={labels.healthStale}
                />
                <HealthBreakdownChip
                  count={summary.healthBreakdown.orphan}
                  label={labels.healthOrphan}
                />
                <HealthBreakdownChip
                  count={summary.healthBreakdown.promotion}
                  label={labels.healthPromotion}
                />
              </div>
              {healthAction ? (
                <div className="mt-3 min-w-0">
                  <div className="border-t border-[color:var(--color-border-soft)] pt-2">
                    <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      {labels.healthRepairTargetLabel}
                    </p>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <button
                        type="button"
                        aria-label={
                          healthActionKindLabel
                            ? `${healthActionKindLabel} ${compactAnalysisTitle(healthAction.title)}`
                            : compactAnalysisTitle(healthAction.title)
                        }
                        onClick={() => onHealthAction(healthAction.slug)}
                        className="group inline-flex min-w-0 items-center gap-1.5 text-left text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                      >
                        {healthActionKindLabel ? (
                          <span className="shrink-0 rounded border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 text-[10px] leading-none text-[color:var(--color-text-tertiary)] group-hover:border-[color:var(--color-border-strong)] group-hover:text-[color:var(--color-text-secondary)]">
                            {healthActionKindLabel}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate">
                          {compactAnalysisTitle(healthAction.title)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={copyHealthEvidence}
                        className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none"
                        aria-label={
                          healthCopied
                            ? labels.healthCopiedAriaLabel
                            : labels.healthCopyAriaLabel
                        }
                      >
                        {healthCopied ? (
                          <Check size={12} aria-hidden />
                        ) : (
                          <Clipboard size={12} aria-hidden />
                        )}
                        <span>{labels.healthCopy}</span>
                      </button>
                      <span className="sr-only" aria-live="polite" aria-atomic="true">
                        {healthCopied ? labels.healthCopied : ""}
                      </span>
                    </div>
                    <div
                      className="mt-2 flex flex-wrap gap-1"
                      data-testid="topology-health-repair-order"
                    >
                      <CompactCopyButton
                        copied={healthMcpCopied}
                        label={labels.healthMcpCopy}
                        ariaLabel={
                          healthMcpCopied
                            ? labels.healthMcpCopiedAriaLabel
                            : labels.healthMcpCopyAriaLabel
                        }
                        onClick={copyHealthMcpCheck}
                      />
                      <Link
                        href={buildTopologyHealthRepairHref(healthAction.slug)}
                        className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-3)]"
                      >
                        {labels.healthRepair}
                      </Link>
                      <Link
                        href={buildOntologyNodeHref(healthAction.slug)}
                        className="inline-flex min-h-8 items-center rounded-md px-2 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                      >
                        {labels.healthOpenOntology}
                      </Link>
                    </div>
                    <div className="mt-2">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {labels.healthRepairOrderTitle}
                      </p>
                      <ol className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                        <OverviewWorkStep label={labels.healthRepairOrderInspect} />
                        <OverviewWorkStep label={labels.healthRepairOrderRepair} />
                        <OverviewWorkStep label={labels.healthRepairOrderSync} />
                      </ol>
                    </div>
                    {healthNextAction ? (
                      <details className="group mt-2">
                        <summary
                          className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                          data-testid="topology-health-repair-proof-summary"
                        >
                          <ChevronDown
                            size={12}
                            aria-hidden
                            className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                            data-testid="topology-health-repair-proof-chevron"
                          />
                          <span>{labels.healthHandoffSummary}</span>
                        </summary>
                        <p className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                          {healthNextAction}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <CompactCopyButton
                            copied={healthMcpImpactCopied}
                            label={labels.healthMcpImpactCopy}
                            ariaLabel={
                              healthMcpImpactCopied
                                ? labels.healthMcpImpactCopiedAriaLabel
                                : labels.healthMcpImpactCopyAriaLabel
                            }
                            onClick={copyHealthImpactMcpCheck}
                          />
                          <CompactCopyButton
                            copied={healthSyncGateCopied}
                            label={labels.healthSyncGateCopy}
                            ariaLabel={
                              healthSyncGateCopied
                                ? labels.healthSyncGateCopiedAriaLabel
                                : labels.healthSyncGateCopyAriaLabel
                            }
                            onClick={copyHealthSyncGate}
                          />
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {mode === "overview" ? (
            <details className="group mt-1">
              <summary
                className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                data-testid="topology-overview-handoff-summary"
              >
                <ChevronDown
                  size={12}
                  aria-hidden
                  className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                  data-testid="topology-overview-handoff-chevron"
                />
                <span>{disclosureSummaryLabel}</span>
              </summary>
              <div className="mt-2">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                    {labels.overviewWorkOrderTitle}
                  </p>
                  <ol
                    className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1"
                    data-testid="topology-overview-work-order"
                  >
                    <OverviewWorkStep label={labels.overviewWorkOrderRead} />
                    <OverviewWorkStep label={labels.overviewWorkOrderFocus} />
                    <OverviewWorkStep label={labels.overviewWorkOrderPath} />
                    <OverviewWorkStep label={labels.overviewWorkOrderHealth} />
                  </ol>
                </div>
                {/* 첫 화면 밀도 축소 — agent 복사 명령 3종은 펼쳐야 보인다. */}
                <div className="mt-2 flex flex-wrap gap-1">
                  <CompactCopyButton
                    copied={overviewReanalyzeCopied}
                    label={
                      overviewReanalyzeCopied
                        ? labels.overviewReanalyzeCopied
                        : labels.overviewReanalyzeCopy
                    }
                    ariaLabel={
                      overviewReanalyzeCopied
                        ? labels.overviewReanalyzeCopiedAriaLabel
                        : labels.overviewReanalyzeCopyAriaLabel
                    }
                    onClick={copyOverviewReanalysisCommand}
                  />
                  <CompactCopyButton
                    copied={overviewSyncCopied}
                    label={
                      overviewSyncCopied
                        ? labels.overviewSyncCopied
                        : labels.overviewSyncCopy
                    }
                    ariaLabel={
                      overviewSyncCopied
                        ? labels.overviewSyncCopiedAriaLabel
                        : labels.overviewSyncCopyAriaLabel
                    }
                    onClick={copyOverviewSyncGate}
                  />
                  <CompactCopyButton
                    copied={overviewBriefCopied}
                    label={
                      overviewBriefCopied
                        ? labels.overviewBriefCopied
                        : labels.overviewBriefCopy
                    }
                    ariaLabel={
                      overviewBriefCopied
                        ? labels.overviewBriefCopiedAriaLabel
                        : labels.overviewBriefCopyAriaLabel
                    }
                    onClick={copyOverviewBrief}
                  />
                </div>
              </div>
            </details>
          ) : null}
          {mode === "path" && pathSourceSlug && pathTargetSlug ? (
            <details className="group mt-2 border-t border-[color:var(--color-border-soft)] pt-2">
              <summary
                className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                data-testid="topology-path-proof-summary"
              >
                <ChevronDown
                  size={12}
                  aria-hidden
                  className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                  data-testid="topology-path-proof-chevron"
                />
                <span>{labels.pathHandoffSummary}</span>
              </summary>
              <div className="mt-2">
              <p className="line-clamp-2 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                {labels.pathProofOrderDesc}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={copyPathEvidence}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={
                    pathEvidenceCopied
                      ? labels.pathEvidenceCopiedAriaLabel
                      : labels.pathEvidenceCopyAriaLabel
                  }
                >
                  {pathEvidenceCopied ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clipboard size={12} aria-hidden />
                  )}
                  <span>
                    {pathEvidenceCopied
                      ? labels.pathEvidenceCopied
                      : labels.pathEvidenceCopy}
                  </span>
                </button>
                <Link
                  href={buildOntologyNodeHref(pathSourceSlug)}
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathSourceOntology}
                </Link>
                <Link
                  href={buildOntologyNodeHref(pathTargetSlug)}
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathTargetOntology}
                </Link>
                <Link
                  href={buildTopologyHealthRepairHref(pathSourceSlug)}
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathSourceBuilder}
                </Link>
                <Link
                  href={buildTopologyHealthRepairHref(pathTargetSlug)}
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathTargetBuilder}
                </Link>
              </div>
              <details className="group mt-2">
                <summary
                  data-testid="topology-path-checks-summary"
                  className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                >
                  <ChevronDown
                    size={12}
                    aria-hidden
                    className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                    data-testid="topology-path-checks-chevron"
                  />
                  <span>{labels.pathCopyTools}</span>
                </summary>
                <div className="mt-1 flex flex-wrap gap-1">
                  <CompactCopyButton
                    copied={pathMcpCopied}
                    label={labels.pathMcpCopy}
                    ariaLabel={
                      pathMcpCopied
                        ? labels.pathMcpCopiedAriaLabel
                        : labels.pathMcpCopyAriaLabel
                    }
                    onClick={copyPathMcpCheck}
                  />
                  <CompactCopyButton
                    copied={pathRelationPreflightCopied}
                    label={labels.pathRelationPreflightCopy}
                    ariaLabel={
                      pathRelationPreflightCopied
                        ? labels.pathRelationPreflightCopiedAriaLabel
                        : labels.pathRelationPreflightCopyAriaLabel
                    }
                    onClick={copyPathRelationPreflight}
                  />
                  <CompactCopyButton
                    copied={pathExplainRelationCopied}
                    label={labels.pathExplainRelationCopy}
                    ariaLabel={
                      pathExplainRelationCopied
                        ? labels.pathExplainRelationCopiedAriaLabel
                        : labels.pathExplainRelationCopyAriaLabel
                    }
                    onClick={copyPathExplainRelation}
                  />
                  <CompactCopyButton
                    copied={pathAllPathsPlanCopied}
                    label={labels.pathAllPathsPlanCopy}
                    ariaLabel={
                      pathAllPathsPlanCopied
                        ? labels.pathAllPathsPlanCopiedAriaLabel
                        : labels.pathAllPathsPlanCopyAriaLabel
                    }
                    onClick={copyPathAllPathsPlan}
                  />
                  <CompactCopyButton
                    copied={pathAllPathsCopied}
                    label={labels.pathAllPathsCopy}
                    ariaLabel={
                      pathAllPathsCopied
                        ? labels.pathAllPathsCopiedAriaLabel
                        : labels.pathAllPathsCopyAriaLabel
                    }
                    onClick={copyPathAllPaths}
                  />
                </div>
              </details>
              </div>
            </details>
          ) : null}
          {mode === "focus" ? (
            <div className="mt-2 border-t border-[color:var(--color-border-soft)] pt-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {labels.focusReviewOrderTitle}
              </p>
              <ol
                data-testid="topology-focus-review-order"
                className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1"
              >
                <OverviewWorkStep label={labels.focusReviewOrderProfile} />
                <OverviewWorkStep label={labels.focusReviewOrderImpact} />
                <OverviewWorkStep label={labels.focusReviewOrderRepair} />
                <OverviewWorkStep label={labels.focusReviewOrderSync} />
              </ol>
              {selectedSlug ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={copyFocusBrief}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                      aria-label={
                        focusBriefCopied
                          ? labels.focusBriefCopiedAriaLabel
                          : labels.focusBriefCopyAriaLabel
                      }
                    >
                      {focusBriefCopied ? (
                        <Check size={12} aria-hidden />
                      ) : (
                        <Clipboard size={12} aria-hidden />
                      )}
                      <span>
                        {focusBriefCopied
                          ? labels.focusBriefCopied
                          : labels.focusBriefCopy}
                      </span>
                    </button>
                    <Link
                      href={buildOntologyNodeHref(selectedSlug)}
                      className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {labels.focusOpenOntology}
                    </Link>
                    <Link
                      href={buildTopologyHealthRepairHref(selectedSlug)}
                      className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {labels.focusOpenBuilder}
                    </Link>
                  </div>
                  <details className="group mt-2">
                    <summary
                      data-testid="topology-focus-proof-summary"
                      className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                    >
                      <ChevronDown
                        size={12}
                        aria-hidden
                        className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                        data-testid="topology-focus-proof-chevron"
                      />
                      <span>{labels.focusHandoffSummary}</span>
                    </summary>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <CompactCopyButton
                        copied={focusMcpCopied}
                        label={labels.focusMcpCopy}
                        ariaLabel={
                          focusMcpCopied
                            ? labels.focusMcpCopiedAriaLabel
                            : labels.focusMcpCopyAriaLabel
                        }
                        onClick={copyFocusMcpCheck}
                      />
                      <CompactCopyButton
                        copied={focusMcpImpactCopied}
                        label={labels.focusMcpImpactCopy}
                        ariaLabel={
                          focusMcpImpactCopied
                            ? labels.focusMcpImpactCopiedAriaLabel
                            : labels.focusMcpImpactCopyAriaLabel
                        }
                        onClick={copyFocusMcpImpactCheck}
                      />
                      <CompactCopyButton
                        copied={focusSyncGateCopied}
                        label={labels.focusSyncGateCopy}
                        ariaLabel={
                          focusSyncGateCopied
                            ? labels.focusSyncGateCopiedAriaLabel
                            : labels.focusSyncGateCopyAriaLabel
                        }
                        onClick={copyFocusSyncGate}
                      />
                      <CompactCopyButton
                        copied={focusEnhanceCopied}
                        label={labels.focusEnhanceCopy}
                        ariaLabel={
                          focusEnhanceCopied
                            ? labels.focusEnhanceCopiedAriaLabel
                            : labels.focusEnhanceCopyAriaLabel
                        }
                        onClick={copyFocusEnhancementCommand}
                      />
                    </div>
                  </details>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function buildOverviewModeUrl(
  currentUrl: string,
  mode: TopologyAnalysisMode,
): string {
  const url = new URL(currentUrl);
  url.searchParams.set("mode", mode);
  return url.toString();
}

function compactAnalysisTitle(title: string): string {
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}

function buildHealthInspectUrl(currentUrl: string, slug: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("mode", "health");
  url.searchParams.set("p", slug);
  return url.toString();
}

function buildFocusInspectUrl(currentUrl: string, slug: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("mode", "focus");
  url.searchParams.set("p", slug);
  return url.toString();
}

function HealthBreakdownChip({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[color:var(--color-text-tertiary)]">
      <span className="text-[color:var(--color-text-secondary)]">{count}</span>{" "}
      {label}
    </span>
  );
}

function OverviewWorkStep({
  label,
}: {
  label: string;
}) {
  return (
    <li className="inline-flex min-w-0 list-none items-center gap-1.5">
      <span className="h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-overlay-3)]" aria-hidden />
      <span className="block whitespace-nowrap text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
        {label}
      </span>
    </li>
  );
}

function CompactCopyButton({
  copied,
  label,
  ariaLabel,
  onClick,
}: {
  copied: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-[color:var(--color-text-quaternary)] transition-[background-color,color,transform] duration-180 ease-out hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none"
      aria-label={ariaLabel}
    >
      {copied ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
      <span>{label}</span>
    </button>
  );
}

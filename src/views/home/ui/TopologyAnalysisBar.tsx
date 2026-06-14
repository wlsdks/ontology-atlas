"use client";

import { useCallback, useState, type CSSProperties, type HTMLAttributes } from "react";
import {
  Activity,
  ArrowRight,
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
  formatTopologyAgentReadinessSummary,
  formatTopologyHealthBrief,
  formatTopologyHealthImpactMcpCheck,
  formatTopologyHealthMcpCheck,
  formatTopologyOverviewBrief,
  formatTopologyRelationQualitySummary,
  formatTopologyRelationProvenanceSummary,
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
  overviewBriefRelationReading: string;
  overviewBriefRelationProvenance: string;
  overviewBriefRelationSourceBacked: string;
  overviewBriefRelationAuthored: string;
  overviewBriefRelationNeedsReview: string;
  overviewBriefRelationQuality: string;
  overviewBriefRelationQualityStrong: string;
  overviewBriefRelationQualitySupported: string;
  overviewBriefRelationQualityWeak: string;
  overviewBriefRelationQualityReview: string;
  overviewAgentReadiness: string;
  overviewAgentReadinessReady: string;
  overviewAgentReadinessPreflight: string;
  overviewAgentReadinessReview: string;
  overviewBriefHealthSignals: string;
  overviewBriefHealthUrl: string;
  overviewBriefInsightsUrl: string;
  overviewBriefAgentCheck: string;
  overviewBriefMcpCheck: string;
  overviewBriefMcpQueryPlan: string;
  overviewBriefWorkspaceCheck: string;
  overviewBriefMcpWorkspaceCheck: string;
  overviewRelationVisibleCountSuffix: string;
  overviewSkeletonCardCountSuffix: string;
  overviewRelationLodNotice: string;
  overviewRelationPreparingNotice: string;
  overviewSkeletonNotice: string;
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
  pathCandidateVisibility: string;
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
    mode?: "relations" | "skeleton";
  } | null;
  pathCandidateVisibility?: {
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
  pathCandidateVisibility = null,
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
    overviewRelationVisibility.mode !== "skeleton" &&
    overviewRelationVisibility.total >= 240 &&
    overviewRelationVisibility.visible === 0;
  const relationVisibilitySkeleton =
    mode === "overview" && overviewRelationVisibility?.mode === "skeleton";
  const overviewRelationNotice = relationVisibilitySkeleton
    ? labels.overviewSkeletonNotice
    : relationVisibilityPreparing
      ? labels.overviewRelationPreparingNotice
      : labels.overviewRelationLodNotice;
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
  const pathCandidateVisibilityText =
    mode === "path" && pathCandidateVisibility && pathCandidateVisibility.total > 0
      ? labels.pathCandidateVisibility
          .replace("{visible}", String(pathCandidateVisibility.visible))
          .replace("{total}", String(pathCandidateVisibility.total))
      : null;

  const primaryLabel =
    mode === "health" ? labels.metricIssues : labels.metricNodes;
  const overviewRelationProvenanceSummary =
    mode === "overview"
      ? formatTopologyRelationProvenanceSummary(summary.relationProvenance, {
          relationSourceBacked: labels.overviewBriefRelationSourceBacked,
          relationAuthored: labels.overviewBriefRelationAuthored,
          relationNeedsReview: labels.overviewBriefRelationNeedsReview,
        })
      : null;
  const overviewRelationQualitySummary =
    mode === "overview"
      ? formatTopologyRelationQualitySummary(summary.relationQuality, {
          relationQualityStrong: labels.overviewBriefRelationQualityStrong,
          relationQualitySupported: labels.overviewBriefRelationQualitySupported,
          relationQualityWeak: labels.overviewBriefRelationQualityWeak,
          relationQualityReview: labels.overviewBriefRelationQualityReview,
        })
      : null;
  const overviewAgentReadinessSummary =
    mode === "overview"
      ? formatTopologyAgentReadinessSummary(summary.relationQuality, {
          ready: labels.overviewAgentReadinessReady,
          preflight: labels.overviewAgentReadinessPreflight,
          review: labels.overviewAgentReadinessReview,
        })
      : null;
  const overviewAgentReadinessCounts = (() => {
    const quality = summary.relationQuality ?? {
      strong: 0,
      supported: 0,
      weak: 0,
      review: 0,
    };
    return {
      ready: quality.strong + quality.supported,
      preflight: quality.weak,
      review: quality.review,
    };
  })();
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
          relationReading: labels.overviewBriefRelationReading,
          relationProvenance: labels.overviewBriefRelationProvenance,
          relationSourceBacked: labels.overviewBriefRelationSourceBacked,
          relationAuthored: labels.overviewBriefRelationAuthored,
          relationNeedsReview: labels.overviewBriefRelationNeedsReview,
          relationQuality: labels.overviewBriefRelationQuality,
          relationQualityStrong: labels.overviewBriefRelationQualityStrong,
          relationQualitySupported: labels.overviewBriefRelationQualitySupported,
          relationQualityWeak: labels.overviewBriefRelationQualityWeak,
          relationQualityReview: labels.overviewBriefRelationQualityReview,
          agentReadiness: labels.overviewAgentReadiness,
          agentReadinessReady: labels.overviewAgentReadinessReady,
          agentReadinessPreflight: labels.overviewAgentReadinessPreflight,
          agentReadinessReview: labels.overviewAgentReadinessReview,
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

  const panelStyle: CSSProperties = {
    width:
      mode === "overview"
        ? rightPanelReserved
          ? "min(clamp(480px, calc(44vw - 150px), 660px), calc(100vw - 520px))"
          : "clamp(500px, 34vw, 680px)"
        : rightPanelReserved
          ? "min(clamp(360px, calc(50vw - 290px), 540px), calc(100vw - 520px))"
          : "clamp(380px, calc(50vw - 270px), 560px)",
  };

  return (
    <section
      aria-label={labels.title}
      data-testid="topology-analysis-panel"
      data-analysis-mode={mode}
      data-panel-width-policy={mode === "overview" ? "overview-wide" : "mode-compact"}
      data-right-panel-reserved={rightPanelReserved ? "true" : "false"}
      style={panelStyle}
      className={`topology-ui-scale pointer-events-auto absolute inset-x-3 z-20 rounded-xl border border-[color:rgba(255,255,255,0.07)] bg-[color:rgba(15,16,17,0.96)] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.28)] data-[analysis-mode=overview]:lg:min-h-[455px] md:hidden lg:inset-x-auto lg:block lg:-translate-x-0 ${
        mode === "overview" ? "overflow-hidden" : "overflow-y-auto"
      } ${
        createPanelReserved
          ? "top-[31.5rem] max-h-[calc(100dvh-33.5rem)]"
          : // 헤더 pill 아래 16px — 9.5rem 은 ~90px 공백, 5rem 은 헤더에
            // 밀착이었다 (사용자 보고 2회). 헤더 bottom ≈ 72px 기준.
            "top-[5.5rem] max-h-[calc(100dvh-7rem)]"
      } lg:left-6 xl:left-8 ${leftPanelExpanded && !createPanelReserved ? "lg:top-[24rem]" : ""}`}
    >
      <div className="flex flex-col gap-3">
        <div className="grid w-full grid-cols-4 gap-1 rounded-lg bg-[color:var(--color-overlay-1)] p-1">
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
                  className={`inline-flex h-9 w-full items-center justify-center rounded-md px-2 transition-colors ${
                    active
                      ? "bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]"
                      : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  }`}
                >
                  <Icon size={15} aria-hidden />
                </button>
              </Tooltip>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 break-keep text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
            {prompt}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            <span>
              <span className="text-[color:var(--color-text-secondary)]">
                {summary.primaryMetric}
              </span>{" "}
              {primaryLabel}
            </span>
            <span>
              <span className="text-[color:var(--color-text-secondary)]">
                {summary.secondaryMetric}
              </span>{" "}
              {labels.metricRelations}
            </span>
          </div>
          {pathCandidateVisibilityText ? (
            <p
              data-testid="topology-path-candidate-visibility"
              data-visible={pathCandidateVisibility?.visible}
              data-total={pathCandidateVisibility?.total}
              className="mt-3 rounded-md border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.06)] px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]"
            >
              {pathCandidateVisibilityText}
            </p>
          ) : null}
          {mode === "overview" ? (
            <>
              <div
                className="mt-3 grid min-w-0 gap-2 rounded-lg border border-[color:rgba(255,255,255,0.065)] bg-[color:rgba(255,255,255,0.025)] p-2.5"
                data-testid="topology-overview-signal-grid"
              >
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  {overviewRelationVisibility && overviewRelationVisibility.total > 0 ? (
                    <OverviewSignalCard
                      label={labels.overviewRelationVisibleCountSuffix}
                      value={
                        relationVisibilitySkeleton
                          ? `${overviewRelationVisibility.visible} ${labels.overviewSkeletonCardCountSuffix}`
                          : `${overviewRelationVisibility.visible}/${overviewRelationVisibility.total}`
                      }
                      compact
                      data-testid="topology-overview-relation-progress"
                    />
                  ) : null}
                  {overviewRelationProvenanceSummary ? (
                    <OverviewSignalCard
                      label={labels.overviewBriefRelationProvenance}
                      value={overviewRelationProvenanceSummary}
                      tone="indigo"
                      compact
                      data-testid="topology-overview-relation-provenance"
                    />
                  ) : null}
                </div>
                {overviewRelationQualitySummary ? (
                  <OverviewSignalCard
                    label={labels.overviewBriefRelationQuality}
                    value={overviewRelationQualitySummary}
                    tone="cyan"
                    aria-label={`${labels.overviewBriefRelationQuality}: ${overviewRelationQualitySummary}`}
                    data-relation-quality-summary={overviewRelationQualitySummary}
                    data-testid="topology-overview-relation-quality"
                  />
                ) : null}
                {overviewAgentReadinessSummary ? (
                  <AgentReadinessGate
                    title={labels.overviewAgentReadiness}
                    labels={{
                      ready: labels.overviewAgentReadinessReady,
                      preflight: labels.overviewAgentReadinessPreflight,
                      review: labels.overviewAgentReadinessReview,
                    }}
                    summary={overviewAgentReadinessSummary}
                    counts={overviewAgentReadinessCounts}
                  />
                ) : null}
                <p className="break-keep rounded-md border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {overviewRelationNotice}
                </p>
              </div>
              <div
                className="mt-3 border-t border-[color:rgba(255,255,255,0.07)] pt-3"
                data-testid="topology-overview-handoff-actions"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                    {disclosureSummaryLabel}
                  </span>
                  <span
                    className="h-px min-w-6 flex-1 bg-[color:rgba(255,255,255,0.07)]"
                    aria-hidden
                  />
                </div>
                <div className="grid gap-1.5">
                  <CompactCopyButton
                    copied={overviewBriefCopied}
                    label={labels.overviewBriefCopy}
                    ariaLabel={
                      overviewBriefCopied
                        ? labels.overviewBriefCopiedAriaLabel
                        : labels.overviewBriefCopyAriaLabel
                    }
                    onClick={copyOverviewBrief}
                    className="min-h-9 border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.08)] text-[10.5px] text-[color:var(--color-text-secondary)]"
                  />
                  <details className="group">
                    <summary
                      data-testid="topology-overview-handoff-summary"
                      className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                    >
                      <ChevronDown
                        size={12}
                        aria-hidden
                        className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                        data-testid="topology-overview-handoff-chevron"
                      />
                      <span>{labels.healthCopyTools}</span>
                    </summary>
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      <CompactCopyButton
                        copied={overviewReanalyzeCopied}
                        label={labels.overviewReanalyzeCopy}
                        ariaLabel={
                          overviewReanalyzeCopied
                            ? labels.overviewReanalyzeCopiedAriaLabel
                            : labels.overviewReanalyzeCopyAriaLabel
                        }
                        onClick={copyOverviewReanalysisCommand}
                        className="border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(255,255,255,0.025)] text-[10px] text-[color:var(--color-text-tertiary)]"
                      />
                      <CompactCopyButton
                        copied={overviewSyncCopied}
                        label={labels.overviewSyncCopy}
                        ariaLabel={
                          overviewSyncCopied
                            ? labels.overviewSyncCopiedAriaLabel
                            : labels.overviewSyncCopyAriaLabel
                        }
                        onClick={copyOverviewSyncGate}
                        className="border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(255,255,255,0.025)] text-[10px] text-[color:var(--color-text-tertiary)]"
                      />
                    </div>
                  </details>
                </div>
              </div>
            </>
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
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {labels.pathProofOrderTitle}
              </p>
              <div
                data-testid="topology-path-proof-route"
                className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5"
              >
                <span className="truncate text-[10.5px] text-[color:var(--color-text-secondary)]">
                  {displayPathSourceTitle}
                </span>
                <ArrowRight size={12} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
                <span className="truncate text-right text-[10.5px] text-[color:var(--color-text-secondary)]">
                  {displayPathTargetTitle}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                {labels.pathProofOrderDesc}
              </p>
              <ol
                data-testid="topology-path-proof-checklist"
                className="mt-2 grid gap-1"
              >
                <PathProofStep
                  label={labels.pathProofVisiblePath}
                  status={labels.pathProofStatusReady}
                  tone="ready"
                />
                <PathProofStep
                  label={labels.pathProofRelationPreflight}
                  status={labels.pathProofStatusRequired}
                  tone="required"
                />
                <PathProofStep
                  label={labels.pathProofExplainRelation}
                  status={labels.pathProofStatusRequired}
                  tone="required"
                />
                <PathProofStep
                  label={labels.pathProofBoundedTraversal}
                  status={labels.pathProofStatusRequired}
                  tone="required"
                />
                <PathProofStep
                  label={labels.pathProofPostWriteSync}
                  status={labels.pathProofStatusAfterWrite}
                  tone="after-write"
                />
              </ol>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={copyPathEvidence}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none"
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
                    {labels.pathEvidenceCopy}
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
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none"
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
                        {labels.focusBriefCopy}
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

function OverviewSignalCard({
  label,
  value,
  compact = false,
  tone = "neutral",
  ...attrs
}: {
  label: string;
  value: string;
  compact?: boolean;
  tone?: "neutral" | "indigo" | "cyan";
} & HTMLAttributes<HTMLDivElement>) {
  const toneClass =
    tone === "indigo"
      ? "border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.065)]"
      : tone === "cyan"
        ? "border-[color:rgba(94,234,212,0.22)] bg-[color:rgba(94,234,212,0.045)]"
        : "border-[color:rgba(255,255,255,0.065)] bg-[color:rgba(255,255,255,0.028)]";

  return (
    <div
      {...attrs}
      data-overview-signal-card={tone}
      data-overview-signal-compact={compact ? "true" : "false"}
      className={`grid min-w-0 ${
        compact ? "gap-0.5 rounded-md px-2.5 py-2" : "gap-1 rounded-md px-3 py-2"
      } border ${toneClass} ${
        attrs.className ?? ""
      }`}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
      <span className="break-words font-mono text-[11.5px] uppercase leading-4 tracking-[0.08em] text-[color:var(--color-text-secondary)]">
        {value}
      </span>
    </div>
  );
}

function AgentReadinessGate({
  title,
  labels,
  summary,
  counts,
}: {
  title: string;
  labels: {
    ready: string;
    preflight: string;
    review: string;
  };
  summary: string;
  counts: {
    ready: number;
    preflight: number;
    review: number;
  };
}) {
  return (
    <div
      className="grid gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.065)] px-3 py-1.5"
      aria-label={`${title}: ${summary}`}
      data-agent-readiness-summary={summary}
      data-overview-signal-card="readiness"
      data-testid="topology-overview-agent-readiness"
    >
      <div className="flex min-w-0 items-center">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]"
          aria-hidden
        >
          {title}
        </span>
      </div>
      <div
        className="grid grid-cols-3 gap-1.5"
        aria-label={`${title}: ${summary}`}
      >
        <AgentReadinessChip
          count={counts.ready}
          label={labels.ready}
          tone="ready"
        />
        <AgentReadinessChip
          count={counts.preflight}
          label={labels.preflight}
          tone="preflight"
        />
        <AgentReadinessChip
          count={counts.review}
          label={labels.review}
          tone="review"
        />
      </div>
      <AgentReadinessMeter
        label={`${title}: ${summary}`}
        counts={counts}
      />
    </div>
  );
}

function AgentReadinessChip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "ready" | "preflight" | "review";
}) {
  const toneClass =
    tone === "ready"
      ? "border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.055)]"
      : tone === "preflight"
        ? "border-[color:rgba(217,161,65,0.24)] bg-[color:rgba(217,161,65,0.07)]"
        : "border-[color:rgba(226,105,105,0.24)] bg-[color:rgba(226,105,105,0.07)]";

  return (
    <span
      className={`grid min-w-0 gap-0.5 rounded-md border px-1.5 py-0.5 ${toneClass}`}
      data-agent-readiness-chip={tone}
    >
      <span className="font-mono text-[11px] leading-3 text-[color:var(--color-text-secondary)]">
        {count}
      </span>
      <span className="truncate font-mono text-[7.5px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
    </span>
  );
}

function AgentReadinessMeter({
  label,
  counts,
}: {
  label: string;
  counts: {
    ready: number;
    preflight: number;
    review: number;
  };
}) {
  const total = counts.ready + counts.preflight + counts.review;
  const segments = [
    {
      key: "ready",
      count: counts.ready,
      className:
        "bg-[linear-gradient(90deg,rgba(139,151,255,0.86),rgba(72,184,203,0.78))]",
    },
    {
      key: "preflight",
      count: counts.preflight,
      className: "bg-[color:rgba(217,161,65,0.72)]",
    },
    {
      key: "review",
      count: counts.review,
      className:
        "bg-[repeating-linear-gradient(90deg,rgba(226,105,105,0.78)_0_4px,rgba(226,105,105,0.30)_4px_7px)]",
    },
  ] as const;

  return (
    <div
      aria-label={label}
      data-testid="topology-overview-agent-readiness-meter"
      className="flex h-2 w-full overflow-hidden rounded-full border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.045)]"
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          aria-hidden
          data-agent-readiness-segment={segment.key}
          data-count={segment.count}
          className={segment.className}
          style={{ flexGrow: total > 0 ? segment.count : 1 }}
        />
      ))}
    </div>
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

function PathProofStep({
  label,
  status,
  tone,
}: {
  label: string;
  status: string;
  tone: "ready" | "required" | "after-write";
}) {
  const statusClass =
    tone === "ready"
      ? "border-[color:rgba(92,214,138,0.28)] bg-[color:rgba(92,214,138,0.08)] text-[color:var(--color-text-secondary)]"
      : tone === "after-write"
        ? "border-[color:rgba(212,160,72,0.28)] bg-[color:rgba(212,160,72,0.08)] text-[color:var(--color-text-secondary)]"
        : "border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] text-[color:var(--color-text-tertiary)]";

  return (
    <li
      data-path-proof-step={tone}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.018)] px-2 py-1.5"
    >
      <span className="min-w-0 truncate text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
        {label}
      </span>
      <span
        className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] ${statusClass}`}
      >
        {status}
      </span>
    </li>
  );
}

function CompactCopyButton({
  copied,
  label,
  ariaLabel,
  onClick,
  className = "",
}: {
  copied: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[color:var(--color-text-quaternary)] transition-[background-color,color,transform] duration-180 ease-out hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none ${className}`}
      aria-label={ariaLabel}
      title={label}
    >
      {copied ? <Check size={13} aria-hidden /> : <Clipboard size={13} aria-hidden />}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

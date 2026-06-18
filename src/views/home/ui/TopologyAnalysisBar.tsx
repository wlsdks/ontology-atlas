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
import {
  ONTOLOGY_KIND_TONE,
  type OntologyVisualKind,
} from "@/entities/ontology-class";
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
  overviewCopyTools: string;
  overviewWorkOrderTitle: string;
  overviewWorkOrderRead: string;
  overviewWorkOrderFocus: string;
  overviewWorkOrderPath: string;
  overviewWorkOrderHealth: string;
  overviewReaderLensTitle: string;
  overviewReaderLensDomains: string;
  overviewReaderLensCapabilities: string;
  overviewReaderLensChangePaths: string;
  overviewTierLegendTitle: string;
  overviewTierLegendProject: string;
  overviewTierLegendDomain: string;
  overviewTierLegendCapability: string;
  overviewTierLegendElement: string;
  overviewRelationLegendTitle: string;
  overviewRelationLegendSpine: string;
  overviewRelationLegendQuality: string;
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
  pathHandoffLabel: string;
  pathHandoffMcpAction: string;
  pathHandoffCliFallback: string;
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
  onClearSelection?: () => void;
  onHealthAction: (slug: string) => void;
}

const MODES = [
  { value: "overview", icon: Network, labelKey: "overview" },
  { value: "focus", icon: Activity, labelKey: "focus" },
  { value: "path", icon: GitBranch, labelKey: "path" },
  { value: "health", icon: HeartPulse, labelKey: "health" },
] as const;

const OVERVIEW_TIER_LEGEND_KINDS = [
  "project",
  "domain",
  "capability",
  "element",
] as const satisfies readonly OntologyVisualKind[];

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
  onClearSelection,
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
  const selectedContextActive =
    mode === "overview" && Boolean(selectedSlug && displaySelectedTitle);
  const panelMode = selectedContextActive ? "focus" : mode;
  const selectedFocusRailActive =
    panelMode === "focus" && Boolean(selectedSlug && displaySelectedTitle);
  const handleModeRailChange = useCallback(
    (nextMode: TopologyAnalysisMode) => {
      if (selectedContextActive && nextMode === "overview") {
        onClearSelection?.();
      }
      onModeChange(nextMode);
    },
    [onClearSelection, onModeChange, selectedContextActive],
  );
  const headerAlignedPanel = panelMode === "overview" || panelMode === "path";
  const postChangeSyncPacket = formatAgentPostChangeSyncPacket();
  const disclosureSummaryLabel =
    panelMode === "overview" ? labels.overviewHandoffSummary : labels.actions;
  const relationVisibilityPreparing =
    panelMode === "overview" &&
    overviewRelationVisibility &&
    overviewRelationVisibility.mode !== "skeleton" &&
    overviewRelationVisibility.total >= 240 &&
    overviewRelationVisibility.visible === 0;
  const relationVisibilitySkeleton =
    panelMode === "overview" && overviewRelationVisibility?.mode === "skeleton";
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
    panelMode === "focus"
      ? displaySelectedTitle
        ? labels.focusSelected.replace("{title}", displaySelectedTitle)
        : labels.focusPrompt
      : panelMode === "path"
        ? resolvedPathTitle
          ? resolvedPathTitle
          : displayPathSourceTitle || displaySelectedTitle
          ? labels.pathSelected.replace(
              "{title}",
              displayPathSourceTitle ?? displaySelectedTitle ?? "",
            )
          : labels.pathPrompt
        : panelMode === "health"
          ? labels.healthPrompt
          : labels.overviewPrompt;
  const pathCandidateVisibilityText =
    panelMode === "path" && pathCandidateVisibility && pathCandidateVisibility.total > 0
      ? labels.pathCandidateVisibility
          .replace("{visible}", String(pathCandidateVisibility.visible))
          .replace("{total}", String(pathCandidateVisibility.total))
      : null;

  const primaryLabel =
    panelMode === "health" ? labels.metricIssues : labels.metricNodes;
  const overviewRelationProvenanceSummary =
    panelMode === "overview"
      ? formatTopologyRelationProvenanceSummary(summary.relationProvenance, {
          relationSourceBacked: labels.overviewBriefRelationSourceBacked,
          relationAuthored: labels.overviewBriefRelationAuthored,
          relationNeedsReview: labels.overviewBriefRelationNeedsReview,
        })
      : null;
  const overviewRelationQualitySummary =
    panelMode === "overview"
      ? formatTopologyRelationQualitySummary(summary.relationQuality, {
          relationQualityStrong: labels.overviewBriefRelationQualityStrong,
          relationQualitySupported: labels.overviewBriefRelationQualitySupported,
          relationQualityWeak: labels.overviewBriefRelationQualityWeak,
          relationQualityReview: labels.overviewBriefRelationQualityReview,
        })
      : null;
  const overviewAgentReadinessSummary =
    panelMode === "overview"
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

  const attentionRole =
    selectedFocusRailActive || panelMode === "overview" || panelMode === "path"
      ? "support"
      : "primary";
  const panelSurfaceToken =
    attentionRole === "support"
      ? "--topology-panel-support-surface"
      : "--topology-panel-primary-surface";
  const panelShadowToken =
    attentionRole === "support"
      ? "--topology-panel-support-shadow"
      : "--topology-panel-primary-shadow";
  const panelStyle: CSSProperties = {
    width:
      selectedFocusRailActive
        ? "var(--topology-panel-selected-rail-width)"
        : panelMode === "health"
          ? "var(--topology-panel-overview-responsive-width)"
        : panelMode === "path"
          ? "var(--topology-panel-path-responsive-width)"
        : headerAlignedPanel
        ? panelMode === "overview"
          ? rightPanelReserved
            ? "var(--topology-panel-overview-reserved-width)"
            : "var(--topology-panel-overview-responsive-width)"
          : rightPanelReserved
            ? "var(--topology-panel-standard-reserved-width)"
            : "var(--topology-panel-standard-width)"
        : rightPanelReserved
          ? "var(--topology-panel-compact-reserved-width)"
          : "var(--topology-panel-compact-width)",
    borderRadius: "var(--topology-panel-radius)",
    padding: "var(--topology-panel-padding)",
    borderColor: "var(--topology-panel-border)",
    background: `var(${panelSurfaceToken})`,
    boxShadow: `var(${panelShadowToken})`,
    zIndex: "var(--topology-panel-read-layer-z-index)",
    transition:
      "background var(--topology-motion-panel-duration) var(--topology-motion-ease-standard), box-shadow var(--topology-motion-panel-duration) var(--topology-motion-ease-standard)",
  };
  const panelWidthTarget =
    selectedFocusRailActive
      ? "selected-focus-rail"
      : panelMode === "overview"
      ? "overview-14-inch-compact"
      : panelMode === "health"
        ? "health-phone-primary-rail"
      : panelMode === "path" && headerAlignedPanel
        ? "path-14-inch-rail"
        : headerAlignedPanel
          ? "header-aligned"
          : "mode-compact";
  const panelBodyScrollEndReserveToken =
    panelMode === "path"
      ? "--topology-analysis-panel-path-collapsed-scroll-end-reserve"
      : panelMode === "health"
        ? "--topology-health-panel-scroll-end-reserve"
      : "--topology-analysis-panel-compact-scroll-end-reserve";

  return (
    <section
      aria-label={labels.title}
      data-testid="topology-analysis-panel"
      data-requested-analysis-mode={mode}
      data-analysis-mode={panelMode}
      data-selected-context={selectedContextActive ? "true" : "false"}
      data-selected-focus-rail={selectedFocusRailActive ? "true" : "false"}
      data-attention-role={attentionRole}
      data-panel-width-policy={
        headerAlignedPanel
          ? panelMode === "overview"
            ? "overview-support"
            : "header-aligned"
          : "mode-compact"
      }
      data-panel-width-band={headerAlignedPanel ? "header-aligned" : "mode-compact"}
      data-panel-width-target={panelWidthTarget}
      data-panel-width-css={String(panelStyle.width)}
      data-panel-width-token={String(panelStyle.width).replace(/^var\((.*)\)$/, "$1")}
      data-panel-surface-token={panelSurfaceToken}
      data-panel-shadow-token={panelShadowToken}
      data-panel-layer-contract="read-surface-above-map-cards"
      data-panel-z-index-token="--topology-panel-read-layer-z-index"
      data-panel-radius-token="--topology-panel-radius"
      data-panel-padding-token="--topology-panel-padding"
      data-panel-motion-token="--topology-motion-panel-duration"
      data-command-spine-padding-token={
        panelMode === "focus" ? "--topology-command-spine-padding" : undefined
      }
      data-command-spine-gap-token={
        panelMode === "focus" ? "--topology-command-spine-gap" : undefined
      }
      data-command-primary-height-token={
        panelMode === "focus" ? "--topology-command-primary-min-height" : undefined
      }
      data-command-spine-surface-token={
        panelMode === "focus" ? "--topology-command-spine-surface" : undefined
      }
      data-command-spine-border-token={
        panelMode === "focus" ? "--topology-command-spine-border" : undefined
      }
      data-panel-width-contract={
        selectedFocusRailActive
          ? "selected-focus-rail-max-320"
          : panelMode === "overview"
            ? "overview-support-max-360-phone-utility-reserve"
            : panelMode === "health"
              ? "health-primary-max-360-phone-full-width"
            : panelMode === "path" && headerAlignedPanel
              ? "path-support-rail-max-360-phone-utility-reserve"
            : "standard"
      }
      data-panel-phone-utility-reserve-token={
        panelMode === "overview" || panelMode === "path" || panelMode === "health"
          ? "--topology-panel-phone-utility-rail-reserve"
          : undefined
      }
      data-panel-compact-scroll-end-reserve-token={panelBodyScrollEndReserveToken}
      data-path-panel-compact-gap-token={
        panelMode === "path" ? "--topology-path-panel-compact-gap" : undefined
      }
      data-overview-panel-compact-gap-token={
        panelMode === "overview" ? "--topology-overview-panel-compact-gap" : undefined
      }
      data-overview-panel-phone-max-height-token={
        panelMode === "overview" ? "--topology-overview-panel-phone-max-height" : undefined
      }
      data-health-panel-phone-max-height-token={
        panelMode === "health" ? "--topology-health-panel-phone-max-height" : undefined
      }
      data-health-repair-lane-contract={
        panelMode === "health" && healthAction
          ? "target-to-builder-to-sync"
          : undefined
      }
      data-health-repair-target-slug={
        panelMode === "health" ? healthAction?.slug : undefined
      }
      data-health-repair-target-kind={
        panelMode === "health" ? healthAction?.kind : undefined
      }
      data-health-repair-order-contract={
        panelMode === "health" && healthAction
          ? "inspect-repair-sync"
          : undefined
      }
      data-compact-focus-collapse-contract={
        selectedFocusRailActive ? "selected-focus-support-hidden-under-md" : undefined
      }
      data-path-guidance-owner={panelMode === "path" ? "analysis-rail" : undefined}
      data-path-prompt-policy={
        panelMode === "path" ? "panel-owned-when-card-mode" : undefined
      }
      data-right-panel-reserved={rightPanelReserved ? "true" : "false"}
      style={panelStyle}
      className={`topology-ui-scale pointer-events-auto absolute inset-x-3 border data-[analysis-mode=overview]:max-md:max-h-[var(--topology-overview-panel-phone-max-height)] data-[analysis-mode=overview]:max-md:overflow-y-auto data-[analysis-mode=overview]:lg:min-h-[455px] data-[analysis-mode=health]:max-md:max-h-[var(--topology-health-panel-phone-max-height)] data-[analysis-mode=health]:max-md:overflow-y-auto md:hidden lg:inset-x-auto lg:block lg:-translate-x-0 ${
        panelMode === "overview" ? "overflow-hidden" : "overflow-y-auto"
      } ${
        createPanelReserved
          ? "top-[31.5rem] max-h-[calc(100dvh-33.5rem)]"
          : // 헤더 pill 아래 16px — 9.5rem 은 ~90px 공백, 5rem 은 헤더에
            // 밀착이었다 (사용자 보고 2회). 헤더 bottom ≈ 72px 기준.
            "top-[5.5rem] max-h-[calc(100dvh-7rem)]"
      } lg:left-6 xl:left-8 ${selectedFocusRailActive ? "max-md:hidden" : ""} ${leftPanelExpanded && !createPanelReserved ? "lg:top-[24rem]" : ""}`}
    >
      <div
        data-testid="topology-analysis-panel-body"
        data-panel-body-scroll-contract="compact-scrolls-above-bottom-tab"
        data-panel-body-scroll-end-reserve-token={panelBodyScrollEndReserveToken}
        className="flex flex-col gap-3 data-[analysis-body-mode=overview]:gap-[var(--topology-overview-panel-compact-gap)] data-[analysis-body-mode=path]:gap-[var(--topology-path-panel-compact-gap)] max-md:max-h-[calc(100dvh-7rem-var(--topology-analysis-panel-compact-scroll-end-reserve))] max-md:overflow-y-auto max-md:overscroll-contain max-md:pb-[var(--topology-analysis-panel-path-collapsed-scroll-end-reserve)] data-[analysis-body-mode=overview]:max-md:pb-[var(--topology-analysis-panel-compact-scroll-end-reserve)] data-[analysis-body-mode=focus]:max-md:pb-[var(--topology-analysis-panel-compact-scroll-end-reserve)] data-[analysis-body-mode=health]:max-md:pb-[var(--topology-health-panel-scroll-end-reserve)] max-md:pr-1"
        data-analysis-body-mode={panelMode}
      >
        <div
          className="grid w-full grid-cols-4 gap-1 rounded-lg bg-[color:var(--topology-analysis-mode-rail-surface)] p-1"
          data-testid="topology-analysis-mode-rail"
          data-mode-rail-contract="four-icon-tabs-tooltip-labels"
          data-surface-token="--topology-analysis-mode-rail-surface"
          data-active-surface-token="--topology-analysis-mode-active-surface"
          data-active-border-token="--topology-analysis-mode-active-border"
          data-active-text-token="--topology-analysis-mode-active-text"
          data-idle-text-token="--topology-analysis-mode-idle-text"
          data-hover-surface-token="--topology-analysis-mode-hover-surface"
          data-focus-ring-token="--topology-analysis-mode-focus-ring"
        >
          {MODES.map(({ value, icon: Icon, labelKey }) => {
            const active = value === panelMode;
            return (
              // 아이콘-전용 탭 — hover 즉시 라벨 tooltip (사용자: "마우스
              // 올리면 뭔지 나와야 선택을 하지").
              <Tooltip key={value} content={labels[labelKey]} side="bottom">
                <button
                  type="button"
                  onClick={() => handleModeRailChange(value)}
                  aria-pressed={active}
                  aria-label={labels[labelKey]}
                  data-analysis-mode-tab={value}
                  data-mode-tab-state={active ? "active" : "idle"}
                  data-active-surface-token={
                    active ? "--topology-analysis-mode-active-surface" : undefined
                  }
                  data-active-border-token={
                    active ? "--topology-analysis-mode-active-border" : undefined
                  }
                  data-text-token={
                    active
                      ? "--topology-analysis-mode-active-text"
                      : "--topology-analysis-mode-idle-text"
                  }
                  data-hover-surface-token="--topology-analysis-mode-hover-surface"
                  data-focus-ring-token="--topology-analysis-mode-focus-ring"
                  className={`inline-flex h-9 w-full items-center justify-center rounded-md border px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-analysis-mode-focus-ring)] ${
                    active
                      ? "border-[color:var(--topology-analysis-mode-active-border)] bg-[color:var(--topology-analysis-mode-active-surface)] text-[color:var(--topology-analysis-mode-active-text)]"
                      : "border-transparent text-[color:var(--topology-analysis-mode-idle-text)] hover:bg-[color:var(--topology-analysis-mode-hover-surface)] hover:text-[color:var(--topology-analysis-mode-active-text)]"
                  }`}
                >
                  <Icon size={15} aria-hidden />
                </button>
              </Tooltip>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <p
            data-testid="topology-analysis-panel-prompt"
            data-prompt-text-token="--topology-analysis-panel-prompt-text"
            className={`line-clamp-3 break-keep text-[13.5px] text-[color:var(--topology-analysis-panel-prompt-text)] ${
              panelMode === "overview" ? "leading-5 max-md:line-clamp-2" : "leading-6"
            }`}
          >
            {prompt}
          </p>
          <div
            data-testid="topology-analysis-panel-metrics"
            data-metric-label-text-token="--topology-analysis-panel-metric-label-text"
            data-metric-value-text-token="--topology-analysis-panel-metric-value-text"
            className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--topology-analysis-panel-metric-label-text)]"
          >
            <span>
              <span className="text-[color:var(--topology-analysis-panel-metric-value-text)]">
                {summary.primaryMetric}
              </span>{" "}
              {primaryLabel}
            </span>
            <span>
              <span className="text-[color:var(--topology-analysis-panel-metric-value-text)]">
                {summary.secondaryMetric}
              </span>{" "}
              {labels.metricRelations}
            </span>
          </div>
          {panelMode === "overview" ? (
            <div
              data-testid="topology-overview-reader-lens"
              data-reader-lens-contract="non-developer-first-map-read"
              data-surface-token="--topology-overview-reader-lens-surface"
              data-border-token="--topology-overview-reader-lens-border"
              data-title-text-token="--topology-overview-reader-lens-title-text"
              data-item-text-token="--topology-overview-reader-lens-item-text"
              data-marker-surface-token="--topology-overview-reader-lens-marker-surface"
              data-marker-border-token="--topology-overview-reader-lens-marker-border"
              className="mt-2 rounded-lg border border-[color:var(--topology-overview-reader-lens-border)] bg-[color:var(--topology-overview-reader-lens-surface)] px-3 py-2"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--topology-overview-reader-lens-title-text)]">
                {labels.overviewReaderLensTitle}
              </p>
              <ol className="mt-1.5 grid gap-1 text-[11.5px] leading-4 text-[color:var(--topology-overview-reader-lens-item-text)]">
                {[
                  labels.overviewReaderLensDomains,
                  labels.overviewReaderLensCapabilities,
                  labels.overviewReaderLensChangePaths,
                ].map((item, index) => (
                  <li key={item} className="flex min-w-0 items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-[color:var(--topology-overview-reader-lens-marker-border)] bg-[color:var(--topology-overview-reader-lens-marker-surface)] font-mono text-[8px] leading-none text-[color:var(--topology-overview-reader-lens-title-text)]"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 break-keep">{item}</span>
                  </li>
                ))}
              </ol>
              <div
                data-testid="topology-overview-map-key"
                data-map-key-contract="compact-node-and-relation-reading"
                className="mt-2 grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-3 border-t border-[color:var(--topology-overview-reader-lens-border)] pt-2"
              >
                <div
                  data-testid="topology-overview-tier-legend"
                  data-tier-legend-contract="map-color-to-ontology-layer"
                  data-tier-legend-token-source="ONTOLOGY_KIND_TONE"
                  className="min-w-0"
                >
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[color:var(--topology-overview-reader-lens-title-text)]">
                    {labels.overviewTierLegendTitle}
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px] leading-4 text-[color:var(--topology-overview-reader-lens-item-text)]">
                    {OVERVIEW_TIER_LEGEND_KINDS.map((kind) => {
                      const tone = ONTOLOGY_KIND_TONE[kind];
                      const labelByKind = {
                        project: labels.overviewTierLegendProject,
                        domain: labels.overviewTierLegendDomain,
                        capability: labels.overviewTierLegendCapability,
                        element: labels.overviewTierLegendElement,
                      } satisfies Record<(typeof kind), string>;

                      return (
                        <span
                          key={kind}
                          data-tier-legend-kind={kind}
                          data-kind-tone-fill={tone.fill}
                          data-kind-tone-border={tone.border}
                          className="flex min-w-0 items-center gap-1.5"
                        >
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full ring-1"
                            style={
                              {
                                backgroundColor: tone.fill,
                                "--tw-ring-color": tone.border,
                              } as CSSProperties
                            }
                          />
                          <span className="min-w-0 truncate">{labelByKind[kind]}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div
                  data-testid="topology-overview-relation-line-legend"
                  data-relation-line-legend-contract="map-line-to-ontology-relation"
                  data-spine-token="--topology-relation-spine-halo"
                  data-spine-terminal-token="--topology-relation-spine-terminal"
                  data-quality-strong-token="--topology-relation-stroke-strong"
                  data-quality-weak-token="--topology-relation-stroke-weak"
                  className="min-w-0"
                >
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[color:var(--topology-overview-reader-lens-title-text)]">
                    {labels.overviewRelationLegendTitle}
                  </p>
                  <div className="mt-1.5 grid gap-1 text-[10.5px] leading-4 text-[color:var(--topology-overview-reader-lens-item-text)]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="relative h-2.5 w-8 shrink-0">
                        <span className="absolute left-0 right-1 top-1/2 h-px -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-halo)]" />
                        <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-terminal)]" />
                      </span>
                      <span className="min-w-0 truncate">
                        {labels.overviewRelationLegendSpine}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-[2px] w-8 shrink-0 rounded-full"
                        style={
                          {
                            backgroundImage:
                              "linear-gradient(90deg, var(--topology-relation-stroke-strong), var(--topology-relation-stroke-weak))",
                          } as CSSProperties
                        }
                      />
                      <span className="min-w-0 truncate">
                        {labels.overviewRelationLegendQuality}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {pathCandidateVisibilityText ? (
            <p
              data-testid="topology-path-candidate-visibility"
              data-visible={pathCandidateVisibility?.visible}
              data-total={pathCandidateVisibility?.total}
              data-copy-contract="reader-facing-map-readability"
              data-surface-token="--topology-path-candidate-visibility-surface"
              data-border-token="--topology-path-candidate-visibility-border"
              data-notice-text-token="--topology-analysis-panel-notice-text"
              className="mt-3 rounded-md border border-[color:var(--topology-path-candidate-visibility-border)] bg-[color:var(--topology-path-candidate-visibility-surface)] px-2.5 py-2 text-[11px] leading-4 tracking-normal text-[color:var(--topology-analysis-panel-notice-text)]"
            >
              {pathCandidateVisibilityText}
            </p>
          ) : null}
          {panelMode === "path" && pathSourceSlug && pathTargetSlug ? (
            <div
              data-testid="topology-path-visible-route"
              data-route-contract="source-target-visible-before-proof-disclosure"
              data-attention-layer="focus-path-state"
              data-guidance-owner="analysis-rail"
              data-overflow-contract="no-horizontal-scroll"
              data-source-slug={pathSourceSlug}
              data-target-slug={pathTargetSlug}
              data-source-title={displayPathSourceTitle}
              data-target-title={displayPathTargetTitle}
              data-surface-token="--topology-path-route-surface"
              data-border-token="--topology-path-route-border"
              data-chip-surface-token="--topology-path-route-chip-surface"
              data-chip-border-token="--topology-path-route-chip-border"
              data-source-surface-token="--topology-path-route-source-surface"
              data-source-border-token="--topology-path-route-source-border"
              data-source-text-token="--topology-path-route-source-text"
              data-target-surface-token="--topology-path-route-target-surface"
              data-target-border-token="--topology-path-route-target-border"
              data-target-text-token="--topology-path-route-target-text"
              data-endpoint-marker-surface-token="--topology-path-route-endpoint-marker-surface"
              data-endpoint-marker-border-token="--topology-path-route-endpoint-marker-border"
              data-endpoint-marker-text-token="--topology-path-route-endpoint-marker-text"
              data-route-compact-min-height-token="--topology-path-route-compact-min-height"
              data-route-source-min-width-token="--topology-path-route-source-min-width"
              data-route-target-min-width-token="--topology-path-route-target-min-width"
              data-route-responsive-contract="target-weighted-endpoints"
              className="mt-3 grid min-w-0 grid-cols-[minmax(var(--topology-path-route-source-min-width),0.62fr)_auto_minmax(var(--topology-path-route-target-min-width),1.9fr)] items-center gap-1.5 overflow-hidden rounded-md border border-[color:var(--topology-path-route-border)] bg-[color:var(--topology-path-route-surface)] px-2 py-1.5"
            >
              <span
                className="min-h-[var(--topology-path-route-compact-min-height)] min-w-0 rounded border border-[color:var(--topology-path-route-source-border)] bg-[color:var(--topology-path-route-source-surface)] px-1.5 py-1"
                data-route-endpoint="source"
                data-route-endpoint-marker-contract="source-a-marker"
              >
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    aria-hidden
                    data-route-endpoint-marker="source"
                    className="grid size-3.5 shrink-0 place-items-center rounded-full border border-[color:var(--topology-path-route-endpoint-marker-border)] bg-[color:var(--topology-path-route-endpoint-marker-surface)] font-mono text-[7px] font-semibold leading-none text-[color:var(--topology-path-route-endpoint-marker-text)]"
                  >
                    A
                  </span>
                  <span className="block truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--topology-path-route-chip-text)]">
                    {labels.pathEvidenceSource}
                  </span>
                </span>
                <span
                  className="block truncate text-[10.5px] text-[color:var(--topology-path-route-source-text)]"
                  data-route-endpoint-title="source"
                  data-route-endpoint-title-contract="weighted-route-title"
                >
                  {displayPathSourceTitle}
                </span>
              </span>
              <ArrowRight
                size={12}
                aria-hidden
                className="text-[color:var(--topology-path-route-arrow-text)]"
              />
              <span
                className="min-h-[var(--topology-path-route-compact-min-height)] min-w-0 rounded border border-[color:var(--topology-path-route-target-border)] bg-[color:var(--topology-path-route-target-surface)] px-1.5 py-1 text-right"
                data-route-endpoint="target"
                data-route-endpoint-marker-contract="target-b-marker"
              >
                <span className="flex min-w-0 items-center justify-end gap-1">
                  <span className="block truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--topology-path-route-chip-text)]">
                    {labels.pathEvidenceTarget}
                  </span>
                  <span
                    aria-hidden
                    data-route-endpoint-marker="target"
                    className="grid size-3.5 shrink-0 place-items-center rounded-full border border-[color:var(--topology-path-route-endpoint-marker-border)] bg-[color:var(--topology-path-route-endpoint-marker-surface)] font-mono text-[7px] font-semibold leading-none text-[color:var(--topology-path-route-endpoint-marker-text)]"
                  >
                    B
                  </span>
                </span>
                <span
                  className="block truncate text-[10.5px] text-[color:var(--topology-path-route-target-text)]"
                  data-route-endpoint-title="target"
                  data-route-endpoint-title-contract="weighted-route-title"
                >
                  {displayPathTargetTitle}
                </span>
              </span>
            </div>
          ) : null}
          {panelMode === "path" ? (
            <div
              data-testid="topology-path-agent-handoff"
              data-attention-layer="focus-path-state"
              data-guidance-owner="analysis-rail"
              data-path-prompt-policy="panel-owned-when-card-mode"
              data-handoff-contract="route-proof-action-visible"
              data-handoff-layout-contract="compact-proof-strip"
              data-overflow-contract="no-horizontal-scroll"
              data-surface-token="--topology-path-handoff-surface"
              data-border-token="--topology-path-handoff-border"
              data-text-token="--topology-path-handoff-text"
              data-label-text-token="--topology-path-handoff-label-text"
              data-action-min-height-token="--topology-path-handoff-action-min-height"
              data-action-radius-token="--topology-path-handoff-action-radius"
              data-compact-padding-y-token="--topology-path-handoff-compact-padding-y"
              data-primary-evidence-min-height-token="--topology-path-primary-evidence-min-height"
              data-primary-evidence-visible={
                pathSourceSlug && pathTargetSlug ? "true" : "false"
              }
              data-path-primary-evidence-contract={
                pathSourceSlug && pathTargetSlug
                  ? "visible-before-proof-disclosure"
                  : undefined
              }
              data-mcp-action="find_path"
              data-cli-fallback="ontology-atlas path"
              className="mt-2 grid min-w-0 grid-cols-2 items-center gap-1 overflow-hidden rounded-md border border-[color:var(--topology-path-handoff-border)] bg-[color:var(--topology-path-handoff-surface)] px-2.5 py-[var(--topology-path-handoff-compact-padding-y)] font-mono text-[10px] text-[color:var(--topology-path-handoff-text)]"
            >
              <span className="col-span-2 min-w-0 uppercase tracking-[0.12em] text-[color:var(--topology-path-handoff-label-text)]">
                {labels.pathHandoffLabel}
              </span>
              {pathSourceSlug && pathTargetSlug ? (
                <button
                  type="button"
                  onClick={copyPathEvidence}
                  data-testid="topology-path-primary-evidence-action"
                  data-path-primary-evidence-contract="visible-before-proof-disclosure"
                  data-surface-token="--topology-path-primary-evidence-surface"
                  data-border-token="--topology-path-primary-evidence-border"
                  data-text-token="--topology-path-primary-evidence-text"
                  data-hover-surface-token="--topology-path-primary-evidence-hover-surface"
                  data-hover-border-token="--topology-path-primary-evidence-hover-border"
                  data-hover-text-token="--topology-path-primary-evidence-hover-text"
                  className="col-span-2 inline-flex min-h-[var(--topology-path-primary-evidence-min-height)] min-w-0 items-center justify-between gap-2 rounded-md border border-[color:var(--topology-path-primary-evidence-border)] bg-[color:var(--topology-path-primary-evidence-surface)] px-2.5 py-1 text-left text-[10.5px] text-[color:var(--topology-path-primary-evidence-text)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:var(--topology-path-primary-evidence-hover-border)] hover:bg-[color:var(--topology-path-primary-evidence-hover-surface)] hover:text-[color:var(--topology-path-primary-evidence-hover-text)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none"
                  aria-label={
                    pathEvidenceCopied
                      ? labels.pathEvidenceCopiedAriaLabel
                      : labels.pathEvidenceCopyAriaLabel
                  }
                >
                  <span className="min-w-0 truncate">{labels.pathEvidenceCopy}</span>
                  {pathEvidenceCopied ? (
                    <Check size={12} aria-hidden className="shrink-0" />
                  ) : (
                    <Clipboard size={12} aria-hidden className="shrink-0" />
                  )}
                </button>
              ) : null}
              <span
                data-testid="topology-path-handoff-mcp-chip"
                data-surface-token="--topology-path-handoff-mcp-surface"
                data-border-token="--topology-path-handoff-mcp-border"
                data-text-token="--topology-path-handoff-mcp-text"
                className="inline-flex min-h-[var(--topology-path-handoff-action-min-height)] min-w-0 items-center justify-center rounded-[var(--topology-path-handoff-action-radius)] border border-[color:var(--topology-path-handoff-mcp-border)] bg-[color:var(--topology-path-handoff-mcp-surface)] px-1.5 py-0.5 text-center uppercase tracking-[0.10em] text-[color:var(--topology-path-handoff-mcp-text)]"
              >
                {labels.pathHandoffMcpAction}
              </span>
              <span
                data-testid="topology-path-handoff-cli-chip"
                data-surface-token="--topology-path-handoff-cli-surface"
                data-border-token="--topology-path-handoff-cli-border"
                data-text-token="--topology-path-handoff-cli-text"
                className="inline-flex min-h-[var(--topology-path-handoff-action-min-height)] min-w-0 items-center justify-center rounded-[var(--topology-path-handoff-action-radius)] border border-[color:var(--topology-path-handoff-cli-border)] bg-[color:var(--topology-path-handoff-cli-surface)] px-1.5 py-0.5 text-center uppercase tracking-[0.10em] text-[color:var(--topology-path-handoff-cli-text)]"
              >
                {labels.pathHandoffCliFallback}
              </span>
            </div>
          ) : null}
          {panelMode === "overview" ? (
            <>
              <div
                className="mt-2 grid min-w-0 gap-[var(--topology-overview-signal-grid-compact-gap)] rounded-lg border border-[color:var(--topology-overview-signal-grid-border)] bg-[color:var(--topology-overview-signal-grid-surface)] p-[var(--topology-overview-signal-grid-compact-padding)]"
                data-surface-token="--topology-overview-signal-grid-surface"
                data-border-token="--topology-overview-signal-grid-border"
                data-compact-padding-token="--topology-overview-signal-grid-compact-padding"
                data-compact-gap-token="--topology-overview-signal-grid-compact-gap"
                data-testid="topology-overview-signal-grid"
              >
                <div
                  className="grid min-w-0 grid-cols-2 gap-[var(--topology-overview-signal-grid-compact-gap)]"
                  data-overview-signal-layout="compact-two-column"
                  data-testid="topology-overview-signal-metric-row"
                >
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
                    <RelationProvenanceGate
                      title={labels.overviewBriefRelationProvenance}
                      labels={{
                        sourceBacked: labels.overviewBriefRelationSourceBacked,
                        authored: labels.overviewBriefRelationAuthored,
                        needsReview: labels.overviewBriefRelationNeedsReview,
                      }}
                      summary={overviewRelationProvenanceSummary}
                      counts={
                        summary.relationProvenance ?? {
                          sourceBacked: 0,
                          authored: 0,
                          needsReview: 0,
                        }
                      }
                    />
                  ) : null}
                </div>
                {overviewRelationQualitySummary ? (
                  <RelationQualityGate
                    title={labels.overviewBriefRelationQuality}
                    labels={{
                      strong: labels.overviewBriefRelationQualityStrong,
                      supported: labels.overviewBriefRelationQualitySupported,
                      weak: labels.overviewBriefRelationQualityWeak,
                      review: labels.overviewBriefRelationQualityReview,
                    }}
                    summary={overviewRelationQualitySummary}
                    counts={
                      summary.relationQuality ?? {
                        strong: 0,
                        supported: 0,
                        weak: 0,
                        review: 0,
                      }
                    }
                    data-relation-quality-summary={overviewRelationQualitySummary}
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
                <p
                  className="topology-overview-low-height-sr-only break-keep rounded-md border border-[color:var(--topology-overview-notice-border)] bg-[color:var(--topology-overview-notice-surface)] px-3 py-[var(--topology-overview-notice-compact-padding-y)] text-[12px] leading-5 text-[color:var(--color-text-tertiary)] max-md:sr-only"
                  data-surface-token="--topology-overview-notice-surface"
                  data-border-token="--topology-overview-notice-border"
                  data-compact-padding-y-token="--topology-overview-notice-compact-padding-y"
                  data-phone-overview-notice-contract="sr-only-while-map-evidence-wins"
                  data-low-height-overview-notice-contract="sr-only-while-primary-copy-stays-visible"
                  data-testid="topology-overview-relation-notice"
                >
                  {overviewRelationNotice}
                </p>
              </div>
              <div
                className="mt-2 border-t border-[color:var(--topology-overview-handoff-divider)] pt-[var(--topology-overview-handoff-compact-padding-top)]"
                data-divider-token="--topology-overview-handoff-divider"
                data-compact-padding-top-token="--topology-overview-handoff-compact-padding-top"
                data-low-height-density-contract="primary-copy-visible-secondary-tools-hidden"
                data-testid="topology-overview-handoff-actions"
              >
                <div
                  className="topology-overview-low-height-sr-only mb-1.5 flex items-center justify-between gap-2 max-md:sr-only"
                  data-overview-handoff-label-compact-contract="phone-action-label-hidden"
                  data-overview-handoff-label-low-height-contract="hidden-under-800px"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                    {disclosureSummaryLabel}
                  </span>
                  <span
                    className="h-px min-w-6 flex-1 bg-[color:var(--topology-overview-handoff-divider)]"
                    data-divider-token="--topology-overview-handoff-divider"
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
                    className="min-h-[var(--topology-overview-handoff-primary-min-height)] border border-[color:var(--topology-overview-handoff-primary-border)] bg-[color:var(--topology-overview-handoff-primary-surface)] text-[10.5px] text-[color:var(--color-text-secondary)]"
                    data-testid="topology-overview-brief-copy"
                    data-surface-token="--topology-overview-handoff-primary-surface"
                    data-border-token="--topology-overview-handoff-primary-border"
                    data-min-height-token="--topology-overview-handoff-primary-min-height"
                  />
                  <details className="topology-overview-low-height-sr-only group">
                    <summary
                      data-testid="topology-overview-handoff-summary"
                      className="inline-flex min-h-[var(--topology-overview-handoff-summary-min-height)] cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                      data-min-height-token="--topology-overview-handoff-summary-min-height"
                    >
                      <ChevronDown
                        size={12}
                        aria-hidden
                        className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                        data-testid="topology-overview-handoff-chevron"
                      />
                      <span>{labels.overviewCopyTools}</span>
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
                        className="border border-[color:var(--topology-overview-handoff-secondary-border)] bg-[color:var(--topology-overview-handoff-secondary-surface)] text-[10px] text-[color:var(--color-text-tertiary)]"
                        data-testid="topology-overview-reanalyze-copy"
                        data-surface-token="--topology-overview-handoff-secondary-surface"
                        data-border-token="--topology-overview-handoff-secondary-border"
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
                        className="border border-[color:var(--topology-overview-handoff-secondary-border)] bg-[color:var(--topology-overview-handoff-secondary-surface)] text-[10px] text-[color:var(--color-text-tertiary)]"
                        data-testid="topology-overview-sync-copy"
                        data-surface-token="--topology-overview-handoff-secondary-surface"
                        data-border-token="--topology-overview-handoff-secondary-border"
                      />
                    </div>
                  </details>
                </div>
              </div>
            </>
          ) : null}
          {panelMode === "health" ? (
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
                      className="mt-2 grid grid-cols-2 gap-1.5"
                      data-testid="topology-health-repair-order"
                      data-health-repair-order-contract="inspect-repair-sync"
                      data-health-repair-action-order="builder-mcp-ontology"
                      data-health-repair-visual-contract="builder-primary-full-secondary-row"
                      data-health-repair-target-slug={healthAction.slug}
                      data-health-repair-target-kind={healthAction.kind}
                      data-health-repair-primary-action="builder"
                      data-health-repair-sync-gate="post-change"
                      data-primary-surface-token="--topology-health-repair-primary-surface"
                      data-primary-border-token="--topology-health-repair-primary-border"
                      data-secondary-surface-token="--topology-health-repair-secondary-surface"
                      data-secondary-border-token="--topology-health-repair-secondary-border"
                    >
                      <Link
                        href={buildTopologyHealthRepairHref(healthAction.slug)}
                        data-health-repair-primary-action="builder"
                        data-health-repair-action-tier="primary"
                        data-surface-token="--topology-health-repair-primary-surface"
                        data-border-token="--topology-health-repair-primary-border"
                        data-hover-surface-token="--topology-health-repair-primary-hover-surface"
                        className="col-span-2 inline-flex min-h-9 min-w-0 items-center justify-center rounded-md border border-[color:var(--topology-health-repair-primary-border)] bg-[color:var(--topology-health-repair-primary-surface)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--topology-health-repair-primary-hover-surface)]"
                      >
                        <span className="truncate whitespace-nowrap">{labels.healthRepair}</span>
                      </Link>
                      <CompactCopyButton
                        data-testid="topology-health-repair-mcp-copy"
                        data-health-repair-secondary-action="mcp"
                        data-health-repair-action-tier="secondary"
                        data-surface-token="--topology-health-repair-secondary-surface"
                        data-border-token="--topology-health-repair-secondary-border"
                        data-hover-surface-token="--topology-health-repair-secondary-hover-surface"
                        copied={healthMcpCopied}
                        label={labels.healthMcpCopy}
                        ariaLabel={
                          healthMcpCopied
                            ? labels.healthMcpCopiedAriaLabel
                            : labels.healthMcpCopyAriaLabel
                        }
                        onClick={copyHealthMcpCheck}
                        className="min-w-0 border border-[color:var(--topology-health-repair-secondary-border)] bg-[color:var(--topology-health-repair-secondary-surface)] px-2.5 text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--topology-health-repair-secondary-hover-surface)]"
                      />
                      <Link
                        href={buildOntologyNodeHref(healthAction.slug)}
                        data-health-repair-secondary-action="ontology"
                        data-health-repair-action-tier="secondary"
                        data-surface-token="--topology-health-repair-secondary-surface"
                        data-border-token="--topology-health-repair-secondary-border"
                        data-hover-surface-token="--topology-health-repair-secondary-hover-surface"
                        className="inline-flex min-h-9 min-w-0 items-center justify-center rounded-md border border-[color:var(--topology-health-repair-secondary-border)] bg-[color:var(--topology-health-repair-secondary-surface)] px-2 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--topology-health-repair-secondary-hover-surface)] hover:text-[color:var(--color-text-primary)]"
                      >
                        <span className="truncate whitespace-nowrap">{labels.healthOpenOntology}</span>
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
          {panelMode === "path" && pathSourceSlug && pathTargetSlug ? (
            <details className="group mt-1.5 border-t border-[color:var(--color-border-soft)] pt-1.5">
              <summary
                className="flex min-h-[var(--topology-path-proof-summary-min-height)] w-full cursor-pointer list-none items-center gap-1.5 rounded-md border border-[color:var(--topology-path-proof-summary-border)] bg-[color:var(--topology-path-proof-summary-surface)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--topology-path-proof-summary-text)] transition-colors hover:border-[color:var(--topology-path-proof-summary-hover-border)] hover:bg-[color:var(--topology-path-proof-summary-hover-surface)] hover:text-[color:var(--topology-path-proof-summary-hover-text)]"
                data-testid="topology-path-proof-summary"
                data-summary-contract="full-width-proof-disclosure"
                data-surface-token="--topology-path-proof-summary-surface"
                data-border-token="--topology-path-proof-summary-border"
                data-text-token="--topology-path-proof-summary-text"
                data-hover-surface-token="--topology-path-proof-summary-hover-surface"
                data-hover-border-token="--topology-path-proof-summary-hover-border"
                data-hover-text-token="--topology-path-proof-summary-hover-text"
                data-min-height-token="--topology-path-proof-summary-min-height"
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
              <p
                data-testid="topology-path-proof-kicker"
                data-text-token="--topology-path-proof-kicker-text"
                className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--topology-path-proof-kicker-text)]"
              >
                {labels.pathProofOrderTitle}
              </p>
              <div
                data-testid="topology-path-proof-route"
                data-route-contract="proof-disclosure-source-target"
                data-surface-token="--topology-path-route-surface"
                data-border-token="--topology-path-route-border"
                data-chip-surface-token="--topology-path-route-chip-surface"
                data-chip-border-token="--topology-path-route-chip-border"
                data-chip-text-token="--topology-path-route-chip-text"
                data-arrow-text-token="--topology-path-route-arrow-text"
                className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-md border border-[color:var(--topology-path-route-border)] bg-[color:var(--topology-path-route-surface)] px-2 py-1.5"
              >
                <span
                  className="min-w-0 truncate rounded border border-[color:var(--topology-path-route-chip-border)] bg-[color:var(--topology-path-route-chip-surface)] px-1.5 py-1 text-[10.5px] text-[color:var(--topology-path-route-chip-text)]"
                  data-route-endpoint="source"
                >
                  {displayPathSourceTitle}
                </span>
                <ArrowRight size={12} aria-hidden className="text-[color:var(--topology-path-route-arrow-text)]" />
                <span
                  className="min-w-0 truncate rounded border border-[color:var(--topology-path-route-chip-border)] bg-[color:var(--topology-path-route-chip-surface)] px-1.5 py-1 text-right text-[10.5px] text-[color:var(--topology-path-route-chip-text)]"
                  data-route-endpoint="target"
                >
                  {displayPathTargetTitle}
                </span>
              </div>
              <p
                data-testid="topology-path-proof-description"
                data-text-token="--topology-path-proof-desc-text"
                className="mt-2 line-clamp-2 text-[10.5px] leading-4 text-[color:var(--topology-path-proof-desc-text)]"
              >
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
                <Link
                  href={buildOntologyNodeHref(pathSourceSlug)}
                  data-path-proof-action="source-ontology"
                  data-surface-token="--topology-path-route-surface"
                  data-border-token="--topology-path-route-border"
                  data-text-token="--topology-path-proof-action-text"
                  data-hover-text-token="--topology-path-proof-action-hover-text"
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--topology-path-route-border)] bg-[color:var(--topology-path-route-surface)] px-2 py-1 text-[10.5px] text-[color:var(--topology-path-proof-action-text)] transition-colors hover:border-[color:var(--topology-path-route-chip-border)] hover:text-[color:var(--topology-path-proof-action-hover-text)]"
                >
                  {labels.pathSourceOntology}
                </Link>
                <Link
                  href={buildOntologyNodeHref(pathTargetSlug)}
                  data-path-proof-action="target-ontology"
                  data-surface-token="--topology-path-route-surface"
                  data-border-token="--topology-path-route-border"
                  data-text-token="--topology-path-proof-action-text"
                  data-hover-text-token="--topology-path-proof-action-hover-text"
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--topology-path-route-border)] bg-[color:var(--topology-path-route-surface)] px-2 py-1 text-[10.5px] text-[color:var(--topology-path-proof-action-text)] transition-colors hover:border-[color:var(--topology-path-route-chip-border)] hover:text-[color:var(--topology-path-proof-action-hover-text)]"
                >
                  {labels.pathTargetOntology}
                </Link>
                <Link
                  href={buildTopologyHealthRepairHref(pathSourceSlug)}
                  data-path-proof-action="source-builder"
                  data-surface-token="--topology-path-route-chip-surface"
                  data-border-token="--topology-path-route-chip-border"
                  data-text-token="--topology-path-proof-action-text"
                  data-hover-text-token="--topology-path-proof-action-hover-text"
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--topology-path-route-chip-border)] bg-[color:var(--topology-path-route-chip-surface)] px-2 py-1 text-[10.5px] text-[color:var(--topology-path-proof-action-text)] transition-colors hover:border-[color:var(--topology-path-route-border)] hover:text-[color:var(--topology-path-proof-action-hover-text)]"
                >
                  {labels.pathSourceBuilder}
                </Link>
                <Link
                  href={buildTopologyHealthRepairHref(pathTargetSlug)}
                  data-path-proof-action="target-builder"
                  data-surface-token="--topology-path-route-chip-surface"
                  data-border-token="--topology-path-route-chip-border"
                  data-text-token="--topology-path-proof-action-text"
                  data-hover-text-token="--topology-path-proof-action-hover-text"
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--topology-path-route-chip-border)] bg-[color:var(--topology-path-route-chip-surface)] px-2 py-1 text-[10.5px] text-[color:var(--topology-path-proof-action-text)] transition-colors hover:border-[color:var(--topology-path-route-border)] hover:text-[color:var(--topology-path-proof-action-hover-text)]"
                >
                  {labels.pathTargetBuilder}
                </Link>
              </div>
              <details className="group mt-2">
                <summary
                  data-testid="topology-path-checks-summary"
                  data-text-token="--topology-path-check-summary-text"
                  data-hover-text-token="--topology-path-check-summary-hover-text"
                  className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--topology-path-check-summary-text)] transition-colors hover:text-[color:var(--topology-path-check-summary-hover-text)]"
                >
                  <ChevronDown
                    size={12}
                    aria-hidden
                    className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                    data-testid="topology-path-checks-chevron"
                  />
                  <span>{labels.pathCopyTools}</span>
                </summary>
                <div
                  className="mt-1 flex flex-wrap gap-1"
                  data-testid="topology-path-check-actions"
                  data-path-check-action-contract="mcp-sequence-proof-actions"
                  data-surface-token="--topology-path-handoff-surface"
                  data-border-token="--topology-path-handoff-border"
                >
                  <CompactCopyButton
                    data-path-check-action="path-mcp"
                    data-surface-token="--topology-path-handoff-mcp-surface"
                    data-border-token="--topology-path-handoff-mcp-border"
                    data-text-token="--topology-path-handoff-mcp-text"
                    copied={pathMcpCopied}
                    label={labels.pathMcpCopy}
                    ariaLabel={
                      pathMcpCopied
                        ? labels.pathMcpCopiedAriaLabel
                        : labels.pathMcpCopyAriaLabel
                    }
                    onClick={copyPathMcpCheck}
                    className="border border-[color:var(--topology-path-handoff-mcp-border)] bg-[color:var(--topology-path-handoff-mcp-surface)] text-[color:var(--topology-path-handoff-mcp-text)] hover:border-[color:var(--topology-path-handoff-border)]"
                  />
                  <CompactCopyButton
                    data-path-check-action="relation-preflight"
                    data-surface-token="--topology-path-handoff-cli-surface"
                    data-border-token="--topology-path-handoff-cli-border"
                    copied={pathRelationPreflightCopied}
                    label={labels.pathRelationPreflightCopy}
                    ariaLabel={
                      pathRelationPreflightCopied
                        ? labels.pathRelationPreflightCopiedAriaLabel
                        : labels.pathRelationPreflightCopyAriaLabel
                    }
                    onClick={copyPathRelationPreflight}
                    className="border border-[color:var(--topology-path-handoff-cli-border)] bg-[color:var(--topology-path-handoff-cli-surface)] hover:border-[color:var(--topology-path-handoff-border)]"
                  />
                  <CompactCopyButton
                    data-path-check-action="explain-relation"
                    data-surface-token="--topology-path-handoff-cli-surface"
                    data-border-token="--topology-path-handoff-cli-border"
                    copied={pathExplainRelationCopied}
                    label={labels.pathExplainRelationCopy}
                    ariaLabel={
                      pathExplainRelationCopied
                        ? labels.pathExplainRelationCopiedAriaLabel
                        : labels.pathExplainRelationCopyAriaLabel
                    }
                    onClick={copyPathExplainRelation}
                    className="border border-[color:var(--topology-path-handoff-cli-border)] bg-[color:var(--topology-path-handoff-cli-surface)] hover:border-[color:var(--topology-path-handoff-border)]"
                  />
                  <CompactCopyButton
                    data-path-check-action="all-paths-plan"
                    data-surface-token="--topology-path-handoff-cli-surface"
                    data-border-token="--topology-path-handoff-cli-border"
                    copied={pathAllPathsPlanCopied}
                    label={labels.pathAllPathsPlanCopy}
                    ariaLabel={
                      pathAllPathsPlanCopied
                        ? labels.pathAllPathsPlanCopiedAriaLabel
                        : labels.pathAllPathsPlanCopyAriaLabel
                    }
                    onClick={copyPathAllPathsPlan}
                    className="border border-[color:var(--topology-path-handoff-cli-border)] bg-[color:var(--topology-path-handoff-cli-surface)] hover:border-[color:var(--topology-path-handoff-border)]"
                  />
                  <CompactCopyButton
                    data-path-check-action="all-paths-run"
                    data-surface-token="--topology-path-handoff-cli-surface"
                    data-border-token="--topology-path-handoff-cli-border"
                    copied={pathAllPathsCopied}
                    label={labels.pathAllPathsCopy}
                    ariaLabel={
                      pathAllPathsCopied
                        ? labels.pathAllPathsCopiedAriaLabel
                        : labels.pathAllPathsCopyAriaLabel
                    }
                    onClick={copyPathAllPaths}
                    className="border border-[color:var(--topology-path-handoff-cli-border)] bg-[color:var(--topology-path-handoff-cli-surface)] hover:border-[color:var(--topology-path-handoff-border)]"
                  />
                </div>
              </details>
              </div>
            </details>
          ) : null}
          {panelMode === "focus" ? (
            <div
              data-testid="topology-focus-command-spine"
              data-command-hierarchy="brief-primary-review-agent-proof"
              data-attention-layer="support-command-spine"
              data-tokenized-surface="topology-command-spine"
              data-command-spine-surface-token="--topology-command-spine-surface"
              data-command-spine-border-token="--topology-command-spine-border"
              className="mt-3 rounded-[var(--topology-command-spine-radius)] border border-[color:var(--topology-command-spine-border)] bg-[image:var(--topology-command-spine-surface)] p-[var(--topology-command-spine-padding)] shadow-[inset_0_1px_0_var(--topology-command-spine-inset-highlight)]"
            >
              {selectedSlug ? (
                <>
                  <button
                    type="button"
                    onClick={copyFocusBrief}
                    data-testid="topology-focus-primary-action"
                    data-command-primary-surface-token="--topology-command-primary-surface"
                    data-command-primary-border-token="--topology-command-primary-border"
                    className="group/focus-action flex min-h-[var(--topology-command-primary-min-height)] w-full min-w-0 items-center justify-between gap-[var(--topology-command-spine-gap)] rounded-lg border border-[color:var(--topology-command-primary-border)] bg-[color:var(--topology-command-primary-surface)] px-3 py-2 text-left text-[color:var(--color-text-secondary)] transition-[background-color,border-color,color,transform,box-shadow] duration-180 ease-out hover:border-[color:var(--topology-command-primary-hover-border)] hover:bg-[color:var(--topology-command-primary-hover-surface)] hover:text-[color:var(--color-text-primary)] hover:shadow-[var(--topology-command-primary-hover-shadow)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none"
                    aria-label={
                      focusBriefCopied
                        ? labels.focusBriefCopiedAriaLabel
                        : labels.focusBriefCopyAriaLabel
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--topology-command-icon-surface)] text-[color:var(--topology-command-icon-text)]">
                        {focusBriefCopied ? (
                          <Check size={13} aria-hidden />
                        ) : (
                          <Clipboard size={13} aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium leading-4">
                          {labels.focusBriefCopy}
                        </span>
                        <span className="block truncate font-mono text-[8.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          {labels.focusReviewOrderProfile} · {labels.focusReviewOrderImpact}
                        </span>
                      </span>
                    </span>
                    <ArrowRight
                      size={14}
                      aria-hidden
                      className="shrink-0 text-[color:var(--topology-command-arrow-text)] transition-transform duration-180 group-hover/focus-action:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                    />
                  </button>
                </>
              ) : null}
              <div className={selectedSlug ? "mt-[var(--topology-command-spine-gap)]" : ""}>
                <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {labels.focusReviewOrderTitle}
                </p>
                <ol
                  data-testid="topology-focus-review-order"
                  data-review-order-contract="flat-numbered-rail"
                  data-command-step-surface-token="--topology-command-step-surface"
                  data-command-step-border-token="--topology-command-step-border"
                  className="mt-1.5 grid min-w-0 overflow-hidden rounded-md border border-[color:var(--topology-command-step-border)] bg-[color:var(--topology-command-step-surface)]"
                >
                  <FocusReviewStep index={1} label={labels.focusReviewOrderProfile} />
                  <FocusReviewStep index={2} label={labels.focusReviewOrderImpact} />
                  <FocusReviewStep index={3} label={labels.focusReviewOrderRepair} />
                  <FocusReviewStep index={4} label={labels.focusReviewOrderSync} />
                </ol>
              </div>
              {selectedSlug ? (
                <>
                  <div
                    data-testid="topology-focus-secondary-actions"
                    data-focus-secondary-action-contract="ontology-builder-exits"
                    data-command-secondary-surface-token="--topology-command-secondary-surface"
                    data-command-secondary-border-token="--topology-command-secondary-border"
                    className="mt-[var(--topology-command-spine-gap)] grid grid-cols-2 gap-1"
                  >
                    <Link
                      href={buildOntologyNodeHref(selectedSlug)}
                      data-focus-secondary-action="ontology"
                      data-command-secondary-surface-token="--topology-command-secondary-surface"
                      data-command-secondary-border-token="--topology-command-secondary-border"
                      className="inline-flex min-h-8 min-w-0 items-center justify-center rounded-md border border-[color:var(--topology-command-secondary-border)] bg-[color:var(--topology-command-secondary-surface)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--topology-command-secondary-hover-border)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <span className="truncate">{labels.focusOpenOntology}</span>
                    </Link>
                    <Link
                      href={buildTopologyHealthRepairHref(selectedSlug)}
                      data-focus-secondary-action="builder"
                      data-command-secondary-surface-token="--topology-command-secondary-surface"
                      data-command-secondary-border-token="--topology-command-secondary-border"
                      className="inline-flex min-h-8 min-w-0 items-center justify-center rounded-md border border-[color:var(--topology-command-secondary-border)] bg-[color:var(--topology-command-secondary-surface)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--topology-command-secondary-hover-border)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <span className="truncate">{labels.focusOpenBuilder}</span>
                    </Link>
                  </div>
                  <details
                    className="group mt-[var(--topology-command-spine-gap)]"
                    data-testid="topology-focus-agent-handoff"
                    data-handoff-contract="mcp-cli-proof-disclosed"
                  >
                    <summary
                      data-testid="topology-focus-proof-summary"
                      className="inline-flex min-h-8 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                    >
                      <span>{labels.focusHandoffSummary}</span>
                      <ChevronDown
                        size={12}
                        aria-hidden
                        className="shrink-0 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none"
                        data-testid="topology-focus-proof-chevron"
                      />
                    </summary>
                    <div className="mt-1 grid gap-1">
                      <CompactCopyButton
                        data-focus-proof-action="mcp-profile"
                        data-command-secondary-surface-token="--topology-command-secondary-surface"
                        data-command-secondary-border-token="--topology-command-secondary-border"
                        copied={focusMcpCopied}
                        label={labels.focusMcpCopy}
                        ariaLabel={
                          focusMcpCopied
                            ? labels.focusMcpCopiedAriaLabel
                            : labels.focusMcpCopyAriaLabel
                        }
                        onClick={copyFocusMcpCheck}
                        className="border border-[color:var(--topology-command-secondary-border)] bg-[color:var(--topology-command-secondary-surface)] hover:border-[color:var(--topology-command-secondary-hover-border)]"
                      />
                      <CompactCopyButton
                        data-focus-proof-action="mcp-impact"
                        data-command-secondary-surface-token="--topology-command-secondary-surface"
                        data-command-secondary-border-token="--topology-command-secondary-border"
                        copied={focusMcpImpactCopied}
                        label={labels.focusMcpImpactCopy}
                        ariaLabel={
                          focusMcpImpactCopied
                            ? labels.focusMcpImpactCopiedAriaLabel
                            : labels.focusMcpImpactCopyAriaLabel
                        }
                        onClick={copyFocusMcpImpactCheck}
                        className="border border-[color:var(--topology-command-secondary-border)] bg-[color:var(--topology-command-secondary-surface)] hover:border-[color:var(--topology-command-secondary-hover-border)]"
                      />
                      <CompactCopyButton
                        data-focus-proof-action="sync-gate"
                        data-command-secondary-surface-token="--topology-command-secondary-surface"
                        data-command-secondary-border-token="--topology-command-secondary-border"
                        copied={focusSyncGateCopied}
                        label={labels.focusSyncGateCopy}
                        ariaLabel={
                          focusSyncGateCopied
                            ? labels.focusSyncGateCopiedAriaLabel
                            : labels.focusSyncGateCopyAriaLabel
                        }
                        onClick={copyFocusSyncGate}
                        className="border border-[color:var(--topology-command-secondary-border)] bg-[color:var(--topology-command-secondary-surface)] hover:border-[color:var(--topology-command-secondary-hover-border)]"
                      />
                      <CompactCopyButton
                        data-focus-proof-action="strengthen-command"
                        data-command-secondary-surface-token="--topology-command-secondary-surface"
                        data-command-secondary-border-token="--topology-command-secondary-border"
                        copied={focusEnhanceCopied}
                        label={labels.focusEnhanceCopy}
                        ariaLabel={
                          focusEnhanceCopied
                            ? labels.focusEnhanceCopiedAriaLabel
                            : labels.focusEnhanceCopyAriaLabel
                        }
                        onClick={copyFocusEnhancementCommand}
                        className="border border-[color:var(--topology-command-secondary-border)] bg-[color:var(--topology-command-secondary-surface)] hover:border-[color:var(--topology-command-secondary-hover-border)]"
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
  const toneTokens = {
    neutral: {
      surface: "--topology-overview-signal-neutral-surface",
      border: "--topology-overview-signal-neutral-border",
    },
    indigo: {
      surface: "--topology-overview-signal-indigo-surface",
      border: "--topology-overview-signal-indigo-border",
    },
    cyan: {
      surface: "--topology-overview-signal-cyan-surface",
      border: "--topology-overview-signal-cyan-border",
    },
  }[tone];

  return (
    <div
      {...attrs}
      data-overview-signal-card={tone}
      data-overview-signal-compact={compact ? "true" : "false"}
      data-surface-token={toneTokens.surface}
      data-border-token={toneTokens.border}
      style={
        {
          ...attrs.style,
          "--topology-overview-signal-card-surface": `var(${toneTokens.surface})`,
          "--topology-overview-signal-card-border": `var(${toneTokens.border})`,
        } as CSSProperties
      }
      className={`grid min-w-0 ${
        compact ? "gap-0.5 rounded-md px-2.5 py-2" : "gap-1 rounded-md px-3 py-2"
      } border border-[color:var(--topology-overview-signal-card-border)] bg-[color:var(--topology-overview-signal-card-surface)] ${
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

function RelationProvenanceGate({
  title,
  labels,
  summary,
  counts,
}: {
  title: string;
  labels: {
    sourceBacked: string;
    authored: string;
    needsReview: string;
  };
  summary: string;
  counts: NonNullable<TopologyAnalysisSummary["relationProvenance"]>;
}) {
  const rows = [
    {
      key: "source-backed",
      count: counts.sourceBacked,
      label: labels.sourceBacked,
      token: "--topology-overview-proof-strong-text",
    },
    {
      key: "authored",
      count: counts.authored,
      label: labels.authored,
      token: "--topology-overview-proof-supported-text",
    },
    {
      key: "needs-review",
      count: counts.needsReview,
      label: labels.needsReview,
      token: "--topology-overview-proof-review-text",
    },
  ] as const;

  return (
    <div
      aria-label={`${title}: ${summary}`}
      className="grid min-w-0 gap-1 rounded-md border border-[color:var(--topology-overview-signal-indigo-border)] bg-[color:var(--topology-overview-signal-indigo-surface)] px-2.5 py-2"
      data-overview-provenance-contract="scan-counts-not-wrapped-summary"
      data-overview-provenance-layout="stacked-fact-rows"
      data-overview-signal-card="indigo"
      data-overview-signal-compact="true"
      data-surface-token="--topology-overview-signal-indigo-surface"
      data-border-token="--topology-overview-signal-indigo-border"
      data-testid="topology-overview-relation-provenance"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {title}
      </span>
      <span className="sr-only">{summary}</span>
      <span className="grid min-w-0 gap-0.5">
        {rows.map((row) => (
          <span
            key={row.key}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-1.5"
            data-overview-provenance-row={row.key}
            data-text-token={row.token}
          >
            <span
              className="font-mono text-[11px] leading-3"
              style={{ color: `var(${row.token})` }}
            >
              {row.count}
            </span>
            <span className="truncate font-mono text-[7.5px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
              {row.label}
            </span>
          </span>
        ))}
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
      className="grid gap-1.5 rounded-md border border-[color:var(--topology-overview-readiness-border)] bg-[color:var(--topology-overview-readiness-surface)] px-3 py-1.5"
      aria-label={`${title}: ${summary}`}
      data-agent-readiness-summary={summary}
      data-overview-signal-card="readiness"
      data-surface-token="--topology-overview-readiness-surface"
      data-border-token="--topology-overview-readiness-border"
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

function RelationQualityGate({
  title,
  labels,
  summary,
  counts,
  ...attrs
}: {
  title: string;
  labels: {
    strong: string;
    supported: string;
    weak: string;
    review: string;
  };
  summary: string;
  counts: {
    strong: number;
    supported: number;
    weak: number;
    review: number;
  };
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...attrs}
      className={`grid gap-1.5 rounded-md border border-[color:var(--topology-overview-quality-border)] bg-[color:var(--topology-overview-quality-surface)] px-3 py-1.5 ${
        attrs.className ?? ""
      }`}
      aria-label={`${title}: ${summary}`}
      data-density="scan-facts"
      data-proof-strip-contract="flat-no-nested-cards"
      data-quality-meter-contract="distribution-bar-maps-relation-quality"
      data-overview-signal-card="quality"
      data-surface-token="--topology-overview-quality-surface"
      data-border-token="--topology-overview-quality-border"
      data-testid="topology-overview-relation-quality"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {title}
      </span>
      <span className="sr-only">{summary}</span>
      <div
        className="grid grid-cols-4 overflow-hidden rounded-md border border-[color:var(--topology-overview-proof-cell-divider)]"
        data-divider-token="--topology-overview-proof-cell-divider"
      >
        <RelationQualityChip count={counts.strong} label={labels.strong} tone="strong" />
        <RelationQualityChip count={counts.supported} label={labels.supported} tone="supported" />
        <RelationQualityChip count={counts.weak} label={labels.weak} tone="weak" />
        <RelationQualityChip count={counts.review} label={labels.review} tone="review" />
      </div>
      <RelationQualityMeter label={`${title}: ${summary}`} counts={counts} />
    </div>
  );
}

function RelationQualityChip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "strong" | "supported" | "weak" | "review";
}) {
  const toneClass =
    tone === "strong"
      ? "text-[color:var(--topology-overview-proof-strong-text)]"
      : tone === "supported"
        ? "text-[color:var(--topology-overview-proof-supported-text)]"
        : tone === "weak"
          ? "text-[color:var(--topology-overview-proof-warning-text)]"
          : "text-[color:var(--topology-overview-proof-review-text)]";
  const textToken =
    tone === "strong"
      ? "--topology-overview-proof-strong-text"
      : tone === "supported"
        ? "--topology-overview-proof-supported-text"
        : tone === "weak"
          ? "--topology-overview-proof-warning-text"
          : "--topology-overview-proof-review-text";
  const displayLabel = compactOverviewProofLabel(label, tone);

  return (
    <span
      aria-label={`${label}: ${count}`}
      className="grid min-w-0 gap-0.5 border-r border-[color:var(--topology-overview-proof-cell-divider)] px-1.5 py-1 last:border-r-0"
      data-relation-quality-chip={tone}
      data-full-label={label}
      data-compact-label={displayLabel}
      data-proof-label-contract="compact-visible-full-aria"
      data-proof-cell-contract="flat-divider-cell"
      data-divider-token="--topology-overview-proof-cell-divider"
      data-text-token={textToken}
      data-testid={`topology-overview-relation-quality-${tone}`}
    >
      <span className={`font-mono text-[11px] leading-3 ${toneClass}`}>
        {count}
      </span>
      <span className="truncate font-mono text-[7.5px] uppercase tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
        {displayLabel}
      </span>
    </span>
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
      ? "text-[color:var(--topology-overview-proof-supported-text)]"
      : tone === "preflight"
        ? "text-[color:var(--topology-overview-proof-warning-text)]"
        : "text-[color:var(--topology-overview-proof-review-text)]";
  const textToken =
    tone === "ready"
      ? "--topology-overview-proof-supported-text"
      : tone === "preflight"
        ? "--topology-overview-proof-warning-text"
        : "--topology-overview-proof-review-text";
  const displayLabel = compactOverviewProofLabel(label, tone);

  return (
    <span
      aria-label={`${label}: ${count}`}
      className="grid min-w-0 gap-0.5 border-r border-[color:var(--topology-overview-proof-cell-divider)] px-1.5 py-0.5 last:border-r-0"
      data-agent-readiness-chip={tone}
      data-full-label={label}
      data-compact-label={displayLabel}
      data-proof-label-contract="compact-visible-full-aria"
      data-proof-cell-contract="flat-divider-cell"
      data-divider-token="--topology-overview-proof-cell-divider"
      data-text-token={textToken}
    >
      <span className={`font-mono text-[11px] leading-3 ${toneClass}`}>
        {count}
      </span>
      <span className="truncate font-mono text-[7.5px] uppercase tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
        {displayLabel}
      </span>
    </span>
  );
}

function compactOverviewProofLabel(label: string, tone: string): string {
  if (tone === "supported") return label.replace(/supported/i, "support");
  if (tone === "ready") return label.replace(/handoff[-\s]?ready/i, "ready");
  return label;
}

function RelationQualityMeter({
  label,
  counts,
}: {
  label: string;
  counts: {
    strong: number;
    supported: number;
    weak: number;
    review: number;
  };
}) {
  const total = counts.strong + counts.supported + counts.weak + counts.review;
  const segments = [
    {
      key: "strong",
      count: counts.strong,
      token: "--topology-overview-quality-strong-meter",
    },
    {
      key: "supported",
      count: counts.supported,
      token: "--topology-overview-quality-supported-meter",
    },
    {
      key: "weak",
      count: counts.weak,
      token: "--topology-overview-quality-weak-meter",
    },
    {
      key: "review",
      count: counts.review,
      token: "--topology-overview-quality-review-meter",
    },
  ] as const;

  return (
    <div
      aria-label={label}
      data-testid="topology-overview-relation-quality-meter"
      data-quality-meter-contract="distribution-bar-maps-relation-quality"
      data-surface-token="--topology-overview-quality-meter-surface"
      data-border-token="--topology-overview-quality-meter-border"
      className="flex h-1.5 w-full overflow-hidden rounded-full border border-[color:var(--topology-overview-quality-meter-border)] bg-[color:var(--topology-overview-quality-meter-surface)]"
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          aria-hidden
          data-relation-quality-segment={segment.key}
          data-count={segment.count}
          data-meter-token={segment.token}
          style={{
            background: `var(${segment.token})`,
            flexGrow: total > 0 ? segment.count : 1,
          }}
        />
      ))}
    </div>
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
      token: "--topology-overview-readiness-ready-meter",
    },
    {
      key: "preflight",
      count: counts.preflight,
      token: "--topology-overview-readiness-preflight-meter",
    },
    {
      key: "review",
      count: counts.review,
      token: "--topology-overview-readiness-review-meter",
    },
  ] as const;

  return (
    <div
      aria-label={label}
      data-testid="topology-overview-agent-readiness-meter"
      data-surface-token="--topology-overview-readiness-meter-surface"
      data-border-token="--topology-overview-readiness-meter-border"
      className="flex h-2 w-full overflow-hidden rounded-full border border-[color:var(--topology-overview-readiness-meter-border)] bg-[color:var(--topology-overview-readiness-meter-surface)]"
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          aria-hidden
          data-agent-readiness-segment={segment.key}
          data-count={segment.count}
          data-meter-token={segment.token}
          style={{
            background: `var(${segment.token})`,
            flexGrow: total > 0 ? segment.count : 1,
          }}
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

function FocusReviewStep({
  index,
  label,
}: {
  index: number;
  label: string;
}) {
  return (
    <li
      data-focus-review-step={index}
      data-command-step-contract="flat-numbered-row"
      className="grid min-h-[var(--topology-command-step-min-height)] grid-cols-[var(--topology-command-step-index-size)_minmax(0,1fr)] items-center gap-2 border-b border-[color:var(--topology-command-step-border)] px-2 py-1 last:border-b-0"
    >
      <span
        aria-hidden
        className="flex h-[var(--topology-command-step-index-size)] w-[var(--topology-command-step-index-size)] items-center justify-center rounded-full border border-[color:var(--topology-command-step-index-border)] bg-[color:var(--topology-command-step-index-surface)] font-mono text-[8.5px] text-[color:var(--topology-command-step-index-text)]"
      >
        {index}
      </span>
      <span className="min-w-0 truncate text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
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
  const statusTokens = {
    ready: {
      surface: "--topology-path-proof-ready-surface",
      border: "--topology-path-proof-ready-border",
      text: "--topology-path-proof-ready-text",
    },
    required: {
      surface: "--topology-path-proof-required-surface",
      border: "--topology-path-proof-required-border",
      text: "--topology-path-proof-required-text",
    },
    "after-write": {
      surface: "--topology-path-proof-after-write-surface",
      border: "--topology-path-proof-after-write-border",
      text: "--topology-path-proof-after-write-text",
    },
  }[tone];

  return (
    <li
      data-path-proof-step={tone}
      data-surface-token="--topology-path-proof-step-surface"
      data-border-token="--topology-path-proof-step-border"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[color:var(--topology-path-proof-step-border)] bg-[color:var(--topology-path-proof-step-surface)] px-2 py-1.5"
    >
      <span className="min-w-0 truncate text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
        {label}
      </span>
      <span
        data-path-proof-status={tone}
        data-surface-token={statusTokens.surface}
        data-border-token={statusTokens.border}
        data-text-token={statusTokens.text}
        className="shrink-0 rounded-full border border-[color:var(--path-proof-status-border)] bg-[color:var(--path-proof-status-surface)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-[color:var(--path-proof-status-text)]"
        style={
          {
            "--path-proof-status-surface": `var(${statusTokens.surface})`,
            "--path-proof-status-border": `var(${statusTokens.border})`,
            "--path-proof-status-text": `var(${statusTokens.text})`,
          } as CSSProperties
        }
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
  ...attrs
}: {
  copied: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
} & Omit<HTMLAttributes<HTMLButtonElement>, "className" | "onClick">) {
  return (
    <button
      {...attrs}
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

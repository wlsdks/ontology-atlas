"use client";

import { useCallback, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  HeartPulse,
  Network,
  Waypoints,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CompactCopyButton, Tooltip } from "@/shared/ui";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";
import type { TopologyAnalysisMode } from "../model/url-state";
import type {
  TopologyAnalysisSummary,
  TopologyHealthActionTarget,
} from "../lib/topology-analysis";
import {
  buildTopologyHealthRepairHref,
  formatTopologyHealthBrief,
  formatTopologyHealthImpactMcpCheck,
  formatTopologyHealthMcpCheck,
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
  graph: string;
  graphPrompt: string;
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
  pathSourceSlug?: string | null;
  pathTargetSlug?: string | null;
  pathSourceTitle?: string | null;
  pathTargetTitle?: string | null;
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

// 2-뷰 레일 — 지도(Relief: overview/focus/path/health 상태 계열의 대표)와
// 그래프(살아있는 그래프)만 상위 뷰. 초점=노드 선택 상태, 경로=액션(shift-클릭
// /URL), 상태=우측 정리 큐 칩 — 탭 승격은 "정체불명 5형제" 혼란(소유자 피드백)
// 을 만들어 뷰 2개 + 진입점 재배치로 정리했다. URL 모드 계약은 전부 보존.
const MODES = [
  { value: "overview", icon: Network, labelKey: "overview" },
  { value: "graph", icon: Waypoints, labelKey: "graph" },
] as const;

export function TopologyAnalysisBar({
  mode,
  summary,
  healthAction,
  pathSourceSlug,
  pathTargetSlug,
  pathSourceTitle,
  pathTargetTitle,
  pathCandidateVisibility = null,
  rightPanelReserved = false,
  leftPanelExpanded = false,
  createPanelReserved = false,
  labels,
  onModeChange,
  onHealthAction,
}: TopologyAnalysisBarProps) {
  const [healthCopied, setHealthCopied] = useState(false);
  const [healthMcpCopied, setHealthMcpCopied] = useState(false);
  const [healthMcpImpactCopied, setHealthMcpImpactCopied] = useState(false);
  const [healthSyncGateCopied, setHealthSyncGateCopied] = useState(false);
  const [pathEvidenceCopied, setPathEvidenceCopied] = useState(false);
  const [pathMcpCopied, setPathMcpCopied] = useState(false);
  const [pathRelationPreflightCopied, setPathRelationPreflightCopied] =
    useState(false);
  const [pathExplainRelationCopied, setPathExplainRelationCopied] =
    useState(false);
  const [pathAllPathsPlanCopied, setPathAllPathsPlanCopied] = useState(false);
  const [pathAllPathsCopied, setPathAllPathsCopied] = useState(false);
  const displayPathSourceTitle = pathSourceTitle
    ? compactAnalysisTitle(pathSourceTitle)
    : null;
  const displayPathTargetTitle = pathTargetTitle
    ? compactAnalysisTitle(pathTargetTitle)
    : null;
  // 분석 패널 완전 소멸 2단계 §a — focus 는 더 이상 이 레일이 별도로 그리는
  // 모드가 아니다(레일은 mode 를 그대로 panelMode 로 쓴다). HomePage 의
  // `resolveLeftSlotOwner`가 focus 를 overview 와 동일하게 취급해 이 컴포넌트
  // 자체가 focus 상태에서는 좌측 슬롯을 갖지 않으므로, 여기 남아 있던
  // "overview 인데 노드가 선택되면 focus 로 승격" 트릭은 죽은 코드였다
  // (당시에도 leftSlotOwner 가 이미 그 케이스를 걸러 렌더 자체가 안 됐다).
  const panelMode = mode;
  // 칩 숫자 = 진짜 결함(오래된 근거 + 소속 미정)만. 허브 승격 후보는
  // 통계적 *제안*이라 카운트에 넣으면 첫 클릭에 "고칠 게 없는 빨간 숫자"
  // 가 되어 칩 신뢰가 무너진다 (기획자 감사 ⑦-b). 제안은 상태 패널 안에서.
  const healthQueueCount =
    summary.healthBreakdown.stale + summary.healthBreakdown.orphan;
  const handleModeRailChange = useCallback(
    (nextMode: TopologyAnalysisMode) => {
      onModeChange(nextMode);
    },
    [onModeChange],
  );
  const headerAlignedPanel = panelMode === "overview" || panelMode === "path";
  const postChangeSyncPacket = formatAgentPostChangeSyncPacket();
  const resolvedPathTitle =
    displayPathSourceTitle && displayPathTargetTitle
      ? labels.pathResolved
          .replace("{source}", displayPathSourceTitle)
          .replace("{target}", displayPathTargetTitle)
      : null;
  const prompt =
    panelMode === "path"
      ? resolvedPathTitle
        ? resolvedPathTitle
        : displayPathSourceTitle
          ? labels.pathSelected.replace("{title}", displayPathSourceTitle)
          : labels.pathPrompt
      : panelMode === "health"
        ? labels.healthPrompt
        : panelMode === "graph"
          ? labels.graphPrompt
          : labels.overviewPrompt;
  const pathCandidateVisibilityText =
    panelMode === "path" && pathCandidateVisibility && pathCandidateVisibility.total > 0
      ? labels.pathCandidateVisibility
          .replace("{visible}", String(pathCandidateVisibility.visible))
          .replace("{total}", String(pathCandidateVisibility.total))
      : null;

  const primaryLabel =
    panelMode === "health" ? labels.metricIssues : labels.metricNodes;
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
    panelMode === "overview" || panelMode === "path" ? "support" : "primary";
  const panelSurfaceToken =
    attentionRole === "support"
      ? "--topology-panel-support-surface"
      : "--topology-panel-primary-surface";
  const panelShadowToken =
    attentionRole === "support"
      ? "--topology-panel-support-shadow"
      : "--topology-panel-primary-shadow";
  const panelPaddingToken = "--topology-panel-padding";
  const panelStyle: CSSProperties = {
    width:
      panelMode === "health"
        ? "var(--topology-panel-overview-responsive-width)"
        : panelMode === "graph"
          ? "var(--topology-panel-graph-width)"
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
    padding: `var(${panelPaddingToken})`,
    borderColor: "var(--topology-panel-border)",
    background: `var(${panelSurfaceToken})`,
    boxShadow: `var(${panelShadowToken})`,
    zIndex: "var(--topology-panel-read-layer-z-index)",
    transition:
      "background var(--topology-motion-panel-duration) var(--topology-motion-ease-standard), box-shadow var(--topology-motion-panel-duration) var(--topology-motion-ease-standard)",
  };
  const panelWidthTarget =
    panelMode === "overview"
      ? "overview-14-inch-compact"
      : panelMode === "health"
        ? "health-phone-primary-rail"
      : panelMode === "graph"
        ? "graph-compact-rail"
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
      data-panel-padding-token={panelPaddingToken}
      data-panel-motion-token="--topology-motion-panel-duration"
      data-panel-width-contract={
        panelMode === "overview"
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
      data-path-guidance-owner={panelMode === "path" ? "analysis-rail" : undefined}
      data-path-prompt-policy={
        panelMode === "path" ? "panel-owned-when-card-mode" : undefined
      }
      data-right-panel-reserved={rightPanelReserved ? "true" : "false"}
      style={panelStyle}
      className={`topology-ui-scale pointer-events-auto absolute inset-x-3 border data-[analysis-mode=overview]:max-md:max-h-[var(--topology-overview-panel-phone-max-height)] data-[analysis-mode=overview]:max-md:overflow-y-auto data-[analysis-mode=overview]:lg:min-h-[390px] data-[analysis-mode=health]:max-md:max-h-[var(--topology-health-panel-phone-max-height)] data-[analysis-mode=health]:max-md:overflow-y-auto md:hidden lg:inset-x-auto lg:block lg:-translate-x-0 ${
        panelMode === "overview" ? "overflow-x-hidden overflow-y-hidden" : "overflow-y-auto"
      } ${
        createPanelReserved
          ? "top-[31.5rem] max-h-[calc(100dvh-33.5rem)]"
          : // 헤더 pill 아래 16px — 9.5rem 은 ~90px 공백, 5rem 은 헤더에
            // 밀착이었다 (사용자 보고 2회). 헤더 bottom ≈ 72px 기준.
            "top-[5.5rem] max-h-[calc(100dvh-7rem)]"
      // xl:left-8(32px) → xl:left-[var(--chrome-inset)](24px) —
      // feat/chrome-system §4, 브랜드 필/INDEX 패널과 같은 24px 정렬 레일.
      } lg:left-6 xl:left-[var(--chrome-inset)] ${leftPanelExpanded && !createPanelReserved ? "lg:top-[24rem]" : ""}`}
    >
      <div
        data-testid="topology-analysis-panel-body"
        data-panel-body-scroll-contract="compact-scrolls-above-bottom-tab"
        data-panel-body-scroll-end-reserve-token={panelBodyScrollEndReserveToken}
        className="flex flex-col gap-3 data-[analysis-body-mode=overview]:gap-[var(--topology-overview-panel-compact-gap)] data-[analysis-body-mode=path]:gap-[var(--topology-path-panel-compact-gap)] max-md:max-h-[calc(100dvh-7rem-var(--topology-analysis-panel-compact-scroll-end-reserve))] max-md:overflow-y-auto max-md:overscroll-contain max-md:pb-[var(--topology-analysis-panel-path-collapsed-scroll-end-reserve)] data-[analysis-body-mode=overview]:max-md:pb-[var(--topology-analysis-panel-compact-scroll-end-reserve)] data-[analysis-body-mode=health]:max-md:pb-[var(--topology-health-panel-scroll-end-reserve)] max-md:pr-1"
        data-analysis-body-mode={panelMode}
      >
        <div
          className="flex w-full items-center gap-1 rounded-lg bg-[color:var(--topology-analysis-mode-rail-surface)] p-1"
          data-testid="topology-analysis-mode-rail"
          data-mode-rail-contract="two-view-tabs-health-queue-chip"
          data-surface-token="--topology-analysis-mode-rail-surface"
          data-mode-tab-height-token="--topology-analysis-mode-tab-height"
          data-active-surface-token="--topology-analysis-mode-active-surface"
          data-active-border-token="--topology-analysis-mode-active-border"
          data-active-text-token="--topology-analysis-mode-active-text"
          data-idle-text-token="--topology-analysis-mode-idle-text"
          data-hover-surface-token="--topology-analysis-mode-hover-surface"
          data-focus-ring-token="--topology-analysis-mode-focus-ring"
        >
          {MODES.map(({ value, icon: Icon, labelKey }) => {
            // 지도 탭은 Relief 계열(overview/focus/path/health) 전체를 대표한다.
            const active =
              value === "graph" ? panelMode === "graph" : panelMode !== "graph";
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
                  className={`inline-flex h-[var(--topology-analysis-mode-tab-height)] flex-1 items-center justify-center rounded-md border px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-analysis-mode-focus-ring)] ${
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
          {healthQueueCount > 0 ? (
            <Tooltip content={labels.health} side="bottom">
              <button
                type="button"
                onClick={() => handleModeRailChange("health")}
                aria-pressed={panelMode === "health"}
                aria-label={labels.health}
                data-analysis-health-chip
                data-health-queue-count={healthQueueCount}
                data-mode-tab-state={panelMode === "health" ? "active" : "idle"}
                data-focus-ring-token="--topology-analysis-mode-focus-ring"
                className={`inline-flex h-[var(--topology-analysis-mode-tab-height)] flex-none items-center gap-1 rounded-md border px-2 font-mono text-[10px] tabular-nums tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-analysis-mode-focus-ring)] ${
                  panelMode === "health"
                    ? "border-[color:var(--topology-analysis-mode-active-border)] bg-[color:var(--topology-analysis-mode-active-surface)] text-[color:var(--topology-analysis-mode-active-text)]"
                    : "border-transparent text-[color:var(--topology-analysis-mode-idle-text)] hover:bg-[color:var(--topology-analysis-mode-hover-surface)] hover:text-[color:var(--topology-analysis-mode-active-text)]"
                }`}
              >
                <HeartPulse size={13} aria-hidden />
                {healthQueueCount}
              </button>
            </Tooltip>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p
            data-testid="topology-analysis-panel-prompt"
            data-prompt-text-token="--topology-analysis-panel-prompt-text"
            className={`break-keep text-[13.5px] text-[color:var(--topology-analysis-panel-prompt-text)] ${
              panelMode === "overview" ? "line-clamp-1 leading-5" : "line-clamp-3 leading-6"
            }`}
          >
            {prompt}
          </p>
          {/* overview 는 census(concepts/relations) 를 상단 워크스페이스 HUD
              (HeroCollapsed subtitle) 가 이미 보여준다 — 같은 숫자를 패널에서
              또 반복하면 "295·505 중복" 이 된다(디자인 가디언 verdict a6).
              다른 모드(health/path)는 그 모드 고유 지표라 유지한다. */}
          {panelMode !== "overview" ? (
            <div
              data-testid="topology-analysis-panel-metrics"
              data-metric-label-text-token="--topology-analysis-panel-metric-label-text"
              data-metric-value-text-token="--topology-analysis-panel-metric-value-text"
              className="grid grid-cols-2 gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--topology-analysis-panel-metric-label-text)] mt-3"
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
          ) : null}
          {pathCandidateVisibilityText ? (
            <p
              data-testid="topology-path-candidate-visibility"
              data-visible={pathCandidateVisibility?.visible}
              data-total={pathCandidateVisibility?.total}
              data-copy-contract="reader-facing-map-readability"
              data-path-rail-spacing-contract="parent-gap-owns-path-stack"
              data-surface-token="--topology-path-candidate-visibility-surface"
              data-border-token="--topology-path-candidate-visibility-border"
              data-notice-text-token="--topology-analysis-panel-notice-text"
              className="rounded-md border border-[color:var(--topology-path-candidate-visibility-border)] bg-[color:var(--topology-path-candidate-visibility-surface)] px-2.5 py-2 text-[11px] leading-4 tracking-normal text-[color:var(--topology-analysis-panel-notice-text)]"
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
              data-route-responsive-contract="phone-fluid-tablet-stacked-wide-desktop-weighted-endpoints"
              data-path-rail-spacing-contract="parent-gap-owns-path-stack"
              className="grid min-w-0 grid-cols-[minmax(0,0.68fr)_auto_minmax(0,1.42fr)] items-center gap-1.5 overflow-hidden rounded-md border border-[color:var(--topology-path-route-border)] bg-[color:var(--topology-path-route-surface)] px-2 py-1.5 md:grid-cols-1 md:gap-1 2xl:grid-cols-[minmax(5.75rem,0.9fr)_auto_minmax(7rem,1.5fr)] 2xl:gap-0"
            >
              <span
                className="min-h-[var(--topology-path-route-compact-min-height)] min-w-0 rounded border border-[color:var(--topology-path-route-source-border)] bg-[color:var(--topology-path-route-source-surface)] px-2 py-1"
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
                className="text-[color:var(--topology-path-route-arrow-text)] md:mx-auto md:rotate-90 2xl:mx-0 2xl:rotate-0"
              />
              <span
                className="min-h-[var(--topology-path-route-compact-min-height)] min-w-0 rounded border border-[color:var(--topology-path-route-target-border)] bg-[color:var(--topology-path-route-target-surface)] px-2 py-1"
                data-route-endpoint="target"
                data-route-endpoint-marker-contract="target-b-marker"
              >
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    aria-hidden
                    data-route-endpoint-marker="target"
                    className="grid size-3.5 shrink-0 place-items-center rounded-full border border-[color:var(--topology-path-route-endpoint-marker-border)] bg-[color:var(--topology-path-route-endpoint-marker-surface)] font-mono text-[7px] font-semibold leading-none text-[color:var(--topology-path-route-endpoint-marker-text)]"
                  >
                    B
                  </span>
                  <span className="block truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--topology-path-route-chip-text)]">
                    {labels.pathEvidenceTarget}
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
              data-handoff-layout-contract="evidence-first-agent-handoff-compact"
              data-handoff-hierarchy="primary-evidence-secondary-agent-checks"
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
              data-path-rail-spacing-contract="parent-gap-owns-path-stack"
              className="grid min-w-0 gap-1 overflow-hidden rounded-md border border-[color:var(--topology-path-handoff-border)] bg-[color:var(--topology-path-handoff-surface)] px-2 py-[var(--topology-path-handoff-compact-padding-y)] font-mono text-[10px] text-[color:var(--topology-path-handoff-text)]"
            >
              <div
                className="flex min-w-0 items-center justify-between gap-2"
                data-testid="topology-path-handoff-header"
                data-path-handoff-header-contract="share-label-before-actions"
              >
                <span className="min-w-0 truncate uppercase tracking-[0.12em] text-[color:var(--topology-path-handoff-label-text)]">
                  {labels.pathHandoffLabel}
                </span>
              </div>
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
                  className="inline-flex min-h-[var(--topology-path-primary-evidence-min-height)] min-w-0 items-center justify-between gap-2 rounded-md border border-[color:var(--topology-path-primary-evidence-border)] bg-[color:var(--topology-path-primary-evidence-surface)] px-2 py-0.5 text-left text-[10.5px] text-[color:var(--topology-path-primary-evidence-text)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:var(--topology-path-primary-evidence-hover-border)] hover:bg-[color:var(--topology-path-primary-evidence-hover-surface)] hover:text-[color:var(--topology-path-primary-evidence-hover-text)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none"
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
              <div
                className="grid min-w-0 grid-cols-2 gap-1"
                data-testid="topology-path-handoff-secondary-row"
                data-path-handoff-secondary-contract="agent-actions-demoted-after-evidence"
              >
                <span
                  data-testid="topology-path-handoff-mcp-chip"
                  data-surface-token="--topology-path-handoff-mcp-surface"
                  data-border-token="--topology-path-handoff-mcp-border"
                  data-text-token="--topology-path-handoff-mcp-text"
                  className="inline-flex min-h-[var(--topology-path-handoff-action-min-height)] min-w-0 items-center justify-center rounded-[var(--topology-path-handoff-action-radius)] border border-[color:var(--topology-path-handoff-mcp-border)] bg-[color:var(--topology-path-handoff-mcp-surface)] px-1.5 py-0 text-center uppercase tracking-[0.10em] text-[color:var(--topology-path-handoff-mcp-text)]"
                >
                  {labels.pathHandoffMcpAction}
                </span>
                <span
                  data-testid="topology-path-handoff-cli-chip"
                  data-surface-token="--topology-path-handoff-cli-surface"
                  data-border-token="--topology-path-handoff-cli-border"
                  data-text-token="--topology-path-handoff-cli-text"
                  className="inline-flex min-h-[var(--topology-path-handoff-action-min-height)] min-w-0 items-center justify-center rounded-[var(--topology-path-handoff-action-radius)] border border-[color:var(--topology-path-handoff-cli-border)] bg-[color:var(--topology-path-handoff-cli-surface)] px-1.5 py-0 text-center uppercase tracking-[0.10em] text-[color:var(--topology-path-handoff-cli-text)]"
                >
                  {labels.pathHandoffCliFallback}
                </span>
              </div>
            </div>
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
            <details
              className="group border-t border-[color:var(--color-border-soft)] pt-1.5"
              data-testid="topology-path-proof-disclosure"
              data-path-proof-disclosure-contract="closed-by-default-path-rail-proof"
              data-path-rail-spacing-contract="parent-gap-owns-path-stack"
            >
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
        </div>
      </div>
    </section>
  );
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


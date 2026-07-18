"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Clipboard, HeartPulse, Network, Waypoints } from "lucide-react";
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
  getTopologyHealthNextAction,
} from "../lib/topology-analysis";
import { copyText } from "@/shared/lib/copy-text";

interface TopologyAnalysisBarLabels {
  title: string;
  overview: string;
  graph: string;
  graphPrompt: string;
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
  healthPrompt: string;
  overviewPrompt: string;
}

interface TopologyAnalysisBarProps {
  mode: TopologyAnalysisMode;
  summary: TopologyAnalysisSummary;
  healthAction: TopologyHealthActionTarget | null;
  rightPanelReserved?: boolean;
  leftPanelExpanded?: boolean;
  createPanelReserved?: boolean;
  labels: TopologyAnalysisBarLabels;
  onModeChange: (mode: TopologyAnalysisMode) => void;
  onHealthAction: (slug: string) => void;
}

// 2-뷰 레일 — 지도(Relief 계열 대표)와 그래프(살아있는 그래프)만 상위 뷰.
// 상태(health)는 우측 정리 큐 칩 — 탭 승격은 "정체불명 5형제" 혼란(소유자
// 피드백)을 만들어 뷰 2개 + 진입점 재배치로 정리했다. 분석 패널 완전 소멸
// 2단계에서 focus(§a)/path(§b) 패널이 이 레일에서 빠졌다 — focus 는 노드
// 데이터시트가 이미 커버해 이관 없이 제거, path 는 상단 중앙 상태 칩
// (`TopologyPathChip`)으로 이동했다. health(§c)도 `/ontology/insights`
// 관계 탭 수리 큐로 이관 예정 — 그때까지는 이 레일이 마지막 서식지다.
// URL 모드 계약은 전부 보존.
const MODES = [
  { value: "overview", icon: Network, labelKey: "overview" },
  { value: "graph", icon: Waypoints, labelKey: "graph" },
] as const;

export function TopologyAnalysisBar({
  mode,
  summary,
  healthAction,
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
  const headerAlignedPanel = panelMode === "overview";
  const postChangeSyncPacket = formatAgentPostChangeSyncPacket();
  const prompt =
    panelMode === "health"
      ? labels.healthPrompt
      : panelMode === "graph"
        ? labels.graphPrompt
        : labels.overviewPrompt;

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

  const attentionRole = panelMode === "overview" ? "support" : "primary";
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
        : headerAlignedPanel
          ? "header-aligned"
          : "mode-compact";
  const panelBodyScrollEndReserveToken =
    panelMode === "health"
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
          : "standard"
      }
      data-panel-phone-utility-reserve-token={
        panelMode === "overview" || panelMode === "health"
          ? "--topology-panel-phone-utility-rail-reserve"
          : undefined
      }
      data-panel-compact-scroll-end-reserve-token={panelBodyScrollEndReserveToken}
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
        className="flex flex-col gap-3 data-[analysis-body-mode=overview]:gap-[var(--topology-overview-panel-compact-gap)] max-md:max-h-[calc(100dvh-7rem-var(--topology-analysis-panel-compact-scroll-end-reserve))] max-md:overflow-y-auto max-md:overscroll-contain max-md:pb-[var(--topology-analysis-panel-path-collapsed-scroll-end-reserve)] data-[analysis-body-mode=overview]:max-md:pb-[var(--topology-analysis-panel-compact-scroll-end-reserve)] data-[analysis-body-mode=health]:max-md:pb-[var(--topology-health-panel-scroll-end-reserve)] max-md:pr-1"
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
            // 지도 탭은 Relief 계열(overview/health) 전체를 대표한다.
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
              health 는 그 모드 고유 지표라 유지한다. */}
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

"use client";

import { useCallback, type CSSProperties } from "react";
import { Network, Waypoints } from "lucide-react";
import { Tooltip } from "@/shared/ui";
import type { TopologyAnalysisMode } from "../model/url-state";
import type { TopologyAnalysisSummary } from "../lib/topology-analysis";

interface TopologyAnalysisBarLabels {
  title: string;
  overview: string;
  graph: string;
  graphPrompt: string;
  metricNodes: string;
  metricRelations: string;
  overviewPrompt: string;
}

interface TopologyAnalysisBarProps {
  mode: TopologyAnalysisMode;
  summary: TopologyAnalysisSummary;
  rightPanelReserved?: boolean;
  leftPanelExpanded?: boolean;
  createPanelReserved?: boolean;
  labels: TopologyAnalysisBarLabels;
  onModeChange: (mode: TopologyAnalysisMode) => void;
}

// 2-뷰 레일 — 지도(Relief 계열 대표)와 그래프(살아있는 그래프)만 상위 뷰.
// 분석 패널 완전 소멸 2단계에서 focus(§a)/path(§b)/health(§c) 가 모두 이
// 레일에서 빠졌다 — focus 는 노드 데이터시트가 이미 커버해 이관 없이 제거,
// path 는 상단 중앙 상태 칩(`TopologyPathChip`)으로, health 는
// `/ontology/insights` 관계 탭의 수리 큐로 이동했다. 이 파일 자체도 §d 에서
// 완전 삭제된다 — 남은 2-tab 스위치는 우상단 유틸리티 레일의 단일 토글로
// 옮겨간다. URL 모드 계약(mode=focus/path/health)은 계속 보존된다(딥링크
// 호환) — 이 레일이 더 이상 그 값들을 그리지 않을 뿐이다.
const MODES = [
  { value: "overview", icon: Network, labelKey: "overview" },
  { value: "graph", icon: Waypoints, labelKey: "graph" },
] as const;

export function TopologyAnalysisBar({
  mode,
  summary,
  rightPanelReserved = false,
  leftPanelExpanded = false,
  createPanelReserved = false,
  labels,
  onModeChange,
}: TopologyAnalysisBarProps) {
  const panelMode = mode;
  const handleModeRailChange = useCallback(
    (nextMode: TopologyAnalysisMode) => {
      onModeChange(nextMode);
    },
    [onModeChange],
  );
  const headerAlignedPanel = panelMode === "overview";
  const prompt = panelMode === "graph" ? labels.graphPrompt : labels.overviewPrompt;

  const attentionRole = panelMode === "overview" ? "support" : "primary";
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
      panelMode === "graph"
        ? "var(--topology-panel-graph-width)"
        : headerAlignedPanel
        ? rightPanelReserved
          ? "var(--topology-panel-overview-reserved-width)"
          : "var(--topology-panel-overview-responsive-width)"
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
    panelMode === "overview"
      ? "overview-14-inch-compact"
      : panelMode === "graph"
        ? "graph-compact-rail"
        : headerAlignedPanel
          ? "header-aligned"
          : "mode-compact";

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
      data-panel-padding-token="--topology-panel-padding"
      data-panel-motion-token="--topology-motion-panel-duration"
      data-panel-width-contract={
        panelMode === "overview" ? "overview-support-max-360-phone-utility-reserve" : "standard"
      }
      data-panel-phone-utility-reserve-token={
        panelMode === "overview" ? "--topology-panel-phone-utility-rail-reserve" : undefined
      }
      data-panel-compact-scroll-end-reserve-token="--topology-analysis-panel-compact-scroll-end-reserve"
      data-overview-panel-compact-gap-token={
        panelMode === "overview" ? "--topology-overview-panel-compact-gap" : undefined
      }
      data-overview-panel-phone-max-height-token={
        panelMode === "overview" ? "--topology-overview-panel-phone-max-height" : undefined
      }
      data-right-panel-reserved={rightPanelReserved ? "true" : "false"}
      style={panelStyle}
      className={`topology-ui-scale pointer-events-auto absolute inset-x-3 border data-[analysis-mode=overview]:max-md:max-h-[var(--topology-overview-panel-phone-max-height)] data-[analysis-mode=overview]:max-md:overflow-y-auto data-[analysis-mode=overview]:lg:min-h-[390px] md:hidden lg:inset-x-auto lg:block lg:-translate-x-0 ${
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
        data-panel-body-scroll-end-reserve-token="--topology-analysis-panel-compact-scroll-end-reserve"
        className="flex flex-col gap-3 data-[analysis-body-mode=overview]:gap-[var(--topology-overview-panel-compact-gap)] max-md:max-h-[calc(100dvh-7rem-var(--topology-analysis-panel-compact-scroll-end-reserve))] max-md:overflow-y-auto max-md:overscroll-contain data-[analysis-body-mode=overview]:max-md:pb-[var(--topology-analysis-panel-compact-scroll-end-reserve)] max-md:pr-1"
        data-analysis-body-mode={panelMode}
      >
        <div
          className="flex w-full items-center gap-1 rounded-lg bg-[color:var(--topology-analysis-mode-rail-surface)] p-1"
          data-testid="topology-analysis-mode-rail"
          data-mode-rail-contract="two-view-tabs"
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
            const active = value === "graph" ? panelMode === "graph" : panelMode !== "graph";
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
              또 반복하면 "295·505 중복" 이 된다(디자인 가디언 verdict a6). */}
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
                {labels.metricNodes}
              </span>
              <span>
                <span className="text-[color:var(--topology-analysis-panel-metric-value-text)]">
                  {summary.secondaryMetric}
                </span>{" "}
                {labels.metricRelations}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

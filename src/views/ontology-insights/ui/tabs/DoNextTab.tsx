"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, FileText, GitBranch, MoreHorizontal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { OntologyHealthActionTarget } from "@/entities/knowledge-graph";
import type { DoNextQueue, DoNextRow } from "../../lib/do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "../../lib/dependency-cycles";
import type { DoNextReviewState } from "../../lib/review-loop";

/**
 * 탭1 "할 일" (S5, 전략 verdict B 채택) — 인사이트의 기본 탭. "무엇이
 * 있나"(재고)가 아니라 "그래서 뭘 해야 하나"에 답한다:
 *
 * 1. Agent readiness 계기 + 수리 큐 요약 — 관계 탭에서 이관 (행동 요소가
 *    재고 탭에 묻혀 있던 것이 "인사이트 부족" 체감의 원인).
 * 2. 행동 큐 — 방치된 허브(연결도×방치일) · 고아 · 승격 후보. 각 행에
 *    [지도에서 보기 · 빌더 열기 · 에이전트에게(행별 MCP 핸드오프 복사)].
 *
 * 자동화 계약: 정밀 순위(maintenance_plan)는 client 재구현하지 않는다 —
 * 사람은 여기서 고르고, 실행은 행별 핸드오프로 에이전트에게 넘긴다.
 */

export interface DoNextTabLabels {
  agentReadinessTitle: string;
  /** 준비도 밴드 제목 아래 평문 한 줄 — 전문용어(ready/preflight/review) 를 비전문가에게 풀어준다. 큐 힌트와 같은 슬롯 패턴. */
  agentReadinessHint?: string;
  agentReadinessReady: string;
  agentReadinessPreflight: string;
  agentReadinessReview: string;
  repairQueueTitle: string;
  repairQueueStale: string;
  repairQueueOrphan: string;
  repairQueuePromotion: string;
  repairQueueIsland: string;
  repairQueueMissingContainment: string;
  repairQueueEmpty: string;
  repairQueueActionKindStale: string;
  repairQueueActionKindOrphan: string;
  repairQueueActionKindPromotion: string;
  repairQueueActionKindIsland: string;
  repairQueueActionKindContainment: string;
  repairQueueOpenBuilder: string;
  repairQueueOpenOntology: string;
  queueTitle: string;
  sectionNeglectedHub: string;
  sectionOrphan: string;
  sectionPromotion: string;
  sectionCycle: string;
  /** 각 큐 섹션 헤더 아래 평문 한 줄 — "이게 왜 할 일인가"를 비전문가도 알게. */
  hintNeglectedHub: string;
  hintOrphan: string;
  hintPromotion: string;
  /** promotion 행 근거 수치 ("참조 {count}개"). */
  promotionMetric: (count: number) => string;
  /** 경로가 maxPathNodes 로 잘렸을 때 노드 생략 표기. */
  cycleMoreNodes: (count: number) => string;
  neglectedHubMetric: (degree: number, agoDays: number) => string;
  cycleMetric: (length: number) => string;
  openMap: string;
  openSource: string;
  openBuilder: string;
  handoffCopy: string;
  handoffCopied: string;
  emptyQueue: string;
  moreCount: (count: number) => string;
  digestTitle: string;
  digestToday: (count: number) => string;
  digestApproveHint: string;
  /** P4-② — why 행 앞에 붙는 prefix ("Why · "). */
  digestWhyPrefix: string;
  /** 상단 우선 검토 밴드 제목. */
  touchUpBandTitle: string;
  /** 완료 카운트가 아니라 현재 절단한 우선 검토 큐의 규모다. */
  touchUpPriorityCount: (count: number) => string;
  /** 시작과 완료를 혼동하지 않도록 명시하는 실제 작업 순서. */
  touchUpFlowHint: string;
  /** 케밥(더보기) 트리거 aria-label. */
  rowMenuTrigger: string;
  reviewChecking: (title: string | null) => string;
  reviewActive: (title: string | null) => string;
  reviewCleared: (title: string | null) => string;
  reviewUnverified: (title: string | null) => string;
}

/**
 * ③ 오늘의 손질 밴드 한 행. `pickTodaysTouchUps` 결과에 표시용 why 문구를
 * 입혀 상위에서 내려준다(순수 함수는 reason 만, 표면은 문구를 안다).
 */
export interface DoNextTouchUp {
  id: string;
  source: "cycle" | "neglected-hub" | "promotion";
  nodeId: string;
  title: string;
  nodeKind: string;
  /** "왜 뽑혔나" 한 줄 — 기존 파생값으로 조립된 표시 문구. */
  why: string;
  handoffPayload: string;
}

export interface DoNextTabAgentReadiness {
  ready: number;
  preflight: number;
  review: number;
}

export interface DoNextTabHealthQueue {
  staleCount: number;
  orphanCount: number;
  promotionCount: number;
  // C1 — CLI-parity signals (`ontology-atlas health`): disconnected actionable
  // islands · capability/element whose domain never links back.
  islandCount: number;
  missingContainmentCount: number;
  actionTarget: OntologyHealthActionTarget | null;
  builderHref: (slug: string) => string;
  ontologyHref: (slug: string) => string;
}

export interface DoNextTabProps {
  queue: DoNextQueue;
  /**
   * ③ 오늘의 손질 — 기존 큐/사이클에서 절단한 상위 3건. 빈 배열이면 밴드를
   * 렌더하지 않는다(콜드스타트 가드는 `pickTodaysTouchUps` 가 이미 적용). 기본
   * `[]` 라 밴드 없이도 동작한다.
   */
  touchUps?: DoNextTouchUp[];
  /** 의존 사이클(depends_on 방향 그래프의 순환). 사이클이 있을 때만 렌더. */
  cycles: DependencyCyclesResult;
  agentReadiness: DoNextTabAgentReadiness;
  healthQueue: DoNextTabHealthQueue;
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  /** 사이클 경로 노드 id → 표시 제목. */
  nodeTitle: (nodeId: string) => string;
  /** 사이클별 에이전트 핸드오프 페이로드(복사용). */
  cycleHandoff: (cycle: DependencyCycle) => string;
  /**
   * B3 — 로컬 감사 로그 다이제스트 (`.ontology-atlas/activity.jsonl` tail).
   * null 이면 카드 자체를 렌더하지 않는다 (static/dogfood 모드 — 로그 없음).
   * 자동화 계약: 에이전트가 실행, 사람은 git diff 로 승인 — 이 카드는
   * "한 일"의 보고이지 조작 화면이 아니다.
   */
  activityDigest: {
    todayCount: number;
    latest: ReadonlyArray<{ at: string; summary: string; agent: string | null; why?: string | null }>;
  } | null;
  labels: DoNextTabLabels;
}

function HandoffCopyButton({
  payload,
  labels,
  candidate,
  onReviewStart,
}: {
  payload: string;
  labels: DoNextTabLabels;
  candidate?: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-testid="do-next-handoff-copy"
      onClick={async () => {
        if (candidate) onReviewStart?.(candidate);
        if (await copyText(payload)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }
      }}
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
    >
      {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
      {copied ? labels.handoffCopied : labels.handoffCopy}
    </button>
  );
}

/**
 * ⑨.2 행 버튼 다이어트 — 주 액션(지도)만 밖에 두고 빌더·에이전트에게는 케밥
 * 안으로. 결정 포인트를 행당 3 → 1.5 로 줄인다. 별도 라이브러리 없이 손으로
 * 짠 접근 가능 메뉴(`TopologyV2ContextMenu` 와 같은 관례): 트리거는 버튼
 * (aria-haspopup/expanded), 바깥 클릭·Esc 로 닫고 Esc 는 트리거로 포커스 복귀.
 */
function RowActionMenu({
  sourceHref,
  builderHref,
  handoffPayload,
  candidate,
  onReviewStart,
  labels,
}: {
  sourceHref: string | null;
  builderHref: string;
  handoffPayload: string;
  candidate: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  labels: DoNextTabLabels;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const menuItemClass =
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-label text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="do-next-row-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.rowMenuTrigger}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          data-testid="do-next-row-menu-popover"
          className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col gap-0.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
        >
          {sourceHref ? (
            <Link
              href={sourceHref}
              role="menuitem"
              data-testid="do-next-row-menu-source"
              onClick={() => {
                onReviewStart?.(candidate);
                setOpen(false);
              }}
              className={menuItemClass}
            >
              <FileText size={13} aria-hidden />
              {labels.openSource}
            </Link>
          ) : null}
          <Link
            href={builderHref}
            role="menuitem"
            data-testid="do-next-row-menu-builder"
            onClick={() => {
              onReviewStart?.(candidate);
              setOpen(false);
            }}
            className={menuItemClass}
          >
            <GitBranch size={13} aria-hidden />
            {labels.openBuilder}
          </Link>
          <button
            type="button"
            role="menuitem"
            data-testid="do-next-row-menu-handoff"
            onClick={async () => {
              onReviewStart?.(candidate);
              if (await copyText(handoffPayload)) {
                setCopied(true);
                window.setTimeout(() => {
                  setCopied(false);
                  setOpen(false);
                }, 1000);
              }
            }}
            className={menuItemClass}
          >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied ? labels.handoffCopied : labels.handoffCopy}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * ③ 오늘의 손질 밴드 — 할 일 탭 상단. 기존 큐/사이클에서 절단된 3건을 "왜
 * 뽑혔나" 한 줄과 함께 보여주고, 주 액션(지도) + 케밥으로 행동을 좁힌다.
 * 지도 열기나 핸드오프 복사를 완료로 가장하지 않는다. 이 밴드는 우선순위를
 * 설명하고 실제 작업 순서만 연결하며, 완료의 진실원은 vault diff/검증이다.
 */
function TouchUpBand({
  items,
  mapHref,
  sourceHref,
  builderHref,
  reviewState,
  onReviewStart,
  registerReviewRow,
  labels,
}: {
  items: DoNextTouchUp[];
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  labels: DoNextTabLabels;
}) {
  return (
    <section
      aria-label={labels.touchUpBandTitle}
      data-testid="do-next-touchups"
      className="flex flex-col gap-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)]"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {labels.touchUpBandTitle}
        </span>
        <span
          data-testid="do-next-touchups-priority-count"
          className="ml-auto font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]"
        >
          {labels.touchUpPriorityCount(items.length)}
        </span>
      </div>
      <p
        data-testid="do-next-touchups-flow"
        className="text-label leading-snug text-[color:var(--color-text-quaternary)]"
      >
        {labels.touchUpFlowHint}
      </p>
      <div className="flex flex-col">
        {items.map((item) => {
          const candidate = { id: item.id, title: item.title };
          const active =
            reviewState?.phase === "active" && reviewState.id === item.id;
          return (
            <div
              key={item.id}
              ref={(element) => registerReviewRow?.(item.id, element)}
              data-testid="do-next-touchup-row"
              tabIndex={-1}
              aria-current={active ? "step" : undefined}
              className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
                active
                  ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
                  : ""
              }`}
            >
              {item.source === "cycle" ? (
                <AlertTriangle size={13} aria-hidden className="text-[color:var(--color-status-warning)]" />
              ) : (
                <TopologyV2KindGlyph kind={item.nodeKind} size={13} />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body text-[color:var(--color-text-secondary)]">
                  {item.title}
                </span>
                <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
                  {labels.digestWhyPrefix}
                  {item.why}
                </span>
              </div>
              <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
                <Link
                  href={mapHref(item.nodeId, item.id)}
                  onClick={() => onReviewStart?.(candidate)}
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.openMap}
                </Link>
                <RowActionMenu
                  sourceHref={sourceHref(item.nodeId, item.id)}
                  builderHref={builderHref(item.nodeId, item.id)}
                  handoffPayload={item.handoffPayload}
                  candidate={candidate}
                  onReviewStart={onReviewStart}
                  labels={labels}
                />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QueueSection({
  title,
  hint,
  rows,
  totalCount,
  metric,
  mapHref,
  sourceHref,
  builderHref,
  reviewState,
  onReviewStart,
  registerReviewRow,
  labels,
}: {
  title: string;
  /** 헤더 아래 평문 한 줄 — "왜 할 일인가"를 비전문가도 알게. */
  hint?: string;
  rows: DoNextRow[];
  totalCount: number;
  metric: (row: DoNextRow) => string | null;
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  labels: DoNextTabLabels;
}) {
  if (rows.length === 0) return null;
  const hiddenCount = Math.max(0, totalCount - rows.length);
  return (
    <section aria-label={title} className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-[color:var(--color-divider)] pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-body font-medium text-[color:var(--color-text-primary)]">{title}</span>
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
            {totalCount}
          </span>
        </div>
        {hint ? (
          <p className="text-label leading-snug text-[color:var(--color-text-quaternary)]">{hint}</p>
        ) : null}
      </div>
      {rows.map((row) => {
        const metricText = metric(row);
        const candidate = { id: row.id, title: row.title };
        const active =
          reviewState?.phase === "active" && reviewState.id === row.id;
        return (
          <div
            key={row.id}
            ref={(element) => registerReviewRow?.(row.id, element)}
            data-testid="do-next-row"
            tabIndex={-1}
            aria-current={active ? "step" : undefined}
            // 모바일(≤sm): 액션 3종이 한 줄에 안 들어가므로 타이틀 아래로
            // wrap (390px overflow-sweep 회귀 — 페이지 가로 스크롤 금지 계약).
            className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
              active
                ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
                : ""
            }`}
          >
            <TopologyV2KindGlyph kind={row.nodeKind} size={13} />
            <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-secondary)]">
              {row.title}
            </span>
            {metricText ? (
              <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
                {metricText}
              </span>
            ) : null}
            <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
              <Link
                href={mapHref(row.nodeId, row.id)}
                onClick={() => onReviewStart?.(candidate)}
                className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {labels.openMap}
              </Link>
              <RowActionMenu
                sourceHref={sourceHref(row.nodeId, row.id)}
                builderHref={builderHref(row.nodeId, row.id)}
                handoffPayload={row.handoffPayload}
                candidate={candidate}
                onReviewStart={onReviewStart}
                labels={labels}
              />
            </span>
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <p className="pt-2 text-label text-[color:var(--color-text-quaternary)]">{labels.moreCount(hiddenCount)}</p>
      ) : null}
    </section>
  );
}

/**
 * 의존 사이클 섹션 (전략 verdict B 후보 ④) — "구조적으로 위험한 순환이
 * 생겼나?". 각 행은 depends_on 방향 경로를 "A → B → C → A" 로 닫아 보여주고,
 * [지도](첫 노드 딥링크) + [에이전트에게](사이클 핸드오프 복사)를 준다.
 * 사이클이 하나도 없으면 렌더하지 않는다.
 */
function CycleSection({
  cycles,
  mapHref,
  nodeTitle,
  cycleHandoff,
  reviewState,
  onReviewStart,
  registerReviewRow,
  labels,
}: {
  cycles: DependencyCyclesResult;
  mapHref: (nodeId: string, reviewId?: string) => string;
  nodeTitle: (nodeId: string) => string;
  cycleHandoff: (cycle: DependencyCycle) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  labels: DoNextTabLabels;
}) {
  if (cycles.cycles.length === 0) return null;
  return (
    <section aria-label={labels.sectionCycle} data-testid="do-next-cycles" className="flex flex-col">
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] pb-2">
        <span className="flex items-center gap-1.5 text-body font-medium text-[color:var(--color-text-primary)]">
          <AlertTriangle size={12} aria-hidden className="text-[color:var(--color-status-warning)]" />
          {labels.sectionCycle}
        </span>
        <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {cycles.totalCycles}
        </span>
      </div>
      {cycles.cycles.map((cycle) => {
        const firstNodeId = cycle.nodeIds[0];
        const reviewId = `cycle:${cycle.id}`;
        const candidate = { id: reviewId, title: nodeTitle(firstNodeId) };
        const active =
          reviewState?.phase === "active" && reviewState.id === reviewId;
        return (
          <div
            key={cycle.id}
            ref={(element) => registerReviewRow?.(reviewId, element)}
            data-testid="do-next-cycle-row"
            tabIndex={-1}
            aria-current={active ? "step" : undefined}
            className={`flex min-w-0 items-center gap-2.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
              active
                ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
                : ""
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-body text-[color:var(--color-text-secondary)]">
              {cycle.nodeIds.map((nodeId, i) => (
                <span key={`${cycle.id}:${nodeId}:${i}`}>
                  {i > 0 ? <span className="text-[color:var(--color-text-quaternary)]"> → </span> : null}
                  {nodeTitle(nodeId)}
                </span>
              ))}
              {cycle.hiddenNodeCount > 0 ? (
                <span className="text-[color:var(--color-text-quaternary)]">
                  {" → "}
                  {labels.cycleMoreNodes(cycle.hiddenNodeCount)}
                </span>
              ) : null}
              <span className="text-[color:var(--color-text-quaternary)]"> → </span>
              {nodeTitle(firstNodeId)}
            </span>
            <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
              {labels.cycleMetric(cycle.length)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Link
                href={mapHref(firstNodeId, reviewId)}
                onClick={() => onReviewStart?.(candidate)}
                className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {labels.openMap}
              </Link>
              <HandoffCopyButton
                payload={cycleHandoff(cycle)}
                labels={labels}
                candidate={candidate}
                onReviewStart={onReviewStart}
              />
            </span>
          </div>
        );
      })}
      {cycles.hiddenCycles > 0 ? (
        <p className="pt-2 text-label text-[color:var(--color-text-quaternary)]">
          {labels.moreCount(cycles.hiddenCycles)}
        </p>
      ) : null}
    </section>
  );
}

export function DoNextTab({
  queue,
  touchUps = [],
  cycles,
  agentReadiness,
  healthQueue,
  mapHref,
  sourceHref,
  builderHref,
  nodeTitle,
  cycleHandoff,
  activityDigest,
  reviewState,
  onReviewStart,
  labels,
}: DoNextTabProps) {
  const reviewStatusRef = useRef<HTMLParagraphElement | null>(null);
  const reviewRowRefs = useRef(new Map<string, HTMLDivElement>());
  const lastFocusedReviewKeyRef = useRef<string | null>(null);
  const nextTouchUpId = touchUps[0]?.id;
  const reviewPhase = reviewState?.phase;
  const currentReviewId = reviewState?.id;
  const registerReviewRow = (
    id: string,
    element: HTMLDivElement | null,
  ) => {
    if (element) reviewRowRefs.current.set(id, element);
    else reviewRowRefs.current.delete(id);
  };
  useEffect(() => {
    if (!reviewPhase || !currentReviewId) return;
    const focusKey = `${currentReviewId}:${reviewPhase}`;
    if (lastFocusedReviewKeyRef.current === focusKey) return;
    lastFocusedReviewKeyRef.current = focusKey;
    if (reviewPhase === "active") {
      const activeRow = reviewRowRefs.current.get(currentReviewId);
      if (activeRow) activeRow.focus();
      else reviewStatusRef.current?.focus();
      return;
    }
    if (reviewPhase === "cleared") {
      if (nextTouchUpId) reviewRowRefs.current.get(nextTouchUpId)?.focus();
      else reviewStatusRef.current?.focus();
    }
  }, [currentReviewId, reviewPhase, nextTouchUpId]);

  const reviewStatus = reviewState
    ? reviewState.phase === "checking"
      ? labels.reviewChecking(reviewState.title)
      : reviewState.phase === "active"
        ? labels.reviewActive(reviewState.title)
        : reviewState.phase === "cleared"
          ? labels.reviewCleared(reviewState.title)
          : labels.reviewUnverified(reviewState.title)
    : null;
  const readinessTotal = agentReadiness.ready + agentReadiness.preflight + agentReadiness.review;
  const REPAIR_ACTION_KIND_LABELS: Record<OntologyHealthActionTarget["kind"], string> = {
    island: labels.repairQueueActionKindIsland,
    containment: labels.repairQueueActionKindContainment,
    stale: labels.repairQueueActionKindStale,
    orphan: labels.repairQueueActionKindOrphan,
    promotion: labels.repairQueueActionKindPromotion,
  };
  const repairActionKindLabel = healthQueue.actionTarget
    ? REPAIR_ACTION_KIND_LABELS[healthQueue.actionTarget.kind]
    : null;
  // ③↔큐 중복 제거 — "오늘의 손질" 밴드는 큐/사이클 상위에서 절단해 오므로
  // 큐 섹션 첫 행과 100% 겹친다(같은 방치 허브/고아/승격 후보). 밴드에 이미
  // 올라온 exact row id 를 큐 행에서 걸러 같은 항목이 위아래로 두 번 보이지 않게
  // 한다. 섹션 헤더 totalCount(queue.counts.*)와 "외 N개" 라인은 그대로 두어
  // 전체 규모는 보존한다(구조 필터일 뿐, 색/토큰 변경 없음).
  const bandIds = new Set(touchUps.map((item) => item.id));
  const neglectedRows = queue.rows.filter(
    (row) => row.rowKind === "neglected-hub" && !bandIds.has(row.id),
  );
  const orphanRows = queue.rows.filter(
    (row) => row.rowKind === "orphan" && !bandIds.has(row.id),
  );
  const promotionRows = queue.rows.filter(
    (row) => row.rowKind === "promotion" && !bandIds.has(row.id),
  );
  const visibleCycleRows = cycles.cycles.filter(
    (cycle) => !bandIds.has(`cycle:${cycle.id}`),
  );
  const removedVisibleCycleCount =
    cycles.cycles.length - visibleCycleRows.length;
  const visibleCycles: DependencyCyclesResult = {
    ...cycles,
    cycles: visibleCycleRows,
    totalCycles: Math.max(0, cycles.totalCycles - removedVisibleCycleCount),
  };
  const hasCycles = visibleCycles.cycles.length > 0;
  const queueEmpty = queue.rows.length === 0 && !hasCycles;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      {reviewStatus ? (
        <p
          ref={reviewStatusRef}
          data-testid="do-next-review-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          tabIndex={-1}
          className="rounded-md border border-[color:var(--color-border-soft)] px-3 py-2 text-label text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)]"
        >
          {reviewStatus}
        </p>
      ) : null}
      {touchUps.length > 0 ? (
        <TouchUpBand
          items={touchUps}
          mapHref={mapHref}
          sourceHref={sourceHref}
          builderHref={builderHref}
          reviewState={reviewState}
          onReviewStart={onReviewStart}
          registerReviewRow={registerReviewRow}
          labels={labels}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      {/* 상태 밴드 — 에이전트 준비도 + 수리 큐를 상단 풀폭 2열 요약으로.
          이전엔 큐 옆 세로 카드(self-start)라 큐가 길면 우측 아래로 거대한
          빈 여백이 생겼다(Guardian 관찰). 상단 밴드로 올려 여백을 없애고
          "전체 상태 → 지금 할 일" 순으로 읽히게 한다. */}
      <section
        aria-label={labels.agentReadinessTitle}
        className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <div
            aria-label={`${labels.agentReadinessTitle}: ${agentReadiness.ready} ${labels.agentReadinessReady} · ${agentReadiness.preflight} ${labels.agentReadinessPreflight} · ${agentReadiness.review} ${labels.agentReadinessReview}`}
            data-testid="insights-agent-readiness"
            className="min-w-0"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
              <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                {labels.agentReadinessTitle}
              </span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)] sm:ml-auto">
                <span
                  className={
                    agentReadiness.ready === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {agentReadiness.ready}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.agentReadinessReady}
                  </span>
                </span>
                <span
                  className={
                    agentReadiness.preflight === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {agentReadiness.preflight}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.agentReadinessPreflight}
                  </span>
                </span>
                <span
                  className={
                    agentReadiness.review === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {agentReadiness.review}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.agentReadinessReview}
                  </span>
                </span>
              </span>
            </div>
            {labels.agentReadinessHint ? (
              <p className="mt-1 text-label leading-snug text-[color:var(--color-text-quaternary)]">
                {labels.agentReadinessHint}
              </p>
            ) : null}
            <div
              data-testid="insights-agent-readiness-meter"
              className="mt-2 flex h-2 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)]"
            >
              <span
                aria-hidden
                className="bg-[color:var(--color-indigo-a58)]"
                style={{ flexGrow: readinessTotal > 0 ? agentReadiness.ready : 1 }}
              />
              <span
                aria-hidden
                className="bg-[color:var(--color-status-warning)]"
                style={{ flexGrow: readinessTotal > 0 ? agentReadiness.preflight : 0 }}
              />
              <span
                aria-hidden
                className="bg-[color:var(--color-status-danger)]"
                style={{ flexGrow: readinessTotal > 0 ? agentReadiness.review : 0 }}
              />
            </div>
          </div>
          <div
            data-testid="insights-repair-queue"
            className="sm:border-l sm:border-[color:var(--color-divider)] sm:pl-8"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                {labels.repairQueueTitle}
              </span>
              <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                <span
                  className={
                    healthQueue.staleCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.staleCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueStale}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.orphanCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.orphanCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueOrphan}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.promotionCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.promotionCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueuePromotion}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.islandCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.islandCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueIsland}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.missingContainmentCount === 0
                      ? "text-[color:var(--color-text-quaternary)]"
                      : undefined
                  }
                >
                  {healthQueue.missingContainmentCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueMissingContainment}
                  </span>
                </span>
              </span>
            </div>
            {healthQueue.actionTarget ? (
              <div
                data-testid="insights-repair-queue-target"
                className="mt-2.5 flex min-w-0 items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-body text-[color:var(--color-text-secondary)]">
                  {repairActionKindLabel ? (
                    <span className="shrink-0 rounded border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 text-caption leading-none text-[color:var(--color-text-tertiary)]">
                      {repairActionKindLabel}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate">{healthQueue.actionTarget.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Link
                    href={healthQueue.builderHref(healthQueue.actionTarget.slug)}
                    data-testid="insights-repair-queue-builder-link"
                    className="inline-flex min-h-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-label font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                  >
                    {labels.repairQueueOpenBuilder}
                  </Link>
                  <Link
                    href={healthQueue.ontologyHref(healthQueue.actionTarget.slug)}
                    className="inline-flex min-h-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                  >
                    {labels.repairQueueOpenOntology}
                  </Link>
                </span>
              </div>
            ) : (
              <p className="mt-2 text-body text-[color:var(--color-text-quaternary)]">{labels.repairQueueEmpty}</p>
            )}
          </div>
        </div>
        {activityDigest && activityDigest.latest.length > 0 ? (
          <div
            data-testid="insights-activity-digest"
            className="mt-5 border-t border-[color:var(--color-divider)] pt-4"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                {labels.digestTitle}
              </span>
              <span className="ml-auto font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                {labels.digestToday(activityDigest.todayCount)}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {activityDigest.latest.map((entry, index) => (
                <div key={`${entry.at}-${index}`} data-testid="do-next-digest-entry">
                  <p className="truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
                    {entry.summary}
                    {entry.agent ? (
                      <span className="text-[color:var(--color-text-quaternary)]"> · {entry.agent}</span>
                    ) : null}
                  </p>
                  {entry.why ? (
                    <p
                      data-testid="do-next-digest-why"
                      className="truncate font-mono text-label italic text-[color:var(--color-text-quaternary)]"
                    >
                      {labels.digestWhyPrefix}
                      {entry.why}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">{labels.digestApproveHint}</p>
          </div>
        ) : null}
      </section>

      <section
        aria-label={labels.queueTitle}
        // 섹션 간 갭 16px 는 행 피치(~53px)보다 약해 다음 섹션 헤딩이 위
        // 목록에 붙어 읽혔다(게슈탈트 근접성 역전) — 24px 로 섹션 경계를
        // 행 간격 위로 올린다.
        className="flex min-h-0 min-w-0 flex-col gap-6 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {labels.queueTitle}
        </span>
        {queueEmpty ? (
          <p className="text-body text-[color:var(--color-text-quaternary)]">{labels.emptyQueue}</p>
        ) : (
          <>
            <QueueSection
              title={labels.sectionNeglectedHub}
              hint={labels.hintNeglectedHub}
              rows={neglectedRows}
              totalCount={queue.counts.neglectedHub}
              metric={(row) =>
                row.degree !== undefined && row.agoDays !== undefined
                  ? labels.neglectedHubMetric(row.degree, row.agoDays)
                  : null
              }
              mapHref={mapHref}
              sourceHref={sourceHref}
              builderHref={builderHref}
              reviewState={reviewState}
              onReviewStart={onReviewStart}
              registerReviewRow={registerReviewRow}
              labels={labels}
            />
            <QueueSection
              title={labels.sectionOrphan}
              hint={labels.hintOrphan}
              rows={orphanRows}
              totalCount={queue.counts.orphan}
              metric={() => null}
              mapHref={mapHref}
              sourceHref={sourceHref}
              builderHref={builderHref}
              reviewState={reviewState}
              onReviewStart={onReviewStart}
              registerReviewRow={registerReviewRow}
              labels={labels}
            />
            <QueueSection
              title={labels.sectionPromotion}
              hint={labels.hintPromotion}
              rows={promotionRows}
              totalCount={queue.counts.promotion}
              metric={(row) =>
                row.degree !== undefined ? labels.promotionMetric(row.degree) : null
              }
              mapHref={mapHref}
              sourceHref={sourceHref}
              builderHref={builderHref}
              reviewState={reviewState}
              onReviewStart={onReviewStart}
              registerReviewRow={registerReviewRow}
              labels={labels}
            />
            <CycleSection
              cycles={visibleCycles}
              mapHref={mapHref}
              nodeTitle={nodeTitle}
              cycleHandoff={cycleHandoff}
              reviewState={reviewState}
              onReviewStart={onReviewStart}
              registerReviewRow={registerReviewRow}
              labels={labels}
            />
          </>
        )}
      </section>
      </div>
    </div>
  );
}

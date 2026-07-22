"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, GitBranch, MoreHorizontal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { cn } from "@/shared/lib/cn";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { OntologyHealthActionTarget } from "@/entities/knowledge-graph";
import type { DoNextQueue, DoNextRow } from "../../lib/do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "../../lib/dependency-cycles";

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
  agentReadinessReady: string;
  agentReadinessPreflight: string;
  agentReadinessReview: string;
  repairQueueTitle: string;
  repairQueueStale: string;
  repairQueueOrphan: string;
  repairQueuePromotion: string;
  repairQueueEmpty: string;
  repairQueueActionKindStale: string;
  repairQueueActionKindOrphan: string;
  repairQueueActionKindPromotion: string;
  repairQueueOpenBuilder: string;
  repairQueueOpenOntology: string;
  queueTitle: string;
  sectionNeglectedHub: string;
  sectionOrphan: string;
  sectionPromotion: string;
  sectionCycle: string;
  /** 경로가 maxPathNodes 로 잘렸을 때 노드 생략 표기. */
  cycleMoreNodes: (count: number) => string;
  neglectedHubMetric: (degree: number, agoDays: number) => string;
  cycleMetric: (length: number) => string;
  openMap: string;
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
  /** ③ 오늘의 손질 밴드 제목. */
  touchUpBandTitle: string;
  /** 밴드 남은 건수 배지 ("{count} left"). */
  touchUpRemaining: (count: number) => string;
  /** 밴드 전건 완료 시 조용한 마감 한 줄. */
  touchUpAllDone: string;
  /** 완료 행 표기 ("손봤어요"). */
  touchUpDone: string;
  /** 케밥(더보기) 트리거 aria-label. */
  rowMenuTrigger: string;
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
  mapHref: (nodeId: string) => string;
  builderHref: (nodeId: string) => string;
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

function HandoffCopyButton({ payload, labels }: { payload: string; labels: DoNextTabLabels }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-testid="do-next-handoff-copy"
      onClick={async () => {
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
 * ③.2 완료 피드백 — 세션 한정. 밴드 행의 액션(지도/빌더/에이전트에게)을 쓰면
 * 그 행 id 를 `sessionStorage` 에 담아, 지도/빌더로 이동했다 돌아와도(=페이지
 * 재마운트) 완료 표기가 유지된다. localStorage 가 아니라 sessionStorage 라
 * 탭을 닫으면 사라진다(세션 한정) — vault 진실원과 무관한 순수 UI 상태다.
 * 배지/포인트는 만들지 않는다.
 */
const TOUCH_UP_DONE_SESSION_KEY = "ontology-insights:touchups-done";

function readDoneSession(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(TOUCH_UP_DONE_SESSION_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeDoneSession(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TOUCH_UP_DONE_SESSION_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode / storage disabled — 완료 표기는 best-effort */
  }
}

function useTouchUpCompletions() {
  const [done, setDone] = useState<Set<string>>(() => readDoneSession());
  const markDone = useCallback((id: string) => {
    setDone((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      writeDoneSession(next);
      return next;
    });
  }, []);
  return { done, markDone };
}

/**
 * ⑨.2 행 버튼 다이어트 — 주 액션(지도)만 밖에 두고 빌더·에이전트에게는 케밥
 * 안으로. 결정 포인트를 행당 3 → 1.5 로 줄인다. 별도 라이브러리 없이 손으로
 * 짠 접근 가능 메뉴(`TopologyV2ContextMenu` 와 같은 관례): 트리거는 버튼
 * (aria-haspopup/expanded), 바깥 클릭·Esc 로 닫고 Esc 는 트리거로 포커스 복귀.
 */
function RowActionMenu({
  builderHref,
  handoffPayload,
  onActionUsed,
  labels,
}: {
  builderHref: string;
  handoffPayload: string;
  /** 밴드 행에서만 넘긴다 — 액션 사용 시 완료 표기. */
  onActionUsed?: () => void;
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
          <Link
            href={builderHref}
            role="menuitem"
            data-testid="do-next-row-menu-builder"
            onClick={() => {
              setOpen(false);
              onActionUsed?.();
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
              if (await copyText(handoffPayload)) {
                setCopied(true);
                onActionUsed?.();
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
 * 액션을 쓰면 세션 한정 완료 표기가 붙고 남은 카운트가 줄어든다(diegetic —
 * 그래프가 그만큼 정돈됐다는 사실만, 배지/포인트 없음).
 */
function TouchUpBand({
  items,
  mapHref,
  builderHref,
  labels,
}: {
  items: DoNextTouchUp[];
  mapHref: (nodeId: string) => string;
  builderHref: (nodeId: string) => string;
  labels: DoNextTabLabels;
}) {
  const { done, markDone } = useTouchUpCompletions();
  const doneCount = items.reduce((count, item) => (done.has(item.id) ? count + 1 : count), 0);
  const remaining = items.length - doneCount;
  const allDone = remaining <= 0;

  return (
    <section
      aria-label={labels.touchUpBandTitle}
      data-testid="do-next-touchups"
      className="flex flex-col gap-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {labels.touchUpBandTitle}
        </span>
        {!allDone ? (
          <span
            data-testid="do-next-touchups-remaining"
            className="ml-auto font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]"
          >
            {labels.touchUpRemaining(remaining)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col">
        {items.map((item) => {
          const isDone = done.has(item.id);
          return (
            <div
              key={item.id}
              data-testid="do-next-touchup-row"
              className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 last:border-b-0"
            >
              {item.source === "cycle" ? (
                <AlertTriangle size={13} aria-hidden className="text-[color:var(--color-status-warning)]" />
              ) : (
                <TopologyV2KindGlyph kind={item.nodeKind} size={13} />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "truncate text-body",
                    isDone
                      ? "text-[color:var(--color-text-quaternary)]"
                      : "text-[color:var(--color-text-secondary)]",
                  )}
                >
                  {item.title}
                </span>
                <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
                  {labels.digestWhyPrefix}
                  {item.why}
                </span>
              </div>
              {isDone ? (
                <span
                  data-testid="do-next-touchup-done"
                  className="flex shrink-0 items-center gap-1 text-label text-[color:var(--color-status-success)]"
                >
                  <Check size={12} aria-hidden />
                  {labels.touchUpDone}
                </span>
              ) : (
                <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
                  <Link
                    href={mapHref(item.nodeId)}
                    onClick={() => markDone(item.id)}
                    className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                  >
                    {labels.openMap}
                  </Link>
                  <RowActionMenu
                    builderHref={builderHref(item.nodeId)}
                    handoffPayload={item.handoffPayload}
                    onActionUsed={() => markDone(item.id)}
                    labels={labels}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {allDone ? (
        <p data-testid="do-next-touchups-alldone" className="text-label text-[color:var(--color-text-tertiary)]">
          {labels.touchUpAllDone}
        </p>
      ) : null}
    </section>
  );
}

function QueueSection({
  title,
  rows,
  totalCount,
  metric,
  mapHref,
  builderHref,
  labels,
}: {
  title: string;
  rows: DoNextRow[];
  totalCount: number;
  metric: (row: DoNextRow) => string | null;
  mapHref: (nodeId: string) => string;
  builderHref: (nodeId: string) => string;
  labels: DoNextTabLabels;
}) {
  if (rows.length === 0) return null;
  const hiddenCount = Math.max(0, totalCount - rows.length);
  return (
    <section aria-label={title} className="flex flex-col">
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] pb-2">
        <span className="text-body font-medium text-[color:var(--color-text-primary)]">{title}</span>
        <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {totalCount}
        </span>
      </div>
      {rows.map((row) => {
        const metricText = metric(row);
        return (
          <div
            key={row.id}
            data-testid="do-next-row"
            // 모바일(≤sm): 액션 3종이 한 줄에 안 들어가므로 타이틀 아래로
            // wrap (390px overflow-sweep 회귀 — 페이지 가로 스크롤 금지 계약).
            className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 last:border-b-0"
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
                href={mapHref(row.nodeId)}
                className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {labels.openMap}
              </Link>
              <RowActionMenu
                builderHref={builderHref(row.nodeId)}
                handoffPayload={row.handoffPayload}
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
  labels,
}: {
  cycles: DependencyCyclesResult;
  mapHref: (nodeId: string) => string;
  nodeTitle: (nodeId: string) => string;
  cycleHandoff: (cycle: DependencyCycle) => string;
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
        return (
          <div
            key={cycle.id}
            data-testid="do-next-cycle-row"
            className="flex min-w-0 items-center gap-2.5 border-b border-[color:var(--color-divider)] py-2.5 last:border-b-0"
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
                href={mapHref(firstNodeId)}
                className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {labels.openMap}
              </Link>
              <HandoffCopyButton payload={cycleHandoff(cycle)} labels={labels} />
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
  builderHref,
  nodeTitle,
  cycleHandoff,
  activityDigest,
  labels,
}: DoNextTabProps) {
  const readinessTotal = agentReadiness.ready + agentReadiness.preflight + agentReadiness.review;
  const repairActionKindLabel = healthQueue.actionTarget
    ? healthQueue.actionTarget.kind === "stale"
      ? labels.repairQueueActionKindStale
      : healthQueue.actionTarget.kind === "orphan"
        ? labels.repairQueueActionKindOrphan
        : labels.repairQueueActionKindPromotion
    : null;
  const neglectedRows = queue.rows.filter((row) => row.rowKind === "neglected-hub");
  const orphanRows = queue.rows.filter((row) => row.rowKind === "orphan");
  const promotionRows = queue.rows.filter((row) => row.rowKind === "promotion");
  const hasCycles = cycles.cycles.length > 0;
  const queueEmpty = queue.rows.length === 0 && !hasCycles;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      {touchUps.length > 0 ? (
        <TouchUpBand items={touchUps} mapHref={mapHref} builderHref={builderHref} labels={labels} />
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-[1.2fr_1fr]">
      <section
        aria-label={labels.queueTitle}
        className="flex min-h-0 min-w-0 flex-col gap-4 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
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
              rows={neglectedRows}
              totalCount={queue.counts.neglectedHub}
              metric={(row) =>
                row.degree !== undefined && row.agoDays !== undefined
                  ? labels.neglectedHubMetric(row.degree, row.agoDays)
                  : null
              }
              mapHref={mapHref}
              builderHref={builderHref}
              labels={labels}
            />
            <QueueSection
              title={labels.sectionOrphan}
              rows={orphanRows}
              totalCount={queue.counts.orphan}
              metric={() => null}
              mapHref={mapHref}
              builderHref={builderHref}
              labels={labels}
            />
            <QueueSection
              title={labels.sectionPromotion}
              rows={promotionRows}
              totalCount={queue.counts.promotion}
              metric={() => null}
              mapHref={mapHref}
              builderHref={builderHref}
              labels={labels}
            />
            <CycleSection
              cycles={cycles}
              mapHref={mapHref}
              nodeTitle={nodeTitle}
              cycleHandoff={cycleHandoff}
              labels={labels}
            />
          </>
        )}
      </section>

      <section
        aria-label={labels.agentReadinessTitle}
        // Guardian 관찰 — 수리 큐가 얕을 때 카드가 좌측 큐 높이까지 늘어나
        // 빈 여백으로 읽혔다: 내용 높이만큼만 (lg 그리드에서 self-start).
        className="flex min-h-0 min-w-0 flex-col self-start rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div
          aria-label={`${labels.agentReadinessTitle}: ${agentReadiness.ready} ${labels.agentReadinessReady} · ${agentReadiness.preflight} ${labels.agentReadinessPreflight} · ${agentReadiness.review} ${labels.agentReadinessReview}`}
          data-testid="insights-agent-readiness"
          className="mb-3.5 border-b border-[color:var(--color-divider)] pb-3.5"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.agentReadinessTitle}
            </span>
            <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
              <span>
                {agentReadiness.ready}{" "}
                <span className="text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.agentReadinessReady}
                </span>
              </span>
              <span>
                {agentReadiness.preflight}{" "}
                <span className="text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.agentReadinessPreflight}
                </span>
              </span>
              <span>
                {agentReadiness.review}{" "}
                <span className="text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.agentReadinessReview}
                </span>
              </span>
            </span>
          </div>
          <div
            data-testid="insights-agent-readiness-meter"
            className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)]"
          >
            <span
              aria-hidden
              className="bg-[color:var(--topology-overview-readiness-ready-meter,var(--color-overlay-3))]"
              style={{ flexGrow: readinessTotal > 0 ? agentReadiness.ready : 1 }}
            />
            <span
              aria-hidden
              className="bg-[color:var(--topology-overview-readiness-preflight-meter,var(--color-status-warning))]"
              style={{ flexGrow: readinessTotal > 0 ? agentReadiness.preflight : 0 }}
            />
            <span
              aria-hidden
              className="bg-[color:var(--topology-overview-readiness-review-meter,var(--color-status-danger))]"
              style={{ flexGrow: readinessTotal > 0 ? agentReadiness.review : 0 }}
            />
          </div>
        </div>
        <div data-testid="insights-repair-queue">
          <div className="flex items-baseline gap-2">
            <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.repairQueueTitle}
            </span>
            <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
              <span>
                {healthQueue.staleCount}{" "}
                <span className="text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueueStale}
                </span>
              </span>
              <span>
                {healthQueue.orphanCount}{" "}
                <span className="text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueueOrphan}
                </span>
              </span>
              <span>
                {healthQueue.promotionCount}{" "}
                <span className="text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueuePromotion}
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
        {activityDigest && activityDigest.latest.length > 0 ? (
          <div
            data-testid="insights-activity-digest"
            className="mt-3.5 border-t border-[color:var(--color-divider)] pt-3.5"
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
                  {/* P4-② — add_relation 의 --why 근거. 저장은 이미 되고 있었지만
                      (relation_notes frontmatter) 어떤 화면에도 안 보였다. 이 카드가
                      감사 로그 요약을 그대로 보여주는 표면이니 여기 truncate 로
                      같이 노출한다. */}
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
      </div>
    </div>
  );
}

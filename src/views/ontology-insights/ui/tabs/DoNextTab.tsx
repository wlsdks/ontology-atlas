"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EvidenceOnlyBadge } from "@/shared/ui/evidence-only-badge";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { OntologyHealthActionTarget } from "@/entities/knowledge-graph";
import type { DoNextQueue, DoNextRow } from "../../lib/do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "../../lib/dependency-cycles";
import type { DuplicatePairRow } from "../../lib/duplicate-pairs";
import type { DoNextReviewState } from "../../lib/review-loop";
import type { DomainChoice, MeaningGapRow } from "../../lib/meaning-gap-rows";
import {
  queueGroupOrder,
  queueGroupOrderKey,
  sumQueueGroupCounts,
  type QueueWorkGroup,
} from "../../lib/queue-work-groups";
import {
  HandoffCopyButton,
  RowActionMenu,
  type QueueRowAbilities,
  type QueueRowActionLabels,
} from "../parts/QueueRowActions";
import { MeaningGapSection, type MeaningGapLabels } from "./MeaningGapSection";

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

export interface DoNextTabLabels extends QueueRowActionLabels {
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
  sectionDuplicate: string;
  /** 중복 섹션의 평문 한 줄 — "왜 지금 손봐야 하나". */
  hintDuplicate: string;
  /** 두 이름이 얼마나 겹치는지 ("겹침 79%"). */
  duplicateMetric: (percent: number) => string;
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
  emptyQueue: string;
  /**
   * 「내 몫 / 넘길 몫」 묶음 머리 — 같은 데이터를 사람의 언어 순서로 세운다.
   * 쓰기 가능한 세션과 읽기 전용 세션이 서로 다른 문장을 쓴다(전자는 "지금
   * 바로", 후자는 "무엇을 하면 고칠 수 있는지").
   */
  groupMeaningTitle: string;
  groupMeaningTitleReadOnly: string;
  groupMeaningHint: string;
  groupMeaningHintReadOnly: string;
  groupCodeTitle: string;
  groupCodeHint: string;
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
  reviewChecking: (title: string | null) => string;
  reviewActive: (title: string | null) => string;
  reviewCleared: (title: string | null) => string;
  reviewUnverified: (title: string | null) => string;
  /**
   * 근거 계층 배지 — 「연결」 탭 랭킹·허브와 **같은 i18n 키**에서 온다.
   * 같은 사실을 표면마다 다른 말로 부르면 사용자는 두 사실로 읽는다.
   */
  evidenceBadge: string;
  evidenceBadgeHint: string;
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
  /**
   * 중복 의심 쌍 — 표시 상한까지 자른 목록. 빈 배열이면 섹션을 렌더하지 않는다.
   * 유사도는 MCP `similar_nodes` 와 같은 계산이라 화면과 에이전트가 같은 쌍을
   * 지목한다(`tests/contract/duplicate-pairs.contract.test.ts`).
   */
  duplicates?: DuplicatePairRow[];
  /** 임계값을 넘은 전체 쌍 수 — 절단 전 규모. */
  duplicateTotal?: number;
  /** 쌍별 인계 — `merge_concepts` dry-run 부터 시작하는 문장. */
  duplicateHandoff?: (row: DuplicatePairRow) => string;
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
  /**
   * 이 세션이 지금 할 수 있는 일 — 묶음 순서와 행동 라벨의 유일한 입력.
   * 역할이 아니라 능력이다(`session-abilities.ts`). 기본값은 아무것도 못 하는
   * 쪽이라, 넘기지 않는 호출부(테스트 등)에서 폼이 저절로 열리지 않는다.
   */
  abilities?: QueueRowAbilities;
  /**
   * 「한 문장으로 끝나는 일」 — 정의 없음 · 소속 미정. 볼트 문서 사실이 있어야
   * 계산되므로 optional 이다(넘기지 않으면 섹션 자체가 없다).
   */
  meaningGaps?: {
    definitionRows: MeaningGapRow[];
    domainRows: MeaningGapRow[];
    counts: { missingDefinition: number; missingDomain: number };
    domainChoices: DomainChoice[];
    onWrite: (row: MeaningGapRow, value: string) => Promise<void>;
    definitionLabels: MeaningGapLabels;
    domainLabels: MeaningGapLabels;
  } | null;
  labels: DoNextTabLabels;
}

/**
 * 묶음 머리 — 「내 몫 먼저」의 얼굴. 섹션 헤더(질문)보다 한 단 위의 잉크로
 * 그려 세 단(카드 → 묶음 → 섹션)이 아니라 두 단으로 읽히게 한다: 큐 카드의
 * 제목은 이제 이 머리들이 대신하므로 따로 그리지 않는다(같은 자리에 "지금"
 * 이 두 번 나오지 않게).
 */
function WorkGroupHeading({
  title,
  count,
  hint,
  testId,
}: {
  title: string;
  count: number;
  hint: string;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {title}
        </span>
        <span
          data-testid={`${testId}-count`}
          className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]"
        >
          {count}
        </span>
      </div>
      <p className="text-label leading-snug text-[color:var(--color-text-quaternary)]">{hint}</p>
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
  abilities,
  labels,
}: {
  items: DoNextTouchUp[];
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  abilities: QueueRowAbilities;
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
                  abilities={abilities}
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
  abilities,
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
  abilities: QueueRowAbilities;
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
            {/* 이름과 배지를 한 묶음으로 묶는다 — 이름만 줄어들고 배지는
                제자리를 지켜야 좁은 폭에서 배지가 다음 줄로 떨어져 행 높이를
                흔드는 일이 없다(치수 규칙성). */}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                {row.title}
              </span>
              {row.evidenceOnly ? (
                <EvidenceOnlyBadge
                  label={labels.evidenceBadge}
                  hint={labels.evidenceBadgeHint}
                />
              ) : null}
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
                abilities={abilities}
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
 * 「비슷한 이름 — 같은 걸까요?」 — 중복은 자라는 폴더의 1번 고장이고, 고치는
 * 값이 가장 싼 할 일이다(문서 둘을 하나로 접으면 끝). 그래서 큐 카드의 첫
 * 섹션으로 둔다.
 *
 * 행은 한 줄로 눌러 앉혔다 — 이 탭은 이미 뷰포트 1.2배라, 새 섹션이 다른
 * 할 일을 화면 밖으로 밀어내면 "지금 뭘 손보나"에 답하는 탭이 아니게 된다.
 * 판단에 필요한 사실(두 이름 · 겹치는 낱말 · 겹침 비율)은 한 줄 안에 다 있고,
 * 합칠지 말지는 사람이 정한다 — 화면은 미리보기(dry-run)까지만 넘긴다.
 *
 * 한 쌍도 없으면 섹션을 아예 그리지 않는다. "중복 0건" 성공 카드는 잉크만
 * 쓰고 아무 결정도 돕지 않는다.
 */
function DuplicateSection({
  rows,
  totalCount,
  mapHref,
  handoff,
  abilities,
  labels,
}: {
  rows: DuplicatePairRow[];
  totalCount: number;
  mapHref: (nodeId: string) => string;
  handoff: (row: DuplicatePairRow) => string;
  abilities: QueueRowAbilities;
  labels: DoNextTabLabels;
}) {
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={labels.sectionDuplicate}
      data-testid="do-next-duplicates"
      className="flex flex-col"
    >
      <div className="flex flex-col gap-1 border-b border-[color:var(--color-divider)] pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-body font-medium text-[color:var(--color-text-primary)]">
            {labels.sectionDuplicate}
          </span>
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
            {totalCount}
          </span>
        </div>
        <p className="text-label leading-snug text-[color:var(--color-text-quaternary)]">
          {labels.hintDuplicate}
        </p>
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          data-testid="do-next-duplicate-row"
          className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-[color:var(--color-divider)] py-1 last:border-b-0"
        >
          <TopologyV2KindGlyph kind={row.kind ?? "unknown"} size={13} />
          <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-secondary)]">
            {row.keepTitle}
            <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">↔</span>
            {row.dissolveTitle}
          </span>
          {row.sharedTokens.length > 0 ? (
            <span className="hidden shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)] lg:inline">
              {row.sharedTokens.slice(0, 3).join(" · ")}
            </span>
          ) : null}
          <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
            {labels.duplicateMetric(Math.round(row.score * 100))}
          </span>
          <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
            <Link
              href={mapHref(row.keepId)}
              className="inline-flex min-h-7 items-center rounded-md border border-[color:var(--color-border-soft)] px-2 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {labels.openMap}
            </Link>
            <HandoffCopyButton
              payload={handoff(row)}
              labels={labels}
              abilities={abilities}
              compact
            />
          </span>
        </div>
      ))}
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
  abilities,
  labels,
}: {
  cycles: DependencyCyclesResult;
  mapHref: (nodeId: string, reviewId?: string) => string;
  nodeTitle: (nodeId: string) => string;
  cycleHandoff: (cycle: DependencyCycle) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  abilities: QueueRowAbilities;
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
                abilities={abilities}
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
  duplicates = [],
  duplicateTotal = 0,
  duplicateHandoff,
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
  abilities = { canWriteVault: false, agentObserved: false },
  meaningGaps = null,
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
  // #63 — "지금은 손볼 것이 없어요 — 그래프가 건강합니다" 는 CLI-parity 신호
  // (분리된 섬 · 누락된 연결)까지 0일 때만 나온다. 예전엔 do-next 행만 보고
  // 단정해서, 바로 아래 수리 큐가 `누락된 연결 1` 을 보여주는 화면에서도
  // "건강합니다" 라고 말했다 (opus5 검수 실측 모순).
  const hasClipParityIssues =
    healthQueue.islandCount > 0 || healthQueue.missingContainmentCount > 0;
  // 중복 의심 쌍도 손볼 일이다 — 그 쌍이 남아 있는데 "손볼 것이 없어요" 라고
  // 말하면 바로 아래 섹션과 모순된다(#63 단일 판정과 같은 규율).
  const hasDuplicates = duplicates.length > 0;
  // 의미 공백(정의 없음 · 소속 미정)도 손볼 일이다 — 아래 섹션이 그 행을
  // 보여주는데 "손볼 것이 없어요" 라고 말하면 같은 카드가 자기모순에 빠진다.
  const meaningGapTotal =
    (meaningGaps?.counts.missingDefinition ?? 0) + (meaningGaps?.counts.missingDomain ?? 0);
  const queueEmpty =
    queue.rows.length === 0 &&
    !hasCycles &&
    !hasClipParityIssues &&
    !hasDuplicates &&
    meaningGapTotal === 0;

  // 묶음 규모 — 섹션 헤더가 이미 찍는 총계(절단 전)를 그대로 더한다.
  const groupCounts = sumQueueGroupCounts([
    { section: "missing-definition", total: meaningGaps?.counts.missingDefinition ?? 0 },
    { section: "missing-domain", total: meaningGaps?.counts.missingDomain ?? 0 },
    { section: "duplicate", total: duplicateTotal },
    { section: "promotion", total: queue.counts.promotion },
    { section: "neglected-hub", total: queue.counts.neglectedHub },
    { section: "orphan", total: queue.counts.orphan },
    { section: "cycle", total: visibleCycles.totalCycles },
  ]);
  const groupOrder = queueGroupOrder(abilities);
  const meaningSections = (
    <>
      {meaningGaps ? (
        <>
          <MeaningGapSection
            gapKind="missing-definition"
            rows={meaningGaps.definitionRows}
            totalCount={meaningGaps.counts.missingDefinition}
            abilities={abilities}
            mapHref={(nodeId) => mapHref(nodeId)}
            sourceHref={(nodeId) => sourceHref(nodeId)}
            builderHref={(nodeId) => builderHref(nodeId)}
            onWrite={meaningGaps.onWrite}
            moreCount={labels.moreCount}
            labels={meaningGaps.definitionLabels}
          />
          <MeaningGapSection
            gapKind="missing-domain"
            rows={meaningGaps.domainRows}
            totalCount={meaningGaps.counts.missingDomain}
            abilities={abilities}
            domainChoices={meaningGaps.domainChoices}
            mapHref={(nodeId) => mapHref(nodeId)}
            sourceHref={(nodeId) => sourceHref(nodeId)}
            builderHref={(nodeId) => builderHref(nodeId)}
            onWrite={meaningGaps.onWrite}
            moreCount={labels.moreCount}
            labels={meaningGaps.domainLabels}
          />
        </>
      ) : null}
      <DuplicateSection
        rows={duplicates}
        totalCount={duplicateTotal}
        mapHref={(nodeId) => mapHref(nodeId)}
        handoff={(row) => duplicateHandoff?.(row) ?? ""}
        abilities={abilities}
        labels={labels}
      />
      <QueueSection
        title={labels.sectionPromotion}
        hint={labels.hintPromotion}
        rows={promotionRows}
        totalCount={queue.counts.promotion}
        metric={(row) => (row.degree !== undefined ? labels.promotionMetric(row.degree) : null)}
        mapHref={mapHref}
        sourceHref={sourceHref}
        builderHref={builderHref}
        reviewState={reviewState}
        onReviewStart={onReviewStart}
        registerReviewRow={registerReviewRow}
        abilities={abilities}
        labels={labels}
      />
    </>
  );
  const codeSections = (
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
        abilities={abilities}
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
        abilities={abilities}
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
        abilities={abilities}
        labels={labels}
      />
    </>
  );
  // 묶음 머리는 그 묶음에 **보이는 행이 있을 때만** 그린다 — 빈 머리는
  // "여기 뭔가 있어야 하는데 없다" 로 읽힌다.
  const meaningVisible =
    (meaningGaps?.definitionRows.length ?? 0) > 0 ||
    (meaningGaps?.domainRows.length ?? 0) > 0 ||
    duplicates.length > 0 ||
    promotionRows.length > 0;
  const codeVisible =
    neglectedRows.length > 0 || orphanRows.length > 0 || visibleCycles.cycles.length > 0;
  const groupNode: Record<QueueWorkGroup, ReactNode> = {
    meaning: meaningVisible ? (
      <div key="meaning" className="flex flex-col gap-4">
        <WorkGroupHeading
          testId="do-next-group-meaning"
          title={abilities.canWriteVault ? labels.groupMeaningTitle : labels.groupMeaningTitleReadOnly}
          count={groupCounts.meaning}
          hint={abilities.canWriteVault ? labels.groupMeaningHint : labels.groupMeaningHintReadOnly}
        />
        {meaningSections}
      </div>
    ) : null,
    code: codeVisible ? (
      <div key="code" className="flex flex-col gap-4">
        <WorkGroupHeading
          testId="do-next-group-code"
          title={labels.groupCodeTitle}
          count={groupCounts.code}
          hint={labels.groupCodeHint}
        />
        {codeSections}
      </div>
    ) : null,
  };

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
          abilities={abilities}
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
        {/* 큐 카드의 제목은 묶음 머리가 대신한다 — 「지금 하면 좋은 일」 바로
            아래에 「지금 바로 고칠 수 있어요」가 오면 같은 말이 두 번이고,
            그 28px 은 이 탭의 스크롤 예산에서 나온다. 비어 있을 때만 카드가
            스스로 이름을 말한다(랜드마크 이름은 aria-label 이 계속 지킨다). */}
        {queueEmpty ? (
          <>
            <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.queueTitle}
            </span>
            <p className="text-body text-[color:var(--color-text-quaternary)]">{labels.emptyQueue}</p>
          </>
        ) : (
          // 묶음 순서는 세션 능력에서 나온다. `key` 가 순서를 담으므로
          // 렌더마다가 아니라 **능력이 바뀔 때만** 크로스페이드가 돈다 —
          // 행이 이유 없이 튀지 않는다.
          <div
            key={queueGroupOrderKey(abilities)}
            data-testid="do-next-groups"
            className="ai-row-swap flex flex-col gap-8"
          >
            {groupOrder.map((group) => groupNode[group])}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

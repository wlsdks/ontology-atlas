"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { AlertTriangle } from "lucide-react";
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
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
    >
      {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
      {copied ? labels.handoffCopied : labels.handoffCopy}
    </button>
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
        <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">{title}</span>
        <span className="font-mono text-[11px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
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
            <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--color-text-secondary)]">
              {row.title}
            </span>
            {metricText ? (
              <span className="shrink-0 font-mono text-[10.5px] text-[color:var(--color-text-quaternary)]">
                {metricText}
              </span>
            ) : null}
            <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
              <Link
                href={mapHref(row.nodeId)}
                className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {labels.openMap}
              </Link>
              <Link
                href={builderHref(row.nodeId)}
                className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {labels.openBuilder}
              </Link>
              <HandoffCopyButton payload={row.handoffPayload} labels={labels} />
            </span>
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <p className="pt-2 text-[11px] text-[color:var(--color-text-quaternary)]">{labels.moreCount(hiddenCount)}</p>
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
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--color-text-primary)]">
          <AlertTriangle size={12} aria-hidden className="text-[color:var(--color-status-warning)]" />
          {labels.sectionCycle}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
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
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[color:var(--color-text-secondary)]">
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
            <span className="shrink-0 font-mono text-[10.5px] text-[color:var(--color-text-quaternary)]">
              {labels.cycleMetric(cycle.length)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Link
                href={mapHref(firstNodeId)}
                className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {labels.openMap}
              </Link>
              <HandoffCopyButton payload={cycleHandoff(cycle)} labels={labels} />
            </span>
          </div>
        );
      })}
      {cycles.hiddenCycles > 0 ? (
        <p className="pt-2 text-[11px] text-[color:var(--color-text-quaternary)]">
          {labels.moreCount(cycles.hiddenCycles)}
        </p>
      ) : null}
    </section>
  );
}

export function DoNextTab({
  queue,
  cycles,
  agentReadiness,
  healthQueue,
  mapHref,
  builderHref,
  nodeTitle,
  cycleHandoff,
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
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-[1.2fr_1fr]">
      <section
        aria-label={labels.queueTitle}
        className="flex min-h-0 min-w-0 flex-col gap-4 rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {labels.queueTitle}
        </span>
        {queueEmpty ? (
          <p className="text-[12.5px] text-[color:var(--color-text-quaternary)]">{labels.emptyQueue}</p>
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
        className="flex min-h-0 min-w-0 flex-col rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div
          aria-label={`${labels.agentReadinessTitle}: ${agentReadiness.ready} ${labels.agentReadinessReady} · ${agentReadiness.preflight} ${labels.agentReadinessPreflight} · ${agentReadiness.review} ${labels.agentReadinessReview}`}
          data-testid="insights-agent-readiness"
          className="mb-3.5 border-b border-[color:var(--color-divider)] pb-3.5"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.agentReadinessTitle}
            </span>
            <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11.5px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
              <span>
                {agentReadiness.ready}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.agentReadinessReady}
                </span>
              </span>
              <span>
                {agentReadiness.preflight}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.agentReadinessPreflight}
                </span>
              </span>
              <span>
                {agentReadiness.review}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
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
            <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.repairQueueTitle}
            </span>
            <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11.5px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
              <span>
                {healthQueue.staleCount}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueueStale}
                </span>
              </span>
              <span>
                {healthQueue.orphanCount}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueueOrphan}
                </span>
              </span>
              <span>
                {healthQueue.promotionCount}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
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
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[color:var(--color-text-secondary)]">
                {repairActionKindLabel ? (
                  <span className="shrink-0 rounded border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 text-[10px] leading-none text-[color:var(--color-text-tertiary)]">
                    {repairActionKindLabel}
                  </span>
                ) : null}
                <span className="min-w-0 truncate">{healthQueue.actionTarget.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={healthQueue.builderHref(healthQueue.actionTarget.slug)}
                  data-testid="insights-repair-queue-builder-link"
                  className="inline-flex min-h-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                >
                  {labels.repairQueueOpenBuilder}
                </Link>
                <Link
                  href={healthQueue.ontologyHref(healthQueue.actionTarget.slug)}
                  className="inline-flex min-h-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.repairQueueOpenOntology}
                </Link>
              </span>
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-[color:var(--color-text-quaternary)]">{labels.repairQueueEmpty}</p>
          )}
        </div>
      </section>
    </div>
  );
}

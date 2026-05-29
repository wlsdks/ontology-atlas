"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeOntologyChangeset, useChangeBaseline } from "@/shared/lib/ontology-tree";
import { useOntologyInsight } from "../model/use-ontology-insight";

/**
 * live-web — 상시 ambient "Live" indicator (operations-nav).
 *
 * baseline 이 잡혀 있으면(=live 추적 중) 항상 "LIVE" 를 표시하고, 그 이후
 * 변경된 노드 수를 옆에 단다. transient toast 와 달리 사라지지 않아 "지금
 * 에이전트 작업이 화면에 추적되고 있다" 를 항상 인지하게 한다. baseline 없으면
 * (static/데모 또는 미추적) 아무것도 안 보임.
 *
 * 디자인 헌장 준수: 무채색 + 인디고 pill, 신호용 green dot(status-success).
 * glow/neon/scale 없음 — 정적 dot.
 */
export function LiveActivityBadge({
  changedCount,
  labels,
}: {
  changedCount: number;
  labels: { live: string; changedTitle: string };
}) {
  const active = changedCount > 0;
  return (
    <span
      data-testid="live-activity-badge"
      title={active ? labels.changedTitle : labels.live}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[11px] text-[color:var(--color-indigo-accent)]"
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-success)]" />
      <span className="font-mono uppercase tracking-[0.10em]">{labels.live}</span>
      {active ? (
        <span className="font-mono tabular-nums" data-testid="live-activity-count">
          · {changedCount}
        </span>
      ) : null}
    </span>
  );
}

export function LiveActivityIndicator() {
  const baseline = useChangeBaseline();
  const { insight } = useOntologyInsight();
  const t = useTranslations("liveActivity");
  const changedCount = useMemo(
    () =>
      baseline && insight
        ? computeOntologyChangeset(baseline, insight.nodes, insight.edges).touchedNodeIds.size
        : 0,
    [baseline, insight],
  );
  if (!baseline) return null;
  return (
    <LiveActivityBadge
      changedCount={changedCount}
      labels={{ live: t("live"), changedTitle: t("changed", { count: changedCount }) }}
    />
  );
}

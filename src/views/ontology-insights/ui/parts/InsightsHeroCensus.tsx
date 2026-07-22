import type { ReactNode } from "react";
import type { CensusHealthSummary } from "../../lib/census-health";

/**
 * 탭1 개요의 히어로 계기 — 개념/관계/건강 3 세그먼트, insights-final.html
 * §hero 를 그대로 옮긴다. 숫자는 각인(engraved) 스타일 — 토폴로지 캔버스가
 * 노드 카운트를 새기는 것과 같은 `--topology-v2-numeral-*` 토큰 재사용해
 * "패널과 캔버스는 같은 세계" 를 각인 숫자에서도 지킨다.
 */
export interface InsightsHeroCensusLabels {
  concepts: string;
  relations: string;
  health: string;
  orphan: string;
  cycle: string;
  domainMembership: string;
  evidenceLinked: string;
}

export function InsightsHeroCensus({
  totalNodes,
  totalEdges,
  health,
  kindsSummary,
  relationsSummary,
  labels,
}: {
  totalNodes: number;
  totalEdges: number;
  health: CensusHealthSummary;
  /** 요약 서브라인 — 예: "요소 250 · 역량 36 · 도메인 6 · 문서 3 · 프로젝트 1". */
  kindsSummary: Array<{ key: string; label: string; count: number }>;
  relationsSummary: Array<{ key: string; label: string; count: number }>;
  labels: InsightsHeroCensusLabels;
}) {
  return (
    <div className="flex flex-col items-stretch gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-4 sm:flex-row sm:gap-0">
      <HeroSegment label={labels.concepts} gcap="concepts">
        <BigNum value={totalNodes} />
        <SubStrip items={kindsSummary} />
      </HeroSegment>
      <HeroSegment label={labels.relations} gcap="relations">
        <BigNum value={totalEdges} />
        <SubStrip items={relationsSummary} />
      </HeroSegment>
      <HeroSegment label={labels.health} gcap="health">
        <BigNum value={health.edgesPerConcept.toFixed(2)} unit="edge/concept" />
        <div className="mt-auto flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
          <HealthStat label={labels.orphan} value={health.orphanCount} />
          <HealthStat label={labels.cycle} value={health.cycleCount} />
          <HealthStat label={labels.domainMembership} value={`${health.domainMembershipPct}%`} />
          <HealthStat label={labels.evidenceLinked} value={`${health.evidenceLinkedPct}%`} />
        </div>
      </HeroSegment>
    </div>
  );
}

function HeroSegment({ label, gcap, children }: { label: string; gcap: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 border-t border-[color:var(--color-divider)] px-6 py-0.5 pt-3 first:border-t-0 first:pt-0.5 sm:border-t-0 sm:border-l sm:pt-0.5 sm:first:border-l-0">
      <div className="flex items-baseline gap-2 text-body font-medium text-[color:var(--color-text-secondary)]">
        {label}
        <span className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {gcap}
        </span>
      </div>
      {children}
    </div>
  );
}

function BigNum({ value, unit }: { value: number | string; unit?: string }) {
  return (
    <div
      // eslint-disable-next-line no-restricted-syntax -- 센서스 시그니처 대형 숫자(40px)는 type 램프 상단(hero 30px)을 넘는 의도적 display 예외.
      className="font-mono text-[40px] font-semibold leading-none tabular-nums tracking-[0.01em] text-[color:var(--topology-v2-numeral-face)]"
      style={{ textShadow: "0 2px 0 var(--topology-v2-numeral-shadow)" }}
    >
      {value}
      {unit ? (
        <span className="ml-1.5 text-body tracking-[0.06em] text-[color:var(--color-text-quaternary)]" style={{ textShadow: "none" }}>
          {unit}
        </span>
      ) : null}
    </div>
  );
}

function HealthStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">{value}</span>
    </span>
  );
}

function SubStrip({ items }: { items: Array<{ key: string; label: string; count: number }> }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          {item.label}
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">{item.count}</span>
        </span>
      ))}
    </div>
  );
}

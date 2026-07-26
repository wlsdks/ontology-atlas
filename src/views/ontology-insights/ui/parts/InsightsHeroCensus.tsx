import type { ReactNode } from "react";
import { useCountUp } from "@/shared/lib/use-count-up";
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
  /** 건강 세그먼트 주숫자(도메인 소속률) 옆 사람이 읽는 요약 — 예: "연결 잘 됨". */
  membershipLabel: string;
  /** 밀도비를 강등한 서브라인 — 예: "개념 1개당 평균 연결 2.34개"(ratio 이미 주입). */
  densityGloss: string;
  evidenceLinked: string;
  /** 「할 일」 탭의 수리 큐와 같은 판정 — 따로 떨어진 무리 수. */
  islands: string;
}

export function InsightsHeroCensus({
  totalNodes,
  totalEdges,
  health,
  islandCount,
  kindsSummary,
  relationsSummary,
  labels,
}: {
  totalNodes: number;
  totalEdges: number;
  health: CensusHealthSummary;
  /**
   * 「할 일」 탭 수리 큐가 세는 것과 **같은** 분리된 무리 수. 여기 같이
   * 두는 이유: 큰 "100%" 만 보고 "우리 지도는 완벽히 이어졌다" 로 읽고
   * 넘어가는 사람이 있었다. 100% 는 *도메인 소속률* 이지 연결률이 아니고,
   * 같은 볼트에 62개의 따로 떨어진 무리가 있었다. 두 수를 한눈에 둔다.
   */
  islandCount: number;
  /** 요약 서브라인 — 예: "요소 250 · 역량 36 · 도메인 6 · 문서 3 · 프로젝트 1". */
  kindsSummary: Array<{ key: string; label: string; count: number }>;
  relationsSummary: Array<{ key: string; label: string; count: number }>;
  labels: InsightsHeroCensusLabels;
}) {
  return (
    <div className="flex flex-col items-stretch gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-4 sm:flex-row sm:gap-0">
      <HeroSegment label={labels.concepts}>
        <BigNum value={totalNodes} />
        <SubStrip items={kindsSummary} />
      </HeroSegment>
      <HeroSegment label={labels.relations}>
        <BigNum value={totalEdges} />
        <SubStrip items={relationsSummary} />
      </HeroSegment>
      {/* 건강 세그먼트 — 주숫자는 밀도비(2.34 edge/concept)가 아니라 사람이
          바로 읽는 소속률(도메인에 담긴 개념 비율) + "연결 잘 됨" 요약. 밀도비는
          densityGloss 서브라인으로 강등한다(전문용어를 주숫자에서 내린다). */}
      <HeroSegment label={labels.health}>
        <BigNum value={health.domainMembershipPct} suffix="%" unit={labels.membershipLabel} />
        <div className="mt-auto flex flex-col gap-1.5">
          <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.densityGloss}</span>
          <div className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
            <HealthStat label={labels.orphan} value={health.orphanCount} />
            <HealthStat label={labels.islands} value={islandCount} />
            <HealthStat label={labels.cycle} value={health.cycleCount} />
            <HealthStat label={labels.evidenceLinked} value={`${health.evidenceLinkedPct}%`} />
          </div>
        </div>
      </HeroSegment>
    </div>
  );
}

function HeroSegment({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 border-t border-[color:var(--color-divider)] px-6 py-0.5 pt-3 first:border-t-0 first:pt-0.5 sm:border-t-0 sm:border-l sm:pt-0.5 sm:first:border-l-0">
      <div className="text-body font-medium text-[color:var(--color-text-secondary)]">{label}</div>
      {children}
    </div>
  );
}

function BigNum({ value, unit, suffix }: { value: number | string; unit?: string; suffix?: string }) {
  // #3 — the census signature numbers count up once on mount. tabular-nums keeps
  // the width stable as digits change; reduced-motion snaps to the final value.
  const isNumeric = typeof value === "number";
  const counted = useCountUp(isNumeric ? value : 0);
  const display = isNumeric ? counted : value;
  return (
    <div
      // eslint-disable-next-line no-restricted-syntax -- 센서스 시그니처 대형 숫자(40px)는 type 램프 상단(hero 30px)을 넘는 의도적 display 예외.
      className="font-mono text-[40px] font-semibold leading-none tabular-nums tracking-[0.01em] text-[color:var(--topology-v2-numeral-face)]"
      style={{ textShadow: "0 2px 0 var(--topology-v2-numeral-shadow)" }}
      data-testid="insights-bignum"
    >
      {display}
      {suffix ?? ""}
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

import { TopologyV2KindGlyph } from "@/shared/ui";
import { getOntologyKindTone } from "@/entities/ontology-class";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import { InsightsHeroCensus, type InsightsHeroCensusLabels } from "../parts/InsightsHeroCensus";
import { InsightsBar } from "../parts/InsightsBar";
import type { CensusHealthSummary } from "../../lib/census-health";
import type { DomainCapacityRow } from "../../lib/domain-capacity";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface OverviewTabLabels extends InsightsHeroCensusLabels {
  kindCensusTitle: string;
  domainCapacityTitle: string;
  noDomains: string;
  kindGlyphCaption: string;
  domainCapacityCaption: string;
  capabilityUnit: string;
  elementUnit: string;
}

export interface OverviewTabProps {
  totalNodes: number;
  totalEdges: number;
  health: CensusHealthSummary;
  /** 수리 큐와 같은 판정에서 온 「따로 떨어진 무리」 수. */
  islandCount: number;
  kindRows: Array<{ kind: string; count: number }>;
  domainRows: DomainCapacityRow[];
  edgeTypeSummary: Array<{ key: string; label: string; count: number }>;
  kindLabel: (kind: string) => string;
  labels: OverviewTabLabels;
}

/**
 * 탭1 개요 — insights-final.html frame 1. 히어로 계기(개념/관계/건강) +
 * kind 분포(색 스택 바 + 글리프+대형 미터) + 도메인 용량(capability/element
 * 2 세그먼트 스택 미터). RATIO-SYSTEM §2: 섹션 갭 28px, 카드 갭 20px, 카드는
 * `flex:1` 로 세로를 채운다(빈 밴드 금지).
 *
 * **kind 팔레트는 왼쪽 「종류」 카드에만 남는다.** 상단 스택 스트립의 조각에는
 * 라벨이 없어서, 조각과 아래 행을 잇는 채널이 색뿐이고 5종을 인디고 하나로
 * 가를 수도 없다 — 색이 정체를 나르는 **유일한** 채널인 자리다. 반대로
 * 오른쪽 「도메인 용량」의 2세그먼트 막대는 순서·단위어·옆 숫자가 정체를 이미
 * 나르므로 앱 공통 막대 문법(무채색 + 인디고 하나 + 1px 심)으로 내려왔다
 * (`DomainCapacityBar`, 2026-07-26). 판별 기준은
 * `docs/DESIGN-SYSTEM.md` "Three ambers, three rules".
 */
export function OverviewTab({
  totalNodes,
  totalEdges,
  health,
  islandCount,
  kindRows,
  domainRows,
  edgeTypeSummary,
  kindLabel,
  labels,
}: OverviewTabProps) {
  const kindMax = kindRows[0]?.count ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--section-gap)]">
      <InsightsHeroCensus
        totalNodes={totalNodes}
        totalEdges={totalEdges}
        health={health}
        islandCount={islandCount}
        kindsSummary={kindRows.map((r) => ({ key: r.kind, label: kindLabel(r.kind), count: r.count }))}
        relationsSummary={edgeTypeSummary}
        labels={labels}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
        <section
          aria-label={labels.kindCensusTitle}
          className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
        >
          <CardHead label={labels.kindCensusTitle} count={totalNodes} />
          <div
            aria-hidden
            className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)]"
          >
            {kindRows.map((row) => {
              const share = totalNodes > 0 ? row.count / totalNodes : 0;
              if (share <= 0) return null;
              return (
                <span
                  key={row.kind}
                  style={{ flexGrow: share, backgroundColor: getOntologyKindTone(row.kind).fill }}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-1 flex-col justify-evenly gap-1">
            {kindRows.map((row, i) => {
              const width = kindMax > 0 ? Math.max(2, Math.round((row.count / kindMax) * 100)) : 0;
              return (
                <div key={row.kind} className="flex items-center gap-3 py-0.5">
                  <span className="flex w-[136px] flex-none items-center gap-2 text-body-lg text-[color:var(--color-text-secondary)]">
                    <TopologyV2KindGlyph kind={row.kind} size={16} />
                    {kindLabel(row.kind)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                    <InsightsBar pct={width} color={getOntologyKindTone(row.kind).fill} index={i} />
                  </span>
                  <span className="w-10 flex-none text-right font-mono text-title tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                    {row.count}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
            {labels.kindGlyphCaption}
          </p>
        </section>

        <section
          aria-label={labels.domainCapacityTitle}
          className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
        >
          <CardHead label={labels.domainCapacityTitle} count={domainRows.length} />
          {domainRows.length === 0 ? (
            <p className="mt-3.5 flex-1 text-body text-[color:var(--color-text-quaternary)]">{labels.noDomains}</p>
          ) : (
            <div className="mt-3.5 flex min-h-0 flex-1 flex-col">
              {/* 막대 두 조각의 열쇠는 카드에 한 줄만 — 행마다 반복하면 소음이다. */}
              <DomainCapacityLegend
                labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
              />
              <div className="mt-2.5 flex flex-1 flex-col justify-evenly gap-1">
                {domainRows.map((row) => (
                  <DomainCapacityBar
                    key={row.id}
                    row={row}
                    labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
                  />
                ))}
              </div>
            </div>
          )}
          <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
            {labels.domainCapacityCaption}
          </p>
        </section>
      </div>
    </div>
  );
}

function CardHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
      <span className="ml-auto font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {count}
      </span>
    </div>
  );
}

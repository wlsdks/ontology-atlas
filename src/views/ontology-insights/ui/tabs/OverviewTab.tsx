import { TopologyV2KindGlyph } from "@/shared/ui";
import { InsightsHeroCensus, type InsightsHeroCensusLabels } from "../parts/InsightsHeroCensus";
import type { CensusHealthSummary } from "../../lib/census-health";
import type { DomainCapacityRow } from "../../lib/domain-capacity";

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
  kindRows: Array<{ kind: string; count: number }>;
  domainRows: DomainCapacityRow[];
  edgeTypeSummary: Array<{ key: string; label: string; count: number }>;
  kindLabel: (kind: string) => string;
  labels: OverviewTabLabels;
}

/**
 * 탭1 개요 — insights-final.html frame 1. 히어로 계기(개념/관계/건강) +
 * kind 분포(글리프+대형 미터) + 도메인 용량(대형 미터). RATIO-SYSTEM §2:
 * 섹션 갭 28px, 카드 갭 20px, 카드는 `flex:1` 로 세로를 채운다(빈 밴드 금지).
 */
export function OverviewTab({
  totalNodes,
  totalEdges,
  health,
  kindRows,
  domainRows,
  edgeTypeSummary,
  kindLabel,
  labels,
}: OverviewTabProps) {
  const kindMax = kindRows[0]?.count ?? 0;
  const domainMax = domainRows[0]?.total ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--section-gap)]">
      <InsightsHeroCensus
        totalNodes={totalNodes}
        totalEdges={totalEdges}
        health={health}
        kindsSummary={kindRows.map((r) => ({ key: r.kind, label: kindLabel(r.kind), count: r.count }))}
        relationsSummary={edgeTypeSummary}
        labels={labels}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
        <section
          aria-label={labels.kindCensusTitle}
          className="flex min-h-0 min-w-0 flex-col rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
        >
          <CardHead label={labels.kindCensusTitle} gcap="kind census" count={totalNodes} />
          <div className="mt-3.5 flex flex-1 flex-col justify-evenly gap-1">
            {kindRows.map((row) => {
              const width = kindMax > 0 ? Math.max(2, Math.round((row.count / kindMax) * 100)) : 0;
              const hot = row.count === kindMax && kindMax > 0;
              return (
                <div key={row.kind} className="flex items-center gap-3 py-0.5">
                  <span className="flex w-[136px] flex-none items-center gap-2 text-[14px] text-[color:var(--color-text-secondary)]">
                    <TopologyV2KindGlyph kind={row.kind} size={16} />
                    {kindLabel(row.kind)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${width}%`,
                        backgroundColor: hot ? "var(--color-indigo-brand)" : "var(--color-overlay-3)",
                      }}
                    />
                  </span>
                  <span className="w-10 flex-none text-right font-mono text-[15px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                    {row.count}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-[11px] text-[color:var(--color-text-quaternary)]">
            {labels.kindGlyphCaption}
          </p>
        </section>

        <section
          aria-label={labels.domainCapacityTitle}
          className="flex min-h-0 min-w-0 flex-col rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
        >
          <CardHead label={labels.domainCapacityTitle} gcap="domain capacity" count={domainRows.length} />
          {domainRows.length === 0 ? (
            <p className="mt-3.5 flex-1 text-[12px] text-[color:var(--color-text-quaternary)]">{labels.noDomains}</p>
          ) : (
            <div className="mt-3.5 flex flex-1 flex-col justify-evenly gap-1">
              {domainRows.map((row) => {
                const width = domainMax > 0 ? Math.max(2, Math.round((row.total / domainMax) * 100)) : 0;
                const hot = row.total === domainMax && domainMax > 0;
                return (
                  <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5">
                    <span className="flex w-full shrink-0 items-center gap-2 truncate text-[14px] text-[color:var(--color-text-secondary)] sm:w-[220px]">
                      <TopologyV2KindGlyph kind="domain" size={15} />
                      <span className="truncate">{row.title}</span>
                    </span>
                    <span className="h-2 min-w-[48px] flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${width}%`,
                          backgroundColor: hot ? "var(--color-indigo-brand)" : "var(--color-overlay-3)",
                        }}
                      />
                    </span>
                    <span className="flex-none text-right">
                      <span className="block font-mono text-[15px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                        {row.total}
                      </span>
                      <span className="block font-mono text-[9.5px] text-[color:var(--color-text-quaternary)]">
                        {labels.capabilityUnit} {row.capabilityCount} · {labels.elementUnit} {row.elementCount}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-[11px] text-[color:var(--color-text-quaternary)]">
            {labels.domainCapacityCaption}
          </p>
        </section>
      </div>
    </div>
  );
}

function CardHead({ label, gcap, count }: { label: string; gcap: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">{label}</span>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {gcap}
      </span>
      <span className="ml-auto font-mono text-[13px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {count}
      </span>
    </div>
  );
}

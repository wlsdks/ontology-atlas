import { Link } from "@/i18n/navigation";
import { TopologyV2KindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
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
  /** 빈 상태의 둘째 줄 — 도메인이 무엇이고 만들면 무엇을 얻는지. */
  noDomainsBody: string;
  /** 빈 상태에서 내미는 다음 한 걸음 — 경계 탭과 같은 문법(설명만 있고 갈 곳이 없으면 빈 방이다). */
  noDomainsAction: string;
  kindGlyphCaption: string;
  domainCapacityCaption: string;
  capabilityUnit: string;
  elementUnit: string;
}

/**
 * 도메인 행 → 지도 딥링크. 「연결」 탭의 `ConnectionsTabHubLink` 와 **같은
 * 모양**이다 — 두 탭의 행이 같은 일(그 개념을 지도에서 연다)을 하므로 계약도
 * 하나여야 한다.
 */
export interface OverviewTabDomainLink {
  /** `buildOntologyNodeHref` — 출처 마커(`via=insights:composition`)까지 실린다. */
  href: (nodeId: string) => string;
  /**
   * 막대는 `aria-hidden` 이므로 **행의 수치가 링크 이름에 실려야 한다**
   * (「연결」 탭 `impactRowAriaLabel` 과 같은 규율). 그래서 title 만이 아니라
   * 행 전체를 넘긴다.
   */
  ariaLabel: (row: DomainCapacityRow) => string;
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
  /** 필수다 — 링크 없는 행이 조용히 돌아오는 길을 남기지 않는다. */
  domainLink: OverviewTabDomainLink;
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
  domainLink,
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
            /*
             * **「구성」 탭에서 누를 수 있는 것이 0개였다** (2026-08-12 census —
             * 다섯 탭 중 유일). 특히 이 빈 상태가 가장 흔한 첫 화면이다: 갓 만든
             * 볼트는 도메인이 없다. 「없습니다」만 말하고 만들 길을 안 내밀면
             * 이 저장소가 이름 붙여 둔 「다음 단계가 없음」이다. 경계 탭의 빈
             * 상태(`domain-coupling-empty-action`)와 같은 문법을 쓴다.
             */
            <div className="mt-3.5 flex flex-1 flex-col items-start">
              <p className="text-body text-[color:var(--color-text-tertiary)]">{labels.noDomains}</p>
              <p className="mt-1.5 max-w-[38em] text-body leading-prose text-[color:var(--color-text-quaternary)]">
                {labels.noDomainsBody}
              </p>
              <Link
                href="/topology/?workbench=create"
                data-testid="domain-capacity-empty-action"
                className={controlClass({ hoverInk: 'strong', shape: "link", tone: "accent", className: "mt-3 rounded-chip hover:underline" })}
              >
                {labels.noDomainsAction}
              </Link>
            </div>
          ) : (
            <div className="mt-3.5 flex min-h-0 flex-1 flex-col">
              {/* 막대 두 조각의 열쇠는 카드에 한 줄만 — 행마다 반복하면 소음이다. */}
              <DomainCapacityLegend
                labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
              />
              <div className="mt-2.5 flex flex-1 flex-col justify-evenly gap-1">
                {/*
                 * **행이 지도로 가는 문이다** (2026-08-12 census: 이 탭에 누를 수
                 * 있는 것이 0개였다). 링크는 **소비처가 두른다** — 막대 부품은
                 * `/projects` 카드와 공유되고 그 카드는 이미 전체가 눌리는
                 * 표면이라, 부품 안에 링크를 넣으면 그쪽이 중첩 인터랙티브가
                 * 된다(2026-08-09 원장 「두 화면이 같이 바뀐다」). 그래서 부품은
                 * 표현 전용으로 남는다.
                 *
                 * 감싼 링크가 더하는 것은 **히트 영역 · 호버 · 초점 링 · 손가락
                 * 바닥**뿐이고, 행의 배치는 한 픽셀도 건드리지 않는다:
                 * `block`/`w-auto` 로 값 층의 flex 행 배치를 비우고(안쪽 막대가
                 * 자기 배치를 이미 갖는다), `py-0` 로 세로 인셋을 0 으로 되돌려
                 * **행 높이를 그대로 둔다**(치수 규칙성 — 여섯 행이 같은 높이여야
                 * 경계 자리를 나란히 비교할 수 있다). 좌우는 허브 행과 같은
                 * `-mx-1.5 px-1.5` — 호버 면만 카드 인셋 밖으로 6px 나가고
                 * 글자·막대의 축은 캡션·열쇠와 계속 한 줄에 선다.
                 */}
                {domainRows.map((row) => (
                  <Link
                    key={row.id}
                    href={domainLink.href(row.id)}
                    aria-label={domainLink.ariaLabel(row)}
                    data-testid="insights-domain-row-link"
                    className={controlClass({ hoverSurface: 'lift',
                      shape: "row",
                      size: "sm",
                      className: "-mx-1.5 block w-auto px-1.5 py-0",
                    })}
                  >
                    <DomainCapacityBar
                      row={row}
                      labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {/* 이 캡션은 **막대를 읽는 법**이다("왼쪽이 역량, 오른쪽이 요소…").
              빈 상태에서는 그 막대가 화면에 없는데도 그대로 떠 있었다 — 없는
              그림을 설명하는 글은 정보가 아니라 소음이다. 행이 있을 때만 단다. */}
          {domainRows.length > 0 ? (
            <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
              {labels.domainCapacityCaption}
            </p>
          ) : null}
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

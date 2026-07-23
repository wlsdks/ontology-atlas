import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TopologyV2KindGlyph } from "@/shared/ui";
import { relationTypeIndigo } from "../../lib/relation-type-tone";
import type { DomainCouplingBoundaryRow, DomainCouplingPairRow } from "../../lib/domain-coupling-rows";

export interface DomainCouplingCardLabels {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  pairsUnit: string;
  boundaryTitle: string;
  boundarySelfLabel: string;
  boundaryCrossLabel: string;
  boundaryCaption: string;
  examplesCaption: string;
  pairTruncated: (shown: number, total: number) => string;
}

export interface DomainCouplingCardLink {
  /** 예시 edge 양 끝 노드 클릭 → 지도 노드 포커스 딥링크 (다른 탭 행과 같은 계약). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface DomainCouplingCardProps {
  domainCount: number;
  crossDomainEdgeCount: number;
  pairs: DomainCouplingPairRow[];
  totalPairCount: number;
  boundaries: DomainCouplingBoundaryRow[];
  isColdStart: boolean;
  edgeTypeLabel: (type: string) => string;
  nodeLink: DomainCouplingCardLink;
  labels: DomainCouplingCardLabels;
}

/**
 * "도메인 결합" — 14-lens audit rank #12. `computeDomainCouplingMatrix` (shared/lib,
 * 이미 MCP `domain_matrix` 가 쓰는 계산) 는 타입 관계 그래프만 답할 수 있는
 * 질문("이 두 도메인 합쳐야 하나? 경계가 새고 있나?")을 계산해 두고도 그동안
 * UI 소비자가 없어 CLI/MCP 왕복으로만 볼 수 있었다. 이 카드가 첫 UI 소비자.
 *
 * 좌: 교차 도메인 pair 상위 N (count 내림차순) — 각 행은 `<details>` 로 접혀
 * 있고 펼치면 관계 타입 분포 + 실제 예시 edge(from→to, 관계 타입, 지도
 * 딥링크)가 나온다(DocFrontmatterBlock 과 같은 `<details>` 관례 — 커스텀
 * disclosure state 없이 네이티브 키보드/ARIA를 그대로 쓴다).
 * 우: 도메인별 self/cross 비율("경계 압력") — 같은 matrix 의 `domains[]` 에서
 * 이미 계산된 outgoing/incoming/selfEdges 를 나누기만 한 것이라 새 그래프
 * 알고리즘을 추가하지 않는다.
 *
 * 콜드스타트(rank #10 계약) — 도메인 2개 미만이거나 교차 edge 가 0건이면
 * 빈/오해 소지 있는 표 대신 명시적 empty-state 한 장만 그린다.
 */
export function DomainCouplingCard({
  domainCount,
  crossDomainEdgeCount,
  pairs,
  totalPairCount,
  boundaries,
  isColdStart,
  edgeTypeLabel,
  nodeLink,
  labels,
}: DomainCouplingCardProps) {
  if (isColdStart) {
    return (
      <section
        aria-label={labels.title}
        data-testid="domain-coupling-empty"
        className="rounded-panel border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] text-center"
      >
        <p className="text-body-lg font-medium text-[color:var(--color-text-primary)]">{labels.emptyTitle}</p>
        <p className="mt-1.5 text-body text-[color:var(--color-text-tertiary)]">{labels.emptyDescription}</p>
      </section>
    );
  }

  const boundaryMax = boundaries.reduce((m, b) => Math.max(m, b.crossEdges + b.selfEdges), 0);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-[1.2fr_1fr]">
      <section
        aria-label={labels.title}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.title} count={crossDomainEdgeCount} />
        <div className="mt-2 flex flex-1 flex-col">
          {pairs.map((pair) => (
            <DomainCouplingPairDisclosure
              key={`${pair.fromId}->${pair.toId}`}
              pair={pair}
              edgeTypeLabel={edgeTypeLabel}
              nodeLink={nodeLink}
            />
          ))}
        </div>
        {totalPairCount > pairs.length ? (
          <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
            {labels.pairTruncated(pairs.length, totalPairCount)}
          </p>
        ) : null}
        <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {labels.examplesCaption}
        </p>
      </section>

      <section
        aria-label={labels.boundaryTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.boundaryTitle} count={domainCount} />
        <div className="mt-3 flex flex-1 flex-col justify-evenly gap-2.5">
          {boundaries.map((row) => {
            const total = row.selfEdges + row.crossEdges;
            const width = boundaryMax > 0 ? Math.max(2, Math.round((total / boundaryMax) * 100)) : 0;
            const crossPct = Math.round(row.crossRatio * 100);
            return (
              <div key={row.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-body text-[color:var(--color-text-secondary)]">
                  <TopologyV2KindGlyph kind="domain" size={14} className="flex-none" />
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                    {labels.boundarySelfLabel} {row.selfEdges} · {labels.boundaryCrossLabel} {row.crossEdges} ({crossPct}%)
                  </span>
                </div>
                <span
                  aria-hidden
                  className="block h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${width}%`, backgroundColor: "var(--color-indigo-a66)" }}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {labels.boundaryCaption}
        </p>
      </section>
    </div>
  );
}

function DomainCouplingPairDisclosure({
  pair,
  edgeTypeLabel,
  nodeLink,
}: {
  pair: DomainCouplingPairRow;
  edgeTypeLabel: (type: string) => string;
  nodeLink: DomainCouplingCardLink;
}) {
  return (
    <details
      data-testid="domain-coupling-pair"
      className="group border-t border-[color:var(--color-divider)] py-2.5 first:border-t-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={12}
          aria-hidden
          className="flex-none text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-secondary)]">
          {pair.fromTitle}
          <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">→</span>
          {pair.toTitle}
        </span>
        <span className="ml-auto flex-none font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {pair.count}
        </span>
      </summary>
      <div className="mt-2 flex flex-col gap-1.5 pl-[26px]">
        <div className="flex flex-wrap gap-1.5">
          {pair.relationCounts.map((rc) => (
            <span
              key={rc.type}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 text-label text-[color:var(--color-text-tertiary)]"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: relationTypeIndigo(rc.type) }}
              />
              {edgeTypeLabel(rc.type)} × {rc.count}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {pair.examples.map((example) => (
            <div key={example.id} className="flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
              <Link
                href={nodeLink.href(example.fromId)}
                aria-label={nodeLink.ariaLabel(example.fromTitle)}
                data-testid="domain-coupling-example-link"
                className="min-w-0 truncate rounded-sm text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] hover:underline"
              >
                {example.fromTitle}
              </Link>
              <span className="flex-none">→</span>
              <Link
                href={nodeLink.href(example.toId)}
                aria-label={nodeLink.ariaLabel(example.toTitle)}
                data-testid="domain-coupling-example-link"
                className="min-w-0 truncate rounded-sm text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] hover:underline"
              >
                {example.toTitle}
              </Link>
              <span className="flex-none text-[color:var(--color-text-quaternary)]">({edgeTypeLabel(example.type)})</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function CardHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">{label}</span>
      <span className="ml-auto font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {count}
      </span>
    </div>
  );
}

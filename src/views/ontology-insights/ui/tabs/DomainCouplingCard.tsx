import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { TopologyV2KindGlyph } from "@/shared/ui";
import { relationTypeIndigo } from "../../lib/relation-type-tone";
import type {
  DomainCouplingBoundaryRow,
  DomainCouplingGrid,
  DomainCouplingPairRow,
} from "../../lib/domain-coupling-rows";

export interface DomainCouplingCardLabels {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  /** 빈 상태에서 내미는 다음 한 걸음 — 설명만 있고 갈 곳이 없으면 빈 방이다. */
  emptyAction: string;
  emptyActionHref: string;
  boundaryTitle: string;
  boundarySelfLabel: string;
  boundaryCrossLabel: string;
  boundaryCaption: string;
  /** 격자 아래 한 줄 — 색과 대각선을 읽는 법. */
  gridCaption: string;
  /** 아무 칸도 안 눌렀을 때 상세 슬롯이 말하는 것. */
  gridSelectHint: string;
  /** 도메인이 상한을 넘었을 때 — "상위 6 / 전체 9 도메인". */
  gridTruncated: (shown: number, total: number) => string;
  /** 격자 밖 도메인이 걸린 교차 관계 수 — 조용히 줄이지 않기 위한 각주. */
  gridHiddenCross: (count: number) => string;
  gridCellAria: (from: string, to: string, count: number) => string;
  gridSelfAria: (domain: string, count: number) => string;
}

export interface DomainCouplingCardLink {
  /** 예시 edge 양 끝 노드 클릭 → 지도 노드 포커스 딥링크 (다른 탭 행과 같은 계약). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface DomainCouplingCardProps {
  domainCount: number;
  crossDomainEdgeCount: number;
  /** 격자 칸을 눌렀을 때 펼칠 실제 연결 — 칸 → 쌍 조회표. */
  pairs: DomainCouplingPairRow[];
  grid: DomainCouplingGrid;
  boundaries: DomainCouplingBoundaryRow[];
  isColdStart: boolean;
  edgeTypeLabel: (type: string) => string;
  nodeLink: DomainCouplingCardLink;
  labels: DomainCouplingCardLabels;
}

/**
 * "도메인 결합" — `computeDomainCouplingMatrix` (shared/lib, 이미 MCP
 * `domain_matrix` 가 쓰는 계산) 의 UI 소비자. 계산은 그대로 쓰고 형태만 바꾼다.
 *
 * 좌: 도메인×도메인 **히트그리드**. 쌍을 세로 리스트로 세우면 22행이 되고,
 * 그 목록은 "엮인 쌍"만 말할 뿐 "안 엮인 조합"은 아예 안 보여준다 — 경계가
 * 어디서 끊겼는지가 이 카드의 질문인데도. 격자는 빈 칸도 사실로 보여주고,
 * 22행이 한 화면 안 6×6 으로 접힌다. 채도는 인디고 한 계열의 값 차이뿐이고
 * (새 hue 0), 색만으로 말하지 않도록 칸 안에 숫자를 남긴다. 대각선(같은 도메인
 * 안쪽 연결)은 교차가 아니므로 무채색이다.
 * 우: 도메인별 self/cross 비율("경계 압력") — 같은 matrix 의 `domains[]` 산술.
 *
 * 콜드스타트 — 도메인 2개 미만이거나 교차 edge 가 0건이면 빈/오해 소지 있는
 * 격자 대신 명시적 empty-state 한 장만 그린다.
 */
export function DomainCouplingCard({
  domainCount,
  crossDomainEdgeCount,
  pairs,
  grid,
  boundaries,
  isColdStart,
  edgeTypeLabel,
  nodeLink,
  labels,
}: DomainCouplingCardProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const boundaryMax = boundaries.reduce((m, b) => Math.max(m, b.crossEdges + b.selfEdges), 0);
  const pairByKey = new Map<string, DomainCouplingPairRow>(
    pairs.map((pair) => [`${pair.fromId}->${pair.toId}`, pair]),
  );
  const selected = selectedKey ? pairByKey.get(selectedKey) ?? null : null;

  if (isColdStart) {
    return (
      <section
        aria-label={labels.title}
        data-testid="domain-coupling-empty"
        className="rounded-panel border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] text-center"
      >
        <p className="text-body-lg font-medium text-[color:var(--color-text-primary)]">{labels.emptyTitle}</p>
        <p className="mt-1.5 text-body text-[color:var(--color-text-tertiary)]">{labels.emptyDescription}</p>
        <Link
          href={labels.emptyActionHref}
          data-testid="domain-coupling-empty-action"
          className="mt-3 inline-flex rounded-md text-body text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)] hover:underline"
        >
          {labels.emptyAction}
        </Link>
      </section>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-[1.2fr_1fr]">
      <section
        aria-label={labels.title}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.title} count={crossDomainEdgeCount} />
        <CouplingGrid
          grid={grid}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          hasPair={(key) => pairByKey.has(key)}
          labels={labels}
        />
        {/* 상세는 선택이 없어도 자리를 예약한다 — 칸을 누를 때마다 카드 높이가
            뛰면 방금 비교하던 격자가 눈 밑에서 움직인다. */}
        <div
          data-testid="domain-coupling-selection"
          className="mt-2.5 min-h-[76px] border-t border-[color:var(--color-divider)] pt-2.5"
        >
          {selected ? (
            <SelectedPairDetail pair={selected} edgeTypeLabel={edgeTypeLabel} nodeLink={nodeLink} />
          ) : (
            <p className="text-label text-[color:var(--color-text-quaternary)]">{labels.gridSelectHint}</p>
          )}
        </div>
        <p className="mt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {grid.totalDomainCount > grid.domains.length
            ? `${labels.gridTruncated(grid.domains.length, grid.totalDomainCount)} · `
            : ""}
          {grid.hiddenCrossEdgeCount > 0 ? `${labels.gridHiddenCross(grid.hiddenCrossEdgeCount)} · ` : ""}
          {labels.gridCaption}
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

/**
 * 칸의 채도 — 인디고 알파 4단. 색은 훑기용(어디가 시끄러운가), 정확한 수는
 * 칸 안 숫자가 말한다. 색만으로 말하면 대비를 못 읽는 사람에게 카드가 사라진다.
 */
function crossCellTone(count: number, maxCross: number): string | undefined {
  if (count <= 0) return undefined;
  const ratio = maxCross > 0 ? count / maxCross : 1;
  if (ratio <= 0.25) return "var(--color-indigo-a22)";
  if (ratio <= 0.5) return "var(--color-indigo-a32)";
  if (ratio <= 0.75) return "var(--color-indigo-a46)";
  return "var(--color-indigo-a66)";
}

function CouplingGrid({
  grid,
  selectedKey,
  onSelect,
  hasPair,
  labels,
}: {
  grid: DomainCouplingGrid;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  hasPair: (key: string) => boolean;
  labels: DomainCouplingCardLabels;
}) {
  // 열 머리는 번호로 둔다 — 도메인 이름 6개를 세로로 눕히면 고개를 돌려야
  // 읽히고, 이름은 바로 옆 행 머리에 같은 번호와 함께 이미 있다.
  //
  // 이름 칸은 14rem 상한이다. `1fr` 로 두면 카드 폭을 다 먹어 이름과 칸 사이가
  // 수백 px 벌어지고, 한 행을 읽는 데 눈이 화면을 가로지른다.
  const template = `minmax(0,14rem) repeat(${grid.domains.length}, 1.75rem)`;

  return (
    <div
      role="grid"
      aria-label={labels.title}
      data-testid="domain-coupling-grid"
      className="mt-2.5 flex w-fit max-w-full flex-col gap-0.5"
    >
      <div role="row" className="grid items-center gap-0.5" style={{ gridTemplateColumns: template }}>
        {/* 이름 칸 위의 빈 머리. `sr-only` 는 absolute 라 격자 흐름에서 빠져
            열이 통째로 한 칸씩 밀린다 — 자리를 차지하는 빈 칸으로 둔다. */}
        <span role="columnheader" aria-label={labels.title} />
        {grid.domains.map((domain, index) => (
          <span
            key={domain.id}
            role="columnheader"
            title={domain.title}
            className="text-center font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {index + 1}
          </span>
        ))}
      </div>
      {grid.domains.map((from, rowIndex) => (
        <div
          key={from.id}
          role="row"
          className="grid items-center gap-0.5"
          style={{ gridTemplateColumns: template }}
        >
          <span
            role="rowheader"
            title={from.title}
            className="flex min-w-0 items-center gap-1.5 pr-2 text-body text-[color:var(--color-text-secondary)]"
          >
            <span className="font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
              {rowIndex + 1}
            </span>
            <span className="min-w-0 truncate">{from.title}</span>
          </span>
          {grid.domains.map((to, colIndex) => {
            const count = grid.cells[rowIndex][colIndex];
            const isDiagonal = rowIndex === colIndex;
            const key = `${from.id}->${to.id}`;
            const selectable = !isDiagonal && count > 0 && hasPair(key);
            const label = isDiagonal
              ? labels.gridSelfAria(from.title, count)
              : labels.gridCellAria(from.title, to.title, count);
            const tone = isDiagonal
              ? count > 0
                ? "var(--color-overlay-2)"
                : undefined
              : crossCellTone(count, grid.maxCross);
            const shared =
              "flex h-7 items-center justify-center rounded-sm border border-[color:var(--color-divider)] font-mono text-label tabular-nums";
            if (!selectable) {
              return (
                <span
                  key={key}
                  role="gridcell"
                  aria-label={label}
                  className={`${shared} text-[color:var(--color-text-quaternary)]`}
                  style={{ backgroundColor: tone }}
                >
                  {count > 0 ? count : ""}
                </span>
              );
            }
            const isSelected = selectedKey === key;
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-selected={isSelected}
                data-testid="domain-coupling-cell"
                onClick={() => onSelect(isSelected ? null : key)}
                className={`${shared} text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a46)] ${
                  isSelected ? "ring-1 ring-inset ring-[color:var(--color-indigo-accent)]" : ""
                }`}
                style={{ backgroundColor: tone }}
              >
                {count}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SelectedPairDetail({
  pair,
  edgeTypeLabel,
  nodeLink,
}: {
  pair: DomainCouplingPairRow;
  edgeTypeLabel: (type: string) => string;
  nodeLink: DomainCouplingCardLink;
}) {
  return (
    <div data-testid="domain-coupling-pair" className="flex flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
          {pair.fromTitle}
          <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">→</span>
          {pair.toTitle}
        </span>
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
          <div
            key={example.id}
            className="flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]"
          >
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
            <span className="flex-none text-[color:var(--color-text-quaternary)]">
              ({edgeTypeLabel(example.type)})
            </span>
          </div>
        ))}
      </div>
    </div>
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

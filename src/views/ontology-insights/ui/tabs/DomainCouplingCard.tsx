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
  /**
   * 카드 머리 숫자의 단위 — 나란한 두 카드가 같은 자리에 55(교차 관계)와
   * 6(도메인)을 놓으면, 단위어 없이는 55 를 도메인 수로 읽는다.
   */
  countUnit: string;
  boundaryCountUnit: string;
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
  /** 연결이 있는 도메인 전체 수 — 목록이 상한에서 잘렸으면 각주로 밝힌다. */
  boundaryTotalCount: number;
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
 * 막대가 그리는 값은 **교차 비중** 하나다. 한때 총량(`self+cross`)을 그리고
 * 총량으로 세웠는데, 캡션은 "교차 비중이 높을수록 경계가 새고 있다" 를 읽으라고
 * 했다 — 실측(2026-07-26 도그푸드) 결과 두 순위가 거의 역방향이라, 막대만 훑은
 * 사람은 가장 심한 도메인을 가장 안전한 것으로 읽었다. 캡션이 약속이고 그림이
 * 캡션을 따른다. 총량은 같은 행의 숫자(`안쪽 N · 교차 M`)가 그대로 말한다.
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
  boundaryTotalCount,
  isColdStart,
  edgeTypeLabel,
  nodeLink,
  labels,
}: DomainCouplingCardProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
    // 폭 배분을 뒤집었다. 격자는 최대 6×6 이라 필요한 폭이 34rem 안에서
    // 정해지고(이름 14rem + 칸 6×2.75rem + 간격 + 카드 패딩), 경계 압력 막대는
    // 폭이 늘수록 비중 차이가 잘 읽힌다. 넓은 쪽을 격자에 주면 격자 오른쪽이
    // 비고(2026-07-26 실측: 카드 폭의 45%) 막대는 짧아진다.
    //
    // `auto` 가 아니라 고정 34rem 인 이유: `auto` 트랙은 남는 공간을 흡수하고
    // 그 상한이 max-content 라 **카드 아래 캡션 한 문장의 길이**가 카드 폭을
    // 정해 버린다(실측 746px). 치수는 설계 결정이지 문장 길이의 부산물이 아니다.
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <section
        aria-label={labels.title}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.title} unit={labels.countUnit} count={crossDomainEdgeCount} />
        <CouplingGrid
          grid={grid}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          hasPair={(key) => pairByKey.has(key)}
          labels={labels}
        />
        {/* 상세는 선택이 없어도 자리를 예약한다 — 칸을 누를 때마다 카드 높이가
            뛰면 방금 비교하던 격자가 눈 밑에서 움직인다.
            빈 상태의 안내문은 예약된 자리 **가운데**에 둔다. 위쪽에 붙여 두면
            아래로 58px 이 남아(2026-07-26 실측) 예약된 슬롯이 아니라 두 캡션
            사이의 죽은 틈으로 읽혔다. */}
        <div
          data-testid="domain-coupling-selection"
          className="mt-2.5 flex min-h-[76px] flex-col justify-center border-t border-[color:var(--color-divider)] pt-2.5"
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
        <CardHead label={labels.boundaryTitle} unit={labels.boundaryCountUnit} count={domainCount} />
        <div className="mt-3 flex flex-1 flex-col justify-evenly gap-2.5">
          {boundaries.map((row) => {
            // 막대 = 교차 비중 그 자체(0~100%). 최대값 정규화를 쓰지 않는 이유는
            // 비중이 이미 0~100 척도라서다 — 목록 안 최대값으로 다시 나누면
            // "100% 짜리 막대"가 실제 100% 가 아닌 자리에도 생긴다.
            const crossPct = Math.round(row.crossRatio * 100);
            const width = crossPct > 0 ? Math.max(2, crossPct) : 0;
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
          {boundaryTotalCount > boundaries.length
            ? `${labels.gridTruncated(boundaries.length, boundaryTotalCount)} · `
            : ""}
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

/**
 * 대각선 칸(같은 도메인 안 연결)의 농도 — **무채색** 3단, 자기 최대값 기준.
 *
 * 한때 값과 무관하게 `--color-overlay-2` 한 값이었다. 그래서 격자에서 가장 큰
 * 두 수(도그푸드 14·10)가 가장 옅은 칸이었고, 캡션의 「칸이 진할수록 …
 * 많아요」가 대각선에서 거짓이 됐다(2026-07-26 실측). 값에 반응하게 고쳐
 * 캡션을 두 채널 모두에서 참으로 만든다.
 *
 * 사다리 상한을 `--color-overlay-3`(0.10)에서 멈추는 이유는 대비다. 한 단 더
 * (`--color-border-strong` 0.14) 올리면 그 배경 위 `text-secondary` 가
 * 6.51:1 로는 남지만 칸 테두리(divider)가 배경에 먹혀 격자선이 사라진다.
 * 0.02/0.06/0.10 세 단은 secondary 텍스트로 9.21 / 8.36 / 7.43:1 이라
 * AA(4.5:1) 를 넉넉히 넘는다.
 */
function selfCellTone(count: number, maxSelf: number): string | undefined {
  if (count <= 0) return undefined;
  const ratio = maxSelf > 0 ? count / maxSelf : 1;
  if (ratio <= 0.34) return "var(--color-overlay-1)";
  if (ratio <= 0.67) return "var(--color-overlay-2)";
  return "var(--color-overlay-3)";
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
  //
  // 칸 크기는 두 단(`--coupling-cell`)이다. 좁은 화면은 28px 로 유지해 가로
  // 넘침을 막고, lg 이상에서는 44px 로 키워 카드가 격자로 채워지게 한다 —
  // 실측(2026-07-26)에서 404×197 격자가 735px 카드 안에 앉아 오른쪽 45%가
  // 비었고, 그 빈칸이 화면을 미완성으로 읽히게 했다. 늘린 건 여백이 아니라
  // 데이터 잉크(숫자가 11px→12.5px 램프 한 단 위로 올라간다)다.
  const template = `minmax(0,14rem) repeat(${grid.domains.length}, var(--coupling-cell))`;

  return (
    <div
      role="grid"
      aria-label={labels.title}
      data-testid="domain-coupling-grid"
      className="mt-2.5 flex w-fit max-w-full flex-col gap-0.5 [--coupling-cell:1.75rem] lg:[--coupling-cell:2.75rem]"
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
              ? selfCellTone(count, grid.maxSelf)
              : crossCellTone(count, grid.maxCross);
            // 파선 테두리 = "이 칸은 다른 척도" 를 색이 아닌 채널로 말한다
            // (헌장: 카테고리 구분은 색이 아닌 보더 스타일). 값이 0인 대각선도
            // 파선이라 「교차 없음」 빈칸과 「안쪽 연결 없음」 빈칸이 구별된다.
            const shared = `flex h-[var(--coupling-cell)] items-center justify-center rounded-sm border font-mono text-body tabular-nums ${
              isDiagonal
                ? "border-dashed border-[color:var(--color-border-strong)]"
                : "border-[color:var(--color-divider)]"
            }`;
            if (!selectable) {
              return (
                <span
                  key={key}
                  role="gridcell"
                  aria-label={label}
                  // 숫자를 실은 칸은 어느 배경에서도 AA 를 넘겨야 한다 —
                  // quaternary 는 대각선 최고 농도에서 3.97:1 로 미달했다.
                  className={`${shared} ${
                    count > 0
                      ? "text-[color:var(--color-text-secondary)]"
                      : "text-[color:var(--color-text-quaternary)]"
                  }`}
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

function CardHead({ label, unit, count }: { label: string; unit: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">{label}</span>
      <span className="ml-auto flex items-baseline gap-1.5">
        <span className="text-label text-[color:var(--color-text-quaternary)]">{unit}</span>
        <span className="font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {count}
        </span>
      </span>
    </div>
  );
}

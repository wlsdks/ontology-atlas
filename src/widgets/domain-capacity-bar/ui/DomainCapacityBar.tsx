import { TopologyV2KindGlyph } from "@/shared/ui";
import { getOntologyKindTone } from "@/entities/ontology-class";

export interface DomainCapacityBarRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

export interface DomainCapacityBarLabels {
  capabilityUnit: string;
  elementUnit: string;
}

export interface DomainCapacityBarProps {
  row: DomainCapacityBarRow;
  /** Denominator for the bar fill — typically the largest row's `total` in
   * the current list, so the widest domain reads as a full track and the
   * rest read proportionally shorter. */
  maxTotal: number;
  labels: DomainCapacityBarLabels;
  /** Responsive width utility classes for the title column — callers place
   * this row in containers of different widths (a dense insights list vs. a
   * full-width project card), so the title column is the one thing left
   * tunable per call site. Defaults to the insights list's column width. */
  titleWidthClassName?: string;
}

/**
 * One domain's capability/element composition — a single shared grammar for
 * "how big is this domain, and what's it made of" wherever domain capacity
 * data is shown (`/ontology/insights` structure tab, `/projects` cards).
 *
 * Guardian I-1 already fixed the *data* source (`computeDomainCensusRows`,
 * shared BFS) so both surfaces count the same way; this component fixes the
 * remaining *rendering* split — insights drew a 2-segment capability/element
 * composition bar in kind tone (amber/eucalyptus), `/projects` drew a
 * single-value monochrome-indigo ranking bar for the same row shape. Two
 * visual grammars for one concept violates Apple HIG's consistency
 * principle (a control or indicator should look and behave the same
 * wherever it appears). The composition bar wins: `design.md`'s charter
 * already carves out an explicit exception for ontology-kind color as a
 * *data mark* in compact panel markers ("ontology kind 색상은 예외적으로
 * 허용하지만 data mark 로만 쓴다") — this is exactly that exception in
 * practice, not a new color system, and it keeps the capability/element
 * split legible instead of collapsing it into a single number.
 *
 * 재심 2026-07-26 — 감사에서 "프로젝트 도메인 바의 amber/green 2색" 이 다시
 * 올라왔다. 실측: `rgba(211,159,73,.94)` = capability kind tone,
 * `rgba(124,166,141,.94)` = element kind tone. 허브 앰버(`#d4b478`)도
 * `--color-status-success` 도 아니다 — **결함 아님**. 규율은 표면이 아니라
 * 계열 수가 정한다: 값 하나짜리 막대는 무채색 + 인디고(`DomainCompositionGrid`),
 * 한 트랙 안에 두 값을 담는 막대는 kind tone 두 개. 판별표는
 * `docs/DESIGN-SYSTEM.md` "Three ambers, three rules" 에 적어 뒀다.
 */
export function DomainCapacityBar({
  row,
  maxTotal,
  labels,
  titleWidthClassName = "sm:w-[220px]",
}: DomainCapacityBarProps) {
  const capWidth = maxTotal > 0 ? (row.capabilityCount / maxTotal) * 100 : 0;
  const elWidth = maxTotal > 0 ? (row.elementCount / maxTotal) * 100 : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5" data-testid="domain-capacity-bar-row">
      <span
        className={`flex w-full shrink-0 items-center gap-2 truncate text-body-lg text-[color:var(--color-text-secondary)] ${titleWidthClassName}`}
      >
        <TopologyV2KindGlyph kind="domain" size={15} />
        <span className="truncate">{row.title}</span>
      </span>
      <span className="flex h-2 min-w-[48px] flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
        <span
          className="block h-full"
          style={{ width: `${capWidth}%`, backgroundColor: getOntologyKindTone("capability").fill }}
        />
        <span
          className="block h-full"
          style={{ width: `${elWidth}%`, backgroundColor: getOntologyKindTone("element").fill }}
        />
      </span>
      {/* 꼬리 열은 **고정 폭**이다. 폭을 내용에 맡기면 `역량 4 · 요소 110` 과
          `역량 2 · 요소 5` 의 글자 폭 차이가 바로 옆 `flex-1` 트랙의 길이를
          정하고, 여섯 행이 공유해야 할 축이 세 길이로 갈린다(2026-07-26 실측:
          929.8 / 935.5 / 941.2px — 오른쪽 끝에 11.4px 계단). 값이 작은 도메인이
          더 긴 축을 받으니 비교값 자체가 최대 1.2% 왜곡됐다.
          「연결」 탭 영향 랭킹이 이미 이 문법(고정 트랙 + 고정 숫자 열)을 쓰고
          있어 그 열 폭 규율을 그대로 가져온다. `tabular-nums` 를 두 줄 모두에
          걸어 숫자 자리도 흔들리지 않게 한다. */}
      <span className="w-[156px] flex-none text-right">
        <span className="block font-mono text-title tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {row.total}
        </span>
        <span className="block truncate font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
          {labels.capabilityUnit} {row.capabilityCount} · {labels.elementUnit} {row.elementCount}
        </span>
      </span>
    </div>
  );
}

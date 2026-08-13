import { TopologyV2KindGlyph } from "@/shared/ui";

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
  labels: DomainCapacityBarLabels;
  /** Responsive width utility classes for the title column — callers place
   * this row in containers of different widths (a dense insights list vs. a
   * full-width project card), so the title column is the one thing left
   * tunable per call site. Defaults to the insights list's column width. */
  titleWidthClassName?: string;
}

/**
 * 한 도메인의 **구성** — 말(역량)과 증거(요소)가 어떤 비율인가.
 *
 * ## 이 막대는 크기를 말하지 않는다 (2026-08-09, 소유자 선택)
 *
 * 예전에는 길이가 **크기**였다(가장 큰 도메인이 트랙 전체). 그런데 그 답은 바로
 * 오른쪽 숫자가 이미 하고 있었고, 실측에서 길이가 새로 말하는 것이 거의 없었다:
 *
 * - 채움 비율이 **100 / 94 / 88 / 82 / 76 / 65 / 53 / 47%** — 가장 작은 도메인도
 *   트랙의 절반 가까이 찼다. 값들이 8~17 사이에 몰려 있으니 분모가 최댓값인 한
 *   이 압축은 데이터에서 그대로 따라 나온다.
 * - 그러면서 막대 묶음이 **카드 높이 685px 중 414px(60%)** 을 썼다.
 *
 * 그래서 트랙을 **끝까지 채우고 경계 위치만 읽게** 바꿨다. 이제 막대가 답하는
 * 것은 「말은 많은데 증거가 얇은가, 그 반대인가」이고, 그건 두 숫자를 암산해야
 * 보이던 사실이다. 크기는 오른쪽 숫자 열이 전담한다.
 *
 * **새 데이터는 0개다** — 행이 이미 들고 있던 두 수로만 그린다. 실측: 이 저장소
 * 볼트에서 경계가 **8%~60%** 사이로 벌어진다(역량 1 : 요소 11 인 도메인부터
 * 3 : 2 인 도메인까지).
 *
 * ⚠️ **이 판단이 틀렸다면 무엇이 보이나** — 실제 볼트들의 구성비가 다 비슷해서
 * 경계가 한 자리에 서면, 이 잉크도 예전 길이처럼 아무 말 안 하는 잉크가 된다.
 * 실제로 예시 볼트(storefront)는 38~57% 라 거의 평평하다 — 데모가 제품이
 * 드러내려는 다양성을 안 보여 주는 것이고, 그건 이 막대가 아니라 예시 데이터
 * 쪽의 숙제다.
 *
 * 두 화면이 이 부품을 나눠 쓴다(`/ontology/insights` 구성 탭, `/projects` 카드) —
 * **뜻이 갈리면 안 되므로 부품에서 고친다.**
 *
 * 채색은 앱 공통 막대 문법을 따른다 — **무채색 + 인디고 하나**. 역량이 主
 * 계열이라 인디고(`--color-indigo-brand`), 요소는 무채
 * (`--color-text-quaternary`), 경계는 색이 아니라 **1px 심**(트랙색이 비치는
 * 틈)이 진다.
 *
 * 왜 kind tone(앰버/유칼립투스)을 버렸나 — 그 두 값은 트랙 위 합성 기준
 * 휘도 대비가 1.14:1 이라 애초에 밝기로는 구분되지 않았고 오직 색상(hue)
 * 으로만 갈렸다. 그런데 그 색상 쌍(주황-초록)이 하필 적록 색약이 가장 못
 * 가르는 축이다 — 남성 약 8%에게 이 막대는 이미 단색이었다. 반면 어느 쪽이
 * 역량인지는 **순서**(역량이 늘 왼쪽) + **단위어** + **옆의 숫자**가 이미
 * 세 겹으로 말하고 있었다. 색은 아무 사실도 나르지 않는 중복 잉크였으므로
 * (Tufte data-ink) 걷어냈다.
 *
 * 심이 필수인 이유 — 인디고와 무채도 서로는 1.12:1 이라 인접 경계가 색으로
 * 안 보인다. 1px 심은 색과 무관한 구분자라 색맹·흑백·고대비 모드에서도
 * "값 두 개짜리 막대"임을 보증한다(WCAG 1.4.11 이 인정하는 경로). 두 값이
 * 모두 0보다 클 때만 생긴다 — 값이 하나면 가를 것도 없다.
 *
 * 최소 폭 바닥은 두지 않는다 — 상수 바닥은 작은 값을 부풀려 lie factor 를
 * 만든다. 1px 미만으로 사라지는 세그먼트의 값은 옆 숫자가 나른다.
 *
 * 결정 기록: `.qa-scratch/domain-bar-color-2026-07-26.md`. 헌장 경계는
 * `docs/DESIGN-SYSTEM.md` "Three ambers, three rules" — kind 팔레트는 색이
 * 정체를 나르는 **유일한** 채널인 자리(종류 센서스의 무라벨 스택, 지도 점,
 * 트리 칩)에만 남는다.
 */
export function DomainCapacityBar({
  row,
  labels,
  titleWidthClassName = "sm:w-[220px]",
}: DomainCapacityBarProps) {
  // 분모는 **이 행의 합**이다 — 목록의 최댓값이 아니라. 그래서 트랙이 늘 꽉 차고,
  // 행끼리 비교되는 것은 길이가 아니라 **경계의 자리**다.
  const filled = row.capabilityCount + row.elementCount;
  const capWidth = filled > 0 ? (row.capabilityCount / filled) * 100 : 0;
  const elWidth = filled > 0 ? (row.elementCount / filled) * 100 : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5" data-testid="domain-capacity-bar-row">
      <span
        className={`flex w-full shrink-0 items-center gap-2 truncate text-body-lg text-[color:var(--color-text-secondary)] ${titleWidthClassName}`}
      >
        <TopologyV2KindGlyph kind="domain" size={15} />
        <span className="truncate">{row.title}</span>
      </span>
      {/* 트랙은 `aria-hidden` — 같은 사실(역량 N · 요소 M)이 바로 오른쪽에
          텍스트로 있어서, 읽어 주면 스크린리더 사용자만 같은 수를 두 번 듣는다.
          두 세그먼트 사이의 1px 심은 flex 갭이다. 세그먼트는 값이 0보다 클 때만
          렌더되므로 심도 두 값이 다 있을 때만 생긴다 — 한쪽이 0인 도메인(예:
          「말만 있고 증거가 0」)은 **통짜 한 색**이 되고, 그것이 이 막대가 가장
          크게 말하는 상태다. */}
      <span
        aria-hidden
        data-testid="domain-capacity-bar-track"
        className="flex h-2 min-w-[48px] flex-1 gap-px overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
      >
        {capWidth > 0 ? (
          <span
            data-testid="domain-capacity-bar-capability"
            className="block h-full bg-[color:var(--color-indigo-brand)]"
            style={{ width: `${capWidth}%` }}
          />
        ) : null}
        {elWidth > 0 ? (
          <span
            data-testid="domain-capacity-bar-element"
            className="block h-full bg-[color:var(--color-text-quaternary)]"
            style={{ width: `${elWidth}%` }}
          />
        ) : null}
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
        <span className="block truncate font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
          {labels.capabilityUnit} {row.capabilityCount} · {labels.elementUnit} {row.elementCount}
        </span>
      </span>
    </div>
  );
}

/**
 * 막대 두 조각의 정체를 밝히는 열쇠 — **막대 블록당 한 번만** 그린다.
 *
 * 행마다 스와치를 반복하면(6행 × 2개 = 12개) 열쇠가 아니라 소음이 된다.
 * 반대로 아예 없으면 색을 걷어낸 뒤 "왼쪽 조각이 무엇인가"를 처음 보는
 * 사람이 알 방법이 순서 추론뿐이다. 그래서 막대 묶음 하나에 한 줄.
 *
 * `aria-hidden` 인 이유 — 이 줄은 `aria-hidden` 인 막대 그래픽의 열쇠다.
 * 그래픽을 숨기고 열쇠만 읽어 주면 스크린리더에는 맥락 없는 단어 두 개만
 * 남는다. 같은 사실은 각 행의 `역량 N · 요소 M` 캡션이 텍스트로 나른다.
 *
 * 막대가 있으면 항상 렌더한다 — 있다 없다 하면 막대 위 여백이 출렁인다
 * (치수 규칙성).
 */
export function DomainCapacityLegend({
  labels,
  className = "",
}: {
  labels: DomainCapacityBarLabels;
  className?: string;
}) {
  return (
    <p
      aria-hidden
      data-testid="domain-capacity-legend"
      className={`flex items-center gap-3.5 whitespace-nowrap text-label text-[color:var(--color-text-tertiary)] ${className}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {labels.capabilityUnit}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-text-quaternary)]" />
        {labels.elementUnit}
      </span>
    </p>
  );
}

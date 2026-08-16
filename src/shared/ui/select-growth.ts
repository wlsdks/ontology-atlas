/**
 * 열린 목록의 **자람과 상한** — 순수 산수 한 벌.
 *
 * `src/shared/lib/composer-growth.ts` 의 자매편이고, 규칙의
 * 문법을 일부러 맞췄다: 상한을 값으로 못 박고, 상한에 **닿았을 때만**
 * 안쪽 스크롤이 생기며, 어포던스는 **실제로 가려졌을 때만** 켜진다.
 * 두 표면이 같은 병을 각자 다르게 풀면 다음 사람이 어느 쪽을 베낄지 모른다.
 *
 * ## 왜 상한이 규칙이어야 하나
 *
 * 구 구현의 상한은 `max-h-[264px]` 리터럴 하나였고, 그 값은 **무엇도
 * 답하지 않았다**: 항목이 몇 개일 때까지 다 보이나, 언제부터 스크롤인가,
 * 화면 아래쪽에서 열면 어떻게 되나. 실측 결과 셋 다 틀려 있었다 — 조상이
 * 잘라 264px 중 39px 만 남았고(가시 14.8%), 7개 중 눌리는 것은 1개였다.
 *
 * 상한은 **두 개**이고 작은 쪽이 이긴다:
 *
 * 1. **행 상한** (`LISTBOX_MAX_ROWS`) — 자람이 멈추는 자리. 행 높이가
 *    제각각이라(설명 줄이 붙는 행이 있다) 줄 수 × 고정 높이로 계산하지 않고
 *    **실제로 렌더된 앞 N 행의 높이 합**으로 잰다. 컴포저가 정수 줄로 잘릴
 *    자리를 없앤 것과 같은 이유다 — 반쯤 잘린 행을 만들지 않는다.
 * 2. **자리 상한** (`availableHeight`) — 앵커 기준 뷰포트에 실제로 남은 공간.
 *    화면 아래쪽 트리거에서 행 상한을 그대로 쓰면 목록이 창 밖으로 나간다.
 *
 * ## 왜 순수 함수인가
 *
 * DOM 측정(행 rect · 패딩 · 남은 공간)은 호출자가 하고 판정은 여기서 한다.
 * 그래야 "7개는 스크롤 없이 다 보인다" 같은 불변식을 jsdom 없이 단위
 * 테스트로 못 박을 수 있다 — 이건 모션이 아니라 **도달 가능성**이라
 * reduced-motion 에서도 살아 있어야 하는 규칙이다.
 */

/**
 * 자람의 상한 (행 수). 여기를 넘으면 상자를 키우는 대신 안쪽 스크롤로 넘긴다.
 *
 * 8인 근거 둘 — 둘 다 실측이고 서로 독립이다:
 *
 * 1. **흔한 경우가 스크롤되면 안 된다.** 실측 러너(Ollama)가 내놓은 모델이
 *    **7개**다. 다 보이는데 스크롤바가 있으면 «더 있다»는 신호가 거짓말이
 *    되고, 사용자는 없는 항목을 찾아 스크롤한다. 7 위로 한 행이 여유다.
 * 2. **드롭다운이 패널이 되면 안 된다.** 설명 줄이 섞인 8행 ≈ 320px 이고,
 *    이 목록이 뜨는 설정 시트는 672px 다. 그 절반을 넘게 자라면 «고르는
 *    컨트롤» 이 아니라 «덮는 표면» 으로 읽힌다(그때 필요한 것은 더 큰
 *    드롭다운이 아니라 검색이다).
 *
 * 9번째부터는 스크롤이 **진짜 정보**다 — 그때만 어포던스가 켜진다.
 */
export const LISTBOX_MAX_ROWS = 8;

export interface ListboxGrowthMetrics {
  /**
   * 렌더된 옵션 행들의 실제 높이(px), 화면 순서 그대로.
   *
   * 줄 수 × 고정 높이로 계산하지 않는 이유: 「임베딩 전용」 설명이 붙는 행은
   * 두 줄이라 더 높다. 고정 높이로 자르면 상한 근처에서 반 행이 걸린다.
   */
  rowHeights: number[];
  /** 목록 상자의 padding-top + padding-bottom. */
  paddingBlock: number;
  /** border-top + border-bottom (`box-sizing: border-box` 라 높이에 포함된다). */
  borderBlock: number;
  /** 앵커 기준 뷰포트에 실제로 남은 세로 공간(px). */
  availableHeight: number;
}

export interface ListboxGrowth {
  /**
   * `max-height` 로 써 넣을 값(px) — **상한이지 높이가 아니다.**
   *
   * 내용이 상한 아래면 상자는 자기 내용대로 자란다. 여기에 «측정한 내용 높이»
   * 를 써 넣으면 안 된다: 서브픽셀 반올림이나 **늦게 도착한 웹폰트**로 행이
   * 1px 자라는 순간 상자가 자기 내용을 스크롤하기 시작한다(실측 — 설치 앱에서
   * 7개가 전부 보이는데 `scrollHeight > clientHeight` 였고, 그래서 「더 있다」
   * 어포던스가 거짓으로 켜졌다). 아무것도 안 묶을 때 상한은 **남은 자리**다.
   */
  height: number;
  /** 잘리지 않고 통째로 담기는 행 수. */
  rows: number;
  /** 상한에 닿아 **안쪽 스크롤이 실제로 생겼는가**. */
  overflowing: boolean;
  /** 무엇이 이겼나 — 게이트와 사람이 원인을 바로 읽게. */
  cappedBy: 'content' | 'rows' | 'space';
}

/**
 * 측정값 → 높이. 재료가 아직 없으면(SSR · 첫 프레임 · 옵션 0개) `null` 이고,
 * 호출자는 그때 남은 공간만 상한으로 쓴다 — 0px 로 접히는 것보다 손대지
 * 않는 편이 언제나 낫다.
 */
export function listboxGrowth(metrics: ListboxGrowthMetrics): ListboxGrowth | null {
  const { rowHeights, paddingBlock, borderBlock, availableHeight } = metrics;
  if (!Array.isArray(rowHeights) || rowHeights.length === 0) return null;
  if (!rowHeights.every((h) => Number.isFinite(h) && h > 0)) return null;
  if (!Number.isFinite(paddingBlock) || !Number.isFinite(borderBlock)) return null;
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return null;

  const chrome = paddingBlock + borderBlock;
  const contentHeight = rowHeights.reduce((sum, h) => sum + h, 0) + chrome;
  // 항목이 상한 이하면 행 상한은 **아무것도 안 묶는다**. 그때 내용 높이를
  // 상한으로 쓰면 자기 내용을 스크롤하게 된다(위 `height` 주석).
  const rowCap =
    rowHeights.length > LISTBOX_MAX_ROWS
      ? rowHeights.slice(0, LISTBOX_MAX_ROWS).reduce((sum, h) => sum + h, 0) + chrome
      : Number.POSITIVE_INFINITY;

  const height = Math.min(rowCap, availableHeight);
  // 1px 여유 — 서브픽셀 반올림으로 «넘쳤다» 고 우기지 않는다.
  const overflowing = contentHeight > height + 1;
  const cappedBy = !overflowing ? 'content' : availableHeight < rowCap ? 'space' : 'rows';

  // 잘리지 않고 **통째로** 담기는 행만 센다 — 반 행은 담긴 것이 아니다.
  let used = chrome;
  let rows = 0;
  for (const rowHeight of rowHeights) {
    if (used + rowHeight > height + 1) break;
    used += rowHeight;
    rows += 1;
  }

  return { height, rows, overflowing, cappedBy };
}

/**
 * 위쪽 어포던스를 켤 조건 — **상한에 닿았고 실제로 위가 가려졌을 때만.**
 * 자라는 동안에는 아무것도 가려지지 않으므로 신호도 없다(없는 넘침을
 * 광고하지 않는다). `composerTopIsHidden` 과 같은 판정.
 */
export function listboxTopIsHidden(overflowing: boolean, scrollTop: number): boolean {
  return overflowing && Number.isFinite(scrollTop) && scrollTop > 0;
}

/**
 * 아래쪽 어포던스를 켤 조건. 목록에서 «더 있다» 를 나르는 것은 주로 이쪽이다 —
 * 열자마자 맨 위에 있으므로 위는 안 가려져 있고 아래만 가려져 있다.
 */
export function listboxBottomIsHidden(
  overflowing: boolean,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): boolean {
  if (!overflowing) return false;
  if (![scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) return false;
  return scrollTop + clientHeight + 1 < scrollHeight;
}

/**
 * 컴포저의 **높이와 스크롤 정렬** — 순수 산수 한 벌.
 *
 * ## 왜 높이가 계산이어야 하나
 *
 * 입력칸은 `rows={2}` 고정이었다. 세 줄짜리 문장이 들어오면 상자는 그대로인 채
 * 안쪽만 스크롤했고, 그때 브라우저가 놓는 `scrollTop` 은 줄 격자와 무관한
 * 값이라 **윗변에 글리프가 반으로 잘린 줄**이 걸렸다. 실측(1512×806, 다크):
 * `line-height 20px` · `padding 8+8` · `border 1+1` → `clientHeight 56`,
 * 3줄이면 `scrollHeight 76`, 최대 스크롤 20px. 20 은 줄 높이의 배수인데도
 * 글은 패딩 8px 뒤에서 시작하므로 첫 줄의 아래 8px 만 남는다.
 *
 * 그래서 높이를 **줄 수로** 정한다: `rows * lineHeight + padding + border`.
 * 상자가 항상 정수 줄이면 잘릴 자리가 없다. 자람의 상한(6줄)에서만 안쪽
 * 스크롤이 생기고, 그때부터는 사용자가 미는 스크롤이다.
 *
 * ## 왜 순수 함수인가
 *
 * DOM 측정(`getComputedStyle` · 미러의 `scrollHeight`)은 호출자가 하고, 판정은
 * 여기서 한다. 그래야 "9px 이 아니라 20px 의 배수" 같은 불변식을 jsdom 없이
 * 단위 테스트로 못 박을 수 있다 — 이건 모션이 아니라 **정렬**이라
 * reduced-motion 에서도 살아 있어야 하는 규칙이다.
 *
 * ## 왜 `shared` 로 내려왔나 (2026-08-16)
 *
 * 원래는 `features/vault-agent/model/` 에 있었다. 작성 칸이 **둘**이 되면서
 * (키를 넣는 갈래 · 내 코딩 에이전트와 나누는 대화) 같은 산수를 둘이 쓰게 됐고,
 * 그때 한쪽 기능의 모델을 다른 쪽이 빌려 쓰면 **그 기능을 정리하는 날 남의
 * 작성 칸이 같이 죽는다** — BYOK 패널의 거취는 아직 열려 있는 질문이다.
 * 이 저장소의 규율 그대로다: 공통화가 필요하면 한 단계 아래로 끌어내린다.
 */

/** 아직 아무 말도 안 한 사람에게 내미는 최소 크기. */
export const COMPOSER_MIN_ROWS = 2;
/**
 * 자람의 기본 상한. 여기를 넘으면 입력칸이 대화를 밀어내기 시작하므로, 그 위는
 * 상자를 키우는 대신 안쪽 스크롤로 넘긴다.
 *
 * **한 화면 안의 좁은 띠**(키 갈래 패널의 하단 바)를 기준으로 정한 값이다.
 * 세로로 긴 칸에서는 이 수가 너무 인색하다 — 그런 자리는 아래
 * `composerMaxRows` 로 **자기 높이에서** 상한을 구한다.
 */
export const COMPOSER_MAX_ROWS = 6;

/**
 * 작성 칸이 차지해도 되는 **몫**. 대화가 주인공이므로 절반을 넘지 않는다.
 *
 * 2026-08-16 소유자 지적: *"이렇게 계속 길어지지는 않지만 어느 정도까지는
 * 길어지면 좋겠는데"*. 맞는 요구였고, 6줄이라는 수는 좁은 띠에서 나온 값이라
 * 세로로 긴 대화 칸에는 안 맞았다. 그렇다고 「12줄」 같은 새 상수를 박으면
 * 그 수도 **어느 한 화면 크기에서만** 맞는다 — 창을 줄이면 작성 칸이 대화를
 * 통째로 밀어낸다. 그래서 상한을 **비율**로 두고 그 자리의 높이에서 구한다.
 */
export const COMPOSER_MAX_SHARE = 0.4;

/** 자람의 절대 상한. 이보다 크면 「입력칸」이 아니라 편집기다. */
export const COMPOSER_CEILING_ROWS = 16;

/**
 * 이 자리에서 허용되는 최대 줄 수 — 쓸 수 있는 높이에서 구한다.
 *
 * 잴 수 없으면(SSR·마운트 직전) 기본 상한으로 돌아간다. 0줄이 되는 길은
 * 없다: 최소값은 시작 크기보다 한 줄 크다(자랄 수 없는 「자라는 칸」은
 * 없는 것과 같다).
 */
export function composerMaxRows(availableHeight: number, lineHeight: number): number {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return COMPOSER_MAX_ROWS;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return COMPOSER_MAX_ROWS;
  const rows = Math.floor((availableHeight * COMPOSER_MAX_SHARE) / lineHeight);
  return Math.min(Math.max(rows, COMPOSER_MIN_ROWS + 1), COMPOSER_CEILING_ROWS);
}

export interface ComposerMetrics {
  /** 계산된 줄 높이(px). */
  lineHeight: number;
  /** padding-top + padding-bottom. */
  paddingBlock: number;
  /** border-top + border-bottom (`box-sizing: border-box` 라 높이에 포함된다). */
  borderBlock: number;
  /**
   * 오프스크린 미러의 `scrollHeight` — 패딩을 포함하고 보더는 제외한 값.
   *
   * **보이는 입력칸을 재지 않는 이유**: `style.height=''` → 리플로우 →
   * 재설정 패턴은 매 프레임 높이를 0 으로 되돌렸다가 다시 놓으므로 자람이
   * 부드러운 전이가 아니라 계단이 된다.
   */
  contentHeight: number;
}

export interface ComposerGrowth {
  /** 입력칸에 그대로 써 넣을 높이(px). 항상 정수 줄 + 크롬. */
  height: number;
  /** 상자가 담는 줄 수 (MIN..MAX). */
  rows: number;
  /** 상한에 닿아 **안쪽 스크롤이 실제로 생겼는가**. */
  overflowing: boolean;
}

/**
 * 측정값 → 높이. 재료가 아직 없으면(SSR·jsdom·폰트 로드 전) `null` 이고,
 * 호출자는 그때 아무것도 하지 않는다 — 0px 로 접히는 것보다 손대지 않는 편이
 * 언제나 낫다.
 */
export function composerGrowth(
  metrics: ComposerMetrics,
  /** 이 자리의 상한. 세로로 긴 칸은 `composerMaxRows` 로 자기 높이에서 구한다. */
  maxRows: number = COMPOSER_MAX_ROWS,
): ComposerGrowth | null {
  const { lineHeight, paddingBlock, borderBlock, contentHeight } = metrics;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return null;
  if (!Number.isFinite(paddingBlock) || !Number.isFinite(borderBlock)) return null;
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return null;

  // 상한이 시작 크기보다 작으면 「자라는 칸」이 오히려 줄어든다.
  const cap = Math.max(COMPOSER_MIN_ROWS, Math.floor(maxRows));
  const textHeight = contentHeight - paddingBlock;
  const wanted = Math.max(1, Math.round(textHeight / lineHeight));
  const rows = Math.min(Math.max(wanted, COMPOSER_MIN_ROWS), cap);
  return {
    height: rows * lineHeight + paddingBlock + borderBlock,
    rows,
    overflowing: wanted > cap,
  };
}

/**
 * 스크롤 위치를 줄 격자에 붙인다. 상자가 줄어들거나(글을 지웠다) 커진 뒤
 * 브라우저가 남겨 놓는 `scrollTop` 은 격자와 무관한 값이라, 그대로 두면 다음
 * 프레임에 반 줄이 윗변에 걸린다.
 */
export function snapScrollTop(scrollTop: number, lineHeight: number): number {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(lineHeight) || lineHeight <= 0) {
    return scrollTop;
  }
  return Math.round(scrollTop / lineHeight) * lineHeight;
}

/**
 * 상단 페이드를 켤 조건 — **상한에 닿았고 실제로 위가 가려졌을 때만.**
 * 자라는 동안에는 아무것도 가려지지 않으므로 신호도 없다(없는 넘침을
 * 광고하지 않는다).
 */
export function composerTopIsHidden(overflowing: boolean, scrollTop: number): boolean {
  return overflowing && Number.isFinite(scrollTop) && scrollTop > 0;
}

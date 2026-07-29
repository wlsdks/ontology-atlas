/**
 * 관문 그리드의 산술 — **한 곳에서만 더한다.**
 *
 * ## 왜 함수인가
 *
 * `--topology-v2-safe-inset-left` 는 지도 카메라가 좌측에 비워 둘 폭이고,
 * 그 값은 `원점 + 판 폭 + 틈` 이다. 2026-07-29 까지 이 덧셈은 **손으로**
 * 되어 있었다 — `app/globals.css` 에 결과값 `544` 리터럴 하나, 그리고 그
 * 셋을 각자 정하는 곳이 셋:
 *
 * - 홈통 40 → `DownloadPage.tsx` 의 `md:px-10`
 * - 판 폭 480 → `DownloadPage.tsx` 의 `max-w-[30rem]`
 * - 틈 24 → 코드에 값으로 존재하지 않고 **주석에만** 있었다
 *
 * 넷 중 하나만 바꾸면 나머지는 그대로 남는다. 같은 날 평결 ③ 이 고친 "판이
 * 폭마다 다른 x 에 선다" 사고도 근본 원인이 같았다 — 한 값이 두 경로에서
 * 각자 진실원이었다. 그래서 원자값에 이름을 주고, 덧셈은 여기 한 함수에만 둔다.
 *
 * ## 첫 항은 홈통이 아니라 **원점**이다 (2026-07-29 밤)
 *
 * 컬럼이 `--page-max` 에서 멈추므로 넓은 화면에서는 홈통이 실제 좌측 여백이
 * 아니다. 좌우를 같게 만드는 수는 `max(홈통, (vw − page-max) / 2)` 이고,
 * 그것이 `--gateway-origin` 이다. 이 함수의 첫 항이 홈통으로 남아 있으면
 * **판은 원점에 서는데 카메라는 홈통을 피하는** 정확히 그 어긋남이 다시
 * 생긴다(1920 +96 · 2560 +416). 소비자가 둘이면 먹는 수도 하나여야 한다.
 *
 * ## 왜 이 덧셈은 CSS `calc()` 가 아닌가
 *
 * 카메라 토큰 리더(`read-topology-v2-tokens.ts`)는 이 값을 `parseFloat` 로
 * 읽는 **무단위 숫자**로 기대한다. `@property` 로 `<number>` 등록을 하면
 * `calc(var(a) + var(b) + var(c))` 가 실제로 하나의 숫자로 리졸브되는 것은
 * 두 엔진에서 확인됐다. 그런데 등록 후 누군가 `--gateway-plate-width: 30rem`
 * 처럼 **자연스러운** 값을 넣으면 문법 위반이라 **에러 없이 initial-value 로
 * 되돌아간다** — 이 저장소가 그림자·색·모션 lint 를 계속 늘려 온 이유인
 * 조용한 드리프트와 같은 등급이다. 사람이 손으로 정하는 값은 등록하지 않고,
 * 깨지면 시끄럽게 깨지게 둔다(`Number("30rem")` = NaN → 시험이 빨개진다).
 *
 * `--gateway-origin` 만 예외적으로 등록한다 — 그건 **파생값**이라 아무도 손으로
 * 안 쓰고, 뷰포트의 함수라 CSS 가 계산해야 리사이즈에 공짜로 따라온다.
 * 근거는 `app/globals.css` 의 그 토큰 독블록.
 */

export interface GatewayGridAtoms {
  /**
   * 정렬 원점 — 판·헤드라인·캡션·GNB·설치 띠·푸터가 공유하는 좌측 x.
   * `--gateway-origin` 의 쓰인 값(px)이고, 홈통이 아니라 **뷰포트의 함수**다.
   */
  origin: number;
  /** 다운로드 판의 폭. */
  plateWidth: number;
  /** 판 오른끝과 지도 잉크 사이에 비워 둘 틈. */
  plateGap: number;
}

/**
 * 지도 카메라가 좌측에 예약할 폭(px, 무단위 숫자로 소비된다).
 *
 * 음수 `plateGap` 은 **판 뒤로 지도를 밀어 넣는** 의도된 입력이다 — 예약폭이
 * 판 오른끝보다 왼쪽에 서면 지도 잉크가 판 아래를 지난다. 0 미만으로 내려가
 * 원점까지 먹지 않도록 바닥만 잡는다.
 */
export function computeGatewaySafeInset({
  origin,
  plateWidth,
  plateGap,
}: GatewayGridAtoms): number {
  return Math.max(0, origin + plateWidth + plateGap);
}

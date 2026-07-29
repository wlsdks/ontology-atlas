/**
 * 관문 그리드의 산술 — **한 곳에서만 더한다.**
 *
 * ## 왜 함수인가
 *
 * `--topology-v2-safe-inset-left` 는 지도 카메라가 좌측에 비워 둘 폭이고,
 * 그 값은 `홈통 + 판 폭 + 틈` 이다. 2026-07-29 까지 이 덧셈은 **손으로**
 * 되어 있었다 — `app/globals.css` 에 결과값 `544` 리터럴 하나, 그리고 그
 * 셋을 각자 정하는 곳이 셋:
 *
 * - 홈통 40 → `DownloadPage.tsx` 의 `md:px-10`
 * - 판 폭 480 → `DownloadPage.tsx` 의 `max-w-[30rem]`
 * - 틈 24 → 코드에 값으로 존재하지 않고 **주석에만** 있었다
 *
 * 넷 중 하나만 바꾸면 나머지는 그대로 남는다. 어제(2026-07-29) 평결 ③ 이
 * 고친 "판이 폭마다 다른 x 에 선다" 사고도 근본 원인이 같았다 — 한 값이 두
 * 경로에서 각자 진실원이었다. 그래서 세 원자값에 이름을 주고, 덧셈은 여기
 * 한 함수에만 둔다.
 *
 * ## 왜 CSS `calc()` 가 아닌가
 *
 * 카메라 토큰 리더(`read-topology-v2-tokens.ts`)는 이 값을 `parseFloat` 로
 * 읽는 **무단위 숫자**로 기대한다. `@property` 로 `<number>` 등록을 하면
 * `calc(var(a) + var(b) + var(c))` 가 실제로 하나의 숫자로 리졸브되는 것은
 * 두 엔진에서 확인됐다. 그런데 등록 후 누군가 `--gateway-gutter: 2.5rem`
 * 처럼 **자연스러운** 값을 넣으면 문법 위반이라 **에러 없이 initial-value 로
 * 되돌아간다** — 이 저장소가 그림자·색·모션 lint 를 계속 늘려 온 이유인
 * 조용한 드리프트와 같은 등급이다. 계산은 JS 가 하고 CSS 는 참조만 하는
 * 쪽이 이미 쓰는 관용구이고, 깨지면 시끄럽게 깨진다.
 */

export interface GatewayGridAtoms {
  /** 페이지 홈통 — 판·헤드라인·캡션·바닥 띠가 공유하는 좌측 x. */
  gutter: number;
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
 * 홈통까지 먹지 않도록 바닥만 잡는다.
 */
export function computeGatewaySafeInset({
  gutter,
  plateWidth,
  plateGap,
}: GatewayGridAtoms): number {
  return Math.max(0, gutter + plateWidth + plateGap);
}

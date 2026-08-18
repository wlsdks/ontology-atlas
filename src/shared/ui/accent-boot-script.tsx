/**
 * 악센트 팔레트를 **첫 페인트 전에** 적용하는 부트 스크립트 (2026-08-18).
 *
 * ## 왜 인라인 스크립트인가
 *
 * 앱의 유일한 채색은 잉걸(기본)과 인디고(되돌림) 둘이고, 고른 값은
 * localStorage 에 있다(`src/shared/lib/appearance-preferences.ts`). CSS 는
 * `:root[data-accent="indigo"]` 로 읽는다.
 *
 * 이 속성을 React 이펙트로 붙이면 **첫 프레임이 기본값으로 그려진 뒤** 인디고로
 * 튄다 — 사용자가 고르지 않은 색이 한 번 번쩍인다. 그래서 렌더 트리보다 먼저
 * 도는 동기 스크립트로 심는다. 다크 모드 토글이 쓰는 표준 수법이고, 여기서는
 * 바꾸는 것이 속성 하나뿐이라 더 짧다.
 *
 * ## 왜 `layout.tsx` 안이 아니라 자기 파일인가
 *
 * `tests/contract/json-ld-script-safety.contract.test.ts` 가 **중앙 `JsonLd`
 * 경계를 쓰는 파일에서 raw script 삽입을 다시 만드는 것**을 막는다. 그 규칙은
 * 옳다 — 이스케이프 책임이 한 곳에 남아야 데이터가 `</script>` 로 경계를 닫는
 * 사고를 못 낸다. 그래서 이 스크립트도 같은 문법을 따라 **자기 이름과 자기
 * 파일**을 갖는다.
 *
 * ## 왜 이 스크립트는 그 사고를 낼 수 없나
 *
 * **데이터가 하나도 안 들어간다.** 문자열이 전부 상수이고 보간이 없다 — 아래
 * 본문에 `${` 가 없다는 것이 그 계약이고, 계약 테스트가 그것을 단언한다.
 * 값을 받는 스크립트가 필요해지면 이 파일이 아니라 `JsonLd` 처럼 이스케이프를
 * 책임지는 경계를 새로 만들어야 한다.
 *
 * 키와 기본값의 정본은 `appearance-preferences.ts` 이고, 여기 하드코딩된
 * 문자열이 그것과 어긋나면 `tests/contract/accent-palette-switch.contract.test.ts`
 * 가 막는다 — 어긋나면 증상이 「가끔 색이 한 번 번쩍인다」라 아무도 버그로
 * 안 적기 때문이다.
 */
const ACCENT_BOOT = [
  "try{",
  "var a=localStorage.getItem('ontology-atlas:accent:v1');",
  "if(a==='indigo')document.documentElement.setAttribute('data-accent','indigo');",
  "}catch(e){}",
].join("");

/**
 * ## 왜 `next/script` 의 `beforeInteractive` 인가 — 자리를 두 번 틀린 끝 (2026-08-18)
 *
 * 맨 raw `<script>` 를 레이아웃 트리에 두면 **어디에 두든 하나씩 값을 치렀다.**
 * 둘 다 신호가 세 다리를 건너 도착했다 — React 경고 → Next 개발 오버레이의
 * 「N Issues」 배지 → 그 배지가 `hover-contrast` e2e 에 잡혀 빨강.
 *
 * ① `<html>` 직계 자식 — *«In HTML, `<script>` cannot be a child of `<html>`»* +
 *    *«Cannot render a sync or defer `<script>` outside the main document»*.
 *    라우트당 개발 이슈 3~4건.
 * ② `<body>` 첫 자식 — 서버 렌더 라우트는 조용해졌지만 **클라이언트에서 그려지는
 *    라우트**(로케일 없는 404)에서 *«Encountered a script tag while rendering
 *    React component — scripts inside React components are never executed when
 *    rendering on the client»*. 즉 그 라우트에서는 **실행되지도 않았다.**
 * ③ 명시적 `<head>` — React 가 처방한 자리지만, 이 저장소의 루트 레이아웃에
 *    `<head>` 를 직접 그리면 not-found 경로가 **500** 이 된다(실측:
 *    `/ko/this-route-does-not-exist/`). Next 가 소유하는 자리를 뺏은 대가다.
 *
 * `next/script` 는 그 자리를 Next 에게 맡긴다 — `beforeInteractive` 는 하이드레이션
 * 이전에 실행되도록 Next 가 문서에 직접 넣고, React 렌더 트리의 스크립트가 아니라서
 * 위 경고 셋 중 어느 것도 나지 않는다. 정적 export 에서도 HTML 에 그대로 인라인된다.
 *
 * **일반화**: 인라인 부팅 스크립트의 자리는 취향이 아니라 계약이다. 그리고 그
 * 계약을 어겼을 때 오는 신호는 「스크립트가 안 돈다」가 아니라 **엉뚱한 게이트의
 * 빨강**이다 — 우리가 안 만든 컨트롤이 감사에 잡히면 개발 오버레이부터 의심한다.
 */
export function AccentBootScript() {
  /*
   * `async` 는 **React 19 에게 「이건 문서로 올려라」라고 말하는 표식**이지
   * 실행을 미루라는 말이 아니다 — 인라인 스크립트에서 `async` 속성은 HTML 명세상
   * 아무 효과가 없고(외부 스크립트에만 의미가 있다), 파싱하는 그 자리에서 동기로
   * 돈다. 그래서 깜빡임이 없다. React 가 이 스크립트를 `<head>` 로 올려 주므로
   * 렌더 트리 어디에 두든 문서에는 한 번만, 올바른 자리에 들어간다.
   *
   * 이 한 글자가 없으면 React 가 정확히 이렇게 말한다:
   * *«Cannot render a sync or defer `<script>` outside the main document without
   * knowing its order. Try adding async="" or moving it into the root `<head>`
   * tag.»* — 처방을 그대로 따른 것이다.
   */
  return <script async dangerouslySetInnerHTML={{ __html: ACCENT_BOOT }} />;
}

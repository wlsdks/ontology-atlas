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

export function AccentBootScript() {
  return <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT }} />;
}

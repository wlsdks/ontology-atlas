/**
 * 공방의 **같은 라우트 안 주소 이동** — 왜 `router.push` 가 아닌가.
 *
 * 2026-07-28 실측(프로덕션 :4173): 위성 클릭(산책)과 「새 노드 만들기」가
 * **무반응**이었다. history push 0건, URL 불변, 무대 불변. 공방의 소프트
 * 내비게이션 전체 — 산책 · 생성 전환 — 이 막다른 길이었다.
 *
 * 원인은 두 겹이었고 둘 다 정적 export(`output: 'export'`) 고유다:
 *
 * 1. **끝의 슬래시가 기능이다.** `trailingSlash: true` 인데 공방의 내부 상수만
 *    `"/ontology/studio"`(슬래시 없음)였다. 그 경로로 client push 하면 라우터가
 *    페이로드를 못 찾고 조용히 아무 일도 안 한다. 다른 href 빌더는 전부 `?`
 *    앞에 슬래시를 둔다 — 공방의 두 상수만 예외였다. (수정 후 「그만하기」
 *    (`/topology/`)는 살아났다.)
 * 2. **경로가 같고 쿼리만 다른 이동은 `router.push` 로 일어나지 않는다.**
 *    라우트는 파일 하나라 검색 파라미터가 라우팅 단위가 아니고, 그래서 같은
 *    라우트로의 push 는 no-op 이 된다. 슬래시를 고친 뒤에도 산책과 생성 전환은
 *    여전히 죽어 있었다 — 이 두 번째 겹이 진짜 원인이다.
 *
 * 지도(`views/home/model/use-home-route-state.ts`)가 이미 같은 벽을 만나
 * `window.history.pushState` + 커스텀 이벤트로 풀었다. 공방은 그 교훈을 못
 * 받았을 뿐이다. **두 번째 기제를 만들지 않는다** — 같은 문법을 쓴다.
 *
 * 경로는 **실제 브라우저 경로**(`window.location.pathname`)를 그대로 쓴다.
 * next-intl 의 `usePathname` 은 locale 이 제거된 경로라, 그걸로 주소를 쓰면
 * `/ko` 가 사라지고 그 URL 을 새로고침할 때 static export 의 `[locale]`
 * 라우트가 깨진다(지도가 실측으로 배운 것과 같은 함정).
 */

/** `history.pushState` 직후 dispatch 하는 이벤트 — `useSearchParams` 는 안 깨어난다. */
export const STUDIO_URL_CHANGE_EVENT = "ontology-atlas:studio-url-change";

/**
 * 다음 주소를 계산한다 — 쿼리만 바꾸고 경로는 지금 그대로.
 *
 * 지금 주소와 결과가 **같으면 `null`** 을 돌려준다. 같은 주소를 pushState 하면
 * 히스토리에 같은 칸이 하나 더 쌓이고, 뒤로가기 첫 번째가 화면을 하나도 바꾸지
 * 못한다 — 사용자에겐 "뒤로가기가 안 먹는" 것으로 읽힌다(지도에서 실측된 결함).
 */
export function nextStudioUrl(
  currentPathname: string,
  currentSearch: string,
  nextParams: URLSearchParams,
): string | null {
  const query = nextParams.toString();
  const url = query ? `${currentPathname}?${query}` : currentPathname;
  return url === `${currentPathname}${currentSearch}` ? null : url;
}

/**
 * 공방 내부 이동에서 **유지되는 파라미터**. 이동해도 맥락은 따라와야 한다:
 * 인사이트에서 넘어온 복귀 마커(`via`/`review`)와 감사용 안내 스위치
 * (`guides`)가 그것이다. 나머지(`node`·`mode`·`edit`·`from`·`rel`·`name`)는
 * **그 이동이 정하는 값**이라 넘겨받지 않는다 — 안 지우면 이전 화면의 편집
 * 요청이 새 노드에 그대로 붙는다.
 *
 * `practice` 도 맥락이다. 실습은 저장 **후** 새 노드로 이동한 자리에서
 * 마무리(「지울까요?」)를 물으므로, 그 이동에서 떨어져 나가면 실습이 저장
 * 직후 증발하고 사용자는 방금 만든 파일을 치울 기회를 잃는다.
 */
const CARRIED_PARAM_KEYS = ["via", "review", "guides", "practice"] as const;

export function carryStudioContext(
  current: URLSearchParams,
  next: URLSearchParams,
): URLSearchParams {
  const merged = new URLSearchParams(next);
  for (const key of CARRIED_PARAM_KEYS) {
    if (merged.has(key)) continue;
    const value = current.get(key);
    if (value !== null) merged.set(key, value);
  }
  return merged;
}

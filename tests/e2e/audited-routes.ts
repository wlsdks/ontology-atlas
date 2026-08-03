/**
 * 접근성·대비 래칫이 **쓸어야 하는 라우트의 단일 출처.**
 *
 * ## 왜 이 파일이 생겼나 (2026-08-04)
 *
 * 두 래칫이 각자 손으로 쓴 라우트 배열을 갖고 있었다 — `a11y-ratchet` 8개,
 * `contrast-ratchet` 5개. 정본 인벤토리(`docs/ARCHITECTURE.md`)는 **17개**다.
 * 어느 목록에도 왜 그만큼인지가 적혀 있지 않았고, 실제로 둘은 서로 다른
 * 이유 없는 부분집합이었다.
 *
 * 그 사각지대가 결함을 숨겼다: 2026-08-03 라운드가 **404 두 페이지**에서 채운
 * 인디고 위 잉크 **4.42:1**(AA 미달)을 찾았는데, 그 자리는 두 래칫이 **한 번도
 * 안 본 자리**였다. 기준선이 전부 0 이 된 것은 사실이지만 그 0 은 «8개 라우트의
 * 0» 이었다 — **재지 않은 화면은 통과한 화면이 아니다.**
 *
 * 그래서 목록을 하나로 합치고, **빠진 자리는 「없음」이 아니라 「제외 + 이유」로**
 * 적는다. 조용히 빠진 라우트와 의도적으로 뺀 라우트가 코드에서 구별되지 않으면
 * 다음 사람이 같은 사각지대를 만든다.
 *
 * ⚠️ **라우트를 추가하면 여기도 추가해야 한다.** 그걸 사람의 기억에 맡기지
 * 않는다 — `tests/contract/audited-route-coverage.contract.test.ts` 가
 * `app/[locale]/**` 를 직접 읽어 분류되지 않은 라우트가 있으면 실패한다.
 */

/**
 * 래칫이 실제로 여는 URL.
 *
 * `[slug]`·`[segment]` 같은 동적 라우트는 **실재하는 값**으로 연다 — 존재하지
 * 않는 슬러그로 열면 404 로 떨어져 그 라우트가 아니라 404 를 재게 된다.
 * `ontology-atlas` 와 `what-is-atlas` 는 각각 도그푸드 볼트와
 * `src/views/gateway-doc/model/guide-pages.ts` 가 내는 값이고, 빌드 산출물
 * (`out/ko/project/*`)에 그대로 있다.
 */
export const AUDITED_ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/project/ontology-atlas/",
  "/ko/project/ontology-atlas/edit/",
  "/ko/project/new/",
  "/ko/project/fallback/",
  "/ko/git/",
  "/ko/download/",
  "/ko/guide/",
  "/ko/guide/what-is-atlas/",
  "/ko/changelog/",
  // ── 404 ────────────────────────────────────────────────────────────────
  // 2026-08-03 라운드가 AA 미달을 찾은 자리. 래칫이 **한 번도 안 보던** 화면이다.
  //
  // ⚠️ 실측으로 정정한 사실(2026-08-04 프로브): not-found 는 파일이 둘인데
  // (`app/not-found.tsx` · `app/[locale]/not-found.tsx`) **뜨는 것은 루트
  // 하나뿐이다.** 로케일 파일에 저대비 문단을 심고 두 URL 을 다 재 봤는데
  // 아무것도 안 잡혔고, 루트 파일에 같은 것을 심으니 **두 URL 이 동시에**
  // 빨개졌다. 루트 파일 자신의 주석이 예고한 그대로다 — "output:'export' +
  // Turbopack 에서는 `[locale]/not-found.tsx` 가 trigger 되지 않을 수 있다".
  // 즉 `app/[locale]/not-found.tsx` 는 **오늘 도달 불가능한 코드**다(별도
  // 라운드 감).
  //
  // 그런데도 **두 URL 을 다 둔다**: 오늘은 같은 파일을 두 번 재는 셈이라
  // 중복이지만, Next 의 not-found 배선이 바뀌어 로케일 파일이 되살아나는 날
  // 그 URL 이 **감사된 적 없는 표면**을 조용히 들여오는 것을 막는다. 3초로
  // 사는 보험이다.
  "/ko/this-route-does-not-exist/",
  "/this-route-does-not-exist/",
] as const;

/**
 * **의도적으로 안 재는 라우트 + 그 이유.**
 *
 * 키는 `app/[locale]/` 기준 라우트 패턴이다(위 계약 테스트가 이 키로 대조한다).
 */
export const EXCLUDED_ROUTES: Readonly<Record<string, string>> = {
  // 얇은 클라이언트 리다이렉트라 **자기 화면이 없다**. 열면 목적지가 뜨므로
  // 재 봐야 목적지를 두 번 재는 것이다(실측 2026-08-04: `/ko/ontology/` 의
  // axe 프로필이 `/ko/topology/` 와, `/ko/ontology/edit/` 이
  // `/ko/ontology/studio/` 와 같았다 — 둘 다 이미 목록에 있다).
  "/ontology": "리다이렉트 → /topology?index=expanded — 목적지를 이미 잰다",
  "/ontology/edit": "리다이렉트 → /ontology/studio — 목적지를 이미 잰다",
};

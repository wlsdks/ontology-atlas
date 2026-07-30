/**
 * 관문 표면이 공유하는 **프레임 두 조각** — 원점 패딩과 그 안의 단일 컬럼.
 *
 * 2026-07-30 에 `views/download` 밖으로 내렸다. 그전엔 관문이 한 뷰뿐이라
 * 그 안의 지역 상수로 충분했는데, `/guide` · `/changelog` 가 같은 크롬을
 * 쓰게 되면서 **뷰끼리 서로 import 하는 모양**이 됐다. FSD 규칙("동일 레이어
 * cross-import 를 피하고 공통화가 필요하면 한 단계 아래로 끌어내린다")대로
 * `shared` 로 내린다 — 관문 크롬 위젯과 관문 뷰들이 여기 하나를 먹는다.
 *
 * 값의 근거는 그대로다. 2026-07-29 평결 ③ 「그리드는 한 벌」이 지킨 것은
 * *모든 원소가 같은 x 에 선다* 이고, 그 x 의 단일 출처가 `--gateway-origin`
 * 이다(`app/globals.css` · `views/download/lib/gateway-grid.ts`).
 */

/**
 * 원점 패딩. **`px-` 라 좌우 둘 다** 원점을 받고, 그것이 좌우 대칭의 전부다.
 *
 * `<md` 는 이 토큰이 아니라 `max(1.5rem, safe-area)` 가 지배한다 — 좁은 폭에서
 * 200px 짜리 홈통은 콘텐츠를 굶긴다.
 */
export const PAGE_GUTTER =
  'px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:px-[var(--gateway-origin)]';

/**
 * 원점 안쪽의 단 하나뿐인 컬럼 — 왼쪽 고정, `--page-max` 에서 정지.
 *
 * 넓은 화면에서 이 상한이 **대칭의 짝**이다: 좌우 패딩이 각각 (vw−1600)/2 면
 * 남는 폭이 정확히 1600 이라 컬럼이 꽉 차고, 오른쪽 여백도 자동으로 같아진다.
 * `mx-auto` 가 필요 없는 이유가 이것이다.
 */
export const PAGE_COLUMN = 'w-full max-w-[var(--page-max)]';

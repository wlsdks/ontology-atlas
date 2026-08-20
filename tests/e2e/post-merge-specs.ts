/**
 * 머지 후 스위프로 미루는 스펙 — **PR 게이트에서 빠지는 유일한 목록.**
 *
 * ## 경계의 기준 (2026-08-21, 소유자 승인 분리)
 *
 * PR 에 남는 것은 **행동 계약과 래칫** — 사용자 여정, 접근성 래칫(오늘 실제
 * 결함 둘을 잡았다), 대비 래칫, 강등 정직성. 여기로 오는 것은 **계측 스위프**
 * — 초 단위 벽시계 표본을 채집하는 프레임/모션/성능 계기와, 전 라우트 × 전
 * 폭을 도는 행렬 계측이다. 이 부류는 ① 한 스펙이 수십 초를 쓰고 ② 지키는
 * 처방이 드물게 바뀌며 ③ 결함이 머지 후 첫 main 런에서 똑같이 잡힌다.
 *
 * ## 언제 도나 — 「나중에」가 아니라 트리거 셋
 *
 * ① main 푸시(= 머지 직후)마다 — `e2e.yml` 의 suite 잡이 push 에서는
 *    프로젝트 필터 없이 전부 돌린다. ② e2e 인프라(`tests/e2e/**` ·
 *    `playwright.config.ts`)를 건드린 PR — 자기 스펙의 빨강을 자기 PR 에서
 *    본다(classify 의 `e2e` 출력). ③ 로컬 `pnpm exec playwright test` —
 *    필터 없이 전 프로젝트가 돈다.
 *
 * ## 규율
 *
 * - **새 스펙의 기본값은 PR 게이트다.** 이 목록에 없는 스펙은 smoke 로 돈다 —
 *   실수의 방향이 «PR 이 조금 느려짐»이지 «게이트 소실»이 아니게.
 * - 목록의 파일이 실재하는지 · 워크플로가 파일명으로 직접 부르는 스펙이 여기
 *   섞이지 않았는지는 `tests/contract/e2e-suite-split.contract.test.ts` 가
 *   지킨다 — 스펙을 rename 하면 그 계약이 먼저 터진다.
 */
export const POST_MERGE_SPECS = [
  // ── 프레임·모션·성능 계기 — 벽시계 표본 채집(스펙당 수 초~40초) ──────
  "camera-transition.spec.ts",
  "datasheet-hover-map-brush.spec.ts",
  "gateway-idle-sleep.spec.ts",
  "map-3d-grip.spec.ts",
  "map-expand-all.spec.ts",
  "map-hover-release.spec.ts",
  "map-trail.spec.ts",
  "nav-yield-map-frames.spec.ts",
  "offscreen-node-census.spec.ts",
  "studio-stage-motion.spec.ts",
  // ── 전 라우트 × 전 폭 행렬 계측 — 레이아웃·스타일 드리프트 스위프 ────
  "cursor-affordance.spec.ts",
  "focus-ring-contrast.spec.ts",
  "hover-contrast.spec.ts",
  "korean-word-break.spec.ts",
  "overflow-sweep.spec.ts",
  "responsive-overflow-audit.spec.ts",
  "screen-hierarchy.spec.ts",
  "scroll-end-gap.spec.ts",
  "surface-vocabulary-ratchet.spec.ts",
] as const;

/**
 * 단축키 시트의 **문맥 범위** (#67).
 *
 * 결함: 8개 섹션 40여 행을 2열로 한 번에 쏟아, 1512×900 에서 다이얼로그가
 * 852px(뷰포트의 95%)를 먹고 하단이 잘려 보였다. 스크롤 가능 여부 신호도 없었다
 * (opus5 검수 2026-07-25 실측 · codex 감사 P2).
 *
 * 해법은 **숨기기가 아니라 분류**다 — 단축키를 지우면 발견 가능성이 사라지므로,
 * 지금 화면에서 실제로 쓸 수 있는 것을 먼저 보여주고 나머지는 탭 뒤에 둔다.
 * `전체` 탭은 종전처럼 모두 보여주므로 잃는 정보가 없다.
 */

export type ShortcutSurface = "global" | "topology" | "docs";

/** 시트 탭. `current` 는 지금 화면 + 전역, `all` 은 종전 전체 목록. */
export type ShortcutScope = "current" | "topology" | "docs" | "all";

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ["current", "topology", "docs", "all"];

/**
 * 지금 보고 있는 라우트의 표면. locale prefix 는 벗겨서 판정한다.
 * 공방/인사이트/프로젝트처럼 전용 단축키가 없는 화면은 `global` —
 * "지금 화면" 탭이 전역 단축키만 보여주는 것이 정직하다.
 */
export function surfaceForPathname(pathname: string): ShortcutSurface {
  const normalized = pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
  if (normalized === "/" || normalized.startsWith("/topology")) return "topology";
  if (normalized.startsWith("/docs")) return "docs";
  return "global";
}

/**
 * 이 범위에서 이 섹션을 보여줄 것인가.
 * `current` 는 지금 화면 표면을 알아야 하므로 `sectionVisibleForCurrent` 를 쓴다.
 */
export function sectionVisible(
  scope: Exclude<ShortcutScope, "current">,
  surface: ShortcutSurface,
): boolean {
  if (scope === "all") return true;
  // 전역 단축키(⌘K · ? · Esc)는 어느 탭에서도 유효하므로 항상 남긴다 —
  // 탭을 바꿨다고 "지금 누를 수 있는 키" 가 사라지면 안 된다.
  if (surface === "global") return true;
  return scope === surface;
}

/** `current` 탭에서 보여줄 섹션 판정 — 지금 화면의 표면 + 전역. */
export function sectionVisibleForCurrent(
  currentSurface: ShortcutSurface,
  surface: ShortcutSurface,
): boolean {
  return surface === "global" || surface === currentSurface;
}

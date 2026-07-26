/**
 * 터미널 도크 높이 — **사용자가 정하고, 기기가 기억한다.**
 *
 * 기본 높이는 뷰포트 비례 토큰(`--agent-terminal-dock-height`)이 잡는다. 그
 * 값이 14"에서 ≈262px ≈ 13행인데, 이 도크의 존재 이유인 에이전트 CLI
 * (`claude`/`codex`)는 박스 드로잉 TUI 를 그려서 13행이면 화면이 계속 스크롤로
 * 밀린다 — 병치하려고 만든 자리가 병치를 못 한다. 그래서 사용자가 직접 잡아
 * 늘릴 수 있어야 하고, 한 번 정한 높이는 다시 정하지 않아도 돼야 한다.
 *
 * 순수 함수 + localStorage 만 — React/DOM 지식 없음. 저장 매체가 localStorage 인
 * 근거는 `appearance-preferences.ts` 선례와 같다: 이건 진실원이 아니라 이 기기의
 * 편의 설정이고(local-first.md 가 명문으로 허용하는 범위), 동기 읽기라 첫
 * 렌더에서 깜빡임 없이 복원된다.
 */

/** 헤더(≈29px) + 셀 두어 줄. 이보다 낮으면 도크가 아니라 헤더 띠다. */
export const DOCK_HEIGHT_MIN = 120;

/**
 * 상한은 절대값이 아니라 뷰포트 비례여야 한다 — 14"의 60%와 27"의 60%는
 * 다른 크기지만 "화면을 다 먹지는 않는다"는 같은 약속이다.
 */
export const DOCK_HEIGHT_MAX_RATIO = 0.6;

/** 키보드로 잡아 늘릴 때의 한 걸음. 드래그만으로 발견되는 컨트롤은 만들지 않는다. */
export const DOCK_HEIGHT_KEYBOARD_STEP = 24;

const STORAGE_KEY = "ontology-atlas:agent-terminal-dock-height:v1";

/** 뷰포트 안에서 쓸 수 있는 범위로 자른다. 상한이 하한보다 작아지는 작은 창도 견딘다. */
export function clampDockHeight(height: number, viewportHeight: number): number {
  const max = Math.max(DOCK_HEIGHT_MIN, Math.round(viewportHeight * DOCK_HEIGHT_MAX_RATIO));
  return Math.round(Math.min(max, Math.max(DOCK_HEIGHT_MIN, height)));
}

/**
 * 저장된 높이. `null` 은 "사용자가 정한 적 없음"이고 그때는 토큰 기본값이 산다 —
 * 0 이나 기본 숫자를 대신 돌려주면 "안 정했다"와 "기본값으로 정했다"를 구분할
 * 수 없어진다.
 */
export function readDockHeight(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= DOCK_HEIGHT_MIN ? value : null;
  } catch {
    return null;
  }
}

/** `null` 을 쓰면 사용자의 선택을 지우고 토큰 기본값으로 되돌린다(더블클릭 리셋). */
export function writeDockHeight(height: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (height === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(Math.round(height)));
  } catch {
    // 프라이빗 모드 등 — 이번 세션 동안은 state 로 살아 있다.
  }
}

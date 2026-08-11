/**
 * 지도 캔버스에 초점을 준다 — **`G M` 이 「지도로 가기」가 아니라 「지도를 잡기」가
 * 되도록.**
 *
 * ## 왜 이 파일이 필요한가 — 실측이 구멍을 냈다
 *
 * 방향키로 그래프를 걷는 기능(2026-08-09)을 붙인 뒤 브라우저에서 재 보니,
 * **키보드로 그 캔버스에 닿으려면 Tab 을 30번 눌러야 했다**(1440×900, 지도 화면
 * 실측). 좌측 레일 · 상단 도구 · INDEX 패널의 컨트롤이 전부 그 앞에 있다.
 * 걷는 기능이 아무리 잘 돌아도, 그 앞에 30번이 있으면 **그것을 쓸 사람이 도달할
 * 수 없다** — 기능을 만든 대상이 정확히 키보드 사용자다.
 *
 * 그래서 이미 있는 키에 일을 하나 더 준다: `G M` 은 지도로 데려가는 키였고, 지도에
 * **이미 있을 때는 아무 일도 안 하던** 키였다. 이제 그 키가 캔버스를 잡는다.
 * 새 단축키를 만들지 않았으므로 외울 것이 늘지 않고, 단축키 시트가 이미 그 키를
 * 안내하므로 발견 경로도 그대로다.
 *
 * ## 왜 즉시 한 번이 아니라 몇 프레임을 기다리나
 *
 * 다른 화면에서 `G M` 을 누르면 라우터가 지도를 **그리기 전에** 이 함수가 불린다.
 * 그 순간 캔버스는 DOM 에 없다. 한 번만 찾고 포기하면 「같은 화면에서는 되는데
 * 다른 화면에서 오면 안 되는」 상태가 되고, 그건 사용자가 원인을 짐작할 수 없는
 * 종류의 결함이다.
 *
 * 기다리는 단위가 시간(ms)이 아니라 **프레임**인 이유: 그려지는 시점은 기계 속도에
 * 딸려 있어서 밀리초로 정하면 느린 기계에서만 실패한다(`architecture.md` 의
 * 「게이트는 밀리초가 아니라 횟수로 잠근다」와 같은 이유).
 */

/** 캔버스를 찾는 표식. `data-testid` 를 런타임 선택자로 쓰지 않는다 — 그건 시험의 것이다. */
export const MAP_CANVAS_SURFACE_ROLE = 'map-canvas';

/**
 * 몇 프레임까지 기다리나. 라우트 전환 + 첫 그림이 이 안에 들어야 한다.
 *
 * ⚠️ **처음에 30으로 뒀고 그게 부족했다** — 다른 화면에서 `G M` 을 눌렀을 때만
 * 실패했다(같은 화면에서는 캔버스가 이미 있어 첫 프레임에 끝난다). 실측:
 * 프로젝트 목록에서 `G M` 을 누르면 캔버스가 **395ms** 뒤에 생긴다. 30프레임은
 * 이상적으로 500ms 지만 라우트 전환 중에는 프레임이 고르지 않아 그 안에 못 든다.
 *
 * 그리고 이 값이 넉넉해도 초점 싸움이 나지 않는다: `RouteFocusManager` 는
 * **이미 `#main` 안에 초점이 있으면 건드리지 않는다**(그 파일의 규칙). 캔버스는
 * `#main` 안이라(실측 확인) 우리가 먼저 잡으면 그쪽이 물러난다 — 우리가 늦으면
 * 그쪽이 읽기 시작점을 잡고, 그건 정상적인 접근성 동작이다.
 */
export const FOCUS_MAP_CANVAS_MAX_FRAMES = 120;

function findMapCanvas(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-surface-role="${MAP_CANVAS_SURFACE_ROLE}"]`,
  );
}

/**
 * 캔버스가 나타나면 초점을 준다. 이미 있으면 그 프레임에 끝난다.
 *
 * 되돌리는 함수를 준다 — 사용자가 그 사이 다른 곳을 눌렀으면 호출자가 취소할 수
 * 있어야 한다(초점을 뺏는 것은 사용자를 놀라게 하는 일이다).
 */
export function focusMapCanvasWhenReady(
  maxFrames: number = FOCUS_MAP_CANVAS_MAX_FRAMES,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const immediate = findMapCanvas();
  if (immediate) {
    immediate.focus();
    return () => {};
  }

  let frame = 0;
  let raf = 0;
  const tick = () => {
    const canvas = findMapCanvas();
    if (canvas) {
      canvas.focus();
      return;
    }
    frame += 1;
    if (frame >= maxFrames) return;
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(raf);
}

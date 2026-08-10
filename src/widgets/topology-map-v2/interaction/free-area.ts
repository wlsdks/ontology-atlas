/**
 * 자유 영역 — **패널에 가리지 않는 자리를 잰다** (2026-08-10 소유자 확정:
 * *"가려선 안되지 패널 뺀 공간 가운데로 맞춰줘"*).
 *
 * ## 이 모듈이 하는 일과 하지 않는 일
 *
 * **잰다**: 캔버스에서 그것을 덮는 패널을 뺀 사각형(`computeFreeArea`)과, 그 패널이
 * 좌·우에서 먹는 폭(`measureCanvasInsets`).
 *
 * **계산하지 않는다**: 「그래서 카메라를 어디로 둘까」. 그 식은
 * `ui/topology-camera-math.ts` 의 `centerForInsets` 한 곳에만 있다. 처음에는 이
 * 모듈이 그 식(`freeAreaOffset` + `cameraCenteringNode`)을 자기도 갖고 있었는데,
 * 그러면 카메라 목표를 정하는 식이 **두 벌**이 된다 — 그리고 실제로 한쪽(초점
 * 다이브)에는 그 식이 아예 없어서 고른 노드가 패널 뒤로 들어갔다. 재는 것과
 * 정하는 것을 갈라 둔 이유가 이것이다.
 *
 * ## 왜 필요한가 — 실측
 *
 * 방향키로 노드를 고르면 오른쪽에 팝오버가 열린다. 그런데 카메라는 노드를 **뷰포트
 * 가운데**로 데려간다. 실측(1512×982): 캔버스는 x64 w1448, 팝오버는 x1128 w352 h813.
 * 즉 가운데(788)로 데려간 노드는 팝오버 왼쪽 경계(1128)와 340px 밖에 안 떨어져 있고,
 * 배율이 커지거나 팝오버가 넓어지면 **고른 노드가 그것을 설명하는 패널 뒤로 들어간다.**
 * 고른 것이 안 보이는 것은 「자리가 세팅됐다」가 아니다.
 *
 * ## 규격
 *
 * 자유 영역 = **캔버스에서 그것을 덮는 패널을 뺀 나머지**. 초점 노드는 그 가운데로 온다.
 *
 * 패널을 어느 쪽에서 빼는지는 **모양이 정한다** — 화면 높이를 대부분 차지하는 것은
 * 세로 패널이라 좌·우에서 빼고, 폭을 대부분 차지하는 것은 가로 바라 위·아래에서 뺀다.
 * 「왼쪽 패널은 몇 px」처럼 값을 박지 않는다: 값을 박으면 패널 폭이 바뀌는 날 조용히
 * 어긋나고, 그건 이 저장소가 이미 여러 번 낸 값이다.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 그 사각형이 **세로 패널**인가 — 캔버스 높이의 이 비율 이상을 차지하면 그렇다.
 *
 * 0.6 인 이유: 실측 팝오버는 813/982 = **0.83**, 반대로 상단 도구 막대는 높이가
 * 100px 안쪽이라 0.1 을 넘지 않는다. 두 무리가 그 사이에서 넉넉히 갈린다.
 */
export const SIDE_PANEL_HEIGHT_RATIO = 0.6;

/** 그 사각형이 **가로 바**인가 — 캔버스 폭의 이 비율 이상. */
export const TOP_BAR_WIDTH_RATIO = 0.6;

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;

function intersects(a: Rect, b: Rect): boolean {
  return right(a) > b.x && a.x < right(b) && bottom(a) > b.y && a.y < bottom(b);
}

/**
 * 캔버스에서 패널들을 빼고 남은 영역.
 *
 * 패널이 영역을 **가운데서 가르는** 경우(양쪽 어디에도 안 붙은 섬)는 빼지 않는다 —
 * 그런 것을 빼면 남는 영역이 둘로 갈라져 「가운데」가 정의되지 않는다. 이 앱의 패널은
 * 전부 가장자리에 붙어 있으므로(실측) 그 경우는 오늘 없고, 생기면 그때 다룬다.
 */
export function computeFreeArea(canvas: Rect, obstacles: readonly Rect[]): Rect {
  let left = canvas.x;
  let rightEdge = right(canvas);
  let top = canvas.y;
  let bottomEdge = bottom(canvas);

  for (const panel of obstacles) {
    if (!intersects(panel, canvas)) continue;

    const tallEnough = panel.height >= canvas.height * SIDE_PANEL_HEIGHT_RATIO;
    const wideEnough = panel.width >= canvas.width * TOP_BAR_WIDTH_RATIO;

    if (tallEnough && !wideEnough) {
      // 세로 패널 — 캔버스 가운데를 기준으로 가까운 쪽에서 뺀다.
      const panelCenter = panel.x + panel.width / 2;
      if (panelCenter >= canvas.x + canvas.width / 2) {
        rightEdge = Math.min(rightEdge, panel.x);
      } else {
        left = Math.max(left, right(panel));
      }
      continue;
    }
    if (wideEnough && !tallEnough) {
      const panelCenter = panel.y + panel.height / 2;
      if (panelCenter >= canvas.y + canvas.height / 2) {
        bottomEdge = Math.min(bottomEdge, panel.y);
      } else {
        top = Math.max(top, bottom(panel));
      }
    }
    // 둘 다이거나 둘 다 아닌 것(전체를 덮는 막 · 작은 섬)은 빼지 않는다.
  }

  // 패널이 서로 겹쳐 영역이 뒤집히면 캔버스를 그대로 쓴다 — 「가운데가 없다」보다
  // 「가운데가 화면 가운데」가 낫다.
  if (rightEdge <= left || bottomEdge <= top) return canvas;
  return { x: left, y: top, width: rightEdge - left, height: bottomEdge - top };
}

/**
 * 캔버스를 덮고 있는 것들을 **DOM 에서 잰다.**
 *
 * 「보인다」 판정은 이 저장소가 이미 정리해 둔 규율을 따른다(`/design-audit`
 * 「사각형이 나온다고 보이는 것은 아니다」): 크기가 없는 것 · `visibility:hidden` ·
 * `display:none` · 거의 투명한 것 · 접힌 `<details>` 안 · `aria-hidden` 조상 안은
 * 화면에 없으므로 세지 않는다. 그것을 빼먹으면 **퇴장 중인 패널이 카메라를 계속
 * 왼쪽으로 밀어** 아무도 원인을 짐작할 수 없는 상태가 된다.
 *
 * 캔버스 자신과 그 조상/자손은 제외한다 — 조상은 캔버스를 「덮는」 것이 아니라
 * 담는 것이다.
 */
export function collectCanvasObstacles(canvas: Element, canvasRect: Rect): Rect[] {
  const out: Rect[] = [];
  const MIN_SIDE = 40;
  for (const el of canvas.ownerDocument.querySelectorAll('body *')) {
    if (el === canvas || canvas.contains(el) || el.contains(canvas)) continue;
    const box = el.getBoundingClientRect();
    if (box.width < MIN_SIDE || box.height < MIN_SIDE) continue;
    if (box.right <= canvasRect.x || box.left >= canvasRect.x + canvasRect.width) continue;
    if (box.bottom <= canvasRect.y || box.top >= canvasRect.y + canvasRect.height) continue;
    if (el.closest('details:not([open])')) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.05) continue;
    // 가장 바깥만 담는다 — 안쪽 자식은 같은 자리를 두 번 세는 것이다.
    if (out.some((r) => r.x <= box.x && r.y <= box.y && r.x + r.width >= box.right && r.y + r.height >= box.bottom)) {
      continue;
    }
    out.push({ x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return out;
}

/**
 * 캔버스의 **좌·우 인셋을 잰다** — 카메라 수학이 이미 쓰는 그 인셋에 먹일 값.
 *
 * ## 왜 재나 — 토큰은 정적인데 패널 상태는 바뀐다
 *
 * `topology-camera-math.ts` 는 **이미** 안전 인셋을 쓴다(`safeInsetLeft/Right/...`,
 * *"the left ReaderLens panel, right popover rail"*). 그런데 그 값이 CSS 토큰이라
 * 고정이고, 실제 기하는 상태에 따라 달라진다. 실측(1512×982):
 *
 * | | 왼쪽 | 오른쪽 |
 * |---|---|---|
 * | 토큰이 예약한 값 | 78 | 120 |
 * | 실제 (선택 전, INDEX 열림) | **324** | 0 |
 * | 실제 (선택 후, 팝오버 열림) | 0 | **384** |
 *
 * 즉 어느 상태에서도 맞지 않는다. 그래서 **어제 나는 두 번째 보정을 만들었다** —
 * 선택 경로에만 자유 영역 시프트를 얹었고, 그건 같은 관심사에 대한 둘째 체계였다
 * (이 저장소가 「따로 노는 두 번째 시스템」이라고 부르는 것). 옳은 처방은 시프트를
 * 하나 더 만드는 게 아니라 **이미 있는 인셋에 참값을 먹이는 것**이다.
 *
 * ## 위·아래는 재지 않는다 — 그건 패널이 아니다
 *
 * `safeInsetTop`(148)은 상단 도구 레인 + 도킹 칩이고 `safeInsetBottom`(96)은
 * **라벨 자리 예약**이다(`LABEL_OFFSET` 에서 파생 — 그 예약이 없어서 최하단 노드
 * 라벨이 조용히 사라진 사고가 있었다). 둘은 「덮는 패널」이 아니라 레이아웃 약속이라
 * 측정으로 대체하면 그 사고가 돌아온다. 그래서 **좌·우만** 잰다.
 *
 * 그리고 토큰값과 **큰 쪽을 쓴다** — 토큰이 패널 말고 다른 이유로 예약한 폭이 있으면
 * 그것을 잃지 않는다.
 */
export interface CanvasInsets {
  left: number;
  right: number;
}

export function measureCanvasInsets(canvas: Element, canvasRect: Rect): CanvasInsets {
  let left = 0;
  let right = 0;
  for (const panel of collectCanvasObstacles(canvas, canvasRect)) {
    const tall = panel.height >= canvasRect.height * SIDE_PANEL_HEIGHT_RATIO;
    const wide = panel.width >= canvasRect.width * TOP_BAR_WIDTH_RATIO;
    if (!tall || wide) continue;
    const panelCenter = panel.x + panel.width / 2;
    if (panelCenter >= canvasRect.x + canvasRect.width / 2) {
      right = Math.max(right, canvasRect.x + canvasRect.width - panel.x);
    } else {
      left = Math.max(left, panel.x + panel.width - canvasRect.x);
    }
  }
  return { left: Math.round(left), right: Math.round(right) };
}

/**
 * 밀도 게이트 슬라이스 (fable 설계) — 클러스터 칩의 순수 Canvas 2D 드로우.
 * 접힌 부모의 자식들을 대신하는 "칩"(겹친 노드 글리프 + rounded-rect +
 * mono `+N` / `−`)을 그린다. 색은 무채색 surface + 인디고 1계열만
 * (`docs/DESIGN-SYSTEM.md` 단일 인디고 헌장) — 새 hue/글로우 없음.
 *
 * 히트테스트(`ui/topology-pointer-handlers.ts`)와 드로우가 **같은 사각형**을
 * 써야 클릭 좌표가 어긋나지 않으므로, 사각형 계산은 이 파일의
 * `clusterChipRect` 하나가 진실원이다(ctx 불필요 — 폰트 폭을 결정론적으로
 * 근사). label 문자열도 `clusterChipLabel` 하나로 통일한다.
 */

/** 칩 높이(px, 스크린 스페이스 — 카메라 스케일과 무관한 고정 크롬). */
export const CLUSTER_CHIP_HEIGHT = 22;
/** mono 폰트 크기(px). */
const CHIP_FONT_SIZE = 12;
/** mono 글자당 근사 폭(px) — 히트/드로우 폭 일치용 결정론 상수. */
const CHIP_CHAR_WIDTH = 7.2;
/** 겹친 노드 글리프가 차지하는 왼쪽 폭. */
const CHIP_GLYPH_WIDTH = 15;
/** 텍스트 좌우 패딩. */
const CHIP_PAD_X = 8;

export interface ClusterChipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 접힘=`+N`, 펼침=`−`(접기 어포던스). */
export function clusterChipLabel(count: number, expanded: boolean): string {
  return expanded ? "−" : `+${count}`;
}

/**
 * anchor(스크린 좌표, 칩 중심)에서 칩 사각형을 유도한다 — 드로우/히트 공용.
 * 폭 = 겹친 글리프 + 텍스트(문자수×근사폭) + 좌우 패딩.
 */
export function clusterChipRect(screenX: number, screenY: number, label: string): ClusterChipRect {
  const textW = label.length * CHIP_CHAR_WIDTH;
  const w = CHIP_GLYPH_WIDTH + textW + CHIP_PAD_X * 2;
  const h = CLUSTER_CHIP_HEIGHT;
  return { x: screenX - w / 2, y: screenY - h / 2, w, h };
}

export interface ClusterChipColors {
  /** 무채색 pill surface. */
  surface: string;
  /** 인디고 1계열 얇은 보더. */
  border: string;
  /** 겹친 노드 글리프 채움(무채색 dim). */
  glyph: string;
  /** `+N` / `−` 텍스트(인디고 계열 또는 numeral face). */
  text: string;
}

/** 수동 rounded-rect 경로 (jsdom 등 `ctx.roundRect` 미구현 환경 방어). */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export interface ClusterChipDrawInput {
  /** 칩 중심 스크린 좌표. */
  screenX: number;
  screenY: number;
  count: number;
  expanded: boolean;
  hovered: boolean;
}

/**
 * 칩 한 개를 그린다. 호출부(`topology-frame-draw.ts`)가 `ctx.globalAlpha` 를
 * 부모 티어 알파로 이미 세팅한다 — 이 함수는 알파를 만지지 않는다.
 */
export function drawClusterChip(
  ctx: CanvasRenderingContext2D,
  input: ClusterChipDrawInput,
  colors: ClusterChipColors,
): void {
  const label = clusterChipLabel(input.count, input.expanded);
  const rect = clusterChipRect(input.screenX, input.screenY, label);

  // 겹친 노드 글리프 — 숨은 자식이 있다는 신호(칩 왼쪽에 2개의 작은 원이 겹침).
  // 접힘 상태에서만 그린다(펼침은 자식이 실제로 보이므로 글리프 불필요).
  if (!input.expanded) {
    const gy = input.screenY;
    const gx = rect.x + CHIP_GLYPH_WIDTH * 0.5;
    ctx.fillStyle = colors.glyph;
    ctx.beginPath();
    ctx.arc(gx + 3, gy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.arc(gx - 2, gy, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.glyph;
    ctx.beginPath();
    ctx.arc(gx - 2, gy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // pill
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, CLUSTER_CHIP_HEIGHT / 2);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  // 텍스트 — glyph 오른쪽에 mono `+N` / `−`.
  ctx.fillStyle = colors.text;
  ctx.font = `600 ${CHIP_FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = rect.x + (input.expanded ? CHIP_PAD_X : CHIP_GLYPH_WIDTH + CHIP_PAD_X * 0.5);
  ctx.fillText(label, textX, input.screenY + 0.5);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

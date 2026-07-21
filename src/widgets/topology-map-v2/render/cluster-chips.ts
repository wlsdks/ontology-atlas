/**
 * 밀도 게이트 슬라이스 (fable 설계) — 클러스터 칩의 순수 Canvas 2D 드로우.
 * 접힌 부모의 자식들을 대신하는 "칩"(겹친 노드 글리프 스택 + rounded-rect +
 * mono `+N` / `− N`)을 그린다. 색은 무채색 surface + 인디고 1계열만
 * (`docs/DESIGN-SYSTEM.md` 단일 인디고 헌장) — 새 hue/글로우 없음.
 *
 * S2 파트 5A (소유자 실보고 "칩이 안 예쁘다 / 무슨 의미인지 모르겠다"):
 * ① 겹친-노드 미니 글리프를 자식 kind(원=capability, 사각=element)로 반영해
 *    "무엇이 접혔나"를 형태로 읽히게, ② 부모→칩 짧은 점선 커넥터 1개로 소속을
 *    잇고, ③ 줌 스케일을 따라(`clusterChipScale`) 존재감 있게 키운다.
 *    펼침 라벨은 `− 63`(숫자 유지 — `−` 단독은 의미 상실).
 *
 * 히트테스트(`ui/topology-pointer-handlers.ts`)와 드로우가 **같은 사각형**을
 * 써야 클릭 좌표가 어긋나지 않으므로, 사각형 계산은 이 파일의
 * `clusterChipRect` 하나가 진실원이다(ctx 불필요 — 폰트 폭을 결정론적으로
 * 근사). label 문자열도 `clusterChipLabel`, 줌 스케일도 `clusterChipScale`
 * 하나로 통일해 히트/드로우가 절대 어긋나지 않는다.
 */

/** 칩 기준 높이(px, 스크린 스페이스 — `clusterChipScale` 로 줌 스케일을 곱한다). */
export const CLUSTER_CHIP_HEIGHT = 28;
/** mono 폰트 기준 크기(px). */
const CHIP_FONT_SIZE = 13;
/** mono 글자당 근사 폭(px) — 히트/드로우 폭 일치용 결정론 상수. */
const CHIP_CHAR_WIDTH = 7.8;
/** 겹친 노드 글리프 스택이 차지하는 왼쪽 폭. */
const CHIP_GLYPH_WIDTH = 22;
/** 텍스트 좌우 패딩. */
const CHIP_PAD_X = 9;

export interface ClusterChipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 칩 줌 스케일 — 카메라 스케일을 따르되(존재감·줌 추종) 판독을 위해 좁은
 * 밴드로 clamp 한다. 히트/드로우가 **같은** 함수를 써 사각형이 어긋나지 않는다.
 */
export function clusterChipScale(cameraScale: number): number {
  if (!Number.isFinite(cameraScale)) return 1;
  return Math.min(1.5, Math.max(0.85, cameraScale));
}

/** 접힘=`+N`, 펼침=`− N`(숫자 유지 — 접기 어포던스이되 의미 보존). */
export function clusterChipLabel(count: number, expanded: boolean): string {
  return expanded ? `− ${count}` : `+${count}`;
}

/**
 * anchor(스크린 좌표, 칩 중심)에서 칩 사각형을 유도한다 — 드로우/히트 공용.
 * 폭 = (겹친 글리프 + 텍스트(문자수×근사폭) + 좌우 패딩) × scale. scale 기본 1.
 */
export function clusterChipRect(
  screenX: number,
  screenY: number,
  label: string,
  scale: number = 1,
): ClusterChipRect {
  const textW = label.length * CHIP_CHAR_WIDTH;
  const w = (CHIP_GLYPH_WIDTH + textW + CHIP_PAD_X * 2) * scale;
  const h = CLUSTER_CHIP_HEIGHT * scale;
  return { x: screenX - w / 2, y: screenY - h / 2, w, h };
}

export interface ClusterChipColors {
  /** 무채색 pill surface. */
  surface: string;
  /** 인디고 1계열 얇은 보더. */
  border: string;
  /** 겹친 노드 글리프 채움(무채색 dim). */
  glyph: string;
  /** `+N` / `− N` 텍스트(인디고 계열 또는 numeral face). */
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

/** 자식 kind 별 미니 글리프 모양 — capability=원, element/그외=사각(노드 형태 반영). */
function glyphShapePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number,
  childKind: string | undefined,
): void {
  if (childKind === "capability") {
    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.closePath();
  } else {
    // element/기타 = 살짝 둥근 사각(노드의 사각 실루엣 반영).
    roundedRectPath(ctx, cx - half, cy - half, half * 2, half * 2, half * 0.35);
  }
}

export interface ClusterChipDrawInput {
  /** 칩 중심 스크린 좌표. */
  screenX: number;
  screenY: number;
  count: number;
  expanded: boolean;
  hovered: boolean;
  /** 줌 스케일(카메라 스케일에서 `clusterChipScale` 로 유도). 기본 1. */
  scale?: number;
  /** 접힌 자식의 kind — 미니 글리프 모양 결정(원/사각). */
  childKind?: string;
  /** 부모 노드 스크린 좌표 — 있으면 부모→칩 짧은 점선 커넥터를 그린다. */
  parentScreenX?: number;
  parentScreenY?: number;
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
  const scale = input.scale ?? 1;
  const label = clusterChipLabel(input.count, input.expanded);
  const rect = clusterChipRect(input.screenX, input.screenY, label, scale);

  // 부모→칩 점선 커넥터 (소속이 읽히도록) — 펼침/접힘 공통. pill 을 나중에
  // 채워 커넥터의 pill 안쪽 구간은 자연히 가려진다.
  if (input.parentScreenX !== undefined && input.parentScreenY !== undefined) {
    ctx.save();
    ctx.setLineDash([2 * scale, 3 * scale]);
    ctx.beginPath();
    ctx.moveTo(input.parentScreenX, input.parentScreenY);
    ctx.lineTo(input.screenX, input.screenY);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // pill
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  // 겹친 노드 글리프 스택 — 숨은 자식 신호(자식 kind 반영, 2~3개 겹침). pill
  // 위에 얹어 채움에 가려지지 않게. 접힘 상태에서만(펼침은 자식이 실제로 보임).
  if (!input.expanded) {
    const gy = input.screenY;
    const gcx = rect.x + CHIP_GLYPH_WIDTH * 0.55 * scale;
    const half = 4.4 * scale;
    const step = 3.4 * scale;
    // 뒤(우)→앞(좌) 순서로 겹쳐, 앞 글리프가 뒤 글리프를 일부 가리는 스택.
    for (const dx of [step, 0, -step]) {
      // 얇은 surface 링으로 글리프 간 분리(겹침이 뭉치지 않게).
      ctx.fillStyle = colors.surface;
      glyphShapePath(ctx, gcx + dx, gy, half + 1.1 * scale, input.childKind);
      ctx.fill();
      ctx.fillStyle = colors.glyph;
      glyphShapePath(ctx, gcx + dx, gy, half, input.childKind);
      ctx.fill();
    }
  }

  // 텍스트 — glyph 오른쪽에 mono `+N` / `− N`.
  ctx.fillStyle = colors.text;
  ctx.font = `600 ${CHIP_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = rect.x + (input.expanded ? CHIP_PAD_X * scale : (CHIP_GLYPH_WIDTH + CHIP_PAD_X * 0.5) * scale);
  ctx.fillText(label, textX, input.screenY + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

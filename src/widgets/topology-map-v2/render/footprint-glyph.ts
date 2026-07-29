/**
 * 발자국 글리프 — 「걸어온 길」의 시각 표기.
 *
 * ## 왜 링이 아니라 발자국인가 (소유자 확정 2026-07-29)
 *
 * 종전 표기는 방문 노드에 얹는 **동심 헤어라인 링**이었다(`model/footprint-ring.ts`).
 * 그 표기의 구조적 한계는 링이 노드 테두리와 **같은 문법**이라는 것이다 — 선택
 * 링·확장 오라·결계가 이미 원이라, 발자국 링은 넷째 원이 되어 "이건 무슨 원인가"를
 * 사용자가 매번 다시 배워야 했다. 소유자: *"걸어왔던 길 노드들에 순서가 뜨고"* ·
 * *"연결된 선에도 작은 발자국이 지나간 흔적처럼"*.
 *
 * 발자국은 **원 문법 밖**이라 그 충돌이 구조적으로 없다. 그리고 링이 못 나르던 것을
 * 나른다: 방향(발끝이 진행 방향을 본다)과 순서(노드 옆 순번).
 *
 * ## 모양은 설정이 아니다
 *
 * 신발 자국(양발) 고정이다. 모양까지 고르게 하면 사용자마다 다른 그림을 보게 되고,
 * 그러면 화면이 "이 표시가 무슨 뜻인가"를 더 이상 말할 수 없다. 사용자가 정하는
 * 것은 **같은 뜻을 얼마나 세게 말하느냐**뿐이다(`FootprintPreference`).
 *
 * ## 선 위가 아니라 선 옆이다
 *
 * 소유자: *"선에 겹치게 말고"*. 관계선은 타입 있는 사실(포함/의존)을 나르는
 * 채널이라, 그 위에 마크를 얹으면 두 사실이 한 잉크를 다툰다. 발자국은 법선
 * 방향으로 비켜 찍혀 "이 길을 따라 지나갔다"만 말한다.
 *
 * 관계가 **있는** 쌍에만 그린다 — 연속 방문한 두 노드 사이에 관계가 없을 수도
 * 있는데, 거기에 선을 따라가는 자국을 찍으면 "선 = 관계"라는 계약이 깨진다.
 */

import {
  FOOTPRINT_EDGE_COUNT,
  FOOTPRINT_EDGE_SCALE,
  type FootprintPreference,
} from "@/shared/lib/appearance-preferences";

/** 발자국 잉크(RGB 3원소) — 호출부가 토큰에서 읽어 넘긴다. */
export type FootprintInk = readonly [number, number, number];

export interface FootprintPaintContext {
  ctx: CanvasRenderingContext2D;
  pref: FootprintPreference;
  ink: FootprintInk;
}

/**
 * 신발 자국 실루엣 — 앞꿈치와 뒤꿈치가 **끊어진 두 덩어리**다. 그게 이 실루엣의
 * 핵심이고, 이어 붙이면 그냥 타원이 된다. 프로시저럴 경로만 쓴다(에셋 import 0).
 *
 * 반환값은 뒤꿈치를 그리는 함수 — 앞꿈치를 먼저 칠하고(fill/stroke) 나서 호출해야
 * 두 덩어리가 각각 닫힌 도형이 된다.
 */
function shoeSole(ctx: CanvasRenderingContext2D, s: number, mirror: boolean): () => void {
  const m = mirror ? -1 : 1;
  ctx.beginPath();
  ctx.ellipse(m * s * 0.02, -s * 0.26, s * 0.26, s * 0.36, m * 0.12, 0, Math.PI * 2);
  ctx.closePath();
  return () => {
    ctx.beginPath();
    ctx.ellipse(m * -s * 0.06, s * 0.34, s * 0.19, s * 0.2, m * 0.12, 0, Math.PI * 2);
    ctx.closePath();
  };
}

/** 노드 옆 양발 배치 오프셋 — 한 발은 앞, 한 발은 뒤로 어긋나야 "걸음"으로 읽힌다. */
const PAIR_OFFSET = [
  { dx: -0.3, dy: 0.1, mirror: false },
  { dx: 0.3, dy: -0.1, mirror: true },
] as const;

/**
 * 현재 변환 원점에 발자국을 그린다. `singleFoot` 이 주어지면 한 발만(선 위용),
 * 없으면 양발(노드 옆용).
 */
function drawSoles(ctx: CanvasRenderingContext2D, pref: FootprintPreference, size: number, singleFoot?: boolean): void {
  const paint = () => (pref.filled ? ctx.fill() : ctx.stroke());
  const feet =
    singleFoot === undefined ? PAIR_OFFSET : [{ dx: 0, dy: 0, mirror: singleFoot } as const];
  for (const foot of feet) {
    ctx.save();
    ctx.translate(foot.dx * size, foot.dy * size);
    const heel = shoeSole(ctx, size, foot.mirror);
    paint();
    heel();
    paint();
    ctx.restore();
  }
}

/**
 * 잉크·굵기·번짐을 세팅하고 `draw` 를 실행한다.
 *
 * ⚠️ `bloom` 은 `shadowBlur` 로 나간다. 헌장은 글로우를 금지하므로 **기본값은
 * 항상 0** 이고, 0 인 동안 이 분기는 아예 실행되지 않는다 — 켜는 것은 사용자의
 * 명시적 선택이다.
 */
function withFootprintInk(
  { ctx, pref, ink }: FootprintPaintContext,
  alpha: number,
  draw: () => void,
): void {
  const rgb = `${ink[0]}, ${ink[1]}, ${ink[2]}`;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.lineWidth = pref.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pref.bloom > 0) {
    ctx.shadowColor = `rgba(${rgb}, 0.9)`;
    ctx.shadowBlur = pref.bloom;
  }
  draw();
  ctx.restore();
}

/** 노드 옆 발자국이 앉는 자리 — 노드 우상단, 라벨(아래)과 겹치지 않는 사분면. */
export function footprintAnchor(
  x: number,
  y: number,
  nodeRadius: number,
  gap: number,
): { x: number; y: number } {
  const off = nodeRadius + gap;
  return { x: x + off * 0.72, y: y - off * 0.72 };
}

/** 노드 옆에 양발 자국 하나를 찍는다. */
export function drawNodeFootprint(
  paint: FootprintPaintContext,
  x: number,
  y: number,
  nodeRadius: number,
  alpha: number,
): void {
  const at = footprintAnchor(x, y, nodeRadius, paint.pref.gap);
  withFootprintInk(paint, alpha, () => {
    paint.ctx.translate(at.x, at.y);
    drawSoles(paint.ctx, paint.pref, paint.pref.size);
  });
}

/**
 * 방문 순번의 표시 문자열. 재방문 노드는 순번이 여럿이라 그대로 이으면 라벨을
 * 덮는다 — 3개를 넘으면 **처음·…·마지막 + 총 횟수**로 줄인다.
 *
 * 총 횟수를 병기하는 이유: `1·…·9` 만 쓰면 그 사이에 몇 번 들렀는지가 **사라진다**.
 * 그런데 "여기 자주 돌아왔다"는 것이 이 표기가 나르려던 사실 자체다 — 축약이
 * 정보를 줄이는 것은 괜찮지만 **없애면** 축약이 아니라 손실이다.
 *
 * 순수 함수(테스트 대상). 첫 방문과 마지막 방문을 남기는 것은 "언제 처음 왔고
 * 언제 마지막에 왔나"가 중간 방문보다 답할 가치가 큰 질문이기 때문이다.
 */
export function formatStepNumbers(steps: readonly number[], totalLabel = "총 %d회"): string {
  if (steps.length === 0) return "";
  if (steps.length <= 3) return steps.join("·");
  const total = totalLabel.replace("%d", String(steps.length));
  return `${steps[0]}·…·${steps[steps.length - 1]} (${total})`;
}

/** 노드 옆 순번 — 발자국 자국 바로 위. */
export function drawFootprintSteps(
  paint: FootprintPaintContext,
  x: number,
  y: number,
  nodeRadius: number,
  alpha: number,
  steps: readonly number[],
  color: string,
): void {
  const label = formatStepNumbers(steps);
  if (label === "") return;
  const { ctx, pref } = paint;
  const at = footprintAnchor(x, y, nodeRadius, pref.gap);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = "650 11px ui-monospace, SFMono-Regular, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, at.x + pref.size * 0.9, at.y - pref.size * 0.9);
  ctx.restore();
}

/**
 * 한 관계선을 따라 남는 자국들의 위치·각도. 렌더와 분리해 순수 함수로 둔다 —
 * "선 위에 겹치지 않는가", "노드에 붙지 않는가"는 그림이 아니라 **좌표**로만
 * 검증되는 성질이라 캔버스 없이 잠글 수 있다.
 */
export function edgeFootprintPlacements(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pref: FootprintPreference,
): { x: number; y: number; angle: number; mirror: boolean; fade: number }[] {
  const count = FOOTPRINT_EDGE_COUNT[pref.edgeDensity];
  const angle = Math.atan2(by - ay, bx - ax);
  const nx = Math.cos(angle + Math.PI / 2);
  const ny = Math.sin(angle + Math.PI / 2);
  const len = Math.hypot(bx - ax, by - ay);
  // 양끝을 비운다 — 노드에 붙은 자국은 노드 장식으로 오독된다.
  const pad = pref.size * 1.6;
  const usable = len - pad * 2;
  if (usable <= 0) return [];

  const out: { x: number; y: number; angle: number; mirror: boolean; fade: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (pad + (usable * (i + 0.5)) / count) / len;
    const alt = i % 2 === 0 ? 1 : -1;
    // 한쪽(right): 선의 오른쪽 한 줄. 양쪽(both): 선을 사이에 두고 좌우 번갈아.
    const d = pref.placement === "both" ? alt * pref.gap : pref.gap;
    out.push({
      x: ax + (bx - ax) * t + nx * d,
      y: ay + (by - ay) * t + ny * d,
      angle: angle + Math.PI / 2,
      mirror: alt < 0,
      // 앞쪽 자국이 진하다 — 최근성이 아니라 "어느 쪽에서 왔나"라는 방향감.
      fade: 0.5 + 0.5 * (1 - i / Math.max(1, count - 1)),
    });
  }
  return out;
}

/** 한 관계선 옆에 자국들을 찍는다. */
export function drawEdgeFootprints(
  paint: FootprintPaintContext,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  alpha: number,
): void {
  const { ctx, pref } = paint;
  for (const spot of edgeFootprintPlacements(ax, ay, bx, by, pref)) {
    withFootprintInk(paint, alpha * spot.fade, () => {
      ctx.translate(spot.x, spot.y);
      ctx.rotate(spot.angle);
      drawSoles(ctx, pref, pref.size * FOOTPRINT_EDGE_SCALE, spot.mirror);
    });
  }
}

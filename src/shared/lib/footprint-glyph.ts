/**
 * 발자국 글리프 — 「걸어온 길」의 시각 표기.
 *
 * `shared` 에 있는 이유: 지도 캔버스와 **설정 미리보기**가 같은 그림을 그려야
 * 한다. 미리보기가 별도 구현이면 둘이 조용히 갈라지고, 그러면 미리보기가
 * 미리보기가 아니게 된다.
 *
 * ## 왜 링이 아니라 발자국인가 (소유자 확정 2026-07-29)
 *
 * 종전 표기는 방문 노드에 얹는 **동심 헤어라인 링**이었다(`widgets/topology-map-v2` 의 구 `model/footprint-ring.ts`).
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
} from "./appearance-preferences";

/** 발자국 잉크(RGB 3원소) — 호출부가 토큰에서 읽어 넘긴다. */
export type FootprintInk = readonly [number, number, number];

export interface FootprintPaintContext {
  ctx: CanvasRenderingContext2D;
  pref: FootprintPreference;
  ink: FootprintInk;
  /**
   * 카메라 배율에서 온 크기 계수 — 축소하면 자국도 함께 작아진다.
   *
   * 소유자 확정: *"겹쳐지는건 없게 하고싶은데? 노드가 멀어지면 발자국도 조금
   * 작아져도 괜찮으니"*. 겹침이 가장 심한 곳은 **줌 아웃**이다 — 노드와 관계선이
   * 화면에 몰리는데 자국만 고정 픽셀 크기면 자국이 그래프를 덮는다. 자국을
   * 배율에 매달면 그 상황에서 자국이 먼저 물러난다.
   *
   * 생략 시 1(종전 동작).
   */
  scale?: number;
  /**
   * 방금 찍힌 자국의 등장 진행 [0,1]. 1 이면 정착.
   *
   * **루프가 아니라 도착이다.** 상시 애니메이션은 헌장이 금지하는 장식 모션이고
   * 앰비언트 휴면도 무력화한다. 이 값은 걸음이 하나 **생긴 그 순간**에만 0→1 로
   * 올라가고 끝난다 — 사용자가 방금 한 일에 화면이 답하는 것이지, 배경이 혼자
   * 움직이는 것이 아니다.
   */
  appear?: number;
}

/** 배율 계수의 허용 범위 — 너무 작으면 모양 채널이 죽고, 너무 크면 그래프를 덮는다. */
export const FOOTPRINT_SCALE_RANGE = { min: 0.55, max: 1.1 } as const;

/**
 * 카메라 배율 → 자국 크기 계수. 순수 함수(테스트 대상).
 *
 * 1.0 배율에서 1.0 이고, 축소할수록 함께 줄되 하한에서 멈춘다. 완전 비례로
 * 두지 않는 것은 깊이 줌아웃했을 때 자국이 **한 점**이 되어 "여기 걸었다"를
 * 아예 못 말하게 되기 때문이다.
 */
export function footprintScaleFor(cameraScale: number): number {
  if (!Number.isFinite(cameraScale) || cameraScale <= 0) return 1;
  const t = Math.sqrt(cameraScale);
  return Math.min(FOOTPRINT_SCALE_RANGE.max, Math.max(FOOTPRINT_SCALE_RANGE.min, t));
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

/**
 * 양발 자국이 차지하는 반지름(px) — 두 발이 어긋나 놓이므로 대각으로 잰다.
 * `PAIR_OFFSET` 의 최대 이탈(0.3)에 한 발의 반높이(0.6)를 더한 값이다.
 */
export function footprintPairRadius(size: number): number {
  return size * 0.9;
}

/**
 * 노드 옆 발자국이 앉는 자리 — 노드 우상단, 라벨(아래)과 겹치지 않는 사분면.
 *
 * ⚠️ 거리에 **자국 반지름을 포함**한다. 그러지 않으면 `gap` 은 자국 *중심*까지의
 * 거리라, 자국이 노드 원판을 파고든다(설치 앱 실측 — 소유자: *"겹쳐지는건
 * 없게 하고싶은데"*). 겹침은 중심이 아니라 가장자리 조건이다.
 */
export function footprintAnchor(
  x: number,
  y: number,
  nodeRadius: number,
  gap: number,
  size: number,
): { x: number; y: number } {
  // 대각(45°)으로 놓으므로 축별 성분은 1/√2. 중심 거리 = 노드 반지름 + 여백 + 자국 반지름.
  const off = (nodeRadius + gap + footprintPairRadius(size)) * Math.SQRT1_2;
  return { x: x + off, y: y - off };
}

/** 노드 옆에 양발 자국 하나를 찍는다. */
export function drawNodeFootprint(
  paint: FootprintPaintContext,
  x: number,
  y: number,
  nodeRadius: number,
  alpha: number,
): void {
  const k = paint.scale ?? 1;
  const size = paint.pref.size * k;
  const at = footprintAnchor(x, y, nodeRadius, paint.pref.gap * k, size);
  // 등장은 **자리로** 표현한다 — 발이 노드 쪽에서 바깥으로 내딛듯 짧게 밀려난다.
  // 크기를 키우며 등장시키면 "커지는 표시"가 되어 상시 애니메이션처럼 읽힌다.
  const appear = paint.appear ?? 1;
  const slide = (1 - appear) * size * 0.45;
  withFootprintInk(paint, alpha * appear, () => {
    paint.ctx.translate(at.x - slide * Math.SQRT1_2, at.y + slide * Math.SQRT1_2);
    drawSoles(paint.ctx, paint.pref, size);
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
  const k = paint.scale ?? 1;
  const size = pref.size * k;
  const at = footprintAnchor(x, y, nodeRadius, pref.gap * k, size);
  ctx.save();
  ctx.globalAlpha = alpha * (paint.appear ?? 1);
  ctx.fillStyle = color;
  // 숫자는 배율을 그대로 따르지 않는다 — 11px 아래로 내려가면 못 읽는다.
  ctx.font = `650 ${Math.max(10, Math.round(11 * Math.max(k, 0.85)))}px ui-monospace, SFMono-Regular, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, at.x + footprintPairRadius(size) * 0.75, at.y - footprintPairRadius(size) * 0.75);
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
  scale = 1,
): { x: number; y: number; angle: number; mirror: boolean; fade: number }[] {
  const size = pref.size * scale;
  const gap = pref.gap * scale;
  const count = FOOTPRINT_EDGE_COUNT[pref.edgeDensity];
  const angle = Math.atan2(by - ay, bx - ax);
  const nx = Math.cos(angle + Math.PI / 2);
  const ny = Math.sin(angle + Math.PI / 2);
  const len = Math.hypot(bx - ax, by - ay);
  // 양끝을 비운다 — 노드에 붙은 자국은 노드 장식으로 오독된다.
  const pad = size * 1.6;
  const usable = len - pad * 2;
  if (usable <= 0) return [];

  /**
   * 자국이 선에서 실제로 비켜 앉으려면 **띄우는 거리에 자국 반폭을 더해야** 한다.
   * 그냥 `gap` 만 쓰면 자국의 중심이 그만큼 떨어질 뿐이라, 폭이 그보다 넓으면
   * 선이 자국 한가운데를 관통한다 — 설치 앱 실측에서 정확히 그랬다(gap 8px,
   * 자국 반폭 약 3px 이상). 소유자 요구는 *"선에 겹치게 말고"* 이고, 그건
   * 중심 거리가 아니라 **가장자리** 조건이다.
   *
   * 반폭은 앞꿈치 타원의 x 반지름(`size * 0.26`)에 크기 배율과 테두리 굵기 절반을
   * 더해 잡는다 — 크기를 키워도 겹침이 다시 생기지 않게 자국 크기에 따라 함께 큰다.
   */
  const glyphHalfWidth = size * FOOTPRINT_EDGE_SCALE * 0.26 + pref.strokeWidth / 2;
  const offset = gap + glyphHalfWidth;

  const out: { x: number; y: number; angle: number; mirror: boolean; fade: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (pad + (usable * (i + 0.5)) / count) / len;
    const alt = i % 2 === 0 ? 1 : -1;
    // 한쪽(right): 선의 오른쪽 한 줄. 양쪽(both): 선을 사이에 두고 좌우 번갈아.
    const d = pref.placement === "both" ? alt * offset : offset;
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
  const k = paint.scale ?? 1;
  for (const spot of edgeFootprintPlacements(ax, ay, bx, by, pref, k)) {
    withFootprintInk(paint, alpha * spot.fade, () => {
      ctx.translate(spot.x, spot.y);
      ctx.rotate(spot.angle);
      drawSoles(ctx, pref, pref.size * k * FOOTPRINT_EDGE_SCALE, spot.mirror);
    });
  }
}

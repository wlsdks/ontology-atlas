/**
 * 밀도 게이트 슬라이스 (fable 설계) — 클러스터 칩의 순수 Canvas 2D 드로우.
 * 접힌 부모의 자식들을 대신하는 "칩"(rounded-rect pill + mono composite
 * `＋N` + 디스클로저 caret)을 그린다. 색은 무채색 surface + 인디고 1계열만
 * (`docs/DESIGN-SYSTEM.md` 단일 인디고 헌장) — 새 hue/글로우 없음.
 *
 * 그룹 A 리디자인 (소유자 실보고 "＋63 이 먼지처럼 읽힌다 / 무슨 의미인지
 * 모르겠다"):
 * ① 대비 ~1.1:1 로 먼지처럼 읽히던 겹친-노드 글리프 스택을 폐기하고, 선행
 *    존에 단일 composite `＋N`(`＋`=인디고, 숫자=중립 numeralFace mono
 *    tabular)으로 "접힌 묶음 N개"가 또렷한 한 덩어리로 읽히게 한다.
 * ② rest 는 조용한 중립 pill(border=nodeStrokeDomain) — 진짜 노드 선택
 *    인디고와 경쟁하지 않는다. hover 에서만 surface/border/ink 가 인디고로
 *    깨어난다(색만 보간, ~150ms; transform/scale/글로우 금지). 카운트 뒤
 *    소형 caret `›`(hover `⌄`)로 "열기 N" 어포던스.
 * ③ 부모→칩 tether 는 depends 점선과 질감을 달리하고(dash [3,3],
 *    strokeStyle edgeContains) 부모 끝점에 2px 인디고 dot 을 찍어 소속을 잇되
 *    '엣지 수프'에 섞이지 않게 한다.
 *    펼침 라벨은 부모 우상단 `−N` 코너 배지로 대칭 유지.
 *
 * 히트테스트(`ui/topology-pointer-handlers.ts`)와 드로우가 **같은 사각형**을
 * 써야 클릭 좌표가 어긋나지 않으므로, 사각형 계산은 이 파일의
 * `clusterChipRect` 하나가 진실원이다(ctx 불필요 — 폰트 폭을 결정론적으로
 * 근사). label 문자열도 `clusterChipLabel`, 줌 스케일도 `clusterChipScale`
 * 하나로 통일해 히트/드로우가 절대 어긋나지 않는다.
 */

import { lerpColorHex } from "./grid";

/** 칩 기준 높이(px, 스크린 스페이스 — `clusterChipScale` 로 줌 스케일을 곱한다). */
export const CLUSTER_CHIP_HEIGHT = 28;
/** mono 폰트 기준 크기(px). */
const CHIP_FONT_SIZE = 13;
/** mono 글자당 근사 폭(px) — 히트/드로우 폭 일치용 결정론 상수. */
const CHIP_CHAR_WIDTH = 7.8;
/** composite `＋N` 앞의 선행 존 폭(px) — pill 을 조이고 `＋`를 앉힌다. */
const CHIP_GLYPH_WIDTH = 14;
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
 * S10 결함 2 — 펼침 배지 라벨. 접힘 pill 의 `+N` 과 대칭인 컴팩트 `−N`(공백
 * 없음). 배지는 부모 노드에 부착돼 좁으므로 pill 라벨보다 조인다.
 */
export function clusterBadgeLabel(count: number): string {
  return `−${count}`;
}

/** 펼침 배지 기준 높이(px, 스크린 스페이스) — 접힘 pill(28)보다 작은 미니 배지. */
export const CLUSTER_BADGE_HEIGHT = 18;
/** 배지 mono 폰트 기준 크기(px). */
const BADGE_FONT_SIZE = 11;
/** 배지 mono 글자당 근사 폭(px) — 히트/드로우 폭 일치용 결정론 상수. */
const BADGE_CHAR_WIDTH = 6.6;
/** 배지 텍스트 좌우 패딩(px). */
const BADGE_PAD_X = 6;
/**
 * 배지를 부모 노드 반지름 **바깥**으로 띄우는 여유(스크린 px, 스케일 불변).
 * 펼침 파선 오라 링(frame-draw `EXPANDED_AURA_RING_OFFSET=6`)보다 넉넉히 커
 * 배지가 오라·노드 어디와도 겹치지 않는다.
 */
const BADGE_NODE_CLEARANCE = 10;

/**
 * S10 결함 2 (소유자 실보고: 펼침 `−N` 알약이 파선/라벨과 겹침) — 떠다니는
 * 알약을 폐기하고 펼침 배지를 부모 노드 **우상단 모서리**(스크린: x+ 오른쪽,
 * y- 위)에 노드 반지름 + 여유만큼 대각(45°)으로 밀어 세운다. 노드에 부착돼
 * 카메라를 함께 타므로 겹침 원천이 차단된다. draw/hit 공용 진실원 — 둘 다 이
 * 함수로 같은 사각형을 얻어 클릭 좌표가 어긋나지 않는다. `nodeScreenRadius` 는
 * 부모 노드의 base 스크린 반지름(`radiusForKind × magnitudeScale × cameraScale`).
 */
export function clusterBadgeRect(
  parentScreenX: number,
  parentScreenY: number,
  nodeScreenRadius: number,
  label: string,
  scale: number = 1,
): ClusterChipRect {
  const textW = label.length * BADGE_CHAR_WIDTH;
  const w = (textW + BADGE_PAD_X * 2) * scale;
  const h = CLUSTER_BADGE_HEIGHT * scale;
  const diag = Math.SQRT1_2; // cos(45°) = sin(45°)
  const reach = nodeScreenRadius + BADGE_NODE_CLEARANCE + h / 2;
  const cx = parentScreenX + reach * diag;
  const cy = parentScreenY - reach * diag;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * 배지가 **앉는 자리**의 중심. `clusterBadgeRect` 의 cx/cy 와 같은 식이되
 * 라벨 폭에 안 기대므로, 라벨을 모르는 자리(알약의 이동 목적지)에서도 쓴다.
 *
 * 왜 필요한가 — 접힘 알약은 anchor 에, 펼침 배지는 부모 우상단에 있고 그 둘은
 * **51~147px 떨어져 있다**(실측). 지금은 그 간극을 알파 크로스페이드로만
 * 건너서, 하나의 표시가 자리를 옮긴 게 아니라 **여기서 사라지고 저기서
 * 나타난다.** 눈이 따라갈 선이 없으면 사용자는 둘을 같은 것으로 안 읽는다.
 * 알약이 이 좌표로 **걸어가면서** 사라지면 크로스페이드가 간극 위가 아니라
 * 도착점에서 일어난다.
 */
export function clusterBadgeCenter(
  parentScreenX: number,
  parentScreenY: number,
  nodeScreenRadius: number,
  scale: number = 1,
): { x: number; y: number } {
  const diag = Math.SQRT1_2;
  const reach = nodeScreenRadius + BADGE_NODE_CLEARANCE + (CLUSTER_BADGE_HEIGHT * scale) / 2;
  return { x: parentScreenX + reach * diag, y: parentScreenY - reach * diag };
}

/**
 * 접힘 알약이 이 프레임에 그려질 자리 — anchor 에서 배지 자리로 `revealT`
 * 만큼 이동한 점.
 *
 * 방향이 양쪽 다 맞는다: 펼칠 때 `revealT` 는 0→1 이라 알약이 anchor 를 떠나
 * 배지 자리에 도착하며 사라지고, 접을 때는 1→0 이라 배지 자리에서 출발해
 * anchor 로 돌아오며 나타난다. 어느 쪽이든 **집으로 가는 하나의 표시**다.
 *
 * 부모 좌표가 없으면(디그레이드) 이동하지 않는다 — 목적지를 모르는데 움직이면
 * 그건 이동이 아니라 표류다.
 */
export function clusterChipTravelPoint(input: {
  screenX: number;
  screenY: number;
  parentScreenX?: number;
  parentScreenY?: number;
  nodeScreenRadius?: number;
  revealT?: number;
  scale?: number;
}): { x: number; y: number } {
  const t = input.revealT;
  if (
    t === undefined ||
    t <= 0 ||
    input.parentScreenX === undefined ||
    input.parentScreenY === undefined ||
    input.nodeScreenRadius === undefined
  ) {
    return { x: input.screenX, y: input.screenY };
  }
  const clamped = Math.min(1, Math.max(0, t));
  const dest = clusterBadgeCenter(
    input.parentScreenX,
    input.parentScreenY,
    input.nodeScreenRadius,
    input.scale ?? 1,
  );
  return {
    x: input.screenX + (dest.x - input.screenX) * clamped,
    y: input.screenY + (dest.y - input.screenY) * clamped,
  };
}

export interface ClusterBadgeDrawInput {
  parentScreenX: number;
  parentScreenY: number;
  /** 부모 노드 base 스크린 반지름(`radiusForKind × magnitudeScale × cameraScale`). */
  nodeScreenRadius: number;
  count: number;
  hovered: boolean;
  /** 줌 스케일(`clusterChipScale`). 기본 1. */
  scale?: number;
}

/**
 * 펼침 배지 한 개를 그린다 — 부모 노드 우상단 모서리에 부착된 미니 `−N`.
 * 겹친-글리프 스택·커넥터 없음(펼치면 자식이 실제로 보이고 배지는 접기
 * 어포던스일 뿐). 호출부가 `ctx.globalAlpha` 를 부모 티어 알파로 세팅한다.
 */
export function drawClusterBadge(
  ctx: CanvasRenderingContext2D,
  input: ClusterBadgeDrawInput,
  colors: ClusterChipColors,
): void {
  const scale = input.scale ?? 1;
  const label = clusterBadgeLabel(input.count);
  const rect = clusterBadgeRect(input.parentScreenX, input.parentScreenY, input.nodeScreenRadius, label, scale);

  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  // 배지 숫자도 중립 numeralFace — 포커스 중에도 포커스 노드가 attention
  // winner 를 유지하도록 indigoBright 를 쓰지 않는다.
  ctx.fillStyle = colors.numeralInk;
  ctx.font = `600 ${BADGE_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
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

/**
 * S11 결함 (소유자 실보고 "노드 사이에 +31 이 겹쳐지는것도 보기싫은데") — 칩은
 * 노드 라벨보다 **먼저** 그려지는데(`topology-frame-draw.ts`) 라벨 배치기
 * (`greedyPlaceLabels`)가 칩의 존재를 몰라 라벨이 칩 위에 그대로 덮어 그려졌다.
 * 라벨 배치기에 칩을 **예약 점유자**로 넘기려면 "이번 프레임에 칩이 실제로
 * 차지하는 사각형" 이 필요하다.
 *
 * `drawClusterChip` 과 **같은 분기**를 타는 것이 이 함수의 계약이다 — reveal 램프로
 * 사라지는 중이면 null(안 보이는 칩이 라벨을 밀어내면 유령 여백이 생긴다), 펼침이면
 * 부모 우상단 배지, 접힘이면 pill. 분기가 갈라지면 라벨이 빈 곳을 피하거나 칩 위에
 * 다시 겹치므로 draw 와 이 함수는 반드시 함께 수정한다(`cluster-chips.test.ts` 가드).
 */
export function clusterChipOccupancyRect(input: ClusterChipDrawInput): ClusterChipRect | null {
  const scale = input.scale ?? 1;
  // drawClusterChip 의 formAlpha 와 동일식 — 램프로 사라지는 형태는 점유하지 않는다.
  const formAlpha =
    input.revealT === undefined
      ? 1
      : Math.min(1, Math.max(0, input.expanded ? input.revealT : 1 - input.revealT));
  if (formAlpha < 0.01) return null;

  if (input.expanded) {
    if (
      input.parentScreenX === undefined ||
      input.parentScreenY === undefined ||
      input.nodeScreenRadius === undefined
    ) {
      return null; // draw 도 이 경우 그리지 않는다(디그레이드).
    }
    return clusterBadgeRect(
      input.parentScreenX,
      input.parentScreenY,
      input.nodeScreenRadius,
      clusterBadgeLabel(input.count),
      scale,
    );
  }

  // 점유도 이동을 따라간다 — 알약이 걸어가는데 자리만 anchor 에 남으면 라벨
  // 회피가 **빈 자리를 피하고 실제 잉크는 안 피한다.**
  const travel = clusterChipTravelPoint(input);
  return clusterChipRect(travel.x, travel.y, clusterChipLabel(input.count, false), scale);
}

export interface ClusterChipColors {
  /** rest pill surface(무채색 dim). */
  surface: string;
  /** rest 얇은 보더(중립 nodeStrokeDomain) — 노드 선택 인디고와 경쟁 안 함. */
  border: string;
  /** composite `＋` 글리프 rest 잉크(인디고). */
  plusInk: string;
  /** 카운트 숫자 + 펼침 배지 rest 잉크(중립 numeralFace, mono tabular). */
  numeralInk: string;
  /** 부모→칩 tether stroke(edgeContains — depends 잉크와 명도대 어긋냄). */
  tether: string;
  /** hover pill surface(nodeFillCapability). */
  hoverSurface: string;
  /** hover 보더(인디고). */
  hoverBorder: string;
  /** hover 시 `＋`/숫자 잉크(indigoBright). */
  hoverInk: string;
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
  /**
   * hover 이징 진행도 0..1(색만 보간). 프레임 루프가 `now` 로 ~150ms 램프를
   * 만들어 넘긴다. prefers-reduced-motion 이면 hovered?1:0 으로 즉시 스냅.
   * 미지정이면 `hovered` 로 폴백(0/1).
   */
  hoverT?: number;
  /**
   * rank7 — 펼침/접힘 reveal 램프 0..1(펼치면 1, 접히면 0 수렴, 루프가 넘김).
   * 현재 표시되는 칩 형태(펼침=badge / 접힘=pill)의 알파를 이 값으로 페이드인해
   * "툭 전환"을 없앤다: badge 알파 = revealT, pill 알파 = 1−revealT. 미지정이면
   * 알파 1(하위호환 — 하드 표시). 색만/알파만 — 위치 이동 없음.
   */
  revealT?: number;
  /** 줌 스케일(카메라 스케일에서 `clusterChipScale` 로 유도). 기본 1. */
  scale?: number;
  /** 부모 노드 스크린 좌표 — 있으면 부모→칩 짧은 점선 커넥터를 그린다. */
  parentScreenX?: number;
  parentScreenY?: number;
  /**
   * S10 결함 2 — 부모 노드 base 스크린 반지름. 펼침(`expanded`)일 때 부모
   * 우상단 배지 위치 계산에 필요. 부모 좌표 + 이 값이 모두 있으면 떠다니는
   * 알약 대신 `drawClusterBadge` 로 위임한다.
   */
  nodeScreenRadius?: number;
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

  // rank7 — 현재 형태(펼침=badge / 접힘=pill)의 알파를 reveal 램프로 페이드인.
  // 미지정이면 1(하위호환). 호출부가 세팅한 baseAlpha(부모 티어 알파)에 곱한다.
  //
  // ⚠️ **램프 중에는 두 형태를 함께 그린다.** 종전에는 `expanded` 로 갈라 한
  // 형태만 그렸고, 그래서 **어느 방향에서도 크로스페이드가 없었다** — 펼치면
  // 알약이 1프레임에 사라지고 배지가 자기 램프를 혼자 탔다(프레임 실측
  // 2026-07-31: 알약 마지막 프레임 α=1.000 → 다음 프레임 부재, 중간 프레임 0개).
  //
  // 더 나쁜 것은 그 갈래가 **이동 코드보다 앞에** 있었다는 점이다. 펼침은
  // 첫 프레임부터 `expanded=true` 라 `clusterChipTravelPoint` 에 **한 번도
  // 도달하지 못했다** — 이동을 넣어 놓고 펼침에서는 실행조차 안 됐다.
  const baseAlpha = ctx.globalAlpha;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const badgeAlpha =
    input.revealT === undefined ? (input.expanded ? 1 : 0) : clamp01(input.revealT);
  const pillAlpha =
    input.revealT === undefined ? (input.expanded ? 0 : 1) : clamp01(1 - input.revealT);
  if (badgeAlpha < 0.01 && pillAlpha < 0.01) return;

  // S10 결함 2 — 펼침 형태는 떠다니는 알약이 아니라 부모 노드 우상단 배지다
  // (파선 오라/라벨 겹침 원천 차단). 부모 좌표 + 노드 반지름이 있어야 배지를
  // 앉힐 수 있다 — 없으면(디그레이드) 그리지 않는다.
  if (
    badgeAlpha >= 0.01 &&
    input.parentScreenX !== undefined &&
    input.parentScreenY !== undefined &&
    input.nodeScreenRadius !== undefined
  ) {
    ctx.globalAlpha = baseAlpha * badgeAlpha;
    drawClusterBadge(
      ctx,
      {
        parentScreenX: input.parentScreenX,
        parentScreenY: input.parentScreenY,
        nodeScreenRadius: input.nodeScreenRadius,
        count: input.count,
        hovered: input.hovered,
        scale,
      },
      colors,
    );
  }

  if (pillAlpha < 0.01) {
    ctx.globalAlpha = baseAlpha; // rank7 — reveal 알파 복원.
    return;
  }
  ctx.globalAlpha = baseAlpha * pillAlpha;

  // 나가는(또는 들어오는) 알약은 **언제나 접힘 형태**다 — `+N`. `input.expanded`
  // 를 라벨에 그대로 넘기면 펼침 램프 중의 알약이 `− N` 으로 읽혀, 사라지는
  // 것과 나타나는 것이 같은 글자를 말하게 된다.
  const label = clusterChipLabel(input.count, false);
  // 알약은 사라지는 동안 배지 자리로 **걸어간다**(`clusterChipTravelPoint` 의
  // 주석 참고). 정착 상태(revealT 0 또는 미지정)에서는 anchor 그대로라 종전
  // 좌표와 한 픽셀도 다르지 않다.
  const travel = clusterChipTravelPoint(input);
  const rect = clusterChipRect(travel.x, travel.y, label, scale);

  // hover 이징 — 색만 보간(transition-colors 성격). rest(조용한 중립) →
  // hover(인디고로 깨어남). transform/scale/글로우 없음. hex 토큰 간 RGB lerp.
  const t = input.hoverT ?? (input.hovered ? 1 : 0);
  const mix = (rest: string, hover: string): string =>
    t <= 0 ? rest : t >= 1 ? hover : lerpColorHex(rest, hover, t);
  const surface = mix(colors.surface, colors.hoverSurface);
  const border = mix(colors.border, colors.hoverBorder);
  const plusColor = mix(colors.plusInk, colors.hoverInk);
  const numColor = mix(colors.numeralInk, colors.hoverInk);

  // 부모→칩 tether — depends 점선과 질감을 달리해(dash [3,3], strokeStyle
  // edgeContains 로 의존 잉크와 명도대 어긋냄) '엣지 수프'에 안 섞이게. 부모
  // 끝점에 2px 인디고 dot 으로 소속을 못 박는다. pill 을 나중에 채워 tether 의
  // pill 안쪽 구간은 자연히 가려진다.
  if (input.parentScreenX !== undefined && input.parentScreenY !== undefined) {
    ctx.save();
    ctx.setLineDash([3 * scale, 3 * scale]);
    ctx.beginPath();
    ctx.moveTo(input.parentScreenX, input.parentScreenY);
    ctx.lineTo(travel.x, travel.y);
    ctx.strokeStyle = colors.tether;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    // 부모 끝점 앵커 dot — tether 시작점을 못 박아 소속을 읽히게.
    ctx.beginPath();
    ctx.arc(input.parentScreenX, input.parentScreenY, 2 * scale, 0, Math.PI * 2);
    ctx.fillStyle = colors.plusInk;
    ctx.fill();
    ctx.restore();
  }

  // pill
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = border;
  ctx.stroke();

  // composite `＋N` + 디스클로저 caret — pill 중앙에 한 덩어리로. `＋`는 인디고,
  // 숫자는 중립 numeralFace(mono tabular), caret 은 border 잉크로 "열기 N"
  // 어포던스만. 히트박스는 위 rect 가 진실원이므로 텍스트는 자유롭게 중앙정렬.
  ctx.font = `600 ${CHIP_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const plus = "+";
  const num = String(input.count);
  const caret = ` ${input.hovered ? "⌄" : "›"}`;
  const plusW = ctx.measureText(plus).width;
  const numW = ctx.measureText(num).width;
  const caretW = ctx.measureText(caret).width;
  const ty = travel.y + 0.5 * scale;
  let tx = travel.x - (plusW + numW + caretW) / 2;
  ctx.fillStyle = plusColor;
  ctx.fillText(plus, tx, ty);
  tx += plusW;
  ctx.fillStyle = numColor;
  ctx.fillText(num, tx, ty);
  tx += numW;
  ctx.fillStyle = border;
  ctx.fillText(caret, tx, ty);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = baseAlpha; // rank7 — reveal formAlpha 복원.
}

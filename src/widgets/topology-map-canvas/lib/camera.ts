/**
 * 지도 카메라 — 단일 컨테이너 transform 의 순수 수학.
 *
 * 계약 (docs/TOPOLOGY-MAP-REBUILD.md §3): 카메라 상태는 (tx, ty, k) 하나뿐이고
 * viewport 좌표 = world 좌표 × k + t. 팬/줌/fit 은 전부 여기의 순수 함수로
 * 계산돼 컨테이너 style.transform 1건으로만 반영된다 — per-frame DOM 동기화
 * (구 SigmaSkeletonCards 의 jank 원천) 를 구조적으로 제거한다.
 */

export interface MapCamera {
  tx: number;
  ty: number;
  k: number;
}

export interface MapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 카드는 `scale(1/k)` 역보정으로 화면-px 크기 고정이다(TopologyMapCanvas.tsx
 * `--map-inv-k`). fit 은 world bounds 만으로는 부족하고, 극단 카드가 화면에서
 * 실제로 차지하는 px 여백(overhang)을 safe rect 예산에서 미리 빼야 한다 —
 * 디자인 가디언 verdict a2.
 */
export interface CardOverhang {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const ZERO_OVERHANG: CardOverhang = { left: 0, right: 0, top: 0, bottom: 0 };

export const MAP_SCALE_MIN = 0.25;
export const MAP_SCALE_MAX = 3;
/** fit 전용 하한 — 0/음수 나눗셈만 막는 수학적 안전장치, 판독성 하한이 아니다. */
const FIT_SCALE_EPSILON = 0.001;

export function clampScale(k: number): number {
  return Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, k));
}

/**
 * fit 전용 clamp — verdict a3: 사용자 줌 하한(MAP_SCALE_MIN)과 다른 도메인.
 * 넓은 콘텐츠는 정직하게 0.25 미만으로 축소돼야 코너가 잘리지 않는다. 사용자가
 * 그 다음 휠 줌을 하면 `zoomAt`(clampScale) 이 판독 가능한 하한을 다시 강제한다.
 */
export function clampFitScale(k: number): number {
  return Math.min(MAP_SCALE_MAX, Math.max(FIT_SCALE_EPSILON, k));
}

/** 커서 아래 world 지점이 고정된 채 스케일만 바뀌는 줌. */
export function zoomAt(
  camera: MapCamera,
  cursor: { x: number; y: number },
  nextScaleRaw: number,
): MapCamera {
  const k = clampScale(nextScaleRaw);
  const ratio = k / camera.k;
  return {
    k,
    tx: cursor.x - (cursor.x - camera.tx) * ratio,
    ty: cursor.y - (cursor.y - camera.ty) * ratio,
  };
}

export function panBy(camera: MapCamera, dx: number, dy: number): MapCamera {
  return { tx: camera.tx + dx, ty: camera.ty + dy, k: camera.k };
}

/**
 * bounds 전체가 (insets 를 뺀) safe rect 안에 들어오는 카메라.
 * 기획자 감사 ③("fit 이 전체를 안 맞춘다")의 계약: 코너 4점이 전부
 * safe rect 내부 — 단위 테스트가 고정한다.
 */
export function fitBounds(
  bounds: MapBounds,
  viewport: { width: number; height: number },
  insets: MapInsets,
  options?: { maxScale?: number; overhang?: CardOverhang },
): MapCamera {
  const overhang = options?.overhang ?? ZERO_OVERHANG;
  const safeW = Math.max(
    1,
    viewport.width - insets.left - insets.right - overhang.left - overhang.right,
  );
  const safeH = Math.max(
    1,
    viewport.height - insets.top - insets.bottom - overhang.top - overhang.bottom,
  );
  const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
  const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  // fit 은 clampScale(사용자 줌 하한) 이 아니라 clampFitScale 로 도메인을
  // 분리한다 — verdict a3: 넓은 콘텐츠는 0.25 미만이 정답일 수 있다.
  const k = clampFitScale(
    Math.min(options?.maxScale ?? 1.4, (safeW / bw) * 0.92, (safeH / bh) * 0.92),
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const safeCx = insets.left + overhang.left + safeW / 2;
  const safeCy = insets.top + overhang.top + safeH / 2;
  return { k, tx: safeCx - cx * k, ty: safeCy - cy * k };
}

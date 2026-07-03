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

export const MAP_SCALE_MIN = 0.25;
export const MAP_SCALE_MAX = 3;

export function clampScale(k: number): number {
  return Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, k));
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
  options?: { maxScale?: number },
): MapCamera {
  const safeW = Math.max(1, viewport.width - insets.left - insets.right);
  const safeH = Math.max(1, viewport.height - insets.top - insets.bottom);
  const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
  const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  const k = clampScale(
    Math.min(options?.maxScale ?? 1.4, (safeW / bw) * 0.92, (safeH / bh) * 0.92),
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const safeCx = insets.left + safeW / 2;
  const safeCy = insets.top + safeH / 2;
  return { k, tx: safeCx - cx * k, ty: safeCy - cy * k };
}

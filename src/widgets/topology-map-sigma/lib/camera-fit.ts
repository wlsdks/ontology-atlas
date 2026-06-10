/**
 * 골격 확장 카메라 fit — 순수 계산.
 *
 * Sigma autoRescale 은 그래프 bbox 를 *컨테이너 전체* 에 맞추므로, 떠 있는
 * chrome(상단 툴바·좌측 분석 패널·우측 팝오버) 밑으로 콘텐츠가 파고든다.
 * 가시 노드들의 viewport bbox 를 chrome inset 을 뺀 safe rect 에 맞추는
 * ratio 배수와 정렬 중심을 계산한다 — 호출자가 framed 좌표로 변환해
 * camera.animate 한다.
 */

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SafeAreaCameraFitInput {
  /** 가시 노드들의 viewport(px) bbox — 현재 카메라 기준. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  viewport: { width: number; height: number };
  insets: SafeAreaInsets;
  /**
   * 줌인 캡 — bbox 가 작아도 이 배수 미만으로 ratio 를 줄이지(줌인하지)
   * 않는다. 골격 overview 에서 한두 카드만 남았을 때 과한 줌인 방지.
   */
  minZoomInScale?: number;
}

export interface SafeAreaCameraFit {
  /** camera.ratio 에 곱할 배수 (>1 = 줌아웃). */
  ratioScale: number;
  /** bbox 중심 (viewport px) — 이 점이 safeCenter 에 오도록 팬한다. */
  bboxCenter: { x: number; y: number };
  /** safe rect 의 중심 (viewport px). */
  safeCenter: { x: number; y: number };
}

const DEFAULT_MIN_ZOOM_IN_SCALE = 0.55;

export function resolveSafeAreaCameraFit({
  bbox,
  viewport,
  insets,
  minZoomInScale = DEFAULT_MIN_ZOOM_IN_SCALE,
}: SafeAreaCameraFitInput): SafeAreaCameraFit {
  const safeWidth = Math.max(1, viewport.width - insets.left - insets.right);
  const safeHeight = Math.max(1, viewport.height - insets.top - insets.bottom);
  const bboxWidth = Math.max(1, bbox.maxX - bbox.minX);
  const bboxHeight = Math.max(1, bbox.maxY - bbox.minY);

  const rawScale = Math.max(bboxWidth / safeWidth, bboxHeight / safeHeight);
  const ratioScale = Math.max(minZoomInScale, rawScale);

  return {
    ratioScale,
    bboxCenter: {
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
    },
    safeCenter: {
      x: insets.left + safeWidth / 2,
      y: insets.top + safeHeight / 2,
    },
  };
}

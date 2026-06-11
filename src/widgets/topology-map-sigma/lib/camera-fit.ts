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
const DEFAULT_SELECTED_FOCUS_TOP_INSET = 420;
const SELECTED_FANOUT_ROW_TOP_INSET = 24;
const BASE_TOP_INSET = 96;

export interface SkeletonSafeInsetOptions {
  /**
   * 선택 노드에 px-docked 로 펼쳐지는 카드 행 수. 없으면 이전처럼 큰
   * fan-out 안전값을 사용해 호출부 마이그레이션 중에도 잘림을 피한다.
   */
  selectedFanoutRows?: number;
}

/**
 * 토폴로지 화면-크기 대응의 단일 기준 — 그래프 카드(폰트 calc), chrome
 * (.topology-ui-scale zoom), safe inset 이 전부 이 단계를 공유한다.
 * 1920px(24") 부터 1.15, 2400px(27"+) 부터 1.3.
 */
export function resolveTopologyUiScale(viewportWidth: number): number {
  if (viewportWidth >= 2400) return 1.3;
  if (viewportWidth >= 1920) return 1.15;
  return 1;
}

/**
 * 골격 뷰의 chrome safe inset 단일 진실원 — 상단 툴바(96, 선택 포커스
 * 팬은 docked 카드 fan-out 에 따라 최대 420) · 우측 팝오버(392 =
 * TopologyNodePopover 폭 + 여백, 선택 활성일 때만) · 좌(48) · 하(56).
 * chrome 이 ui-scale(zoom)로 커지는 만큼 inset 도 같은 배수. 소형
 * 뷰포트에선 우측 inset 을 16 으로 줄여 safe 폭 붕괴(음수)를 막는다.
 */
export function resolveSkeletonSafeInsets(
  viewportWidth: number,
  selectionActive: boolean,
  options: SkeletonSafeInsetOptions = {},
): SafeAreaInsets {
  const scale = resolveTopologyUiScale(viewportWidth);
  const selectedTop =
    options.selectedFanoutRows === undefined
      ? DEFAULT_SELECTED_FOCUS_TOP_INSET
      : Math.min(
          DEFAULT_SELECTED_FOCUS_TOP_INSET,
          Math.max(BASE_TOP_INSET, options.selectedFanoutRows * SELECTED_FANOUT_ROW_TOP_INSET),
        );
  const top = (selectionActive ? selectedTop : BASE_TOP_INSET) * scale;
  const right = selectionActive ? (viewportWidth < 720 ? 16 : 392 * scale) : 48 * scale;
  return {
    top,
    right,
    bottom: 56 * scale,
    left: 48 * scale,
  };
}

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

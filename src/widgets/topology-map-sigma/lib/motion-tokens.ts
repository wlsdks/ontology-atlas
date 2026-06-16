export const TOPOLOGY_CAMERA_MOTION_CONTRACT = 'purposeful-safe-fit-motion';
export const TOPOLOGY_CAMERA_EASING_NAME = 'ease-out-quart';
export const SELECTED_FOCUS_CAMERA_DURATION_MS = 420;
export const SELECTED_FOCUS_CAMERA_DISTANCE_POLICY = 'bounded-safe-fit-distance';
export const SELECTED_FOCUS_CAMERA_BASE_MAX_DISTANCE_PX = 220;
export const SELECTED_FOCUS_CAMERA_FANOUT_ROW_DISTANCE_PX = 16;
export const TOPOLOGY_DRAG_SETTLE_MOTION_CONTRACT = 'linked-cluster-drag-settle';
export const TOPOLOGY_DRAG_SETTLE_DURATION_MS = 720;
export const TOPOLOGY_DRAG_SETTLE_EASING_NAME = 'ease-out';
export const TOPOLOGY_RELATION_INSPECTOR_MOTION_CONTRACT =
  'active-relation-inspector-entry';
export const TOPOLOGY_RELATION_INSPECTOR_DURATION_MS = 180;
export const TOPOLOGY_RELATION_INSPECTOR_EASING_NAME = 'ease-out';

export function topologyCameraEaseOutQuart(k: number): number {
  return 1 - Math.pow(1 - k, 4);
}

export function resolveSelectedFocusCameraMaxDistancePx(selectedFanoutRows: number): number {
  return (
    SELECTED_FOCUS_CAMERA_BASE_MAX_DISTANCE_PX +
    Math.max(0, selectedFanoutRows - 2) *
      SELECTED_FOCUS_CAMERA_FANOUT_ROW_DISTANCE_PX
  );
}

export const TOPOLOGY_CAMERA_MOTION_CONTRACT = 'purposeful-safe-fit-motion';
export const TOPOLOGY_CAMERA_EASING_NAME = 'ease-out-quart';
export const SELECTED_FOCUS_CAMERA_DURATION_MS = 420;
export const TOPOLOGY_DRAG_SETTLE_MOTION_CONTRACT = 'linked-cluster-drag-settle';
export const TOPOLOGY_DRAG_SETTLE_DURATION_MS = 720;
export const TOPOLOGY_DRAG_SETTLE_EASING_NAME = 'ease-out';

export function topologyCameraEaseOutQuart(k: number): number {
  return 1 - Math.pow(1 - k, 4);
}

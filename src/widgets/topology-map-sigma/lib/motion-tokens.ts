export const TOPOLOGY_CAMERA_MOTION_CONTRACT = 'purposeful-safe-fit-motion';
export const TOPOLOGY_CAMERA_EASING_NAME = 'ease-out-quart';
export const SELECTED_FOCUS_CAMERA_DURATION_MS = 420;

export function topologyCameraEaseOutQuart(k: number): number {
  return 1 - Math.pow(1 - k, 4);
}

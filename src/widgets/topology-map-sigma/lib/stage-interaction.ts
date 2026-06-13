export const STAGE_PAN_CLICK_CANCEL_PX = 12;

export function isStagePanGesture(
  downAt: { x: number; y: number } | null,
  upAt: { x: number; y: number },
  threshold = STAGE_PAN_CLICK_CANCEL_PX,
) {
  return downAt !== null && Math.hypot(upAt.x - downAt.x, upAt.y - downAt.y) > threshold;
}

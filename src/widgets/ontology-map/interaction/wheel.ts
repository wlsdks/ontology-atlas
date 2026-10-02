export const WHEEL_LINE_HEIGHT_PX = 16;

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number, viewportHeight: number): number {
  if (deltaMode === 1) return deltaY * WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === 2) return deltaY * viewportHeight;
  return deltaY;
}

export const WHEEL_ZOOM_SENSITIVITY = 0.0023;

const PINCH_ZOOM_SENSITIVITY = 0.01;

const PINCH_WHEEL_MAX_DELTA_PX = 50;

export function isPinchWheel(event: Pick<WheelEvent, "ctrlKey" | "deltaMode" | "deltaY">): boolean {
  return event.ctrlKey && event.deltaMode === 0 && Math.abs(event.deltaY) < PINCH_WHEEL_MAX_DELTA_PX;
}

export interface WheelZoomOptions {
  pinch?: boolean;
  speed?: number;
}

export function computeWheelZoomFactor(pixelDeltaY: number, { pinch = false, speed = 1 }: WheelZoomOptions = {}): number {
  const sensitivity = pinch ? PINCH_ZOOM_SENSITIVITY : WHEEL_ZOOM_SENSITIVITY;
  return Math.exp(-pixelDeltaY * sensitivity * speed);
}

const WHEEL_GLIDE_IGNORE_THRESHOLD_PX = 4;

export function shouldIgnoreWheelGlide(pixelDeltaY: number, ctrlKey: boolean): boolean {
  if (ctrlKey) return false;
  return Math.abs(pixelDeltaY) < WHEEL_GLIDE_IGNORE_THRESHOLD_PX;
}

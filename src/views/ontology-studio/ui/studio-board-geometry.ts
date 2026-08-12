/**
 * 나침 무대의 고정 좌표계 — `StudioCompass.tsx` 분할(2026-08-13)에서 나온
 * 공유 기하. 무대 본체·피커·오버플로 목록이 같은 보드 치수와 같은 클램프를
 * 써야 서로 어긋난 좌표로 그리지 않는다.
 */
export const BOARD = { w: 1180, h: 600 } as const;
export const CX = BOARD.w / 2; // 590
export const CY = BOARD.h / 2; // 300

/** Clamp a picker/list left edge inside the board with an 8px gutter. */
export function clampX(x: number, w: number): number {
  return Math.min(Math.max(x, 8), BOARD.w - w - 8);
}
/** Clamp a picker/list top edge inside the board so its full height stays visible. */
export function clampY(y: number, h: number): number {
  return Math.min(Math.max(y, 8), Math.max(8, BOARD.h - h - 8));
}

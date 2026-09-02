/**
 * **Keyboard zoom and fit** (2026-09-02).
 *
 * Every canvas and graph tool the map is measured against offers the same
 * three keys (zoom in, zoom out, fit) and this map answered only the wheel. A person walking the map with the
 * arrow keys (`keyboard-walk.ts`) had no way to change altitude without
 * reaching for the trackpad, which breaks the flow the walk exists for.
 *
 * `+`/`=` zooms in one step, `-`/`_` zooms out one step, `0` fits the whole
 * map. A step is ×1.25 — small enough that three presses feel like one
 * deliberate approach rather than a jump, large enough that ten presses cross
 * the full range. Modifier combinations are left to the browser (`⌘+`/`⌘-` are
 * page zoom and must keep working), and the key handler only runs while the
 * canvas has focus, so typing in a panel is never a zoom.
 */
export const KEY_ZOOM_STEP = 1.25;

export type KeyboardZoomIntent = { kind: "zoom"; factor: number } | { kind: "fit" };

/** Which camera intent a keydown carries, or null when the key is not one of ours. */
export function keyboardZoomIntent(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): KeyboardZoomIntent | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  switch (event.key) {
    case "+":
    case "=":
      return { kind: "zoom", factor: KEY_ZOOM_STEP };
    case "-":
    case "_":
      return { kind: "zoom", factor: 1 / KEY_ZOOM_STEP };
    case "0":
      return { kind: "fit" };
    default:
      return null;
  }
}

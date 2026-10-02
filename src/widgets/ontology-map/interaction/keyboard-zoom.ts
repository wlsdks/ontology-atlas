export const KEY_ZOOM_STEP = 1.25;

export type KeyboardZoomIntent = { kind: "zoom"; factor: number } | { kind: "fit" };

export function keyboardZoomIntent(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
  },
  speed = 1,
): KeyboardZoomIntent | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const step = Math.pow(KEY_ZOOM_STEP, speed);
  switch (event.key) {
    case "+":
    case "=":
      return { kind: "zoom", factor: step };
    case "-":
    case "_":
      return { kind: "zoom", factor: 1 / step };
    case "0":
      return { kind: "fit" };
    default:
      return null;
  }
}

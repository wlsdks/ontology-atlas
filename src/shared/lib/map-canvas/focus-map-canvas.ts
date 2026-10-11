export const MAP_CANVAS_SURFACE_ROLE = 'map-canvas';

const FOCUS_MAP_CANVAS_MAX_FRAMES = 120;

const MAP_CANVAS_SELECTOR = `[data-surface-role="${MAP_CANVAS_SURFACE_ROLE}"], [data-role="${MAP_CANVAS_SURFACE_ROLE}"]`;

function findMapCanvas(): HTMLElement | null {
  return document.querySelector<HTMLElement>(MAP_CANVAS_SELECTOR);
}

export function focusMapCanvasWhenReady(
  maxFrames: number = FOCUS_MAP_CANVAS_MAX_FRAMES,
  keyboardVisible = false,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const focus = (canvas: HTMLElement) => {
    canvas.focus();
    if (keyboardVisible && document.activeElement === canvas) canvas.dataset.keyboardFocus = 'true';
  };

  const immediate = findMapCanvas();
  if (immediate) {
    focus(immediate);
    return () => {};
  }

  let frame = 0;
  let raf = 0;
  const tick = () => {
    const canvas = findMapCanvas();
    if (canvas) {
      focus(canvas);
      return;
    }
    frame += 1;
    if (frame >= maxFrames) return;
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(raf);
}

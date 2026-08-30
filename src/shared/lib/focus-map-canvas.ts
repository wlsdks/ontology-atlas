/**
 * Focuses the map canvas, so that **`G M` means "grab the map", not just "go to
 * the map"**.
 *
 * **Why this exists — a measurement found the hole.** After arrow-key graph
 * walking shipped (2026-08-09), measuring in the browser showed that **reaching
 * that canvas from the keyboard took 30 Tab presses** (1440×900, on the map
 * screen): the left rail, the top tools and the INDEX panel controls all come
 * first. However well the walking works, 30 presses in front of it mean **the
 * people it was built for cannot reach it** — those people are keyboard users.
 *
 * So an existing key gains one more job. `G M` already navigated to the map and
 * **did nothing when you were already there**; now it grabs the canvas. No new
 * shortcut was invented, so there is nothing extra to memorise, and the shortcut
 * sheet already documents the key, so discovery is unchanged.
 *
 * **Why it waits several frames instead of trying once.** Pressing `G M` from
 * another screen calls this **before** the router has drawn the map, so the
 * canvas is not in the DOM yet. Looking once and giving up produces a defect
 * where it works from the map but not from elsewhere — the kind whose cause a
 * user cannot guess.
 *
 * The wait is counted in **frames** rather than milliseconds because paint timing
 * follows machine speed, so a millisecond budget fails only on slow machines
 * (the same reason `.claude/rules/architecture.md` locks gates by call count,
 * not by milliseconds).
 */

/** The marker used to find the canvas. `data-testid` is never a runtime selector — that belongs to tests. */
export const MAP_CANVAS_SURFACE_ROLE = 'map-canvas';

/**
 * How many frames to wait: the route transition plus the first paint must fit.
 *
 * ⚠️ **This started at 30 and that was too few** — it failed only when `G M` was
 * pressed from another screen (from the map itself the canvas already exists and
 * it finishes on the first frame). Measured: pressing `G M` from the project list
 * creates the canvas **395ms** later. 30 frames is 500ms in the ideal case, but
 * frames are uneven during a route transition, so it does not fit.
 *
 * A generous value causes no focus fight: `RouteFocusManager` **leaves focus
 * alone when it is already inside `#main`** (its own rule), and the canvas is
 * inside `#main` (verified), so it yields if we get there first. If we are late,
 * it sets the reading start point instead, which is correct accessibility
 * behaviour.
 */
const FOCUS_MAP_CANVAS_MAX_FRAMES = 120;

function findMapCanvas(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-surface-role="${MAP_CANVAS_SURFACE_ROLE}"]`,
  );
}

/**
 * Focuses the canvas once it appears; finishes on the same frame if it is
 * already there.
 *
 * Returns a cancel function, because if the user clicked elsewhere meanwhile the
 * caller must be able to abort — stealing focus startles people.
 */
export function focusMapCanvasWhenReady(
  maxFrames: number = FOCUS_MAP_CANVAS_MAX_FRAMES,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const immediate = findMapCanvas();
  if (immediate) {
    immediate.focus();
    return () => {};
  }

  let frame = 0;
  let raf = 0;
  const tick = () => {
    const canvas = findMapCanvas();
    if (canvas) {
      canvas.focus();
      return;
    }
    frame += 1;
    if (frame >= maxFrames) return;
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(raf);
}

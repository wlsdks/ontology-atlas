/**
 * Free area — **measure the space a panel does not cover** (owner call,
 * 2026-08-10: "It must not be covered; centre it in the space left after subtracting the panel".
 *
 * ## What this module does and does not do
 *
 * **Measures**: the canvas rectangle minus the panels covering it
 * (`computeFreeArea`), and how much width those panels eat on the left and right
 * (`measureCanvasInsets`).
 *
 * **Does not compute**: «so where does the camera go». That formula lives in
 * exactly one place, `centerForInsets` in `ui/topology-camera-math.ts`. This
 * module used to carry its own copy (`freeAreaOffset` + `cameraCenteringNode`),
 * which made **two** formulas for deciding the camera target — and one of them
 * (the focus dive) had no formula at all, so a chosen node went behind the panel.
 * That is why measuring and deciding are kept apart.
 *
 * ## Why it is needed — measured
 *
 * Choosing a node with the arrow keys opens a popover on the right, while the
 * camera takes that node to **the viewport centre**. Measured (1512×982): the
 * canvas is x64 w1448 and the popover is x1128 w352 h813. So a node taken to the
 * centre (788) is only 340px from the popover's left edge (1128), and at a higher
 * zoom or a wider popover **the chosen node goes behind the panel explaining it**.
 * Not seeing what you chose is not "the scene is set".
 *
 * ## The specification
 *
 * The free area is **the canvas minus the panels covering it**, and the focused
 * node comes to its centre.
 *
 * **Shape decides** which side a panel is subtracted from — something occupying
 * most of the screen's height is a side panel, so it comes off the left or right;
 * something occupying most of the width is a top bar, so it comes off the top or
 * bottom. No value is baked in like "the left panel is N px": a baked value drifts
 * silently the day the panel's width changes, and this repository has paid that
 * bill several times already.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** A product-owned inspector may be a camera obstacle even when its content
   * is shorter than the generic side-panel height heuristic. */
  readonly cameraObstacle?: "side-panel";
}

/**
 * Is that rectangle a **side panel** — true when it occupies at least this ratio
 * of the canvas height, unless an edge-attached product inspector declares the
 * same role explicitly because its content is shorter.
 *
 * Why 0.6: the measured popover is 813/982 = **0.83**, while the top toolbar is
 * under 100px tall and never exceeds 0.1. The two populations separate with room
 * to spare in between.
 */
export const SIDE_PANEL_HEIGHT_RATIO = 0.6;

/** Is that rectangle a **top bar** — at least this ratio of the canvas width. */
const TOP_BAR_WIDTH_RATIO = 0.6;

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;

function intersects(a: Rect, b: Rect): boolean {
  return right(a) > b.x && a.x < right(b) && bottom(a) > b.y && a.y < bottom(b);
}

/**
 * The canvas with the panels subtracted.
 *
 * A panel that **splits the area down the middle** (an island touching neither
 * side) is not subtracted — subtracting one would break the remaining area in two
 * and leave «the centre» undefined. Every panel in this app is edge-attached
 * (measured), so that case does not exist today; it gets handled when it appears.
 */
export function computeFreeArea(canvas: Rect, obstacles: readonly Rect[]): Rect {
  let left = canvas.x;
  let rightEdge = right(canvas);
  let top = canvas.y;
  let bottomEdge = bottom(canvas);

  for (const panel of obstacles) {
    if (!intersects(panel, canvas)) continue;

    const explicitSidePanel = panel.cameraObstacle === "side-panel";
    const tallEnough =
      explicitSidePanel || panel.height >= canvas.height * SIDE_PANEL_HEIGHT_RATIO;
    const wideEnough = panel.width >= canvas.width * TOP_BAR_WIDTH_RATIO;

    if (tallEnough && !wideEnough) {
      // A side panel — subtracted from whichever side is nearer the canvas centre.
      const panelCenter = panel.x + panel.width / 2;
      if (panelCenter >= canvas.x + canvas.width / 2) {
        rightEdge = Math.min(rightEdge, panel.x);
      } else {
        left = Math.max(left, right(panel));
      }
      continue;
    }
    if (wideEnough && !tallEnough) {
      const panelCenter = panel.y + panel.height / 2;
      if (panelCenter >= canvas.y + canvas.height / 2) {
        bottomEdge = Math.min(bottomEdge, panel.y);
      } else {
        top = Math.max(top, bottom(panel));
      }
    }
    // Neither or both (a sheet covering everything, a small island) is not subtracted.
  }

  // If overlapping panels invert the area, fall back to the canvas — «the centre is
  // the screen centre» beats «there is no centre».
  if (rightEdge <= left || bottomEdge <= top) return canvas;
  return { x: left, y: top, width: rightEdge - left, height: bottomEdge - top };
}

/**
 * **Measure from the DOM** what is covering the canvas.
 *
 * The "is it visible" decision follows the discipline this repository already
 * settled (`/design-audit`, "A rectangle coming back does not mean it is visible"): zero size, `visibility:hidden`,
 * `display:none`, near-transparent, inside a collapsed `<details>`, or under an
 * `aria-hidden` ancestor is not on screen and is not counted. Skip that and **a
 * panel mid-exit keeps pushing the camera left** in a state nobody can trace.
 *
 * The canvas itself and its ancestors and descendants are excluded — an ancestor
 * does not «cover» the canvas, it contains it.
 *
 * **A modal is not a panel** (2026-09-03). Picking a result in the search
 * palette closes it and selects the node in the same tick; the focus camera
 * measures the DOM one frame later, while the palette is still fading out
 * (`aria-modal` sheet, 60% of the canvas height, centred left of the middle).
 * It was subtracted as a *left* panel — a left inset of 915 px on a 1329 px
 * canvas — so the free area collapsed to a sliver at the right and the chosen
 * node was aimed under the detail panel (measured: node x 1090, panel edge
 * 955). A modal blocks the map instead of sharing the screen with it, so the
 * camera never has to make room for one; `data-topology-camera-obstacle="none"`
 * opts a non-modal transient surface out the same way.
 */
export function collectCanvasObstacles(canvas: Element, canvasRect: Rect): Rect[] {
  const out: Rect[] = [];
  const MIN_SIDE = 40;
  for (const el of canvas.ownerDocument.querySelectorAll('body *')) {
    if (el === canvas || canvas.contains(el) || el.contains(canvas)) continue;
    const box = el.getBoundingClientRect();
    if (box.width < MIN_SIDE || box.height < MIN_SIDE) continue;
    if (box.right <= canvasRect.x || box.left >= canvasRect.x + canvasRect.width) continue;
    if (box.bottom <= canvasRect.y || box.top >= canvasRect.y + canvasRect.height) continue;
    if (el.closest('details:not([open])')) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.closest('[aria-modal="true"], [data-topology-camera-obstacle="none"]')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.05) continue;
    // Keep only the outermost — an inner child is the same area counted twice.
    if (out.some((r) => r.x <= box.x && r.y <= box.y && r.x + r.width >= box.right && r.y + r.height >= box.bottom)) {
      continue;
    }
    out.push({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      ...(el.getAttribute("data-topology-camera-obstacle") === "side-panel"
        ? { cameraObstacle: "side-panel" as const }
        : {}),
    });
  }
  return out;
}

/**
 * **Measure the canvas's left and right insets** — the values to feed the insets
 * the camera maths already uses.
 *
 * ## Why measure — the tokens are static while the panel state is not
 *
 * `topology-camera-math.ts` **already** uses safe insets
 * (`safeInsetLeft/Right/...`, *"the left ReaderLens panel, right popover rail"*).
 * But those values are CSS tokens and therefore fixed, while the real geometry
 * varies with state. Measured (1512×982):
 *
 * | | left | right |
 * |---|---|---|
 * | reserved by the tokens | 78 | 120 |
 * | actual (before selection, INDEX open) | **324** | 0 |
 * | actual (after selection, popover open) | 0 | **384** |
 *
 * Neither state matches. So **the day before, I built a second correction** — a
 * free-area shift on the selection path only, which was a second system for the
 * same concern (what this repository calls «a second system running alongside»).
 * The right prescription is not one more shift but **feeding true values into the
 * insets that already exist**.
 *
 * ## Top and bottom are not measured — those are not panels
 *
 * `safeInsetTop` (148) is the top tool lane plus the docking chips, and
 * `safeInsetBottom` (96) is **reserved label space** (derived from `LABEL_OFFSET`
 * — without that reservation, the bottom-most node's label once disappeared
 * silently). Both are layout promises rather than «covering panels», and replacing
 * them with measurement brings that accident back. So **only left and right** are
 * measured.
 *
 * And **the larger of the two wins** against the token value, so width the token
 * reserved for some reason other than a panel is not lost.
 */
export interface CanvasInsets {
  left: number;
  right: number;
}

export function measureCanvasInsets(canvas: Element, canvasRect: Rect): CanvasInsets {
  let left = 0;
  let right = 0;
  for (const panel of collectCanvasObstacles(canvas, canvasRect)) {
    const explicitSidePanel = panel.cameraObstacle === "side-panel";
    const tall =
      explicitSidePanel || panel.height >= canvasRect.height * SIDE_PANEL_HEIGHT_RATIO;
    const wide = panel.width >= canvasRect.width * TOP_BAR_WIDTH_RATIO;
    if (!tall || wide) continue;
    const panelCenter = panel.x + panel.width / 2;
    if (panelCenter >= canvasRect.x + canvasRect.width / 2) {
      right = Math.max(right, canvasRect.x + canvasRect.width - panel.x);
    } else {
      left = Math.max(left, panel.x + panel.width - canvasRect.x);
    }
  }
  return { left: Math.round(left), right: Math.round(right) };
}

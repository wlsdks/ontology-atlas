/**
 * Parallax origin for the constellation background — pure computation.
 *
 * **Why it exists** (2026-07-28 design council). Owner: *"It would be nice to add a setting for a background
 * that feels like space, with some kind of inertia."* (a background
 * with space-like inertia would be a good setting to add).
 *
 * Seven seats independently reached the same answer — **an autonomous
 * (time-driven) background is rejected; input-coupled parallax is approved.** The
 * 「System」 seat (design systems) found the decisive fact: the setting **already
 * exists** — `constellation`, one of the three `CanvasBackground` choices in
 * `appearance-preferences.ts`, is already a starfield. The delta the owner wanted
 * was not a new background but **camera-coupled parallax on that starfield**.
 *
 * What was missing: the background rode `worldToScreen(camera, 0, 0)` directly, at
 * **factor 1.0 — welded to the world**. Right for the blueprint grid, which is the
 * ground; wrong for a starfield, whose stars are a far layer that must move less
 * than the ground. That **difference** is the depth information.
 *
 * **Autonomous motion is 0, which is why this passes the charter.** The return
 * value is only a function of the camera origin, so a stopped camera means a
 * stopped background: zero idle-frame cost, a different axis from `forbidden.md`'s
 * ban on "moving gradient backgrounds / aurora" (time-driven decoration), and
 * inside WCAG 2.2 §2.3.3's user-initiated exception.
 *
 * The precondition was already met — the 「Interaction」 seat (interaction) required
 * that *"a background without camera
 * inertia is a lie"*, and the camera measurably glides for 819 ms after a flick
 * release (2026-07-28, measured once ambient sleep had removed the contaminant).
 */

/**
 * Parallax-adjusted background tile origin.
 *
 * @param origin Current screen coordinate of world origin (0,0) — the background
 *   origin at factor 1.0.
 * @param viewport Viewport size, and the pivot the factor turns about, so the
 *   background holds still while the camera sits at the origin.
 * @param k Parallax factor. 1 = welded to the world (previous behaviour),
 *   0 = welded to the screen.
 *
 * The factor is applied **about the viewport centre** because that is where the
 * camera is looking, and no two layers may disagree at that point. Applied about
 * the top-left, the layers start out misaligned even at rest — a background that
 * looks wrong before anything has moved.
 */
export function backgroundParallaxOrigin(
  origin: { x: number; y: number },
  viewport: { width: number; height: number },
  k: number,
): { x: number; y: number } {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const f = Number.isFinite(k) ? k : 1;
  return {
    x: cx + (origin.x - cx) * f,
    y: cy + (origin.y - cy) * f,
  };
}

/**
 * The parallax factor for this frame.
 *
 * Under `prefers-reduced-motion` it is **1.0**, not 0. Vestibular stimulus comes
 * from **relative motion between layers**, so at 1.0 the background moves at
 * exactly the content's speed and relative motion disappears (= previous
 * behaviour). At 0 the background welds to the screen and relative motion against
 * the content **appears** — manufacturing the thing being avoided.
 *
 * Every background other than the near starfield is 1.0 here. The dot grid is
 * ground; **depth dots carry a per-layer factor** that one number cannot express —
 * `render/grid.ts`'s `DEPTH_DOT_LAYERS` holds the per-layer values and
 * `topology-frame-draw` computes an origin for each layer separately.
 */
export function resolveBackgroundOrigin(
  gridOrigin: { x: number; y: number },
  viewport: { width: number; height: number },
  variant: string | undefined,
  token: number,
  reducedMotion: boolean,
): { x: number; y: number } {
  return backgroundParallaxOrigin(
    gridOrigin,
    viewport,
    resolveBackgroundParallax(variant, token, reducedMotion),
  );
}

export function resolveBackgroundParallax(
  variant: string | undefined,
  token: number,
  reducedMotion: boolean,
): number {
  if (variant !== "web") return 1;
  if (reducedMotion) return 1;
  if (!Number.isFinite(token)) return 1;
  // Above 1 the background outruns the content and reads as a *near* layer, the
  // opposite of what a starfield means. Negative flows the other way and makes
  // people motion-sick. Clamp both.
  return Math.min(1, Math.max(0, token));
}

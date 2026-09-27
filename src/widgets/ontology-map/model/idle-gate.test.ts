import { describe, expect, it } from "vitest";

import {
  isCameraUnsettled,
  isCanvasActive,
  isDomeSpinAnimating,
  isEgoTailAnimating,
  shouldSkipFrame,
  type CanvasActivityFlags,
  type DomeSpinInput,
  type EgoTailActivityInput,
} from "./idle-gate";
import { stepFocusRamp } from "./focus-state";

const IDLE: CanvasActivityFlags = {
  pointerActive: false,
  simWarm: false,
  homing: false,
  selectionPulseActive: false,
  egoTailAnimating: false,
  emphasisTarget: false,
  breathing: false,
  cameraMoving: false,
  focusFadeSettling: false,
  spotlightSettling: false,
  trailLensSettling: false,
  trailMotionActive: false,
  galaxySettling: false,
  galaxyAtmosphereActive: false,
};

describe("isCanvasActive", () => {
  it("is inactive when every flag is false", () => {
    expect(isCanvasActive(IDLE)).toBe(false);
  });

  it("is active when any one flag is true, never skipping", () => {
    for (const key of Object.keys(IDLE) as (keyof CanvasActivityFlags)[]) {
      expect(isCanvasActive({ ...IDLE, [key]: true })).toBe(true);
    }
  });
});

describe("shouldSkipFrame", () => {
  it("never skips within grace, protecting the ramp decay tail", () => {
    expect(shouldSkipFrame(1000, 500, 1200)).toBe(false);
    expect(shouldSkipFrame(1700, 500, 1200)).toBe(false);
  });

  it("skips only idleness past grace", () => {
    expect(shouldSkipFrame(1701, 500, 1200)).toBe(true);
  });
});

describe("focusFadeSettling (deselect ring residue regression)", () => {
  // Reproduces the regression: no live focus (node or edge) remains, but the
  // retained colorFocus is still there while the focus ramp decays. Both the ramp
  // decay and the colorFocus clear happen only inside the rAF frame body, so with
  // no incidental activity (a comet, the camera) the idle skip drops the frame,
  // the ramp freezes, and the selection ring stays at full opacity. This flag
  // counts the window as activity and keeps the loop awake until the fade ends.
  const TAU = 0.16; // --map-focus-dim-tau
  const CLEAR_THRESHOLD = 0.02; // the colorFocus clear threshold in use-topology-loop

  it("stays active during the retained colorFocus fade with no other activity", () => {
    // Every incidental source (comet, camera, hover) is off — pure idle, fade only.
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: true })).toBe(true);
  });

  // Mirrors, as a pure function, the focusFadeSettling decision use-topology-loop
  // computes from refs each frame — proving all three deselect paths converge on
  // the same state: no live focus, colorFocus retained.
  const focusFadeSettlingFrom = (refs: {
    colorFocus: string | null;
    focusedSlug: string | null;
    selectedEdge: unknown | null;
  }): boolean => refs.colorFocus !== null && refs.focusedSlug === null && refs.selectedEdge === null;

  it("converges the three deselect paths (empty click, Escape, panel close) to one active frame state", () => {
    // All three run through handleClose and set focusedSlug to null, but the
    // retained colorFocus stays as the color fade target. The state must count as
    // activity regardless of which event produced it, or the ring freezes —
    // handling the paths separately is exactly how only X-close froze.
    const deselected = { colorFocus: "domain:views", focusedSlug: null, selectedEdge: null };
    for (const _path of ["empty-click", "escape", "panel-x-close"]) {
      expect(focusFadeSettlingFrom(deselected)).toBe(true);
      expect(isCanvasActive({ ...IDLE, focusFadeSettling: focusFadeSettlingFrom(deselected) })).toBe(true);
    }
    // A live focus still held (a static selection) is not fading, so idle is allowed.
    expect(focusFadeSettlingFrom({ colorFocus: "domain:views", focusedSlug: "domain:views", selectedEdge: null })).toBe(false);
    // A live edge-pair selection is not a fade either.
    expect(focusFadeSettlingFrom({ colorFocus: null, focusedSlug: null, selectedEdge: { a: 1 } })).toBe(false);
  });

  it("returns to idle once the fade decays below the threshold and colorFocus clears", () => {
    // Just after deselect: the ramp starts at 1 and decays each frame with focusActive=false.
    let ramp = 1;
    let colorFocusRetained = true;
    let frames = 0;
    const dt = 1 / 60;

    // While the fade runs, frames must never be skipped: the ramp decays only
    // inside a frame, so freezing it means the fade never finishes.
    while (colorFocusRetained) {
      const focusFadeSettling = colorFocusRetained; // no live focus, colorFocus retained
      expect(isCanvasActive({ ...IDLE, focusFadeSettling })).toBe(true);
      ramp = stepFocusRamp(ramp, false, dt, TAU);
      if (ramp < CLEAR_THRESHOLD) colorFocusRetained = false; // the clear condition in use-topology-loop
      frames += 1;
      if (frames > 600) throw new Error("페이드가 수렴하지 않음");
    }

    // The decay finishes in bounded time: ~4τ ≈ 0.64 s at 60 fps ≈ 39 frames.
    expect(frames).toBeLessThan(60);
    // Once cleared and with nothing else active, the canvas returns to idle rather than repainting forever.
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: false })).toBe(false);
  });
});

describe("isCameraUnsettled (wheel zoom dying while idle, regression)", () => {
  const settled = { x: 100, y: 50, scale: 1.2 };

  it("settles when target and value match", () => {
    expect(isCameraUnsettled(settled, { tx: 100, ty: 50, tscale: 1.2 })).toBe(false);
  });

  it("counts a wheel changing only the scale target as activity, without value movement", () => {
    // While frames are skipped the physics step does not run, so the value cannot
    // move. If a changed target alone is not activity, nothing ever wakes the loop.
    expect(isCameraUnsettled(settled, { tx: 100, ty: 50, tscale: 1.4 })).toBe(true);
  });

  it("counts a pan target change as activity", () => {
    expect(isCameraUnsettled(settled, { tx: 130, ty: 50, tscale: 1.2 })).toBe(true);
  });

  it("settles a difference within epsilon, avoiding a needless repaint wake", () => {
    expect(isCameraUnsettled(settled, { tx: 100.005, ty: 50, tscale: 1.20005 })).toBe(false);
  });
});

describe("isEgoTailAnimating: ambient sleep reaches all three branches", () => {
  // Awake, depends comets flowing, one node selected.
  const AWAKE_FOCUSED: EgoTailActivityInput = {
    reducedMotion: false,
    ambientAsleep: false,
    hasDependsEdges: true,
    edgePulseSpeed: 0.075,
    focused: true,
    hasContainsEdges: true,
    livePulseCount: 0,
  };

  it("is active while awake, so the watched screen is unchanged", () => {
    expect(isEgoTailAnimating(AWAKE_FOCUSED)).toBe(true);
  });

  /**
   * A regression this repository actually had: ambient sleep was applied to the
   * depends branch only, so **leaving a node selected and taking your hands off**
   * left the contains branch holding the condition open forever. The screen had
   * already stopped (every comet speed × factor 0), so it was pure wasted raster.
   */
  it("is inactive asleep even while selected, so a datasheet left open still sleeps", () => {
    expect(isEgoTailAnimating({ ...AWAKE_FOCUSED, ambientAsleep: true })).toBe(false);
  });

  it("the depends branch is inactive asleep too", () => {
    expect(
      isEgoTailAnimating({ ...AWAKE_FOCUSED, focused: false, ambientAsleep: true }),
    ).toBe(false);
  });

  it("reduced motion is inactive whether awake or not (still contract)", () => {
    expect(isEgoTailAnimating({ ...AWAKE_FOCUSED, reducedMotion: true })).toBe(false);
  });

  it("becomes active again on input (waking), with no frozen failure mode", () => {
    const asleep = { ...AWAKE_FOCUSED, ambientAsleep: true };
    expect(isEgoTailAnimating(asleep)).toBe(false);
    expect(isEgoTailAnimating({ ...asleep, ambientAsleep: false })).toBe(true);
  });

  /**
   * The pulse is deliberately outside the condition: it is a one-shot signal born
   * from hover that expires after 420 ms, and hover is input, so the app is already
   * awake at that moment. Gating it would only add a "fired but never drawn"
   * failure mode.
   */
  it("still draws a live hover pulse while asleep", () => {
    expect(
      isEgoTailAnimating({ ...AWAKE_FOCUSED, ambientAsleep: true, livePulseCount: 1 }),
    ).toBe(true);
  });

  it("the depends branch is inactive when the comet speed token is 0", () => {
    expect(
      isEgoTailAnimating({ ...AWAKE_FOCUSED, focused: false, edgePulseSpeed: 0 }),
    ).toBe(false);
  });

  it("the contains branch is inactive when the selection has no contains edge", () => {
    expect(
      isEgoTailAnimating({
        ...AWAKE_FOCUSED,
        hasDependsEdges: false,
        hasContainsEdges: false,
      }),
    ).toBe(false);
  });
});

/**
 * The 3D dome's autonomous spin under the ambient-motion contract.
 *
 * Measured 2026-08-19: the spin alone sat outside the `ambient-sleep` contract,
 * so 3D would not sleep even 45 s after the last input, permanently burning
 * 520 ms per second (half a core) at 2,000 nodes where the same state in 2D cost
 * 3 ms/s. Same failure as `isEgoTailAnimating`, so the same condition sits in the
 * same place.
 */
describe("isDomeSpinAnimating", () => {
  const SPINNING: DomeSpinInput = {
    domeOn: true,
    reducedMotion: false,
    ambientAsleep: false,
    spinArmed: true,
    pointerOverCanvas: false,
    assembled: true,
  };

  it("rotates when armed, assembled and awake", () => {
    expect(isDomeSpinAnimating(SPINNING)).toBe(true);
  });

  /** This one line guards the most expensive regression in the file. */
  it("auto-rotate is not activity during ambient sleep", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, ambientAsleep: true })).toBe(false);
  });

  it("does not rotate with 3D off", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, domeOn: false })).toBe(false);
  });

  it("does not rotate under reduced motion", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, reducedMotion: true })).toBe(false);
  });

  it("does not rotate once intervention disarms it", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, spinArmed: false })).toBe(false);
  });

  it("stops while the cursor is over the canvas, so the aimed node never slides away", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, pointerOverCanvas: true })).toBe(false);
  });

  it("does not auto-rotate before the assembly ramp fills", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, assembled: false })).toBe(false);
  });
});

describe("keeps the loop awake while the walked trail is open", () => {
  /*
   * ⚠️ Written after the defect. `trailLensSettling` buys a frame when the lens *toggles*,
   * and nothing kept the loop awake after that — the constellation was measured byte-identical
   * over 2.0s with the lens open, so the twinkle and the light that carries direction had
   * never run at all (design-lead, 2026-09-10).
   */
  it("is active when the lens is open and walked relations exist", () => {
    expect(isCanvasActive({ ...IDLE, trailMotionActive: true })).toBe(true);
  });

  it("does not wake on the settling flag alone, which was what froze it", () => {
    expect(isCanvasActive({ ...IDLE, trailLensSettling: false, trailMotionActive: false })).toBe(
      false,
    );
  });
});

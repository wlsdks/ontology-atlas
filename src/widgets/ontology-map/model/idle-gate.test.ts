import { describe, expect, it } from "vitest";

import {
  extendsGrace,
  isCameraUnsettled,
  isCanvasActive,
  isDomeSpinAnimating,
  isEgoTailAnimating,
  isGalaxyAtmosphereAnimating,
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
  lightActive: false,
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

describe("extendsGrace", () => {
  it("keeps a light drawing without restarting the grace, so the map sleeps once the last light lands", () => {
    expect(isCanvasActive({ ...IDLE, lightActive: true })).toBe(true);
    expect(extendsGrace({ ...IDLE, lightActive: true })).toBe(false);
    expect(extendsGrace({ ...IDLE, lightActive: true, cameraMoving: true })).toBe(true);
    let lastActive = 0;
    let lastDrawn = 0;
    for (let now = 0; now <= 4000; now += 16) {
      const flags = { ...IDLE, cameraMoving: now < 500, lightActive: now >= 120 && now < 2100 };
      if (isCanvasActive(flags)) {
        if (extendsGrace(flags)) lastActive = now;
      } else if (shouldSkipFrame(now, lastActive, 1200)) continue;
      lastDrawn = now;
    }
    expect(lastDrawn).toBeLessThan(2100 + 17);
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
  // The ramp decays and colorFocus clears only inside a frame, so skipping frames during the
  // retained fade would freeze the selection ring at full opacity.
  const TAU = 0.16; // --map-focus-dim-tau
  const CLEAR_THRESHOLD = 0.02; // the colorFocus clear threshold in use-topology-loop

  it("stays active during the retained colorFocus fade with no other activity", () => {
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: true })).toBe(true);
  });

  // The pure form of the per-frame decision in use-topology-loop.
  const focusFadeSettlingFrom = (refs: {
    colorFocus: string | null;
    focusedSlug: string | null;
    selectedEdge: unknown | null;
  }): boolean => refs.colorFocus !== null && refs.focusedSlug === null && refs.selectedEdge === null;

  it("converges the three deselect paths (empty click, Escape, panel close) to one active frame state", () => {
    // Every deselect path leaves the same state and must count as activity, or the ring
    // freezes; handling the paths separately let one of them freeze.
    const deselected = { colorFocus: "domain:views", focusedSlug: null, selectedEdge: null };
    for (const _path of ["empty-click", "escape", "panel-x-close"]) {
      expect(focusFadeSettlingFrom(deselected)).toBe(true);
      expect(isCanvasActive({ ...IDLE, focusFadeSettling: focusFadeSettlingFrom(deselected) })).toBe(true);
    }
    expect(focusFadeSettlingFrom({ colorFocus: "domain:views", focusedSlug: "domain:views", selectedEdge: null })).toBe(false);
    expect(focusFadeSettlingFrom({ colorFocus: null, focusedSlug: null, selectedEdge: { a: 1 } })).toBe(false);
  });

  it("returns to idle once the fade decays below the threshold and colorFocus clears", () => {
    let ramp = 1;
    let colorFocusRetained = true;
    let frames = 0;
    const dt = 1 / 60;

    while (colorFocusRetained) {
      const focusFadeSettling = colorFocusRetained;
      expect(isCanvasActive({ ...IDLE, focusFadeSettling })).toBe(true);
      ramp = stepFocusRamp(ramp, false, dt, TAU);
      if (ramp < CLEAR_THRESHOLD) colorFocusRetained = false;
      frames += 1;
      if (frames > 600) throw new Error("the fade did not converge within 600 frames");
    }

    // About 4τ ≈ 0.64 s at 60 fps ≈ 39 frames.
    expect(frames).toBeLessThan(60);
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: false })).toBe(false);
  });
});

describe("isCameraUnsettled (wheel zoom dying while idle, regression)", () => {
  const settled = { x: 100, y: 50, scale: 1.2 };

  it("settles when target and value match", () => {
    expect(isCameraUnsettled(settled, { tx: 100, ty: 50, tscale: 1.2 })).toBe(false);
  });

  it("counts a wheel changing only the scale target as activity, without value movement", () => {
    // Skipped frames run no physics, so the value cannot move; unless a changed target is
    // activity, nothing wakes the loop.
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
   * Ambient sleep must reach the contains branch too, or a node left selected holds the
   * loop open for pure wasted raster.
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
   * The pulse stays outside the condition: it is born from hover, which is input, so the app
   * is already awake; gating it would only add a fired-but-never-drawn failure.
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

/** The 3D autonomous spin sleeps under the same ambient contract as the comets. */
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

describe("isGalaxyAtmosphereAnimating", () => {
  const AWAKE = { galaxyOn: true, reducedMotion: false, ambientAsleep: false };

  it("keeps the sky moving while Galaxy is on and input is recent", () => {
    expect(isGalaxyAtmosphereAnimating(AWAKE)).toBe(true);
  });

  it("lets the sky sleep once ambient sleep has run its ramp", () => {
    expect(isGalaxyAtmosphereAnimating({ ...AWAKE, ambientAsleep: true })).toBe(false);
  });

  it("never runs under reduced motion or outside Galaxy", () => {
    expect(isGalaxyAtmosphereAnimating({ ...AWAKE, reducedMotion: true })).toBe(false);
    expect(isGalaxyAtmosphereAnimating({ ...AWAKE, galaxyOn: false })).toBe(false);
  });
});

describe("keeps the loop awake while the walked trail is open", () => {
  /*
   * The `trailLensSettling` flag buys one frame per toggle; without this the twinkle and the light
   * carrying direction would never run while the lens stays open.
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

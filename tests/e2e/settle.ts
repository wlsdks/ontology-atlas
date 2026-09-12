import type { Locator, Page } from "@playwright/test";

/**
 * **Wait for the condition, not the clock.**
 *
 * `.claude/rules/testing.md` (the timing rule, #1578) forbids a fixed sleep that
 * gates an assertion: `waitForTimeout(2500)` asserts how fast this machine is, so
 * a slow machine reads a moving screen and a fast one throws the difference away.
 * Every wait here returns the moment the screen stops changing, which costs
 * nothing when it already had and still passes when it has not.
 *
 * The map's canvas has no DOM, so its stillness is read from the `__atlasMap`
 * probe (`atlas-map-probe.ts`) that every `?e2e=1` page already attaches — the
 * same values the frame actually drew. The DOM waits read the browser's own
 * animation registry (`Element.getAnimations`) rather than guessing a duration
 * out of a token.
 *
 * ## Why "N repeated frames" is a condition and not a disguised sleep
 *
 * A spring is still when its value stops changing, and a value that has not
 * changed for one frame may simply be crossing zero velocity. `STILL_FRAMES`
 * consecutive identical samples is the observable — it is counted in frames the
 * page actually rendered, so it stretches with the machine instead of racing it,
 * and it returns as soon as the motion ends rather than after a budget.
 */

/** Consecutive identical animation frames that make a value "still". */
const STILL_FRAMES = 8;

/** Every wait is a hang detector, never a budget: generous, never asserted about. */
const HANG_TIMEOUT_MS = 30_000;

/** Distinct storage per call site, so two waits in one test never share a counter. */
let stillKeySeed = 0;

export type MapStillness =
  /** Camera spring only — pan, zoom, fit, focus framing. */
  | "camera"
  /** Camera plus every drawn node coordinate — physics, expansion, auto-arrange. */
  | "layout"
  /** 3D dome pose, its inertia and its assembly ramp. */
  | "dome"
  /** The galaxy altitude ramp. */
  | "altitude";

export interface MapStillOptions {
  /** Which of the map's motions must stop. Default `"layout"`. */
  what?: MapStillness;
  /** Consecutive identical frames required. Default {@link STILL_FRAMES}. */
  frames?: number;
  /** Hang ceiling, not a budget. */
  timeout?: number;
}

/**
 * Resolve once the map has drawn {@link STILL_FRAMES} consecutive frames with the
 * same camera / layout / pose. The predicate runs **in the page** on animation
 * frames, so a settle costs one round trip rather than one per sample.
 *
 * The idle gate never stops rAF (`model/idle-gate.ts`); it skips the physics step
 * and the paint. A skipped frame therefore reports the last drawn values, which is
 * exactly the "still" this waits for.
 */
export async function waitForMapStill(page: Page, options: MapStillOptions = {}): Promise<void> {
  const { what = "layout", frames = STILL_FRAMES, timeout = HANG_TIMEOUT_MS } = options;
  const key = `still-${(stillKeySeed += 1)}`;
  await page.waitForFunction(
    (argument: { what: string; frames: number; key: string }) => {
      type ProbeNode = { id: string; x: number; y: number; hidden: boolean };
      type Probe = {
        camera?: () => { x: number; y: number; scale: number; width: number; height: number } | null;
        nodes?: () => ProbeNode[];
        dome?: () => {
          yaw: number;
          pitch: number;
          ramp: number;
          poseTween: boolean;
          orbiting: boolean;
        } | null;
        altitude?: () => number;
      };
      const probe = (window as unknown as { __atlasMap?: Probe }).__atlasMap;
      if (!probe) return false;
      /** Tenths of a pixel: below the width of the thinnest thing the map draws. */
      const tenth = (value: number) => Math.round(value * 10);
      let signature = "";
      if (argument.what === "camera" || argument.what === "layout") {
        const camera = probe.camera?.() ?? null;
        if (!camera || camera.width <= 0) return false;
        signature = `${tenth(camera.x)},${tenth(camera.y)},${Math.round(camera.scale * 1e4)}`;
      }
      if (argument.what === "layout") {
        const nodes = probe.nodes?.() ?? [];
        if (nodes.length === 0) return false;
        signature += `|${nodes
          .filter((node) => !node.hidden)
          .map((node) => `${node.id}:${tenth(node.x)},${tenth(node.y)}`)
          .join(",")}`;
      }
      if (argument.what === "dome") {
        const dome = probe.dome?.() ?? null;
        if (!dome) return false;
        // A pose tween or live inertia is motion regardless of how small this
        // frame's step was, so they are part of the signature rather than a
        // separate early return: the counter resets while either is live.
        signature = `${Math.round(dome.yaw * 1e3)},${Math.round(dome.pitch * 1e3)},${Math.round(
          dome.ramp * 1e3,
        )},${dome.poseTween},${dome.orbiting}`;
      }
      if (argument.what === "altitude") {
        const altitude = probe.altitude?.();
        if (altitude === undefined) return false;
        signature = String(Math.round(altitude * 1e3));
      }
      const store = ((window as unknown as { __atlasStill?: Record<string, { signature: string; count: number }> })
        .__atlasStill ??= {});
      const seen = store[argument.key];
      if (!seen || seen.signature !== signature) {
        store[argument.key] = { signature, count: 1 };
        return false;
      }
      seen.count += 1;
      return seen.count >= argument.frames;
    },
    { what, frames, key },
    { polling: "raf", timeout },
  );
}

/**
 * Resolve once the map's probe is attached and has drawn at least one node.
 *
 * The probe only exists on `?e2e=1` pages and only after the first frame, so this
 * is the honest "the map is up" condition — `toBeVisible()` on the canvas passes
 * while it is still empty.
 */
export async function waitForMapReady(page: Page, timeout = HANG_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = (window as unknown as { __atlasMap?: { nodes?: () => unknown[] } }).__atlasMap;
      const nodes = probe?.nodes?.();
      return Array.isArray(nodes) && nodes.length > 0;
    },
    undefined,
    { polling: "raf", timeout },
  );
}

/** The map is up **and** has stopped moving — the usual state a spec wants to measure. */
export async function waitForMapSettled(page: Page, options: MapStillOptions = {}): Promise<void> {
  await waitForMapReady(page, options.timeout);
  await waitForMapStill(page, options);
}

/**
 * Resolve once no CSS animation or transition is running on `locator` or inside it.
 *
 * This is the browser's own registry (`Element.getAnimations({ subtree: true })`),
 * so it covers a reveal whose duration comes from a token without the spec having
 * to read — or guess — that token. An element that never animates resolves on the
 * first poll.
 */
export async function waitForAnimationsDone(locator: Locator, timeout = HANG_TIMEOUT_MS): Promise<void> {
  await locator.evaluate(
    (element, hang) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + hang;
        const check = () => {
          const running = element
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === "running");
          if (!running) {
            resolve();
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error("animations still running"));
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    timeout,
  );
}

/**
 * Resolve once `locator`'s box has been identical for {@link STILL_FRAMES} frames.
 *
 * For a surface that slides, grows or reflows into place with no single animation
 * to await — a sheet re-laying out, a grid reflowing after a resize.
 */
export async function waitForBoxStill(
  locator: Locator,
  options: { frames?: number; timeout?: number } = {},
): Promise<void> {
  const { frames = STILL_FRAMES, timeout = HANG_TIMEOUT_MS } = options;
  await locator.evaluate(
    (element, argument) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + argument.hang;
        let previous = "";
        let repeats = 0;
        const check = () => {
          const box = element.getBoundingClientRect();
          const signature = [box.x, box.y, box.width, box.height]
            .map((value) => Math.round(value * 10))
            .join(",");
          repeats = signature === previous ? repeats + 1 : 1;
          previous = signature;
          if (repeats >= argument.frames) {
            resolve();
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error("box never stopped moving"));
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    { frames, hang: timeout },
  );
}

/**
 * Resolve once the page has been scrolled to a position that stays put for
 * {@link STILL_FRAMES} frames — the end of a smooth scroll, including the momentum
 * of `scrollIntoView({ behavior: "smooth" })`.
 */
export async function waitForScrollStill(
  page: Page,
  options: { frames?: number; timeout?: number } = {},
): Promise<void> {
  const { frames = STILL_FRAMES, timeout = HANG_TIMEOUT_MS } = options;
  await page.evaluate(
    (argument) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + argument.hang;
        let previous = Number.NaN;
        let repeats = 0;
        const check = () => {
          const position = Math.round(window.scrollY * 10);
          repeats = position === previous ? repeats + 1 : 1;
          previous = position;
          if (repeats >= argument.frames) {
            resolve();
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error("the page never stopped scrolling"));
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    { frames, hang: timeout },
  );
}

/**
 * Resolve after `count` animation frames have been painted.
 *
 * For the handful of places where the condition genuinely is "the next frame or
 * two" — a value the loop writes once per frame, read after the frame that writes
 * it. Frames are the engine's unit; milliseconds are the machine's.
 */
export async function waitFrames(page: Page, count = 2): Promise<void> {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        let remaining = frames;
        const step = () => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

/**
 * Resolve once the 3D dome has finished assembling — its ramp clock is at the top.
 *
 * The assembly is a fixed-length ramp the loop advances by real elapsed time, so a
 * busy machine takes more wall clock to reach the same ramp value. `ramp >= 1` is
 * that value; four seconds was one machine's guess at it.
 *
 * The pose is deliberately not part of this: the dome arrives **armed to spin**
 * (`dome-view.ts`), so "assembled" and "still" are different states and only the
 * first one is what arriving in 3D means.
 */
export async function waitForDomeAssembled(page: Page, timeout = HANG_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    () => {
      const dome = (window as unknown as { __atlasMap?: { dome?: () => { ramp: number } | null } }).__atlasMap?.dome?.();
      return dome !== null && dome !== undefined && dome.ramp >= 1;
    },
    undefined,
    { polling: "raf", timeout },
  );
}

/**
 * Resolve once the map is flat again: the dome's ramp has run all the way back
 * down (or the runtime is gone), and the 2D layout underneath has stopped moving.
 */
export async function waitForFlatMap(page: Page, timeout = HANG_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = (window as unknown as { __atlasMap?: { dome?: () => { ramp: number } | null } }).__atlasMap;
      if (!probe) return false;
      const dome = probe.dome?.() ?? null;
      return dome === null || dome.ramp <= 0;
    },
    undefined,
    { polling: "raf", timeout },
  );
  await waitForMapStill(page, { timeout });
}

/**
 * Resolve once the 3D dome has both assembled **and** finished its entry sweep.
 *
 * The two have separate clocks — the sweep outlives the assembly by 380 ms
 * (`model/dome-view.ts`) — so "arrived in 3D" is both flags, and while the sweep
 * is alive the drawn attitude keeps moving and cannot be told apart from what a
 * drag changed.
 *
 * The pose is still not required to be *still*: the dome arrives armed to spin, so
 * stillness would never come until a hand touched it.
 */
export async function waitForDomeEntered(page: Page, timeout = HANG_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    () => {
      const dome = (
        window as unknown as { __atlasMap?: { dome?: () => { ramp: number; entryArmed: boolean } | null } }
      ).__atlasMap?.dome?.();
      return dome !== null && dome !== undefined && dome.ramp >= 1 && !dome.entryArmed;
    },
    undefined,
    { polling: "raf", timeout },
  );
}

import { expect, test, type Page } from "@playwright/test";

import {
  NATIVE_LATENCY_MS,
  installDesktopRailRuntime,
  mountDesktopVault,
} from "./desktop-rail-arrival-harness";

/**
 * **A pane the app has already read arrives painted, not loading** — the proof for the
 * flicker the owner reported on 2026-09-12: *"when this right-hand area switches it loads
 * with a strange flicker."*
 *
 * ## What was wrong, and why no gate saw it
 *
 * Every destination's view is unmounted on a route change, so all of its async state went
 * back to "not known yet" and its fallback painted again — **on a return visit exactly as on
 * the first**. Measured with the harness beside this file (installed-app runtime, 120 ms
 * native answers, 1512×901, static export), second arrival from the rail:
 *
 * | arriving at | before | after |
 * |---|---|---|
 * | History | loading skeleton + connect stepper 43-278 ms, workbench cut in at 283 ms | workbench from 44 ms |
 * | Agents | "checking…" row until 201 ms, list from there | list from 48 ms |
 * | Map | `map-entry-fallback` painted 35-53 ms | never mounts |
 *
 * That reads as a flicker rather than as loading because a rail navigation runs inside
 * `document.startViewTransition`. The browser captures the arriving state about 25-40 ms
 * after the click — while the pane is still its fallback — and crossfades the old screen
 * into **that**. So the fade landed on a skeleton and the real screen then cut in with no
 * motion: two events where the design system promised one.
 *
 * No existing gate could see it. The web gates cannot: on the web `useAtlasGitContext`
 * resolves `vaultPath` to `null`, so History renders its honest web degradation card and
 * never enters the state that flashes. And a stub that answers natively in the same
 * microtask leaves no window for a fallback to reach the screen at all — which is why the
 * harness delays every answer.
 *
 * ## ⚠️ Why this counts frames instead of asserting a screenshot
 *
 * The wrong picture is on screen for 200-240 ms and is then replaced. A screenshot taken
 * after `expect(...).toBeVisible()` sees the settled screen and passes on the defect; one
 * taken at a fixed offset measures how fast the runner renders, which
 * `route-transition-input.spec.ts` already records failing three times out of three on the
 * GitHub runner. A frame sampler armed **before** the click cannot miss the window, and
 * counting is machine-independent: zero is zero on any hardware.
 *
 * ## ⚠️ The idling guard is the cold arrival
 *
 * A count of zero is also what a broken sampler reports. So each destination is measured
 * **twice**: the first arrival has nothing remembered and must still show its fallback
 * (History's loading skeleton is asserted to appear), and the second must show none. The
 * first assertion is what proves the second one is looking at something. Verified by
 * planting the defect: reverting `shared/lib/route-arrival-memory.ts` to a plain `useState`
 * turns the second-arrival assertions red on all three destinations while the cold-arrival
 * assertion stays green.
 */

/**
 * Everything the shell body can put on screen to mean "not settled yet".
 *
 * One list rather than a per-destination selector: a fallback added to a new pane later is
 * then counted by this gate for free, which is the direction of error to prefer — a new
 * screen that flashes fails here rather than shipping unmeasured.
 */
const NOT_SETTLED = [
  '[data-route-loading="true"]',
  '[data-testid="route-loading-fallback"]',
  '[data-testid="map-entry-fallback"]',
  '[data-testid="gateway-entry-fallback"]',
  '[data-testid="atlas-git-setup-preview"]',
  '[data-testid="app-settings-runtimes-loading"]',
  "[data-empty-skeleton]",
] as const;

/**
 * **The shell's own neutral pane is measured but not gated here** — a separate subject with a
 * separate owner.
 *
 * `app/providers/AppShell.tsx` used to mount an empty canvas-coloured pane on **every** route
 * change and release it from a microtask. Measured across 18 crossings on the static export it
 * reached 0 of ~90 sampled frames; against the dev server the same crossings put it in **1-3**,
 * and it was named here as follow-up because removing it meant changing the shell rather than
 * what any pane remembers.
 *
 * It was removed on 2026-09-13 (inspection 122, B1): no release mechanism was early enough,
 * because what held the pane on the glass was the *arriving* route suspending against it, and
 * React already keeps the departing screen until the destination can render. The boundary now
 * fires only for a folder load or a workbench destination with no vault, so this count is
 * expected to be zero on every crossing below. It stays measured rather than asserted —
 * `rail-stays-painted.spec.ts` is what gates it — so that a number appearing here still says so.
 */
const SHELL_NEUTRAL_PANE = '[data-testid="vault-route-identity-pending"]';

/**
 * The `data-testid`s among `NOT_SETTLED` — the churn record carries testids, not selectors.
 * Derived from that list so the two cannot drift apart.
 */
const FALLBACK_TESTIDS = NOT_SETTLED.map((selector) => {
  const match = /^\[data-testid="([^"]+)"\]$/.exec(selector);
  return match ? match[1] : null;
}).filter((value): value is string => value !== null);

interface Arrival {
  /** How many sampled frames carried at least one not-settled marker. */
  fallbackFrames: number;
  /** Which markers were seen, so a failure names the screen instead of a count. */
  seen: string[];
  /** Total frames sampled — an idling guard of its own. */
  frames: number;
  /** Mount/unmount records for elements carrying a `data-testid` in the body slot. */
  churn: string[];
  /** Frames holding the shell's neutral pane — measured, not gated. See `SHELL_NEUTRAL_PANE`. */
  shellPaneFrames: number;
}

/**
 * Samples the shell's body slot every animation frame for `windowMs`.
 *
 * The sampler is armed before the click and reads the **live DOM**, not the compositor: while
 * a view transition runs the captured document is not repainted, so a pixel sampler would
 * report the frame the browser captured rather than the one the pane is in. What matters here
 * is which screen the pane *was* in when that capture happened, and that is the DOM.
 */
async function sampleArrival(page: Page, windowMs: number, routePath: string): Promise<void> {
  await page.evaluate(
    ([selectors, window_, routePath_, shellPane_]) => {
      const state: {
        fallbackFrames: number;
        seen: string[];
        frames: number;
        churn: string[];
        done: boolean;
        shellPaneFrames: number;
      } = { fallbackFrames: 0, seen: [], frames: 0, churn: [], shellPaneFrames: 0, done: false };
      (window as unknown as { __arrivalPaint: typeof state }).__arrivalPaint = state;
      const slot = () => document.querySelector('[data-testid="app-shell-body-slot"]');
      const host = slot();
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue;
            const id = (node as Element).getAttribute("data-testid");
            if (id) state.churn.push(`+${id}`);
          }
          for (const node of record.removedNodes) {
            if (node.nodeType !== 1) continue;
            const id = (node as Element).getAttribute("data-testid");
            if (id) state.churn.push(`-${id}`);
          }
        }
      });
      if (host) observer.observe(host, { childList: true });
      /*
       * ⚠️ **The window starts at the arrival, not at the click.**
       *
       * It used to be a fixed wall-clock window from the click, which passed against the static
       * export and collapsed to 7 frames against the dev server — Turbopack compiles the route
       * on demand, so most of the window was spent before the arriving pane existed at all. A
       * fixed offset from a click measures how fast the machine renders, which is the same
       * mistake `route-transition-input.spec.ts` records failing three times out of three on
       * the GitHub runner. Counting from the moment the address becomes the destination makes
       * the sample the same size on a fast machine, a cold dev server, and a CI runner.
       */
      let started: number | null = null;
      const tick = () => {
        /*
         * Frames are counted **only once the address is the arriving route**. For the first
         * frame or two after the click the DOM still holds the screen being left, and counting
         * its own empty states would blame the arriving pane for the departing one's.
         */
        if (!location.pathname.includes(routePath_ as string)) {
          requestAnimationFrame(tick);
          return;
        }
        if (started === null) started = performance.now();
        state.frames += 1;
        const present = (selectors as string[]).filter((selector) =>
          document.querySelector(selector),
        );
        if (present.length > 0) {
          state.fallbackFrames += 1;
          for (const selector of present) {
            if (!state.seen.includes(selector)) state.seen.push(selector);
          }
        }
        if (document.querySelector(shellPane_ as string)) state.shellPaneFrames += 1;
        if (performance.now() - started < (window_ as number)) {
          requestAnimationFrame(tick);
        } else {
          observer.disconnect();
          state.done = true;
        }
      };
      requestAnimationFrame(tick);
    },
    [NOT_SETTLED as unknown as string[], windowMs, routePath, SHELL_NEUTRAL_PANE] as const,
  );
}

async function readArrival(page: Page): Promise<Arrival> {
  await page.waitForFunction(
    () => (window as unknown as { __arrivalPaint: { done: boolean } }).__arrivalPaint.done,
    undefined,
    // Generous, because the window only starts once the route arrives and a cold dev server
    // compiles it on demand. A route that never arrives fails here rather than reporting a
    // suspiciously small sample as a pass.
    { timeout: 90_000, polling: "raf" },
  );
  return page.evaluate(
    () => (window as unknown as { __arrivalPaint: Arrival }).__arrivalPaint,
  );
}

/**
 * How long to watch from the click.
 *
 * Long enough to contain the whole window the defect lived in — the crossfade (180 ms) plus
 * the native answer (120 ms) plus slack — so a fallback that appears late is still counted.
 */
const WATCH_MS = 900;

/**
 * The address segment each destination arrives at, so a frame can be attributed to the pane
 * that owns it. Read from the registry rather than written out, so a moved route cannot leave
 * this gate silently counting frames on the wrong screen.
 */
const ROUTE_PATH: Record<string, string> = {
  agents: "/agents",
  git: "/git",
  map: "/topology",
  library: "/library",
  mcp: "/mcp",
  docs: "/docs",
};

/** Leaves the destination and comes back, reporting what the return arrival painted. */
async function arriveFrom(page: Page, destination: string): Promise<Arrival> {
  const rail = page.getByTestId("app-nav-rail");
  await rail.getByTestId("app-nav-rail-item-insights").click();
  // Settle the departure screen fully: a half-finished transition on the way out would put
  // its own fallback inside the window measured on the way in.
  await page.waitForTimeout(NATIVE_LATENCY_MS * 4);
  await sampleArrival(page, WATCH_MS, ROUTE_PATH[destination]);
  await rail.getByTestId(`app-nav-rail-item-${destination}`).click({ noWaitAfter: true });
  return readArrival(page);
}

test.use({ viewport: { width: 1512, height: 901 } });

test("a pane the app has already read arrives painted on every rail crossing", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  // The vault's own first read has to finish before "already read" means anything.
  await page.getByTestId("app-nav-rail-item-git").click();
  await expect(page.getByTestId("git-page")).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByTestId("atlas-git-pending-row"),
    "History never reached its workbench — the harness did not mount a git-backed vault, so nothing below is measured",
  ).toBeVisible({ timeout: 60_000 });

  /*
   * ★ The idling guard. This is the **cold** arrival at Agents: nothing has been remembered,
   * so the runner list genuinely is not known and its "checking…" row must be on screen. If
   * this is zero the sampler is blind and every zero below is meaningless.
   */
  const coldAgents = await arriveFrom(page, "agents");
  expect(
    coldAgents.frames,
    "no frames were sampled — the sampler never ran",
  ).toBeGreaterThan(20);
  expect(
    coldAgents.fallbackFrames,
    `the first arrival at Agents showed no unsettled state at all, so this gate cannot see one. ` +
      `frames ${coldAgents.frames} · churn ${coldAgents.churn.join(" ")}`,
  ).toBeGreaterThan(0);

  // ── Every return arrival must be painted ────────────────────────────────
  const returns: Record<string, Arrival> = {};
  for (const destination of ["agents", "git", "map", "library", "mcp", "docs"]) {
    // Warm it once, so "already read" is true, then measure the arrival after that.
    if (destination !== "agents") await arriveFrom(page, destination);
    returns[destination] = await arriveFrom(page, destination);
  }

  for (const [destination, arrival] of Object.entries(returns)) {
    console.log(
      `[arrival] ${destination}: ${arrival.fallbackFrames}/${arrival.frames} unsettled frames · ` +
        `shell neutral pane ${arrival.shellPaneFrames} frames · ` +
        `seen ${arrival.seen.join(" ") || "none"} · churn ${arrival.churn.join(" ")}`,
    );
  }

  for (const [destination, arrival] of Object.entries(returns)) {
    expect(
      arrival.frames,
      `${destination}: no frames sampled — this destination was not measured`,
    ).toBeGreaterThan(20);
    expect(
      arrival.fallbackFrames,
      `${destination}: the pane painted an unsettled state on a return arrival, so the route ` +
        `crossfade faded into it and the real screen then cut in — ${arrival.seen.join(" ")} ` +
        `over ${arrival.fallbackFrames} of ${arrival.frames} frames · churn ${arrival.churn.join(" ")}`,
    ).toBe(0);
    /*
     * ★ **A fallback shorter than a frame still has to be gone.**
     *
     * The frame count above cannot see one: `map-entry-fallback` lived 35-53 ms, and with the
     * defect planted the sampler counted **0** frames for the map while the churn below
     * recorded `+map-entry-fallback -map-entry-fallback`. A fallback that mounts at all is
     * a fallback the view transition can capture, whether or not an animation frame happened
     * to land on it — so the mount record, not the frame count, is what gates this one.
     */
    const mounted = arrival.churn.filter(
      (record) => record.startsWith("+") && FALLBACK_TESTIDS.includes(record.slice(1)),
    );
    expect(
      mounted,
      `${destination}: a fallback was mounted on a return arrival — it can be captured by the ` +
        `route crossfade even when no animation frame lands on it · churn ${arrival.churn.join(" ")}`,
    ).toEqual([]);
  }
});

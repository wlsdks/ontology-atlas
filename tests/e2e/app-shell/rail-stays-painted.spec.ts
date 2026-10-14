import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "../desktop-rail-arrival-harness";
import { waitForAnimationsDone } from "../settle";

/**
 * Hit-tests instead of reading pixels: the defect is WebKit-only and CI installs Chromium alone.
 * A captured element is not painted and an unpainted element is not hit-tested, so ask whether the
 * document is being captured and whether a press aimed at the rail reaches it.
 */

/** The shell's neutral pane. It exists on purpose, but it must never reach a frame. */
const SHELL_NEUTRAL_PANE = '[data-testid="vault-route-identity-pending"]';

interface Crossing {
  /** Frames sampled from the click until the transition was over. */
  frames: number;
  /** Frames during which at least one `::view-transition` animation was running. */
  transitionFrames: number;
  /** Frames showing the live map preparation surface. */
  pendingFrames: number;
  /** Frames on which a point over the rail did not answer with the rail. */
  railMissFrames: number;
  /** What those frames answered instead, so a failure names something. */
  railMissed: string[];
  /** Every `::view-transition` pseudo-element seen, so a captured document is visible here. */
  captured: string[];
  /** Frames holding the shell's neutral pane. */
  neutralPaneFrames: number;
}

/**
 * Samples every frame until a route crossfade or the live map preparation has ended.
 *
 * Armed before the click, because the window it measures opens within a frame of it. The
 * sampler stops once a transition has been seen and is over, or at `maxMs` — a run that
 * never saw activity fails on transition/pending frames rather than a vacuous pass.
 */
async function sampleCrossing(page: Page, maxMs: number): Promise<void> {
  await page.evaluate(
    ([neutralPane, maxMs_]) => {
      const state: Crossing & { done: boolean } = {
        frames: 0,
        transitionFrames: 0,
        pendingFrames: 0,
        railMissFrames: 0,
        railMissed: [],
        captured: [],
        neutralPaneFrames: 0,
        done: false,
      };
      (window as unknown as { __railPaint: typeof state }).__railPaint = state;

      const rail = document.querySelector('[data-testid="app-nav-rail"]');
      const box = rail?.getBoundingClientRect();
      // A point on the rail that is not the tile being pressed: the rail's horizontal middle,
      // a third of the way down its own box.
      const x = box ? box.left + box.width / 2 : 0;
      const y = box ? box.top + box.height / 3 : 0;

      const transitionPseudos = () =>
        document
          .getAnimations()
          .map(
            (animation) =>
              (animation.effect as unknown as { pseudoElement?: string | null } | null)
                ?.pseudoElement ?? "",
          )
          .filter((pseudo) => pseudo.startsWith("::view-transition"));

      const started = performance.now();
      let sawActivity = false;
      const tick = () => {
        state.frames += 1;
        const pseudos = transitionPseudos();
        if (pseudos.length > 0) {
          sawActivity = true;
          state.transitionFrames += 1;
          for (const pseudo of pseudos) {
            if (!state.captured.includes(pseudo)) state.captured.push(pseudo);
          }
        }
        const pending = document.querySelector('[data-testid="map-navigation-wait"]:not([inert])');
        const pendingBox = pending?.getBoundingClientRect();
        const waiting = !!pendingBox && pendingBox.width > 0 && pendingBox.height > 0;
        if (waiting) { state.pendingFrames += 1; sawActivity = true; }
        // The rail must answer throughout preparation as well as crossfade frames.
        const hit = document.elementFromPoint(x, y);
        if ((pseudos.length > 0 || waiting) && !hit?.closest('[data-testid="app-nav-rail"]')) {
          state.railMissFrames += 1;
          const name = hit ? hit.tagName : "null";
          if (!state.railMissed.includes(name)) state.railMissed.push(name);
        }
        if (document.querySelector(neutralPane as string)) state.neutralPaneFrames += 1;
        const over = sawActivity && pseudos.length === 0 && !waiting;
        if (!over && performance.now() - started < (maxMs_ as number)) {
          requestAnimationFrame(tick);
        } else {
          state.done = true;
        }
      };
      requestAnimationFrame(tick);
    },
    [SHELL_NEUTRAL_PANE, maxMs] as const,
  );
}

async function readCrossing(page: Page): Promise<Crossing> {
  await page.waitForFunction(
    () => (window as unknown as { __railPaint: { done: boolean } }).__railPaint.done,
    undefined,
    { timeout: 60_000, polling: "raf" },
  );
  return page.evaluate(() => (window as unknown as { __railPaint: Crossing }).__railPaint);
}

/** How long to keep sampling if a transition never ends — generous, because a stall is a failure. */
const MAX_SAMPLE_MS = 3_000;

/** The five destinations the rail offers on a vault-bearing workbench; MCP is a section of Agents. */
const DESTINATIONS = ["library", "agents", "git", "map", "architecture"] as const;

test.use({ viewport: { width: 1512, height: 901 } });

test("the rail stays painted and pressable across every rail navigation", async ({ page }) => {
  test.setTimeout(300_000);
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);

  const rail = page.getByTestId("app-nav-rail");
  await rail.waitFor({ timeout: 60_000 });

  const crossings: Record<string, Crossing> = {};
  for (const destination of DESTINATIONS) {
    // Leave, settle, then measure the arrival — a half-finished departure would put its own
    // transition inside the window measured on the way in.
    await rail.getByTestId("app-nav-rail-item-insights").click({ noWaitAfter: true });
    await expect(page).toHaveURL(/\/insights\//);
    await waitForAnimationsDone(page.locator("html"));
    await sampleCrossing(page, MAX_SAMPLE_MS);
    await rail.getByTestId(`app-nav-rail-item-${destination}`).click({ noWaitAfter: true });
    crossings[destination] = await readCrossing(page);
    await expect(page).toHaveURL(new RegExp(`/${destination === "map" ? "topology" : destination}/`));
    if (destination === "map") {
      await expect(page.locator('canvas[data-surface-role="map-canvas"]')).toBeVisible();
      await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
    }
    await waitForAnimationsDone(page.locator("html"));
  }

  for (const [destination, crossing] of Object.entries(crossings)) {
    console.log(
      `[rail] ${destination}: ${crossing.transitionFrames}/${crossing.frames} transition frames · ${crossing.pendingFrames} preparation frames · ` +
        `rail unreachable on ${crossing.railMissFrames} (${crossing.railMissed.join(" ") || "none"}) · ` +
        `neutral pane ${crossing.neutralPaneFrames} · captured ${crossing.captured.join(" ")}`,
    );
  }

  for (const [destination, crossing] of Object.entries(crossings)) {
    /*
     * ★ The idling guard. If no frame carried a transition or map preparation, every count below is
     * zero for the wrong reason and this gate is blind.
     */
    expect(
      destination === "map" ? crossing.pendingFrames : crossing.transitionFrames,
      `${destination}: no frame carried ${destination === "map" ? "map preparation" : "a running view transition"} — nothing was measured`,
    ).toBeGreaterThan(0);

    /*
     * ★ The document must not be captured. Capturing it is what put the rail underneath the
     * departing screen's snapshot in WebKit, and it is the one fact a Chromium runner can
     * check for a WebKit-only blank.
     */
    const capturedRoot = crossing.captured.filter((pseudo) => pseudo.includes("(root)"));
    expect(
      capturedRoot,
      `${destination}: the route crossfade captured the document itself, so the rail and the ` +
        `page frame are a snapshot rather than the live screen — ${crossing.captured.join(" ")}`,
    ).toEqual([]);

    /*
     * ★ And the rail must answer. A captured element is not painted and therefore not
     * hit-tested, so a rail that takes a press is a rail that is on screen.
     */
    expect(
      crossing.railMissFrames,
      `${destination}: a press aimed at the rail landed on ` +
        `${crossing.railMissed.join("/") || "nothing"} on ${crossing.railMissFrames} of ` +
        `${crossing.frames} sampled frames — the rail is not on screen`,
    ).toBe(0);

    /*
     * ★ The shell's neutral pane is released inside the commit that schedules it, so it never
     * reaches a frame. When it did, the crossfade captured *it* as the arriving screen, which
     * is why the body band measured 0.0000 alongside the rail.
     */
    expect(
      crossing.neutralPaneFrames,
      `${destination}: the shell's neutral pane was painted on ${crossing.neutralPaneFrames} ` +
        `frames, so the crossfade can capture a blank pane as the arriving screen`,
    ).toBe(0);
  }
});

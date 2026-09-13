import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";

/**
 * **The rail and the page frame are on screen for every frame of a rail navigation.**
 *
 * ## What was wrong
 *
 * Inspection 122 of the installed app (2026-09-13, blocker B1): *"every rail navigation
 * blanks the whole window — rail included — for 0.3-0.5 s."* Captured ink fractions on the
 * installed app, rail band against body band, timed from the click returning:
 *
 * | route | +0.15 s | +0.30 s | +0.47 s | +0.63 s |
 * |---|---|---|---|---|
 * | History, first visit | 0.0000 / 0.0000 | 0.0000 / 0.0000 | 0.0000 / 0.0000 | 0.0601 / 0.0574 |
 * | History, warm | 0.0000 / 0.0000 | 0.0550 / 0.0075 | — | — |
 *
 * The rail was never unmounted. A rail navigation runs inside
 * `document.startViewTransition`, which captured the **document**, and the rail was named
 * `app-nav-rail` so it would be lifted out of that snapshot. In WebKit — which is the engine
 * the installed app runs — the root group paints over every other group, so the lifted rail
 * spent the whole transition underneath the departing screen's snapshot. Measured on one
 * page in both engines, rail band ink while a transition ran: Chromium 0.9808, WebKit
 * 0.0000, and no styling of the pair changed it; only not capturing the root did. The full
 * measurement table is in `app/globals.css`.
 *
 * Capturing the pane instead of the document is what this gate holds in place, so the rail,
 * the page frame and everything else the shell owns stay part of the live document.
 *
 * ## ⚠️ It was not the whole story, and the ink above is not this gate's evidence
 *
 * The blank survived that change (inspection 122, re-inspection). A rail press in the
 * installed app was not a route change at all: `connect-src` refused the App Router's fetch
 * of the arriving route's payload, so the router fell back to a **full document load**, and
 * the blank was the app booting and restoring the folder again — 33-67 ms on six documents,
 * 100-300 ms on 104. The cause and its gates are in `scripts/lib/desktop-csp.mjs`; with it
 * fixed, a crossing on WKWebView runs the crossfade with every frame painted (rail ink
 * 0.0243-0.0307, measured on the installed app at 1/120 s). So the ink table above records a
 * real WebKit behaviour and a wrong diagnosis, and what follows guards only what it can
 * actually see.
 *
 * ## ⚠️ Why this gate hit-tests instead of reading pixels
 *
 * The defect is WebKit-only and CI installs Chromium alone, so an ink gate here would be
 * green before and after — a permanently green gate, which is not evidence. What *is*
 * engine-independent is the cause: **a captured element is not painted, and an unpainted
 * element is not hit-tested** (`route-transition-input.spec.ts` established that reasoning
 * on 2026-09-12). So this gate asks the two questions that decide whether the rail can be
 * on screen at all — is the document being captured, and does a press aimed at the rail
 * reach the rail — and both were red in Chromium on the defect:
 *
 * | sampled over one whole transition | before | after |
 * |---|---|---|
 * | frames where a rail point answered `HTML` | 182 of 183 | 1 of 183 |
 * | frames where the document itself was captured | all | none |
 *
 * A rail that answers presses is a rail that is painted. The pixels are measured directly
 * in WebKit against the static export, and that table is in the pull request.
 */

/** The shell's neutral pane. It exists on purpose, but it must never reach a frame. */
const SHELL_NEUTRAL_PANE = '[data-testid="vault-route-identity-pending"]';

interface Crossing {
  /** Frames sampled from the click until the transition was over. */
  frames: number;
  /** Frames during which at least one `::view-transition` animation was running. */
  transitionFrames: number;
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
 * Samples every animation frame from the click until one full transition has come and gone.
 *
 * Armed before the click, because the window it measures opens within a frame of it. The
 * sampler stops once a transition has been seen and is over, or at `maxMs` — a run that
 * never saw one fails on `transitionFrames` rather than reporting zero misses as a pass.
 */
async function sampleCrossing(page: Page, maxMs: number): Promise<void> {
  await page.evaluate(
    ([neutralPane, maxMs_]) => {
      const state: Crossing & { done: boolean } = {
        frames: 0,
        transitionFrames: 0,
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
      let sawTransition = false;
      const tick = () => {
        state.frames += 1;
        const pseudos = transitionPseudos();
        if (pseudos.length > 0) {
          sawTransition = true;
          state.transitionFrames += 1;
          for (const pseudo of pseudos) {
            if (!state.captured.includes(pseudo)) state.captured.push(pseudo);
          }
          const hit = document.elementFromPoint(x, y);
          if (!hit?.closest('[data-testid="app-nav-rail"]')) {
            state.railMissFrames += 1;
            const name = hit ? hit.tagName : "null";
            if (!state.railMissed.includes(name)) state.railMissed.push(name);
          }
        }
        if (document.querySelector(neutralPane as string)) state.neutralPaneFrames += 1;
        const over = sawTransition && pseudos.length === 0;
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

/** The six destinations the rail offers on a vault-bearing workbench. */
const DESTINATIONS = ["library", "agents", "mcp", "git", "map", "docs"] as const;

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
    await page.waitForTimeout(600);
    await sampleCrossing(page, MAX_SAMPLE_MS);
    await rail.getByTestId(`app-nav-rail-item-${destination}`).click({ noWaitAfter: true });
    crossings[destination] = await readCrossing(page);
    await page.waitForTimeout(300);
  }

  for (const [destination, crossing] of Object.entries(crossings)) {
    console.log(
      `[rail] ${destination}: ${crossing.transitionFrames}/${crossing.frames} transition frames · ` +
        `rail unreachable on ${crossing.railMissFrames} (${crossing.railMissed.join(" ") || "none"}) · ` +
        `neutral pane ${crossing.neutralPaneFrames} · captured ${crossing.captured.join(" ")}`,
    );
  }

  for (const [destination, crossing] of Object.entries(crossings)) {
    /*
     * ★ The idling guard. If no frame carried a running transition, every count below is
     * zero for the wrong reason and this gate is blind.
     */
    expect(
      crossing.transitionFrames,
      `${destination}: no frame carried a running view transition — nothing was measured`,
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
        `${crossing.transitionFrames} frames while the crossfade ran — the rail is not on screen`,
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

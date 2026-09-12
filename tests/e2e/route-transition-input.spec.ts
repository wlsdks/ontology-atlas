import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Arriving from the rail, the new screen takes a press** — slice S7's third proof.
 *
 * A route change runs inside `document.startViewTransition`
 * (`src/shared/lib/route-view-transition.ts`, 2026-09-02), and while a view transition is
 * running the captured document is **not painted** — so it is not hit-tested either.
 * `document.elementFromPoint` answers `html` at every point and a press lands on nothing.
 * The length of the transition is therefore the length of time the arriving screen refuses
 * input, and nobody had measured it.
 *
 * Measured on the static export at 1512×901, before 2026-09-12, six rail crossings with
 * no sampling load on the page:
 *
 * | arriving at | route committed | animations started | transition finished |
 * |---|---|---|---|
 * | Agents / MCP / History | 20-43 ms | 39-56 ms | **278-301 ms** |
 * | Library | 22-24 ms | 229-239 ms | **480-489 ms** |
 *
 * Two independent causes. The browser also runs a *group* animation per captured name at
 * the UA's own 250 ms, which outlived the 180 ms crossfade `app/globals.css` declares and
 * which nobody chose; and the animations only begin on the first frame after the arriving
 * route's own first render, so the Library paid ~205 ms of its own work **and then** the
 * whole animation. A press aimed at `library-open-vault` landed on `HTML` for 430 ms after
 * that door had been laid out.
 *
 * `pointer-events: none` on `::view-transition` was tried first and measured to change
 * nothing — the overlay is not what the hit test reaches. The fix is for the transition to
 * end: the two group animations are removed, and the hold is bounded from the moment the
 * route commits (one crossfade's worth of time later, a fade that has not begun never
 * will, and it is skipped).
 *
 * ## ⚠️ Why the presses are timed from the door, not from the click
 *
 * The first draft pressed at a wall-clock +300 ms after the rail click. That passed locally
 * and **failed three times out of three on the GitHub runner** (`{"dt":327,"on":"HTML"}`),
 * because a fixed offset from the click measures how fast the runner renders the arriving
 * route, not how long the transition holds the screen. A slower machine commits the route
 * later, the bound starts later, and 300 ms lands legitimately inside a hold that has not
 * finished waiting for a screen that has not arrived.
 *
 * So the clock starts where the arriving screen does. `library-open-vault` belongs to the
 * Library's own tree, so it cannot have a box until the Library has committed and laid out
 * — which makes its first box a **lower bound on the commit**, observed in the page and
 * therefore scaled to whatever machine is running. The bound in
 * `route-view-transition.ts` ends the hold one crossfade after the commit, so it ends at
 * or before *that* moment plus one crossfade, on any machine.
 *
 * The presses are therefore at **one crossfade plus four frames** after the door's first
 * box, and again 100 ms later. Both must land. Measured locally, the door's box arrives
 * 49-52 ms after the click and the door becomes hit-testable 192-206 ms after that — so the
 * budget below clears the real figure by about 100 ms while still failing on the defect,
 * which held the door for 430 ms past its own layout.
 *
 * Not `paint + 0`: the door has a box ~150 ms *before* the crossfade this design system
 * chose is over, so a press there would assert the crossfade itself away rather than the
 * hold that outlived it. The click-to-layout and layout-to-hit-testable figures are
 * recorded as measurements below and nothing asserts on them.
 */

/** One frame at 30fps, the unit this repository's motion proofs already sample in. */
const FRAME = 1000 / 30;

/**
 * How long after the arriving door is laid out a press must land: the crossfade's own
 * budget plus four frames of compositor slack.
 *
 * Four rather than one because the hold ends on a frame boundary and the click has to
 * cross the CDP hop. The number is bounded on both sides by measurement: it must exceed
 * the 192-206 ms the fixed build actually takes, and it must stay well under the 430 ms
 * the defect took, or the case stops failing on the thing it is about.
 */
const AFTER_LAYOUT_SLACK_FRAMES = 4;

/** The second press, to show the first was not a one-frame coincidence. */
const SECOND_PRESS_GAP_MS = 100;

test.use({ viewport: { width: 1512, height: 901 } });

/**
 * Arms an in-page watcher **before** the navigation, so the first frame is not missed, and
 * reports when the door was laid out, when it became hit-testable, and when the transition
 * let go.
 */
const WATCH = `(() => {
  const state = { t0: performance.now(), layout: null, hittable: null, holdEnd: null, sawHold: false };
  window.__arrival = state;
  const door = () => document.querySelector('[data-testid="library-open-vault"]');
  const tick = () => {
    const now = Math.round(performance.now() - state.t0);
    const node = door();
    if (node) {
      const rect = node.getBoundingClientRect();
      if (state.layout === null && rect.width > 0 && rect.height > 0) state.layout = now;
      if (state.hittable === null && rect.width > 0) {
        const owner = document.elementFromPoint(
          Math.round(rect.x + rect.width / 2),
          Math.round(rect.y + rect.height / 2),
        );
        if (owner && owner.closest('[data-testid="library-open-vault"]')) state.hittable = now;
      }
    }
    const holding = document.documentElement.matches(':active-view-transition');
    if (holding) state.sawHold = true;
    else if (state.sawHold && state.holdEnd === null) state.holdEnd = now;
    if (now < 3000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

test("레일에서 자료실로 건너오면 도착한 문이 한 크로스페이드 안에 누름을 받는다", async ({ page }) => {
  await seedFirstRunSeen(page);

  // Every press is logged with its own timestamp, so the assertion reads the element the
  // click actually reached rather than trusting a locator's own retry.
  await page.addInitScript(() => {
    const log: { at: number; on: string }[] = [];
    (window as unknown as { __presses: typeof log }).__presses = log;
    addEventListener(
      "click",
      (event) => {
        const target = event.target as Element | null;
        log.push({
          at: Math.round(performance.now()),
          on: target?.closest("[data-testid]")?.getAttribute("data-testid") ?? target?.tagName ?? "none",
        });
      },
      { capture: true },
    );
  });

  await page.goto("/en/library/?guides=off", { waitUntil: "networkidle" });
  const rail = page.getByTestId("app-nav-rail");
  await rail.waitFor({ timeout: 30_000 });

  // The door's coordinates on the settled screen; the arriving screen puts it in the same
  // place, and a fixed point is what a person's hand does.
  const door = page.getByTestId("library-open-vault");
  await expect(door).toBeVisible({ timeout: 25_000 });
  const box = await door.boundingBox();
  expect(box, "자료실의 폴더 문을 찾지 못했다").not.toBeNull();
  const aim = { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) };

  // Leave the Library and come back, pressing without waiting for anything to be actionable.
  await rail.getByRole("link", { name: "Agents" }).click();
  await expect(page.getByTestId("agents-page")).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    (window as unknown as { __presses: { at: number; on: string }[] }).__presses.length = 0;
  });
  await page.evaluate(WATCH);
  await rail.getByRole("link", { name: "Library" }).click({ noWaitAfter: true });

  // Wait, in the page, for the arriving door to be laid out — then for the crossfade's own
  // budget on top of it. `page.waitForFunction` polls on animation frames.
  await page.waitForFunction(
    () => (window as unknown as { __arrival: { layout: number | null } }).__arrival.layout !== null,
    undefined,
    { timeout: 25_000, polling: "raf" },
  );
  const budget = await page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--motion-base").trim();
    const seconds = /^([\d.]+)s$/.exec(raw);
    if (seconds) return Number(seconds[1]) * 1000;
    const milliseconds = /^([\d.]+)ms$/.exec(raw);
    return milliseconds ? Number(milliseconds[1]) : Number.NaN;
  });
  expect(budget, "--motion-base 를 읽지 못했다").toBeGreaterThan(0);

  const waitFor = Math.round(budget + AFTER_LAYOUT_SLACK_FRAMES * FRAME);
  // The wait reads the door's layout time **in the page**, so the budget is counted from
  // the frame the arriving screen was laid out on rather than from a round trip later.
  await page.waitForFunction(
    (until) => {
      const arrival = (window as unknown as { __arrival: { t0: number; layout: number } }).__arrival;
      return performance.now() - arrival.t0 >= arrival.layout + until;
    },
    waitFor,
    { timeout: 25_000, polling: "raf" },
  );

  await page.mouse.click(aim.x, aim.y);
  await page.waitForTimeout(SECOND_PRESS_GAP_MS);
  await page.mouse.click(aim.x, aim.y);
  await page.waitForTimeout(250);

  const arrival = await page.evaluate(
    () =>
      (
        window as unknown as {
          __arrival: { layout: number; hittable: number | null; holdEnd: number | null };
        }
      ).__arrival,
  );
  const presses = await page.evaluate(
    () => (window as unknown as { __presses: { at: number; on: string }[] }).__presses,
  );

  /*
   * Measurements, not assertions. They say what machine this run happened on, so a future
   * failure can be read as "the hold regressed" or "this runner got slower" without
   * guessing. Locally: layout 49-52 ms after the click, hit-testable 192-206 ms after that.
   */
  console.log(
    `[arrival] door laid out at +${arrival.layout}ms · hit-testable at ` +
      `+${arrival.hittable ?? "?"}ms (${arrival.hittable === null ? "?" : arrival.hittable - arrival.layout}ms ` +
      `after layout) · hold released at +${arrival.holdEnd ?? "?"}ms · budget ${waitFor}ms · ` +
      `presses ${JSON.stringify(presses)}`,
  );

  // The rail tile's own click is the first entry; the two aimed presses are the last two.
  const aimed = presses.slice(-2);
  expect(aimed, "겨눈 누름 두 번이 기록되지 않았다").toHaveLength(2);
  for (const [index, press] of aimed.entries()) {
    expect(
      press.on,
      `문이 놓인 뒤 ${waitFor + index * SECOND_PRESS_GAP_MS}ms 에 누름이 문에 닿지 않았다 — ` +
        `문 놓임 +${arrival.layout}ms · 히트 가능 +${arrival.hittable ?? "?"}ms · ` +
        `전환 해제 +${arrival.holdEnd ?? "?"}ms · 기록 ${JSON.stringify(presses)}`,
    ).toBe("library-open-vault");
  }
});

/**
 * **No animation in the transition may outlive the crossfade this app declares.**
 *
 * The other half of the same fix. `app/globals.css` sets the crossfade to `--motion-base`
 * (180 ms) on `::view-transition-old(root)` / `-new(root)`, and those two rules were the
 * only ones anybody chose. The browser also ran a *group* animation per captured name at
 * its own **250 ms** — `-ua-view-transition-group-anim-root` and
 * `-ua-view-transition-group-anim-app-nav-rail` — and a transition holds the screen until
 * **every** one of its animations is done, so the hold outlived the declared crossfade by
 * 70 ms on every route. A route change neither moves nor resizes the root box, and the
 * rail's own snapshots are already excluded from the fade, so both groups were animating
 * something with nothing to show.
 *
 * ## ⚠️ Why this reads the animation list rather than timing the hold
 *
 * The first draft asserted the distance from the fade starting to `finished` against the
 * declared duration plus a frame. It measured 180-182 ms across three runs and then 199 on
 * the fourth — because `finished` is a promise resolving on the main thread, so the number
 * carries whatever else that thread was doing. Meanwhile the defect measured 237-247 ms.
 * Two overlapping distributions is a coin toss, not a gate, and widening the slack to make
 * it stable would have pushed it past the defect it exists to catch.
 *
 * The list has no such problem. Every animation is captured at `ready`, before any of them
 * has started, and each one's authored duration is read straight off its timing — no clock,
 * nothing to jitter, and exactly the thing that changed. The hold's measured length is
 * logged beside it as a figure to read, and nothing asserts on it.
 */
test("전환이 도는 애니메이션 중 선언한 크로스페이드보다 긴 것이 없다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const seen: {
      animations: { pseudo: string; name: string; duration: number }[] | null;
      held: number | null;
    } = { animations: null, held: null };
    (window as unknown as { __transition: typeof seen }).__transition = seen;
    const original = (document as unknown as { startViewTransition?: (cb: () => unknown) => unknown })
      .startViewTransition;
    if (!original) return;
    (document as unknown as { startViewTransition: (cb: () => unknown) => unknown }).startViewTransition = function (
      update: () => unknown,
    ) {
      const startedAt = performance.now();
      seen.animations = null;
      seen.held = null;
      const handle = original.call(document, update) as {
        ready?: Promise<unknown>;
        finished?: Promise<unknown>;
      };
      handle.ready?.then(() => {
        seen.animations = document
          .getAnimations()
          .map((animation) => {
            const pseudo =
              (animation.effect as unknown as { pseudoElement?: string | null } | null)?.pseudoElement ?? "";
            const timing = animation.effect?.getTiming();
            const duration = typeof timing?.duration === "number" ? timing.duration : Number.NaN;
            return {
              pseudo,
              name: (animation as unknown as { animationName?: string }).animationName ?? "?",
              duration,
            };
          })
          .filter((animation) => animation.pseudo.startsWith("::view-transition"));
      }, () => undefined);
      handle.finished?.then(
        () => {
          seen.held = Math.round(performance.now() - startedAt);
        },
        () => undefined,
      );
      return handle;
    };
  });
  await page.goto("/en/library/?guides=off", { waitUntil: "networkidle" });
  const rail = page.getByTestId("app-nav-rail");
  await rail.waitFor({ timeout: 30_000 });

  await rail.getByRole("link", { name: "Agents" }).click({ noWaitAfter: true });
  await page.waitForFunction(
    () => (window as unknown as { __transition: { held: number | null } }).__transition.held !== null,
    undefined,
    { timeout: 25_000, polling: "raf" },
  );

  const seen = await page.evaluate(
    () =>
      (
        window as unknown as {
          __transition: {
            animations: { pseudo: string; name: string; duration: number }[] | null;
            held: number | null;
          };
        }
      ).__transition,
  );
  const declared = await page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--motion-base").trim();
    const seconds = /^([\d.]+)s$/.exec(raw);
    if (seconds) return Number(seconds[1]) * 1000;
    const milliseconds = /^([\d.]+)ms$/.exec(raw);
    return milliseconds ? Number(milliseconds[1]) : Number.NaN;
  });
  expect(declared, "--motion-base 를 읽지 못했다").toBeGreaterThan(0);

  // A figure to read, not a gate: it says what the hold cost on this machine, so a future
  // failure here can be told apart from a runner that got slower.
  console.log(
    `[hold] released ${seen.held}ms after the click · declared ${declared}ms · ` +
      `animations ${JSON.stringify(seen.animations)}`,
  );

  expect(
    seen.animations,
    "전환 애니메이션 목록을 잡지 못했다 — ready 가 거부됐거나 브라우저에 전환이 없다",
  ).not.toBeNull();
  /*
   * Idling guard. The four fade and blend animations on the captured pane's `old`/`new` pair
   * are what the crossfade *is*, so a run that captured fewer than that captured the wrong
   * moment and the duration rule below would pass on an empty set. The pair was named `root`
   * until 2026-09-13, when the capture moved off the document so the rail could stay on screen
   * in WebKit (`rail-stays-painted.spec.ts`); the count is the same either way.
   */
  expect(seen.animations!.length, `잡은 애니메이션: ${JSON.stringify(seen.animations)}`).toBeGreaterThanOrEqual(4);
  const overrunning = seen.animations!.filter((animation) => !(animation.duration <= declared));
  expect(
    overrunning,
    `선언한 ${declared}ms 보다 긴 애니메이션이 전환을 붙잡는다: ${JSON.stringify(overrunning)}`,
  ).toEqual([]);
});

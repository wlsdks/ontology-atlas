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
 * Measured on the static export at 1512x901, before 2026-09-12, six rail crossings with
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
 * whole animation. A press aimed at `library-open-vault` at +100 ms and +300 ms landed on
 * `HTML`; at +700 ms it landed on the door.
 *
 * `pointer-events: none` on `::view-transition` was tried first and measured to change
 * nothing — the overlay is not what the hit test reaches. The fix is for the transition to
 * end: the two group animations are removed, and the hold is bounded from the moment the
 * route commits (one crossfade's worth of time later, a fade that has not begun never
 * will, and it is skipped).
 *
 * ## What this spec asserts, and why it is these two numbers
 *
 * A press at **+300 ms** after the rail click, on the Library — the slowest arrival in the
 * app and the one this defect was reported on — and again at **+700 ms**. Both must land
 * on the control they were aimed at. The offsets are wall-clock from the click rather than
 * from an actionability wait, because a wait for the control to be actionable is exactly
 * the wait a person does not do: the door is on screen and they reach for it.
 *
 * It also records the press at +100 ms as **not** landing. That is inside the 180 ms
 * crossfade the design system chose, so it is the contract rather than a defect — and
 * writing it down is what keeps this spec honest about what was fixed. If the crossfade is
 * ever re-decided to something a press can cross, this assertion goes red and says so.
 */

/** Offsets, in ms after the rail click, at which the arriving screen must take a press. */
const MUST_LAND = [300, 700] as const;

/** Inside the crossfade's own 180 ms; a press here is the contract, not a defect. */
const STILL_HELD = 100;

test.use({ viewport: { width: 1512, height: 901 } });

test("레일에서 자료실로 건너오면 도착한 화면이 곧바로 누름을 받는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.goto("/en/library/?guides=off", { waitUntil: "networkidle" });
  const rail = page.getByTestId("app-nav-rail");
  await rail.waitFor({ timeout: 30_000 });

  // Every press on the page is logged with its own timestamp, so the assertion reads the
  // element the click actually reached rather than trusting a locator's own retry.
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
  await page.reload({ waitUntil: "networkidle" });
  await rail.waitFor({ timeout: 30_000 });

  /** The Library's own door, at the coordinates it holds once the route has arrived. */
  const door = page.getByTestId("library-open-vault");
  await expect(door).toBeVisible({ timeout: 25_000 });
  const box = await door.boundingBox();
  expect(box, "자료실의 폴더 문을 찾지 못했다").not.toBeNull();
  const target = { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) };

  const pressAfter = async (delay: number) => {
    // Leave the Library, settle, then come back and press without waiting for anything.
    await rail.getByRole("link", { name: "Agents" }).click();
    await expect(page.getByTestId("agents-page")).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const held = window as unknown as { __presses: { at: number; on: string }[]; __from: number };
      held.__presses.length = 0;
      held.__from = performance.now();
    });
    await rail.getByRole("link", { name: "Library" }).click({ noWaitAfter: true });
    await page.waitForTimeout(delay);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const held = window as unknown as { __presses: { at: number; on: string }[]; __from: number };
      return held.__presses.map((press) => ({ dt: Math.round(press.at - held.__from), on: press.on }));
    });
  };

  for (const delay of MUST_LAND) {
    const presses = await pressAfter(delay);
    // The rail tile's own click is the first entry; the aimed press is the last.
    const landed = presses.at(-1);
    expect(landed, `+${delay}ms 의 누름이 기록되지 않았다`).toBeTruthy();
    expect(
      landed!.on,
      `+${delay}ms 에 누름이 문에 닿지 않았다 — 기록: ${JSON.stringify(presses)}`,
    ).toBe("library-open-vault");
  }

  const held = await pressAfter(STILL_HELD);
  expect(
    held.at(-1)?.on,
    `크로스페이드 안에서 누름이 통과했다 — 페이드 길이가 재결정됐다면 이 줄을 다시 정하라: ${JSON.stringify(held)}`,
  ).not.toBe("library-open-vault");
});

/**
 * **The transition may not outlive the crossfade this app declares.**
 *
 * The other half of the same fix, on a route that arrives fast enough for the fade to
 * actually play. `app/globals.css` sets the crossfade to `--motion-base` (180 ms) on
 * `::view-transition-old(root)` / `-new(root)`, and those two rules were the only ones
 * anybody chose: the browser also ran `-ua-view-transition-group-anim-root` and
 * `-ua-view-transition-group-anim-app-nav-rail` at its own 250 ms, and a transition holds
 * the screen until **every** animation is done. Measured before: 250 ms from the first
 * animation starting to `finished`, against a declared 180.
 *
 * So the number here is the distance from "the fade started" to "the screen is live
 * again", which is the crossfade's own duration plus a frame — not a wall-clock offset,
 * because the arriving route's render cost belongs to the route and is bounded separately
 * above.
 */
test("크로스페이드가 선언한 길이보다 전환이 더 오래 화면을 잡지 않는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const marks: { what: string; at: number }[] = [];
    (window as unknown as { __marks: typeof marks }).__marks = marks;
    const original = (document as unknown as { startViewTransition?: (cb: () => unknown) => unknown })
      .startViewTransition;
    if (!original) return;
    (document as unknown as { startViewTransition: (cb: () => unknown) => unknown }).startViewTransition = function (
      update: () => unknown,
    ) {
      marks.length = 0;
      marks.push({ what: "start", at: performance.now() });
      const handle = original.call(document, update) as { ready?: Promise<unknown>; finished?: Promise<unknown> };
      handle.ready?.then(() => {
        const watch = () => {
          const running = document
            .getAnimations()
            .filter((animation) =>
              ((animation.effect as unknown as { pseudoElement?: string | null } | null)?.pseudoElement ?? "").startsWith(
                "::view-transition",
              ),
            );
          if (running.some((animation) => animation.startTime !== null)) {
            marks.push({ what: "animsStarted", at: performance.now() });
            return;
          }
          if (running.length > 0) requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      }, () => undefined);
      handle.finished?.then(
        () => marks.push({ what: "finished", at: performance.now() }),
        () => undefined,
      );
      return handle;
    };
  });
  await page.goto("/en/library/?guides=off", { waitUntil: "networkidle" });
  const rail = page.getByTestId("app-nav-rail");
  await rail.waitFor({ timeout: 30_000 });

  await rail.getByRole("link", { name: "Agents" }).click({ noWaitAfter: true });
  await page.waitForTimeout(2000);
  const marks = (await page.evaluate(() => {
    const held = window as unknown as { __marks: { what: string; at: number }[] };
    const base = held.__marks[0]?.at ?? 0;
    return held.__marks.map((mark) => ({ what: mark.what, dt: Math.round(mark.at - base) }));
  })) as { what: string; dt: number }[];

  const started = marks.find((mark) => mark.what === "animsStarted");
  const finished = marks.find((mark) => mark.what === "finished");
  expect(started, `페이드가 시작되지 않았다 — 이 라우트에서는 이 계약을 잴 수 없다: ${JSON.stringify(marks)}`).toBeTruthy();
  expect(finished, `전환이 끝나지 않았다: ${JSON.stringify(marks)}`).toBeTruthy();

  // ⚠️ The computed value comes back in **seconds** (`0.18s`), not as authored (`180ms`),
  // so the unit is read rather than assumed — the same parse
  // `shared/lib/route-view-transition.ts` does, and for the same reason.
  const declared = await page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--motion-base").trim();
    const seconds = /^([\d.]+)s$/.exec(raw);
    if (seconds) return Number(seconds[1]) * 1000;
    const milliseconds = /^([\d.]+)ms$/.exec(raw);
    return milliseconds ? Number(milliseconds[1]) : Number.NaN;
  });
  expect(declared, "--motion-base 를 읽지 못했다").toBeGreaterThan(0);
  /*
   * One frame of slack at 30fps over the declared duration. The UA's own 250 ms group
   * animation measured 250 against a declared 180, so this fails on a revert rather than
   * idling.
   */
  expect(
    finished!.dt - started!.dt,
    `페이드 시작부터 끝까지 ${finished!.dt - started!.dt}ms — 선언값은 ${declared}ms: ${JSON.stringify(marks)}`,
  ).toBeLessThanOrEqual(declared + 34);
});

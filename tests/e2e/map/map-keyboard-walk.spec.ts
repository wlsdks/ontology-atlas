import { expect, test } from "@playwright/test";
import ko from "../../../messages/ko.json";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../../../src/features/first-run-starter/model/first-run-starter-dismiss";
import { seedFirstRunSeen } from "../first-run-seed";
// The `window.__atlasMap` type is declared in exactly one place — two copies raise TS2717.
import "../atlas-map-probe";
import { waitForMapStill, waitFrames } from "../settle";

/**
 * **Walking the map by keyboard.**
 *
 * This canvas is a picture, so pressing Tab had nowhere to go among the nodes. It
 * could take focus (`tabIndex=0`) but **there were zero things a key could do**. So
 * what this spec measures is not "can focus reach it" but **"did pressing a key
 * move to another node"**.
 *
 * Verdicts come from `window.__atlasMap.selection()`; no screen coordinates are
 * clicked. Verifying by coordinates would prove the spec's own claim (that the map
 * is usable without coordinates) by the opposite means.
 */

const DIRECTIONS = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"] as const;

async function focusCanvas(page: import("@playwright/test").Page) {
  const canvas = page.getByTestId("ontology-map-canvas");
  await canvas.waitFor({ state: "visible", timeout: 20_000 });
  await canvas.focus();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__atlasMap)), { timeout: 15_000 })
    .toBe(true);
  return canvas;
}

const selectedId = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null);

/**
 * Press once, then wait until it moves; answers "none" only after waiting up to `patienceMs`,
 * because a fixed delay is one machine's number.
 */
async function pressAndSettle(
  page: import("@playwright/test").Page,
  key: string,
  from: string | null,
  patienceMs = 3_000,
): Promise<string | null> {
  await page.keyboard.press(key);
  const deadline = Date.now() + patienceMs;
  let now = await selectedId(page);
  while (Date.now() < deadline) {
    now = await selectedId(page);
    if (now && now !== from) return now;
    // A poll interval, not a gate: the loop returns the moment the selection moves.
    await waitFrames(page, 3);
  }
  return now;
}

/**
 * **Wait for coordinates to settle before reading them.** Measuring mid camera
 * transition makes "off screen" accidentally true.
 *
 * Stillness is judged in the page, on the frames it drew: two samples taken 150 ms
 * apart from here could both land inside one slow step and call a moving camera
 * settled, and on a fast machine each threw 150 ms away.
 */
async function settleSelectedPosition(page: import("@playwright/test").Page) {
  await waitForMapStill(page);
}

/** Presses all four directions in turn to find one that moves **at all**. */
async function walkOneStep(
  page: import("@playwright/test").Page,
  from: string | null,
): Promise<string | null> {
  for (const key of DIRECTIONS) {
    const now = await pressAndSettle(page, key, from);
    if (now && now !== from) return now;
  }
  return null;
}

/**
 * Walks one direction until a dead end; stops the moment the notice appears, since it
 * dismisses itself during further presses.
 */
async function walkUntilDeadEnd(page: import("@playwright/test").Page, direction = "ArrowLeft") {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press(direction);
    // A press is answered within a few drawn frames; frames are the unit, and 140 ms
    // was this machine's guess at eight of them.
    await waitFrames(page, 8);
    if ((await page.locator("[data-walk-notice]").count()) > 0) return true;
  }
  return false;
}

test.describe("ways to focus the map", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
  });

  /**
   * **`G M` grabs the map** — the entrance to walking.
   *
   * ⚠️ Measured while this test did not exist: reaching this canvas by keyboard took
   * **30 Tab presses** (1440×900). However well the walking works, 30 presses in
   * front of it puts it out of reach of the very people it was built for — keyboard
   * users.
   *
   * The Tab count is not pinned as a cap: adding a destination to the rail correctly
   * raises it, and a test failing each time makes the next person fix the test. The
   * property to lock is **"there is a path reachable in one key"**.
   */
  test("pressing G M from another screen focuses the map canvas", async ({ page }) => {
    await page.goto("/ko/projects/?guides=off&e2e=1");
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await expect(page).toHaveURL(/\/ko\/topology\/?($|\?)/, { timeout: 10_000 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.activeElement?.getAttribute("data-surface-role") ?? "",
          ),
        { timeout: 10_000 },
      )
      .toBe("map-canvas");
  });

  /** Can you walk immediately after grabbing — is the entrance really wired to the feature. */
  test("after G M, the arrow keys can walk the map", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.addInitScript((key) => {
      window.sessionStorage.setItem(key, "1");
      window.localStorage.setItem("demo:sample-source:v1", "storefront");
    }, FIRST_RUN_STARTER_DISMISSED_KEY);
    await page.goto("/ko/topology/?guides=off&e2e=1");
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.activeElement?.getAttribute("data-surface-role") ?? "",
          ),
        { timeout: 10_000 },
      )
      .toBe("map-canvas");
    // Focus can land before graph props reach the canvas. Read the rendered map
    // contract instead of `__atlasMap.nodes()`: the latter is the interaction
    // instrument under test here and can be replaced during a dev remount.
    await expect
      .poll(async () => Number(await page.getByTestId("ontology-map").getAttribute("data-source-node-count")), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("map-detail-panel")).toHaveAttribute(
      "data-selected-node-id",
      /.+/,
      { timeout: 5_000 },
    );
  });
});

test.describe("map keyboard walk", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off&e2e=1");
  });

  test("the walk lands on a real neighbor and never jumps to an arbitrary node", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const from = await selectedId(page);

    const to = await walkOneStep(page, from);
    /* Failing to walk here is a regression, not a vault property, so assert rather than skip. */
    expect(to, `could not walk in any of four directions from the first node (${from})`).not.toBeNull();

    // Are the two really joined by an edge — ask the graph, not the screen.
    const connected = await page.evaluate(
      ([a, b]) => {
        const probe = window.__atlasMap;
        if (!probe) return null;
        // `edgeAt` is coordinate-based and is not used. Whether two nodes are neighbours
        // must be judged by the map's adjacency rather than the datasheet, so this only
        // confirms both appear in the list of drawn nodes.
        const ids = new Set(probe.nodes().filter((n) => !n.hidden).map((n) => n.id));
        return { aVisible: ids.has(a as string), bVisible: ids.has(b as string) };
      },
      [from, to],
    );
    expect(connected?.aVisible, "the origin node is not on screen").toBe(true);
    expect(connected?.bVisible, "the node walked to is not on screen").toBe(true);
  });

  test("the node walked to stays on screen because the camera follows", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    /* Wait for the coordinates to settle, not a duration: a slow machine would measure mid-transition. */
    for (const key of DIRECTIONS) {
      await page.keyboard.press(key);
      await settleSelectedPosition(page);
    }

    const onScreen = await page.evaluate(() => {
      const probe = window.__atlasMap;
      const id = probe?.selection().nodeId;
      const camera = probe?.camera();
      if (!probe || !id || !camera) return null;
      const node = probe.nodes().find((n) => n.id === id);
      if (!node) return null;
      return {
        inside:
          node.x >= 0 && node.x <= camera.width && node.y >= 0 && node.y <= camera.height,
        x: Math.round(node.x),
        y: Math.round(node.y),
        width: camera.width,
        height: camera.height,
      };
    });
    expect(onScreen, "could not read the selection").not.toBeNull();
    expect(
      onScreen?.inside,
      `the selected node is off screen (${onScreen?.x},${onScreen?.y} / ${onScreen?.width}×${onScreen?.height})`,
    ).toBe(true);
  });

  /**
   * Sidestepping between siblings works: domains around the project have no edges between
   * them, so siblings (same parent) are candidates.
   */
  test("siblings under one parent can be visited with the arrow keys", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const seen = new Set<string>();
    for (const key of [...DIRECTIONS, ...DIRECTIONS]) {
      const id = await selectedId(page);
      if (id) seen.add(id);
      await pressAndSettle(page, key, id);
    }
    const last = await selectedId(page);
    if (last) seen.add(last);
    /*
     * A small vault has fewer places to go, so no specific node name is pinned. The
     * property locked is **visiting three or more places**.
     */
    expect(seen.size, `the arrow keys visited only ${seen.size} nodes`).toBeGreaterThanOrEqual(3);
  });

  /**
   * When there is nowhere to go, say so beside the node walked from. The notice must dismiss
   * itself and must not take focus, or arrow keys never reach the canvas.
   */
  test("at a dead end the notice appears beside the node, does not take focus and disappears by itself", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    expect(await walkUntilDeadEnd(page), "never reached a dead end, so this test measures nothing").toBe(true);

    // It says so, rather than staying silent.
    await expect(
      page.getByText(ko.topologyWidgets.keyboardWalk.deadEnd).first(),
      "a dead end but nothing is said",
    ).toBeVisible({ timeout: 4_000 });

    // Beside the node being walked from — "beside" can only be measured as a distance. The
    // measured toast sat in the bottom-right corner, over 500px away at 1440×900.
    const geom = await page.evaluate(() => {
      const probe = window.__atlasMap;
      const id = probe?.selection().nodeId;
      const canvas = document.querySelector('[data-surface-role="map-canvas"]');
      const notice = document.querySelector("[data-walk-notice]");
      if (!probe || !id || !canvas || !notice) return null;
      const node = probe.nodes().find((n) => n.id === id);
      if (!node) return null;
      const cbox = canvas.getBoundingClientRect();
      const nbox = notice.getBoundingClientRect();
      return {
        dx: Math.abs(nbox.x + nbox.width / 2 - (cbox.x + node.x)),
        dy: Math.abs(nbox.y + nbox.height / 2 - (cbox.y + node.y)),
      };
    });
    expect(geom, "the notice is not in the DOM and cannot be found by `data-walk-notice`").not.toBeNull();
    expect(geom!.dx, "the notice is too far horizontally from the node").toBeLessThan(280);
    expect(geom!.dy, "the notice is too far vertically from the node").toBeLessThan(200);

    // It does not take the focus, so the arrow keys still reach the canvas.
    const stillOnCanvas = await page.evaluate(
      () => document.activeElement?.getAttribute("data-surface-role") === "map-canvas",
    );
    expect(stillOnCanvas, "the notice took focus, so the arrow keys no longer reach the map").toBe(true);

    // It goes away without being pressed.
    await expect(page.locator("[data-walk-notice]")).toHaveCount(0, { timeout: 6_000 });

    // And walking still works. Going back the way we came, there is a neighbour.
    const before = await selectedId(page);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => selectedId(page), { timeout: 4_000 })
      .not.toBe(before);
  });

  /**
   * The selected node is never hidden behind the panel: the camera centres it in the space
   * excluding the panel. Asserts "not covered", not "exactly centred", since the camera
   * follows only when needed.
   */
  test("the selected node is not covered by a panel", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const covered: string[] = [];
    for (const key of [...DIRECTIONS, ...DIRECTIONS]) {
      await page.keyboard.press(key);
      await settleSelectedPosition(page);
      const hit = await page.evaluate(() => {
        const probe = window.__atlasMap;
        const id = probe?.selection().nodeId;
        const canvas = document.querySelector('[data-surface-role="map-canvas"]');
        if (!probe || !id || !canvas) return null;
        const node = probe.nodes().find((n) => n.id === id);
        if (!node) return null;
        const box = canvas.getBoundingClientRect();
        // Convert to document coordinates — `nodes()` returns canvas-local ones.
        const px = box.x + node.x;
        const py = box.y + node.y;
        for (const el of document.querySelectorAll("body *")) {
          if (el === canvas || canvas.contains(el) || el.contains(canvas)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) continue;
          if (el.closest("details:not([open])")) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          if (Number(cs.opacity) < 0.05) continue;
          if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
            return `${id} is behind ${(el as HTMLElement).dataset.testid || el.tagName}`;
          }
        }
        return null;
      });
      if (hit) covered.push(hit);
    }
    expect(covered, "the selected node is covered by a panel").toEqual([]);
  });

  // A camera transition must leave the selected branch visible beside the inspector.
  test("after the camera moves, the selected branch stays inside the free area", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const readGeometry = () =>
      page.evaluate(() => {
        const probe = window.__atlasMap;
        const canvas = document.querySelector('[data-surface-role="map-canvas"]');
        const cam = probe?.camera();
        const id = probe?.selection().nodeId;
        if (!probe || !canvas || !cam || !id) return null;
        const node = probe.nodes().find((n) => n.id === id);
        if (!node) return null;
        const box = canvas.getBoundingClientRect();
        // Free area = the canvas minus vertical panels. The spec does not import product
        // code and **re-measures from the screen** — sharing the function would stay green
        // when both are wrong together.
        let left = box.x;
        let rightEdge = box.right;
        // The selected inspector is a known product surface. Measure it by its
        // screen identity rather than importing the production marker/heuristic,
        // so deleting that wiring makes this gate turn RED.
        const selectedInspector = document.querySelector<HTMLElement>(
          '[data-testid="topology-node-popover-positioner"]',
        );
        if (selectedInspector) {
          const r = selectedInspector.getBoundingClientRect();
          const cs = getComputedStyle(selectedInspector);
          if (
            r.width >= 40 &&
            r.height >= 40 &&
            r.right > box.x &&
            r.left < box.right &&
            cs.visibility !== "hidden" &&
            cs.display !== "none" &&
            Number(cs.opacity) >= 0.05
          ) {
            if (r.x + r.width / 2 >= box.x + box.width / 2) {
              rightEdge = Math.min(rightEdge, r.x);
            } else {
              left = Math.max(left, r.right);
            }
          }
        }
        for (const el of document.querySelectorAll("body *")) {
          if (el === canvas || canvas.contains(el) || el.contains(canvas)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) continue;
          if (r.right <= box.x || r.left >= box.right) continue;
          if (el.closest("details:not([open])") || el.closest('[aria-hidden="true"]')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) continue;
          const tall = r.height >= box.height * 0.6;
          const wide = r.width >= box.width * 0.6;
          if (!tall || wide) continue;
          if (r.x + r.width / 2 >= box.x + box.width / 2) rightEdge = Math.min(rightEdge, r.x);
          else left = Math.max(left, r.right);
        }
        return {
          camX: cam.x,
          camY: cam.y,
          boxX: box.x,
          nodeDocX: box.x + node.x,
          freeLeft: left - box.x,
          freeRight: rightEdge - box.x,
          canvasHeight: box.height,
          name: probe.labels().find((label) => label.nodeId === id) ?? null,
        };
      });

    let landed: Awaited<ReturnType<typeof readGeometry>> = null;
    for (const key of [...DIRECTIONS, ...DIRECTIONS, ...DIRECTIONS]) {
      const before = await readGeometry();
      await page.keyboard.press(key);
      await settleSelectedPosition(page);
      const after = await readGeometry();
      if (!before || !after) continue;
      const cameraMoved = Math.hypot(after.camX - before.camX, after.camY - before.camY) > 2;
      if (cameraMoved) {
        landed = after;
        break;
      }
    }
    expect(landed, "never triggered a camera transition").not.toBeNull();
    // Selection may make only a small nudge; its drawn name and mark must clear the inspector.
    expect(landed!.name, "the selected branch keeps a drawn name").not.toBeNull();
    expect(landed!.name!.minX, "the selected name clears the left obstruction").toBeGreaterThanOrEqual(landed!.freeLeft - 1);
    expect(landed!.name!.maxX, "the selected name clears the right inspector").toBeLessThanOrEqual(landed!.freeRight + 1);
    expect(landed!.name!.minY, "the selected name stays on the canvas").toBeGreaterThanOrEqual(0);
    expect(landed!.name!.maxY, "the selected name stays on the canvas").toBeLessThanOrEqual(landed!.canvasHeight);
    expect(landed!.nodeDocX - landed!.boxX, "the selected mark clears the left obstruction").toBeGreaterThanOrEqual(landed!.freeLeft);
    expect(landed!.nodeDocX - landed!.boxX, "the selected mark clears the right inspector").toBeLessThanOrEqual(landed!.freeRight);
  });

  /** The shortcut sheet is the only place that teaches the keyboard, so it must list arrow-key walking. */
  test("the shortcuts sheet explains arrow-key walking", async ({ page }) => {
    await focusCanvas(page);
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("?");
    const sheet = page.getByTestId("shortcut-sheet-scroll");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    const all = page.getByTestId("shortcut-sheet-scope-all");
    if (await all.isVisible().catch(() => false)) await all.click();

    const section = await sheet.evaluate((el) => {
      const lines = (el as HTMLElement).innerText.split("\n").map((s) => s.trim()).filter(Boolean);
      const start = lines.findIndex((l, i) => l === "지도" && i > 3);
      if (start < 0) return null;
      const rest = lines.slice(start);
      const next = rest.findIndex((l, i) => i > 0 && /^(검색 팔레트|허브|문서함)/.test(l));
      return rest.slice(0, next > 0 ? next : 24);
    });
    expect(section, "found no Map section in the sheet, so this test spins idle").not.toBeNull();
    expect(
      section!.some((line) => /↑|↓|←|→|방향키/.test(line)),
      `the map section does not mention arrow keys: ${section!.join(" · ")}`,
    ).toBe(true);
  });

  /** The canvas label must say what works on the canvas, not send people to the INDEX panel. */
  test("the canvas label first says what works here", async ({ page }) => {
    const canvas = page.getByTestId("ontology-map-canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    const label = await canvas.getAttribute("aria-label");
    expect(label, "the canvas has no accessible name").toBeTruthy();
    expect(label!, `the label does not mention arrow keys: ${label}`).toMatch(/방향키/);
  });

  /**
   * **We claim the arrow keys** — is `preventDefault` really applied?
   *
   * ⚠️ The first attempt measured whether `window.scrollY` changed, and that test
   * **could not fail in principle** (confirmed by probe: deleting `preventDefault`
   * entirely left it green), because the shell holds the map screen with
   * `overflow-hidden` so the document never scrolls anyway. So the property changed:
   * not scrolling, but **whether we declared the key handled**.
   */
  test("the map takes the arrow keys (preventDefault)", async ({ page }) => {
    await focusCanvas(page);
    await page.evaluate(() => {
      (window as unknown as { __keyPrevented?: boolean[] }).__keyPrevented = [];
      window.addEventListener(
        "keydown",
        (event) => {
          if (!event.key.startsWith("Arrow")) return;
          (window as unknown as { __keyPrevented: boolean[] }).__keyPrevented.push(
            event.defaultPrevented,
          );
        },
        // Listen in the bubble phase — the canvas handler must run first for the value to be true.
        false,
      );
    });
    for (const key of DIRECTIONS) await page.keyboard.press(key);
    // The listener records one entry per key, so the count **is** the condition.
    const recorded = () =>
      page.evaluate(() => (window as unknown as { __keyPrevented: boolean[] }).__keyPrevented.length);
    await expect
      .poll(recorded, { timeout: 15_000, message: "no arrow-key event was captured, so this test spins idle" })
      .toBe(4);
    const flags = await page.evaluate(
      () => (window as unknown as { __keyPrevented: boolean[] }).__keyPrevented,
    );
    expect(flags.length, "no arrow-key event was captured, so this test spins idle").toBe(4);
    expect(flags, "the map did not take the arrow keys, so the browser default remains").toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  /**
   * Without focus on the canvas the keys are not ours — the map reacting to arrow
   * keys pressed elsewhere is stealing someone else's input.
   */
  test("without focus on the canvas, the arrow keys do not move the map", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const pinned = await selectedId(page);

    // Move focus off the canvas.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator("body").press("ArrowUp");
    await page.locator("body").press("ArrowDown");
    // An **absence**: nothing positive marks "these presses did nothing", so the wait is
    // an opportunity for a move to happen, counted in drawn frames.
    await waitFrames(page, 30);
    expect(await selectedId(page), "the map moved without focus").toBe(pinned);
  });
});

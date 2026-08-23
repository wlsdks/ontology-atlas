import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
// The `window.__atlasMap` type is declared in exactly one place — two copies raise TS2717.
import "./atlas-map-probe";

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
  const canvas = page.getByTestId("topology-map-v2-canvas");
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
 * **Press once, then wait until it moves.**
 *
 * ⚠️ This used to count a fixed 250ms after the press and check once. 250ms is one
 * machine's number: on a slower one, a not-yet-moved state reads as "no neighbour
 * in this direction", and on a faster one the remaining time is simply wasted. It
 * now returns **immediately** on a move, and only answers "none" after waiting up
 * to `patienceMs` (full check audit, 2026-08-17).
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
    await page.waitForTimeout(50);
  }
  return now;
}

/**
 * **Wait for coordinates to settle before reading them.** Until the selected
 * node's screen coordinates repeat twice in a row — measuring mid camera
 * transition makes "off screen" accidentally true.
 */
async function settleSelectedPosition(page: import("@playwright/test").Page) {
  const snapshot = () =>
    page.evaluate(() => {
      const probe = window.__atlasMap;
      const id = probe?.selection().nodeId;
      if (!probe || !id) return "";
      const node = probe.nodes().find((n) => n.id === id);
      return node ? `${id}:${Math.round(node.x)},${Math.round(node.y)}` : "";
    });
  await expect
    .poll(
      async () => {
        const before = await snapshot();
        await page.waitForTimeout(150);
        return before !== "" && before === (await snapshot());
      },
      { timeout: 20_000, message: "카메라가 멈추지 않아 좌표를 믿을 수 없다" },
    )
    .toBe(true);
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
 * **Walks one direction until a dead end.**
 *
 * ⚠️ This used to be "press eight times, then check". Once the notice began
 * dismissing itself, that approach **broke first** — the notice appeared and
 * vanished during the presses and was never seen. Stopping the moment the notice
 * appears is correct: a person also sees it right after being blocked.
 */
async function walkUntilDeadEnd(page: import("@playwright/test").Page, direction = "ArrowLeft") {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press(direction);
    await page.waitForTimeout(140);
    if ((await page.locator("[data-walk-notice]").count()) > 0) return true;
  }
  return false;
}

test.describe("지도에 초점을 주는 길", () => {
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
  test("다른 화면에서 G M 을 누르면 지도 캔버스가 초점을 받는다", async ({ page }) => {
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

  test("지도에 이미 있을 때 G M 을 누르면 캔버스를 잡는다", async ({ page }) => {
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
  });

  /** Can you walk immediately after grabbing — is the entrance really wired to the feature. */
  test("G M 으로 잡은 다음 방향키로 걸을 수 있다", async ({ page }) => {
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
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null), {
        timeout: 5_000,
      })
      .not.toBeNull();
  });
});

test.describe("지도 키보드 걷기", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off&e2e=1");
  });

  test("초점이 없을 때 방향키를 누르면 노드 하나가 잡힌다", async ({ page }) => {
    await focusCanvas(page);
    expect(await selectedId(page), "시작부터 무언가 골라져 있으면 이 시험이 무의미하다").toBeNull();

    // Whichever direction, the first press starts from whatever is currently in view.
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
  });

  test("방향키가 실제로 다른 노드로 옮겨 간다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const first = await selectedId(page);

    /*
     * Pressing all four directions and moving **at least once** passes. No specific
     * direction is pinned because node placement is decided by physics, so "there is a
     * neighbour to the right" varies with the data. The property this spec locks is
     * "arrow keys move you", not "there is something to the right".
     */
    const moved = await walkOneStep(page, first);
    expect(moved, `네 방향 어디로도 못 걸었다 (시작: ${first})`).not.toBeNull();
  });

  test("걸어간 곳은 실제로 이웃이다 — 아무 노드로나 뛰지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const from = await selectedId(page);

    const to = await walkOneStep(page, from);
    /*
     * ⚠️ This used to be `test.skip(to === null, …)` — **a silent skip.** The test
     * directly above pins "it walks" from the same setup, so failing to walk here is a
     * regression rather than a property of the vault. A skipped test looks green and
     * nobody looks at it (full check audit, 2026-08-17).
     */
    expect(to, `첫 노드(${from})에서 네 방향 어디로도 못 걸었다`).not.toBeNull();

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
    expect(connected?.aVisible, "출발 노드가 화면에 없다").toBe(true);
    expect(connected?.bVisible, "걸어간 노드가 화면에 없다").toBe(true);
  });

  test("이동한 노드가 화면 안에 남는다 — 카메라가 따라온다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    /*
     * ⚠️ This used to be a fixed 500ms per press ("so the camera transition
     * finishes"). This test judges by **reading coordinates**, so what must be waited
     * on is whether the coordinates settled, not a duration — a slow machine measures
     * mid-transition and a fast one wastes the remainder (full check audit,
     * 2026-08-17; the same prescription as `settleLayout` in `map-expand-all`).
     */
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
    expect(onScreen, "선택을 못 읽었다").not.toBeNull();
    expect(
      onScreen?.inside,
      `고른 노드가 화면 밖이다 (${onScreen?.x},${onScreen?.y} / ${onScreen?.width}×${onScreen?.height})`,
    ).toBe(true);
  });

  /**
   * **Sidestepping between siblings works** (owner report from real use,
   * 2026-08-10).
   *
   * At first the only candidates were connected neighbours (edges). But the domains
   * surrounding the project at the map's centre **have no edges between them** — each
   * attaches only to the project. So sidestepping from one domain to another did not
   * work, and on a screen where they stand in a ring that reads as broken (owner:
   * *"You cannot move freely from the centre."*
   *
   * Siblings are a relation ("same parent"), so this is not an arbitrary spatial
   * jump.
   */
  test("한 부모 아래 형제끼리 방향키로 오갈 수 있다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const seen = new Set<string>();
    for (const key of [...DIRECTIONS, ...DIRECTIONS]) {
      const id = await selectedId(page);
      if (id) seen.add(id);
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
    }
    const last = await selectedId(page);
    if (last) seen.add(last);
    /*
     * A small vault has fewer places to go, so no specific node name is pinned. The
     * property locked is **visiting three or more places**.
     */
    expect(seen.size, `방향키로 돌아다닌 노드가 ${seen.size}곳뿐이다`).toBeGreaterThanOrEqual(3);
  });

  /**
   * **When there is nowhere to go, say so** — rather than staying silent.
   *
   * This test exists because of what the owner said in real use: *"The arrow keys work, but you cannot
   * move freely between nodes."* With no response at all, "broken" and "nothing in
   * that direction" are indistinguishable.
   */
  test("그 방향에 갈 곳이 없으면 안내가 뜬다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);
    await expect(
      page.getByText(/이어진 노드가 없어요/).first(),
      "막다른 길인데 아무 말도 없다",
    ).toBeVisible({ timeout: 4_000 });
  });

  /**
   * **The notice appears beside the node being walked from, dismisses itself, and
   * does not block walking** (three owner reports from real use, 2026-08-10).
   *
   * What the owner saw: *"Shown this way I cannot tell — it should appear clearly right beside the node I was moving from and then go
   * away; right now it does not even disappear, and while it is up I cannot move at
   * all unless I press the x."* (shown this way I cannot tell
   * — it should appear clearly right beside the node I was moving from and then go
   * away; right now it does not even disappear, and while it is up I cannot move at
   * all unless I press the x).
   *
   * All three are measured together because **all three follow from one decision:
   * where and as what it was raised**. Raised as the app's shared toast, its position
   * is a screen corner, its close button takes focus so arrow keys never reach the
   * canvas, and a focused toast stops its own dismissal timer. Fixing one leaves the
   * other two.
   */
  test("막다른 길 안내가 노드 옆에 뜬다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);

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
    expect(geom, "안내가 DOM 에 없다 — `data-walk-notice` 로 찾을 수 없다").not.toBeNull();
    // "Beside the node" **can only be measured as a distance.** The measured toast sat
    // in the bottom-right corner, over 500px away at 1440×900.
    expect(geom!.dx, "안내가 노드에서 가로로 너무 멀다").toBeLessThan(280);
    expect(geom!.dy, "안내가 노드에서 세로로 너무 멀다").toBeLessThan(200);
  });

  test("막다른 길 안내는 스스로 사라진다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);
    await expect(page.locator("[data-walk-notice]").first()).toBeVisible({ timeout: 4_000 });
    // It goes away without being pressed — owner: *"Show briefly, then vanish on its own."*
    await expect(page.locator("[data-walk-notice]")).toHaveCount(0, { timeout: 6_000 });
  });

  test("안내가 떠 있어도 계속 걸을 수 있다 — 초점을 빼앗지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);
    await expect(page.locator("[data-walk-notice]").first()).toBeVisible({ timeout: 4_000 });

    const stillOnCanvas = await page.evaluate(
      () => document.activeElement?.getAttribute("data-surface-role") === "map-canvas",
    );
    expect(stillOnCanvas, "안내가 초점을 가져갔다 — 그러면 방향키가 지도에 도착하지 않는다").toBe(true);

    // And walking must actually work. Going back the way we came, there is a neighbour.
    const before = await selectedId(page);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => selectedId(page), { timeout: 4_000 })
      .not.toBe(before);
  });

  /**
   * **The selected node is never hidden behind the panel** (owner decision
   * 2026-08-10: *"It must not be covered; centre it in the space excluding the panel."*
   *
   * Selecting a node opens a popover on the right. The camera used to target **the
   * viewport centre**, so the selection could end up **behind the panel describing
   * it**. Measured at 1512×982: canvas x64 w1448, popover x1128 w352 — the free
   * area's centre is 192px left of the screen centre.
   *
   * The property locked is **"it is not covered"**, not "exactly centred". While
   * walking, the camera follows only when needed (following every step would make
   * the map slide constantly), so where the node sits inside the free area differs
   * per step. Being covered must be false regardless.
   */
  test("고른 노드가 패널에 가리지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const covered: string[] = [];
    for (const key of [...DIRECTIONS, ...DIRECTIONS]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(500); // Let the camera transition finish
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
            return `${id} 가 ${(el as HTMLElement).dataset.testid || el.tagName} 뒤에 있다`;
          }
        }
        return null;
      });
      if (hit) covered.push(hit);
    }
    expect(covered, "고른 노드가 패널에 가려졌다").toEqual([]);
  });

  /**
   * **When the camera does bring a node in, it lands in the free area's centre.**
   *
   * ⚠️ The "not covered" test above does not prove this change — confirmed by probe:
   * reverting the target to the viewport centre left that test **green**, because at
   * this zoom and on this graph a centred node happens not to reach the popover
   * (x1128). Passing is not evidence (`/gate-probe`).
   *
   * So **the changed thing is measured directly**: right after a transition actually
   * occurs, is the node at the free area's centre? Reverting to the viewport centre
   * diverges by the measured 192px and turns red immediately.
   */
  test("카메라가 데려간 뒤 노드가 자유 영역 가운데에 있다", async ({ page }) => {
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
        const freeCenterX = rightEdge > left ? (left + rightEdge) / 2 : box.x + box.width / 2;
        return {
          camX: cam.x,
          camY: cam.y,
          nodeDocX: box.x + node.x,
          freeCenterX,
          canvasCenterX: box.x + box.width / 2,
          canvasWidth: box.width,
        };
      });

    let landed: Awaited<ReturnType<typeof readGeometry>> = null;
    for (const key of [...DIRECTIONS, ...DIRECTIONS, ...DIRECTIONS]) {
      const before = await readGeometry();
      await page.keyboard.press(key);
      await page.waitForTimeout(600);
      const after = await readGeometry();
      if (!before || !after) continue;
      const cameraMoved = Math.hypot(after.camX - before.camX, after.camY - before.camY) > 2;
      if (cameraMoved) {
        landed = after;
        break;
      }
    }
    expect(landed, "카메라 전환을 한 번도 일으키지 못했다").not.toBeNull();
    const toFree = Math.abs(landed!.nodeDocX - landed!.freeCenterX);
    const toCanvas = Math.abs(landed!.nodeDocX - landed!.canvasCenterX);
    /*
     * **"Exactly centred" is not required** — measuring that way was wrong (measured
     * 64px off). This dive frames **the ego bbox**, not one node, so what lands in the
     * centre is the group and the node sits somewhere inside it. "The node is exactly
     * centred" was a misreading, not the spec.
     *
     * The property locked is **whether the framing favours the free area**: the node is
     * closer to the free area's centre than to the screen's. Reverting the correction
     * seats the node at the screen centre (a measured 192px difference), which flips
     * this comparison immediately.
     */
    expect(
      toFree,
      `노드가 자유 영역 가운데(${landed!.freeCenterX.toFixed(0)})보다 ` +
        `화면 가운데(${landed!.canvasCenterX.toFixed(0)})에 가깝다 — 보정이 안 걸렸다 ` +
        `(자유 ${toFree.toFixed(0)}px · 화면 ${toCanvas.toFixed(0)}px)`,
    ).toBeLessThan(toCanvas);
  });

  /**
   * **A feature nobody can discover is not a feature** (caught in a usability review
   * 2026-08-10).
   *
   * Arrow-key walking shipped, yet the map section of the shortcut sheet — **the only
   * place that teaches the keyboard** — did not know about it; measured, that section
   * listed only click, drag, and scroll. That same sheet once caused trouble by
   * **advertising a feature that did not exist** (see its own comments). This is the
   * same failure in the opposite direction.
   */
  test("단축키 시트가 방향키 걷기를 안내한다", async ({ page }) => {
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
    expect(section, "시트에서 「지도」 절을 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
    expect(
      section!.some((line) => /↑|↓|←|→|방향키/.test(line)),
      `지도 절이 방향키를 안내하지 않는다: ${section!.join(" · ")}`,
    ).toBe(true);
  });

  /**
   * **The canvas label does not send people elsewhere** (usability review
   * 2026-08-10).
   *
   * The label read *"you can navigate the same information by keyboard in the INDEX
   * panel"* — true yesterday, but **this canvas now does that job itself**. A label
   * telling someone who just took focus "not here, go over there" is stale
   * information.
   */
  test("캔버스 라벨이 여기서 되는 일을 먼저 말한다", async ({ page }) => {
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    const label = await canvas.getAttribute("aria-label");
    expect(label, "캔버스에 접근 이름이 없다").toBeTruthy();
    expect(label!, `라벨이 방향키를 말하지 않는다: ${label}`).toMatch(/방향키/);
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
  test("방향키를 지도가 가져간다 (preventDefault)", async ({ page }) => {
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
    await page.waitForTimeout(300);
    const flags = await page.evaluate(
      () => (window as unknown as { __keyPrevented: boolean[] }).__keyPrevented,
    );
    expect(flags.length, "방향키 사건이 하나도 안 잡혔다 — 이 시험이 공회전한다").toBe(4);
    expect(flags, "지도가 방향키를 가져가지 않았다 — 브라우저 기본 동작이 남는다").toEqual([
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
  test("캔버스에 초점이 없으면 방향키가 지도를 움직이지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const pinned = await selectedId(page);

    // Move focus off the canvas.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator("body").press("ArrowUp");
    await page.locator("body").press("ArrowDown");
    await page.waitForTimeout(400);
    expect(await selectedId(page), "초점이 없는데 지도가 움직였다").toBe(pinned);
  });
});

import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * Three usability defects found by walking every map control on 2026-09-03,
 * each pinned by the number that exposed it.
 *
 * ① **A search pick lands under the detail panel.** Picking a result closes the
 *    palette and selects the node in one tick; the focus camera measured the DOM
 *    one frame later while the modal was still fading out and subtracted it as
 *    a 915 px *left* panel, so the free area collapsed and the chosen node was
 *    aimed at x 1090 behind a panel whose edge was at 955. A modal is not a
 *    camera obstacle (`interaction/free-area.ts`).
 * ② **Auto-arrange while expanded returns to the spine.** The overview-fit ref
 *    was frozen at mount, so with everything expanded the arrange button and the
 *    `0` key refitted the spine bounds with 19 of 125 nodes off screen.
 * ③ **The Korean relation sentence carried fixed particles** with a space before
 *    them; they are picked by the name's final consonant now (`lib/edge-sentence.ts`).
 */
type MapNode = { id: string; kind: string; label: string; x: number; y: number; hidden: boolean };
type AtlasMap = { nodes: () => MapNode[]; selection: () => { nodeId: string | null } };

const readMap = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: AtlasMap }).__atlasMap;
    const canvasEl = document.querySelector('[data-testid="ontology-map-canvas"]');
    if (!m || !canvasEl) {
      return { canvas: { width: 0, height: 0 }, panelLeft: null, selected: null, offscreen: 0, visible: 0, project: null, domains: [] as MapNode[] };
    }
    const canvas = canvasEl.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="map-detail-panel"]')?.getBoundingClientRect() ?? null;
    const visible = m.nodes().filter((n) => !n.hidden);
    const selected = visible.find((n) => n.id === m.selection().nodeId) ?? null;
    return {
      canvas: { width: canvas.width, height: canvas.height },
      panelLeft: panel ? panel.left - canvas.left : null,
      selected: selected ? { x: selected.x, y: selected.y, label: selected.label } : null,
      offscreen: visible.filter((n) => n.x < 0 || n.y < 0 || n.x > canvas.width || n.y > canvas.height).length,
      visible: visible.length,
      project: visible.find((n) => n.kind === "project") ?? null,
      domains: visible.filter((n) => n.kind === "domain"),
    };
  });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20_000 }).toBeGreaterThan(0);
  // The first reveal homes the camera and the physics is still warm; measure the
  // screen it comes to rest on, not the one 1.5 s of this machine's clock leaves.
  await waitForMapStill(page);
});

test("a node picked from the search palette is framed left of the detail panel", async ({ page }) => {
  // The map's search chip opens the unified palette (an `aria-modal` dialog).
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await page.locator('[data-testid="topology-concept-search"]').click();
  await expect(palette, "검색 칩이 팔레트를 연다").toBeVisible();
  await page.keyboard.type("배송");
  /*
   * Enter takes the **active** option, so the condition the old 600 ms sleep was
   * standing in for is "the row Enter will take is the one we typed for". Waiting
   * for that row is also the only form that cannot pick the previous query's
   * result on a slow machine.
   */
  await expect(
    palette.locator('[role="option"][aria-selected="true"]'),
    "고른 결과가 배송이다",
  ).toContainText("배송");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5_000 });
  // The focus camera reframes around the panel; read where it lands, not where it is
  // 1.8 s in.
  await waitForMapStill(page, { what: "camera" });
  const after = await readMap(page);
  expect(after.selected, "검색으로 고른 노드가 선택된다").not.toBeNull();
  expect(after.panelLeft, "상세 패널이 오른쪽에 있다").not.toBeNull();
  // The chosen node sits in the free area, clear of the panel by a readable margin.
  expect(after.selected!.x, "고른 노드가 패널 뒤로 가지 않는다").toBeLessThan(after.panelLeft! - 60);
  expect(after.selected!.x).toBeGreaterThan(0);
});

test("auto-arrange while everything is expanded keeps every node on screen", async ({ page }) => {
  await page.locator('[data-testid="topology-expand-all"]').click();
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 10_000 }).toBeGreaterThan(100);
  await waitForMapStill(page);
  await page.locator('[data-testid="topology-auto-arrange"]').click();
  await waitForMapStill(page);
  const arranged = await readMap(page);
  expect(arranged.offscreen, "정렬 후 펼친 노드가 화면 밖으로 나가지 않는다").toBe(0);
  // The `0` key is the same fit and must agree.
  await page.mouse.click(700, 800);
  await page.keyboard.press("0");
  await waitForMapStill(page);
  expect((await readMap(page)).offscreen).toBe(0);
  // Flat still ends expand-all on selection; Galaxy's different overview
  // contract is covered below.
});

test("Galaxy inspection approaches the star, returns context, and yields to later camera input", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.locator('[data-testid="topology-view-3d"]').click();
  await page.locator('[data-testid="topology-view-3d-choice-galaxy"]').click();
  await expect(page.locator('[data-testid="topology-view-3d"]')).toHaveText(/Galaxy|갤럭시/);
  // Galaxy is the complete ontology sky. It exposes every real concept on
  // entry and omits Flat's expand control because that action would be inert.
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20_000 }).toBeGreaterThan(100);
  await expect(page.locator('[data-testid="topology-expand-all"]')).toHaveCount(0);
  // Match the overview journey under test: INDEX is open before inspection and
  // returns after the datasheet yields the left slot.
  if (!(await page.locator('[data-testid="topology-index-panel"]').isVisible())) {
    await page.locator('[data-testid="topology-index-tab"]').click();
    await expect(page.locator('[data-testid="topology-index-panel"]')).toBeVisible();
  }
  await page.getByTestId("topology-fit-control").getByRole("button").click();
  await waitForMapStill(page);

  const fitted = await page.evaluate(() => ({
    camera: window.__atlasMap?.camera() ?? null,
    visible: window.__atlasMap?.nodes().filter((node) => !node.hidden).length ?? 0,
    target:
      window.__atlasMap
        ?.nodes()
        .filter((node) => !node.hidden && node.y > 100 && node.y < 740)
        .sort((a, b) => b.x - a.x)[0] ?? null,
  }));
  expect(fitted.camera).not.toBeNull();
  expect(fitted.target).not.toBeNull();

  const canvas = (await page.locator('[data-testid="ontology-map-canvas"]').boundingBox())!;
  await page.mouse.move(canvas.x + fitted.target!.x, canvas.y + fitted.target!.y);
  await page.mouse.wheel(0, -80);
  await waitForMapStill(page, { what: "camera" });
  const zoomed = await page.evaluate((targetId) => ({
    camera: window.__atlasMap?.camera() ?? null,
    target: window.__atlasMap?.nodes().find((node) => node.id === targetId) ?? null,
  }), fitted.target!.id);
  expect(zoomed.camera!.scale).toBeGreaterThan(fitted.camera!.scale);
  expect(zoomed.target).not.toBeNull();

  await page.mouse.click(canvas.x + zoomed.target!.x, canvas.y + zoomed.target!.y);
  await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5_000 });
  await waitForMapStill(page, { what: "camera" });

  const selected = await page.evaluate((targetId) => {
    const canvasRect = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const panelRect = document.querySelector('[data-testid="map-detail-panel"]')!.getBoundingClientRect();
    const node = window.__atlasMap?.nodes().find((candidate) => candidate.id === targetId) ?? null;
    return {
      camera: window.__atlasMap?.camera() ?? null,
      visible: window.__atlasMap?.nodes().filter((candidate) => !candidate.hidden).length ?? 0,
      panelClearance: node ? panelRect.left - (canvasRect.left + node.x) : Number.NEGATIVE_INFINITY,
    };
  }, fitted.target!.id);
  expect(selected.visible).toBe(fitted.visible);
  // Inspection uses the existing focus camera spring to approach the star and
  // place it in the free canvas beside the panel. It never collapses the graph.
  expect(selected.camera!.scale).toBeGreaterThan(zoomed.camera!.scale);
  expect(selected.panelClearance).toBeGreaterThan(0);
  await expect(page.locator('[data-testid="topology-expand-all"]')).toHaveCount(0);

  // Moving directly to another concept reframes from the current focus while
  // retaining the original return target from before inspection began.
  const next = await page.evaluate((targetId) => {
    const canvasRect = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const panelRect = document.querySelector('[data-testid="map-detail-panel"]')!.getBoundingClientRect();
    const freeCenterX = (panelRect.left - canvasRect.left) / 2;
    return window.__atlasMap
      ?.nodes()
      .filter((node) => !node.hidden && node.id !== targetId && node.x > 80 && node.x < panelRect.left - canvasRect.left - 80 && node.y > 80 && node.y < canvasRect.height - 80)
      .sort((a, b) => Math.abs(a.x - freeCenterX) - Math.abs(b.x - freeCenterX))[0] ?? null;
  }, fitted.target!.id);
  expect(next).not.toBeNull();
  await page.mouse.click(canvas.x + next!.x, canvas.y + next!.y);
  await expect.poll(async () => (await page.evaluate(() => window.__atlasMap?.selection().nodeId))).toBe(next!.id);
  await waitForMapStill(page, { what: "camera" });

  await page.locator('[data-testid="map-detail-panel-close"]').click();
  await expect(page.locator('[data-testid="map-detail-panel"]')).toHaveCount(0, { timeout: 5_000 });
  await waitForMapStill(page, { what: "camera" });
  const closed = await page.evaluate(() => ({
    camera: window.__atlasMap?.camera() ?? null,
    visible: window.__atlasMap?.nodes().filter((node) => !node.hidden).length ?? 0,
  }));
  expect(closed.visible).toBe(fitted.visible);
  expect(Math.abs(closed.camera!.x - zoomed.camera!.x)).toBeLessThan(0.1);
  expect(Math.abs(closed.camera!.y - zoomed.camera!.y)).toBeLessThan(0.1);
  expect(Math.abs(closed.camera!.scale - zoomed.camera!.scale)).toBeLessThan(0.001);
  await expect(page.locator('[data-testid="topology-expand-all"]')).toHaveCount(0);

  // A camera gesture during a later inspection replaces the saved return:
  // closing the panel must retain the camera the person chose.
  const restoredTarget = await page.evaluate((targetId) => window.__atlasMap?.nodes().find((node) => node.id === targetId) ?? null, fitted.target!.id);
  await page.mouse.click(canvas.x + restoredTarget!.x, canvas.y + restoredTarget!.y);
  await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5_000 });
  await waitForMapStill(page, { what: "camera" });
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -80);
  await waitForMapStill(page, { what: "camera" });
  // The interactive spring can meet the frame-delta stillness threshold with
  // a small amount of target convergence left. Let that tail settle before
  // using this frame as the close-retention reference.
  await page.waitForTimeout(2_000);
  const userCamera = await page.evaluate(() => window.__atlasMap?.camera() ?? null);
  await page.locator('[data-testid="map-detail-panel-close"]').click();
  await expect(page.locator('[data-testid="map-detail-panel"]')).toHaveCount(0, { timeout: 5_000 });
  await waitForMapStill(page, { what: "camera" });
  const afterUserClose = await page.evaluate(() => window.__atlasMap?.camera() ?? null);
  // Releasing focus also releases its pan leash, so the last few pixels of the
  // user's already-recorded target may finish after close. Bound that spring
  // tail in screen space while requiring the chosen zoom exactly.
  expect(Math.abs(afterUserClose!.x - userCamera!.x) * afterUserClose!.scale).toBeLessThan(24);
  expect(Math.abs(afterUserClose!.y - userCamera!.y) * afterUserClose!.scale).toBeLessThan(24);
  expect(Math.abs(afterUserClose!.scale - userCamera!.scale)).toBeLessThan(0.001);

  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -80);
  await waitForMapStill(page, { what: "camera" });
  const afterSecondWheel = await page.evaluate(() => window.__atlasMap?.camera() ?? null);
  expect(afterSecondWheel!.scale).toBeGreaterThan(afterUserClose!.scale);
  expect(pageErrors).toEqual([]);
});

test("the Korean relation sentence joins its particles to the names", async ({ page }) => {
  const box = (await page.locator('[data-testid="ontology-map-canvas"]').boundingBox())!;
  const m = await readMap(page);
  const domain = m.domains.find((d) => d.label === "배송")!;
  const mid = { x: (m.project!.x + domain.x) / 2, y: (m.project!.y + domain.y) / 2 };
  await page.mouse.move(box.x + mid.x, box.y + mid.y);
  /*
   * The old 300 ms sleep was aiming, not waiting: it gave the hover a moment and
   * hoped the midpoint really was on the edge. `edgeAt` answers the aim itself —
   * the click goes out once the frame reports an edge under that exact point.
   */
  await page.waitForFunction(
    (point) =>
      Boolean(
        (window as unknown as { __atlasMap?: { edgeAt?: (x: number, y: number) => unknown } }).__atlasMap?.edgeAt?.(
          point.x,
          point.y,
        ),
      ),
    mid,
    { polling: "raf", timeout: 15_000 },
  );
  await page.mouse.click(box.x + mid.x, box.y + mid.y);
  const sentence = page.locator('[data-testid="map-edge-sentence"]');
  await expect(sentence).toBeVisible({ timeout: 5_000 });
  await expect(sentence).toHaveText("온라인 쇼핑몰이 배송을 담고 있어요.");
});

test("an edit intent that arrives by URL on the sample says why it cannot edit and offers the folder", async ({ page }) => {
  await page.goto(
    "/ko/topology/?e2e=1&guides=off&p=capability%3Aorder-placement&workbench=edit&via=insights%3Ado-next&review=promotion%3Acapability%3Aorder-placement",
    { waitUntil: "domcontentloaded" },
  );
  const dialog = page.locator('[data-testid="recent-changes-needs-vault-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText("고칠 수 있어요");
  // The intent leaves the address so a reload does not ask again.
  await expect.poll(() => new URL(page.url()).searchParams.get("workbench"), { timeout: 5_000 }).toBeNull();
  await page.locator('[data-testid="recent-changes-needs-vault-close"]').click();
  await expect(dialog).toHaveCount(0, { timeout: 3_000 });
});

test("a deep link that opens one domain frames its revealed children, and the 0 key agrees", async ({ page }) => {
  await page.goto("/ko/topology/?e2e=1&guides=off&open=domain%3Amarketing", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20_000 }).toBeGreaterThan(40);
  await waitForMapStill(page);
  // Capabilities are density-gated at overview altitude (not drawn, not hidden), so
  // only the tiers the overview draws are measured: spine and the revealed elements.
  const drawnOffscreen = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap: AtlasMap }).__atlasMap;
      const c = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      return m
        .nodes()
        .filter((n) => !n.hidden && n.kind !== "capability")
        .filter((n) => n.x < 0 || n.y < 0 || n.x > c.width || n.y > c.height).length;
    });
  expect(await drawnOffscreen(), "딥링크로 펼친 도메인의 요소가 화면 밖에 남지 않는다").toBe(0);
  await page.mouse.click(700, 820);
  await page.keyboard.press("0");
  await waitForMapStill(page);
  expect(await drawnOffscreen(), "0 키 맞춤도 펼친 요소를 담는다").toBe(0);
});

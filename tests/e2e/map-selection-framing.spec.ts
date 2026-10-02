import { expect, test } from "@playwright/test";
import { waitForCosmosStill } from "./atlas-cosmos-probe";
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

test("a capability picked from the search palette brings the camera to rest on its target", async ({ page }) => {
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await page.locator('[data-testid="topology-concept-search"]').click();
  await page.keyboard.type("회원 탈퇴");
  await expect(palette.locator('[role="option"][aria-selected="true"]')).toContainText("회원 탈퇴");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await readMap(page)).selected?.label).toBe("회원 탈퇴");
  await waitForMapStill(page, { what: "camera" });
  const gap = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { camera: () => { x: number; y: number }; cameraTarget: () => { x: number; y: number } } }).__atlasMap;
    return Math.hypot(m.camera().x - m.cameraTarget().x, m.camera().y - m.cameraTarget().y);
  });
  expect(gap, "the camera never reaches its target").toBeLessThan(0.5);
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

test.describe("Galaxy at device pixel ratio 2, where one notch brings stars live", () => {
  test.use({ deviceScaleFactor: 2 });

  test("Galaxy inspection approaches the star, returns context, and yields to later camera input", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.locator('[data-testid="topology-view-3d"]').click();
    await page.locator('[data-testid="topology-view-3d-choice-galaxy"]').click();
    await expect(page.locator('[data-testid="topology-view-3d"]')).toHaveText(/Galaxy|갤럭시/);
    await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.layout()?.galaxies.length ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="topology-expand-all"]')).toHaveCount(0);
    if (!(await page.locator('[data-testid="topology-index-panel"]').isVisible())) {
      await page.locator('[data-testid="topology-index-tab"]').click();
      await expect(page.locator('[data-testid="topology-index-panel"]')).toBeVisible();
    }
    await page.evaluate(() => window.__atlasCosmos!.overview());
    await waitForCosmosStill(page);
    const fitted = await page.evaluate(() => window.__atlasCosmos!.camera());

    const canvas = (await page.locator('[data-testid="ontology-map-canvas"]').boundingBox())!;
    const biggest = await page.evaluate(() => window.__atlasCosmos!.layout()!.galaxies.slice().sort((a, b) => b.rho - a.rho)[0]!);
    await page.mouse.move(canvas.x + biggest.sx, canvas.y + biggest.sy);
    await page.evaluate(() => window.__atlasCosmos!.armPaint(true));
    for (let notch = 0; notch < 8 && (await page.evaluate(() => window.__atlasCosmos!.painted().length)) === 0; notch += 1) {
      await page.mouse.wheel(0, -80);
      await waitForCosmosStill(page);
    }
    const zoomed = await page.evaluate(() => window.__atlasCosmos!.camera());
    expect(zoomed.scale).toBeGreaterThan(fitted.scale);
    expect(await page.evaluate(() => window.__atlasCosmos!.painted().length)).toBeGreaterThan(0);
    const target = await page.evaluate(() => {
      const probe = window.__atlasCosmos!;
      const canvasEl = document.querySelector('[data-testid="ontology-map-canvas"]')!;
      const box = canvasEl.getBoundingClientRect();
      const room = probe.room();
      const domains = new Set(probe.layout()!.galaxies.map((g) => g.id));
      return (
        probe
          .painted()
          .filter((p) => !domains.has(p.id) && p.x > room.x + 24 && p.x < room.x + room.width - 24 && p.y > room.y + 24 && p.y < room.y + room.height - 24)
          .find((p) => probe.hit(p.x, p.y).id === p.id && document.elementFromPoint(box.x + p.x, box.y + p.y) === canvasEl) ?? null
      );
    });
    await page.evaluate(() => window.__atlasCosmos!.armPaint(false));
    expect(target, "no painted star after one wheel notch").not.toBeNull();

    await page.mouse.click(canvas.x + target!.x, canvas.y + target!.y);
    await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.selection().nodeId)).toBe(target!.id);
    await waitForCosmosStill(page);
    const selected = await page.evaluate((id) => {
      const probe = window.__atlasCosmos!;
      const canvasRect = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      const panelRect = document.querySelector('[data-testid="map-detail-panel"]')!.getBoundingClientRect();
      const point = probe.point(id)!;
      const room = probe.room();
      return {
        camera: probe.camera(),
        inRoom: point.x >= room.x && point.x <= room.x + room.width && point.y >= room.y && point.y <= room.y + room.height,
        panelClearance: panelRect.left - (canvasRect.left + point.x),
      };
    }, target!.id);
    expect(selected.camera.scale).toBeGreaterThan(zoomed.scale);
    expect(selected.inRoom).toBe(true);
    expect(selected.panelClearance).toBeGreaterThan(0);

    await page.locator('[data-testid="map-detail-panel-close"]').click();
    await expect(page.locator('[data-testid="map-detail-panel"]')).toHaveCount(0, { timeout: 5_000 });
    await waitForCosmosStill(page);
    const closed = await page.evaluate(() => window.__atlasCosmos!.camera());
    expect(Math.abs(closed.x - zoomed.x)).toBeLessThan(0.1);
    expect(Math.abs(closed.y - zoomed.y)).toBeLessThan(0.1);
    expect(Math.abs(closed.scale - zoomed.scale)).toBeLessThan(0.001);

    const again = (await page.evaluate((id) => window.__atlasCosmos!.point(id), target!.id))!;
    await page.mouse.click(canvas.x + again.x, canvas.y + again.y);
    await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5_000 });
    await waitForCosmosStill(page);
    const room = await page.evaluate(() => window.__atlasCosmos!.room());
    await page.mouse.move(canvas.x + room.x + room.width / 3, canvas.y + room.y + room.height / 2);
    await page.mouse.wheel(0, -80);
    await waitForCosmosStill(page);
    const userCamera = await page.evaluate(() => window.__atlasCosmos!.camera());
    await page.locator('[data-testid="map-detail-panel-close"]').click();
    await expect(page.locator('[data-testid="map-detail-panel"]')).toHaveCount(0, { timeout: 5_000 });
    await waitForCosmosStill(page);
    const afterUserClose = await page.evaluate(() => window.__atlasCosmos!.camera());
    expect(Math.abs(afterUserClose.x - userCamera.x)).toBeLessThan(0.1);
    expect(Math.abs(afterUserClose.y - userCamera.y)).toBeLessThan(0.1);
    expect(Math.abs(afterUserClose.scale - userCamera.scale)).toBeLessThan(0.001);
    expect(pageErrors).toEqual([]);
  });
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

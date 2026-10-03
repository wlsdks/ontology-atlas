import { expect, test } from "@playwright/test";
import { waitForCosmosStill } from "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

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
  await waitForMapStill(page);
});

test("a node picked from the search palette is framed left of the detail panel", async ({ page }) => {
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await page.locator('[data-testid="topology-concept-search"]').click();
  await expect(palette, "검색 칩이 팔레트를 연다").toBeVisible();
  await page.keyboard.type("배송");
  await expect(
    palette.locator('[role="option"][aria-selected="true"]'),
    "고른 결과가 배송이다",
  ).toContainText("배송");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5_000 });
  await waitForMapStill(page, { what: "camera" });
  const after = await readMap(page);
  expect(after.selected, "검색으로 고른 노드가 선택된다").not.toBeNull();
  expect(after.panelLeft, "상세 패널이 오른쪽에 있다").not.toBeNull();
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
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=project%3Astorefront", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="topology-realm-chip"]')).toBeVisible({ timeout: 20_000 });
  await waitForMapStill(page);
  await page.locator('[data-testid="topology-expand-all"]').click();
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 10_000 }).toBeGreaterThan(100);
  await waitForMapStill(page);
  await page.locator('[data-testid="topology-auto-arrange"]').click();
  await waitForMapStill(page);
  const arranged = await readMap(page);
  expect(arranged.offscreen, "정렬 후 펼친 노드가 화면 밖으로 나가지 않는다").toBe(0);
  await page.mouse.click(700, 800);
  await page.keyboard.press("0");
  await waitForMapStill(page);
  expect((await readMap(page)).offscreen).toBe(0);
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
    await waitForCosmosStill(page);
    const core = await page.evaluate(() => window.__atlasCosmos!.painted().map((p) => p.id));
    const live = () => page.evaluate((skip) => window.__atlasCosmos!.painted().filter((p) => !skip.includes(p.id)).length, core);
    for (let notch = 0; notch < 8 && (await live()) === 0; notch += 1) {
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
      const galaxies = probe.layout()!.galaxies;
      const domains = new Set(galaxies.map((g) => g.id));
      const inGalaxy = (p: { x: number; y: number }) => galaxies.some((g) => Math.hypot(p.x - g.sx, p.y - g.sy) < g.rho);
      return (
        probe
          .painted()
          .filter((p) => !domains.has(p.id) && inGalaxy(p) && p.x > room.x + 24 && p.x < room.x + room.width - 24 && p.y > room.y + 24 && p.y < room.y + room.height - 24)
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
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=domain%3Afulfillment", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20_000 }).toBeGreaterThan(0);
  await waitForMapStill(page);
  const box = (await page.locator('[data-testid="ontology-map-canvas"]').boundingBox())!;
  const m = await page.evaluate(() => {
    const nodes = (window as unknown as { __atlasMap: AtlasMap }).__atlasMap.nodes();
    const at = (id: string) => nodes.find((n) => n.id === id)!;
    return { from: at("domain:fulfillment"), to: at("capability:carrier-integration") };
  });
  const mid = { x: (m.from.x + m.to.x) / 2, y: (m.from.y + m.to.y) / 2 };
  await page.mouse.move(box.x + mid.x, box.y + mid.y);
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
  await expect(sentence).toHaveText("배송이 택배사 연동을 담고 있어요.");
});

test("an edit intent that arrives by URL on the sample says why it cannot edit and offers the folder", async ({ page }) => {
  await page.goto(
    "/ko/topology/?e2e=1&guides=off&p=capability%3Aorder-placement&workbench=edit&via=insights%3Ado-next&review=promotion%3Acapability%3Aorder-placement",
    { waitUntil: "domcontentloaded" },
  );
  const dialog = page.locator('[data-testid="recent-changes-needs-vault-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText("고칠 수 있어요");
  await expect.poll(() => new URL(page.url()).searchParams.get("workbench"), { timeout: 5_000 }).toBeNull();
  await page.locator('[data-testid="recent-changes-needs-vault-close"]').click();
  await expect(dialog).toHaveCount(0, { timeout: 3_000 });
});

test("a deep link that opens one domain frames its revealed children, and the 0 key agrees", async ({ page }) => {
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=project%3Astorefront&open=domain%3Amarketing", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="topology-realm-chip"]')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20_000 }).toBeGreaterThan(40);
  await waitForMapStill(page);
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

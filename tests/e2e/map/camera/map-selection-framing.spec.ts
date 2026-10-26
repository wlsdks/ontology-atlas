import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

type MapNode = { id: string; kind: string; label: string; x: number; y: number; hidden: boolean;
};
type AtlasMap = { nodes: () => MapNode[]; cameraTarget: () => { x: number; y: number; scale: number }; selection: () => { nodeId: string | null;
    };
};

const readMap = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: AtlasMap;
    }).__atlasMap;
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
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20000 }).toBeGreaterThan(0);
  await waitForMapStill(page);
});

test("a node picked from the search palette is framed left of the detail panel", async ({ page }) => {
  const readTarget = () => page.evaluate(() => (window as unknown as { __atlasMap: AtlasMap }).__atlasMap.cameraTarget());
  const beforeTarget = await readTarget();
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await page.locator('[data-testid="topology-concept-search"]').click();
  await expect(palette, "검색 칩이 팔레트를 연다").toBeVisible();
  await page.keyboard.type("배송");
  await expect(
    palette.locator('[role="option"][aria-selected="true"]'),
    "고른 결과가 배송이다").toContainText("배송");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5000 });
  await expect.poll(readTarget, { message: "the search selection issues its camera target" }).not.toEqual(beforeTarget);
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
    const m = (window as unknown as { __atlasMap: { camera: () => { x: number; y: number;
                };
                cameraTarget: () => {
                    x: number;
                    y: number;
                };
            };
        }).__atlasMap;
    return Math.hypot(m.camera().x - m.cameraTarget().x, m.camera().y - m.cameraTarget().y);
  });
  expect(gap, "the camera never reaches its target").toBeLessThan(0.5);
});

test("auto-arrange while everything is expanded keeps every node on screen", async ({ page }) => {
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=project%3Astorefront", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="topology-realm-chip"]')).toBeVisible({ timeout: 20000 });
  await waitForMapStill(page);
  await page.locator('[data-testid="topology-expand-all"]').click();
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 10000 }).toBeGreaterThan(100);
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

test("the Korean relation sentence joins its particles to the names", async ({ page }) => {
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=domain%3Afulfillment&mode=path&pathFrom=domain%3Afulfillment&pathTo=capability%3Acarrier-integration", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20000 }).toBeGreaterThan(0);
  await waitForMapStill(page);
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  const box = (await page.locator('[data-testid="ontology-map-canvas"]').boundingBox())!;
  const hit = await page.evaluate(() => {
    type Hit = { sourceId: string; targetId: string; kind: string };
    const map = (window as unknown as { __atlasMap: AtlasMap & { edges: () => Array<{ sourceId: string; targetId: string; ax: number; ay: number; bx: number; by: number }>; edgeAt: (x: number, y: number) => Hit | null } }).__atlasMap;
    const edge = map.edges().find((edge) => edge.sourceId === "domain:fulfillment" && edge.targetId === "capability:carrier-integration");
    if (!edge) return null;
    // Inspect the recorded edge's corridor; branch ports can move its hit target off the chord.
    const dx = edge.bx - edge.ax, dy = edge.by - edge.ay;
    const length = Math.hypot(dx, dy);
    if (length === 0) return null;
    for (let step = 1; step < 20; step++) {
      const t = step / 20;
      for (let offset = -length / 5; offset <= length / 5; offset += 3) {
        const x = edge.ax + dx * t - dy / length * offset;
        const y = edge.ay + dy * t + dx / length * offset;
        const picked = map.edgeAt(x, y);
        if (picked?.sourceId === edge.sourceId && picked.targetId === edge.targetId && picked.kind === "contains") return { x, y };
      }
    }
    return null;
  });
  expect(hit, "the recorded containment relation has a typed pointer target").not.toBeNull();
  await page.mouse.click(box.x + hit!.x, box.y + hit!.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().edge)).toMatchObject({ sourceId: "domain:fulfillment", targetId: "capability:carrier-integration" });
  const sentence = page.locator('[data-testid="map-edge-sentence"]');
  await expect(sentence).toBeVisible({ timeout: 5000 });
  await expect(sentence).toHaveText("배송이 택배사 연동을 담고 있어요.");
});

test("an edit intent that arrives by URL on the sample says why it cannot edit and offers the folder", async ({ page }) => {
  await page.goto(
    "/ko/topology/?e2e=1&guides=off&p=capability%3Aorder-placement&workbench=edit&via=insights%3Ado-next&review=promotion%3Acapability%3Aorder-placement",
    { waitUntil: "domcontentloaded" });
  const dialog = page.locator('[data-testid="recent-changes-needs-vault-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await expect(dialog).toContainText("고칠 수 있어요");
  await expect.poll(() => new URL(page.url()).searchParams.get("workbench"), { timeout: 5000 }).toBeNull();
  await page.locator('[data-testid="recent-changes-needs-vault-close"]').click();
  await expect(dialog).toHaveCount(0, { timeout: 3000 });
});

test("a deep link that opens one domain frames its revealed children, and the 0 key agrees", async ({ page }) => {
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=project%3Astorefront&open=domain%3Amarketing", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="topology-realm-chip"]')).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20000 }).toBeGreaterThan(40);
  await waitForMapStill(page);
  const drawnOffscreen = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap: AtlasMap;
        }).__atlasMap;
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

for (const target of ["domain:order", "domain:customer", "domain:support"]) {
  test(`search leaves a completed path and selects ${target}`, async ({ page }) => {
    await page.goto("/ko/topology/?e2e=1&guides=off&mode=path&pathFrom=domain%3Aorder&pathTo=domain%3Acustomer");
    await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
    const label = await page.evaluate((id) => (window as unknown as { __atlasMap: AtlasMap }).__atlasMap.nodes().find((node) => node.id === id)!.label, target);
    await page.getByTestId("topology-concept-search").click();
    const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
    await palette.getByRole("combobox").fill(label);
    await palette.locator(`[role="option"][data-value="ontology:${target}"]`).click();
    await expect.poll(async () => (await readMap(page)).selected?.label).toBe(label);
    await expect(page.getByTestId("ontology-map")).not.toHaveAttribute("data-map-lens", "path");
    const query = new URL(page.url()).searchParams;
    expect(query.get("p")).toBe(target);
    expect(query.has("pathFrom")).toBe(false);
    expect(query.has("pathTo")).toBe(false);
    await expect(page.getByTestId("ontology-map-canvas")).toBeFocused();
  });
}

test("search still supplies the target of an unfinished path", async ({ page }) => {
  await page.goto("/ko/topology/?e2e=1&guides=off&mode=path&pathFrom=domain%3Aorder");
  await expect(page.getByTestId("ontology-map-canvas")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("mode")).toBe("path");
  const target = "domain:customer";
  const label = await page.evaluate((id) => (window as unknown as { __atlasMap: AtlasMap }).__atlasMap.nodes().find((node) => node.id === id)!.label, target);
  await page.getByTestId("topology-concept-search").click();
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await palette.getByRole("combobox").fill(label);
  await palette.locator(`[role="option"][data-value="ontology:${target}"]`).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("pathTo")).toBe(target);
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
});

test("a project search result opens its project after a completed path", async ({ page }) => {
  await page.goto("/ko/topology/?e2e=1&guides=off&mode=path&pathFrom=domain%3Aorder&pathTo=domain%3Acustomer");
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  await page.getByTestId("topology-concept-search").click();
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await palette.locator('[role="option"][data-value="project:storefront"]').click();
  await expect(page.getByTestId("project-drawer")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("p")).toBe("storefront");
  await expect(page.getByTestId("ontology-map")).not.toHaveAttribute("data-map-lens", "path");
});

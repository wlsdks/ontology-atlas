import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

type MapNode = { id: string; kind: string; label: string; x: number; y: number; hidden: boolean;
};
type AtlasMap = { nodes: () => MapNode[]; selection: () => { nodeId: string | null;
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
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await page.locator('[data-testid="topology-concept-search"]').click();
  await expect(palette, "검색 칩이 팔레트를 연다").toBeVisible();
  await page.keyboard.type("배송");
  await expect(
    palette.locator('[role="option"][aria-selected="true"]'),
    "고른 결과가 배송이다").toContainText("배송");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="map-detail-panel"]')).toBeVisible({ timeout: 5000 });
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
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=domain%3Afulfillment", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await readMap(page)).visible, { timeout: 20000 }).toBeGreaterThan(0);
  await waitForMapStill(page);
  const box = (await page.locator('[data-testid="ontology-map-canvas"]').boundingBox())!;
  const m = await page.evaluate(() => {
    const nodes = (window as unknown as { __atlasMap: AtlasMap;
        }).__atlasMap.nodes();
    const at = (id: string) => nodes.find((n) => n.id === id)!;
    return { from: at("domain:fulfillment"), to: at("capability:carrier-integration") };
  });
  const mid = { x: (m.from.x + m.to.x) / 2, y: (m.from.y + m.to.y) / 2 };
  await page.mouse.move(box.x + mid.x, box.y + mid.y);
  await page.waitForFunction(
    (point) =>
      Boolean(
        (window as unknown as { __atlasMap?: { edgeAt?: (x: number, y: number) => unknown;
        };
    }).__atlasMap?.edgeAt?.(point.x, point.y)), mid, { polling: "raf", timeout: 15000 });
  await page.mouse.click(box.x + mid.x, box.y + mid.y);
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

import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

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
    const canvasEl = document.querySelector('[data-testid="topology-map-v2-canvas"]');
    if (!m || !canvasEl) {
      return { canvas: { width: 0, height: 0 }, panelLeft: null, selected: null, offscreen: 0, visible: 0, project: null, domains: [] as MapNode[] };
    }
    const canvas = canvasEl.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="topology-v2-detail-panel"]')?.getBoundingClientRect() ?? null;
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
  await page.waitForTimeout(1500);
});

test("a node picked from the search palette is framed left of the detail panel", async ({ page }) => {
  // The map's search chip opens the unified palette (an `aria-modal` dialog).
  const palette = page.getByRole("dialog", { name: "글로벌 검색" });
  await expect
    .poll(
      async () => {
        await page.locator('[data-testid="topology-concept-search"]').click();
        await page.waitForTimeout(400);
        return palette.isVisible();
      },
      { timeout: 15_000, message: "검색 칩이 팔레트를 연다" },
    )
    .toBe(true);
  await page.keyboard.type("배송");
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="topology-v2-detail-panel"]')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(1800);
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
  await page.waitForTimeout(2500);
  await page.locator('[data-testid="topology-auto-arrange"]').click();
  await page.waitForTimeout(3500);
  const arranged = await readMap(page);
  expect(arranged.offscreen, "정렬 후 펼친 노드가 화면 밖으로 나가지 않는다").toBe(0);
  // The `0` key is the same fit and must agree.
  await page.mouse.click(700, 800);
  await page.keyboard.press("0");
  await page.waitForTimeout(2500);
  expect((await readMap(page)).offscreen).toBe(0);
  // (Selecting a node ends expand-all by design, so the panel-close return is
  // covered by `map-viewport-reframe.spec.ts` in the plain state instead.)
});

test("the Korean relation sentence joins its particles to the names", async ({ page }) => {
  const box = (await page.locator('[data-testid="topology-map-v2-canvas"]').boundingBox())!;
  const m = await readMap(page);
  const domain = m.domains.find((d) => d.label === "배송")!;
  const mid = { x: (m.project!.x + domain.x) / 2, y: (m.project!.y + domain.y) / 2 };
  await page.mouse.move(box.x + mid.x, box.y + mid.y);
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + mid.x, box.y + mid.y);
  const sentence = page.locator('[data-testid="topology-v2-edge-sentence"]');
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

import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForDomeAssembled, waitForFlatMap, waitForMapStill, waitFrames } from "./settle";

/**
 * **Coming back from 3D leaves the 2D map alone** (owner report, 2026-09-07).
 *
 * The owner switched the map to a 3D arrangement and back to flat, and the flat
 * map then showed a walked trail and one domain fanned open inside a selection
 * ring — from a click they never made. The chain, both halves in
 * `search-hint/ui/View3dMenu.tsx`:
 *
 * 1. The 「3D」 chip counted as 「outside」 its own picker, so a second press closed
 *    and reopened it in one batch and could never put it away. The only exit left
 *    was pressing the map.
 * 2. That press was not consumed: it dismissed the picker **and** reached the
 *    canvas. In 3D every tier is drawn, so it usually landed on a capability —
 *    which appends a footprint step and derives that node's `contains` ancestors
 *    into `open=`, the flat map's expansion state.
 *
 * So this spec walks 2D → 3D → 2D twice: once with the picker used as intended,
 * and once dismissing the picker over a node, which is the reported accident.
 */
const trailChip = (page: import("@playwright/test").Page) => page.getByText(/걸어온 길/);

async function openPicker(page: import("@playwright/test").Page) {
  await page.getByTestId("topology-view-3d").click();
  await expect(page.getByTestId("topology-view-3d-menu")).toBeVisible();
}

test("2D → 3D → 2D leaves no trail and no expansion behind", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1512, height: 917 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);
  await expect(trailChip(page), "출발선에 자취가 있으면 안 된다").toHaveCount(0);

  await openPicker(page);
  await page.getByTestId("topology-view-3d-choice-strata").click();
  await waitForDomeAssembled(page);

  await openPicker(page);
  await page.getByTestId("topology-view-3d-choice-flat").click();
  await waitForFlatMap(page);

  await expect(trailChip(page), "3D 를 다녀왔다고 걸어온 길이 생기지 않는다").toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("open"), "3D 왕복이 2D 펼침을 만들지 않는다").toBeNull();
});

test("the press that dismisses the 3D picker does not also walk the map", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1512, height: 917 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);

  await openPicker(page);
  await page.getByTestId("topology-view-3d-choice-ownership").click();
  await waitForDomeAssembled(page);

  // The chip closes its own picker — without this the reader has no way out but the map.
  await openPicker(page);
  await page.getByTestId("topology-view-3d").click();
  await expect(
    page.getByTestId("topology-view-3d-menu"),
    "3D 칩을 다시 누르면 피커가 닫힌다",
  ).toHaveCount(0);

  // And the other exit — pressing the map — only dismisses.
  await openPicker(page);
  const target = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { nodes: () => Array<{ id: string; hidden: boolean; x: number; y: number }> } }).__atlasMap;
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const n = m.nodes().find((n) => !n.hidden && n.id.startsWith("capability:"));
    return n ? { id: n.id, px: box.left + n.x, py: box.top + n.y } : null;
  });
  expect(target, "3D 에서 역량 노드를 못 찾았다 — 공회전").not.toBeNull();
  await page.mouse.click(target!.px, target!.py);
  await expect(page.getByTestId("topology-view-3d-menu"), "그 누름은 피커를 닫는다").toHaveCount(0);
  /*
   * The two claims below are **absences**, and an absence proven by sleeping only
   * proves the sleep was long enough. The picker closing above is the positive
   * marker that the press was handled; a walk would have been recorded by the same
   * press, so the next drawn frames are where it would already show.
   */
  await waitFrames(page, 3);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __atlasMap: { selection: () => { nodeId: string | null } } }).__atlasMap.selection()
          .nodeId,
    ),
    "피커를 치우는 누름이 노드를 고르지 않는다",
  ).toBeNull();
  await expect(trailChip(page), "피커를 치우는 누름이 노드를 밟지 않는다").toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("p"), "피커를 치우는 누름이 선택을 만들지 않는다").toBeNull();

  // Back to flat: still nothing left behind.
  await openPicker(page);
  await page.getByTestId("topology-view-3d-choice-flat").click();
  await waitForFlatMap(page);
  await expect(trailChip(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("open")).toBeNull();
});

test("a deliberate node click in 3D does survive the return to 2D", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1512, height: 917 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);

  await openPicker(page);
  await page.getByTestId("topology-view-3d-choice-ownership").click();
  await waitForDomeAssembled(page);

  const target = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { nodes: () => Array<{ id: string; hidden: boolean; x: number; y: number }> } }).__atlasMap;
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const n = m.nodes().find((n) => !n.hidden && n.id.startsWith("capability:"));
    return n ? { id: n.id, px: box.left + n.x, py: box.top + n.y } : null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(target!.px, target!.py);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("p"), {
      timeout: 15_000,
      message: "일부러 누른 노드는 선택된다",
    })
    .toBe(target!.id);

  await openPicker(page);
  await page.getByTestId("topology-view-3d-choice-flat").click();
  await waitForFlatMap(page);
  // A walk the reader really took is theirs to keep; only what they never asked
  // for is dropped.
  await expect(trailChip(page), "일부러 걸은 자취는 남는다").toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("p")).toBe(target!.id);
});

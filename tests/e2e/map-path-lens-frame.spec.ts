import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";
/**
 * **A path between two domains keeps the whole ring on screen** (2026-09-19).
 *
 * The path lens fitted the two endpoints alone, at 1.55× the overview: the
 * rest of the ring overflowed, three domains sat under the toolbar and one
 * left the canvas. The path is bright and the rest dim now, so the person
 * wants the dim ring as the frame the path sits in, not a crop that cuts it.
 * The lens fit takes the spine into its bounds while a path is asked for.
 */
test("a path keeps every spine node on the canvas and out from under the toolbar", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&mode=path&pathFrom=domain:order&pathTo=domain:fulfillment", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  await waitForMapStill(page);

  const reading = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const camera = probe.camera()!;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    // The tool lane: every control drawn over the canvas's top band.
    const controls = [...document.querySelectorAll<HTMLElement>("main button")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top < 120 && r.left > canvas.left);
    const toolbarBottom = Math.max(...controls.map((r) => r.bottom)) - canvas.top;
    const spine = probe.nodes().filter((node) => !node.hidden && (node.kind === "domain" || node.kind === "project"));
    return {
      underToolbar: spine.filter((node) => node.y - node.radius < toolbarBottom).map((node) => node.label),
      offscreen: spine
        .filter((node) => node.y - node.radius < 0 || node.y + node.radius > camera.height || node.x - node.radius < 0 || node.x + node.radius > camera.width)
        .map((node) => node.label),
      spine: spine.length,
    };
  });
  expect(reading.spine, "스파인이 없으면 이 스펙은 공회전한다").toBeGreaterThan(3);
  expect(reading.underToolbar, "툴바 아래 들어간 스파인 노드").toEqual([]);
  expect(reading.offscreen, "화면 밖으로 나간 스파인 노드").toEqual([]);
});

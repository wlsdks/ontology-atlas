import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";
/** The path lens fit takes the spine into its bounds so the dim ring stays on screen. */
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
    const dial = probe.dial!()!;
    if (!("texts" in dial)) throw new Error("the path branch frame is not drawn");
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    // The tool lane: every control drawn over the canvas's top band.
    const controls = [...document.querySelectorAll<HTMLElement>("main button")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top < 120 && r.left > canvas.left);
    const spine = new Set(probe.nodes().filter((node) => !node.hidden && (node.kind === "domain" || node.kind === "project")).map((node) => node.id));
    const names = dial.texts.filter((text) => text.id && spine.has(text.id) && (text.role === "domain" || text.role === "project"));
    const boxes = [
      ...names.map((text) => ({ id: text.id!, ...text.box })),
      ...dial.glyphs.filter((mark) => spine.has(mark.id)).map((mark) => ({ id: mark.id, minX: mark.x - mark.r, maxX: mark.x + mark.r, minY: mark.y - mark.r, maxY: mark.y + mark.r })),
      ...dial.blocks.filter((block) => block.alpha > 0.5 && spine.has(block.id)).map((block) => ({ id: block.id, ...block.box })),
    ];
    return {
      underToolbar: boxes.filter((box) => controls.some((control) => box.minX < control.right - canvas.left && box.maxX > control.left - canvas.left && box.minY < control.bottom - canvas.top && box.maxY > control.top - canvas.top)).map((box) => box.id),
      offscreen: boxes.filter((box) => box.minY < 0 || box.maxY > camera.height || box.minX < 0 || box.maxX > camera.width).map((box) => box.id),
      missingNames: [...spine].filter((id) => !names.some((name) => name.id === id)),
      spine: spine.size,
    };
  });
  expect(reading.spine, "the path must retain a nonempty overview spine").toBeGreaterThan(3);
  expect(reading.missingNames, "spine concepts without painted names").toEqual([]);
  expect(reading.underToolbar, "painted spine marks obscured by toolbar controls").toEqual([]);
  expect(reading.offscreen, "painted spine marks outside the canvas").toEqual([]);
});

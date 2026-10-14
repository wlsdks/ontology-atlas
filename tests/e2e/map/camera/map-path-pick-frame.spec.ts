import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { dogfoodVaultFiles } from "../dogfood-vault-files";
import { waitForMapSettled, waitForMapStill } from "../../settle";

/** Choosing a path's source must keep every candidate target on the canvas, centred between chrome. */
test("a path's source waits for its target with every candidate on the canvas", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page, dogfoodVaultFiles(), undefined, { replaceFixture: true });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapSettled(page);

  // The domain drawn highest: its dive is the one that pushed the lowest domain off.
  const source = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const stretch = canvas.width / probe.camera()!.width;
    const domains = probe
      .nodes()
      .filter((node) => node.kind === "domain" && !node.hidden)
      .map((node) => ({ id: node.id, x: canvas.left + node.x * stretch, y: canvas.top + node.y * stretch }));
    return domains.sort((a, b) => a.y - b.y)[0] ?? null;
  });
  expect(source, "no domain drawn to start a path from").not.toBeNull();
  await page.mouse.click(source!.x, source!.y, { button: "right" });
  await page.getByTestId("map-context-menu-path").click();
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(source!.id);
  await waitForMapStill(page, { what: "camera" });
  await waitForMapStill(page);

  const reading = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const canvasEl = document.querySelector('[data-testid="ontology-map-canvas"]')!;
    const canvas = canvasEl.getBoundingClientRect();
    const stretch = canvas.width / probe.camera()!.width;
    const toolbar = document.querySelector('[data-testid="topology-top-toolbar"]')!;
    const toolbarBottom = Math.max(
      ...[...toolbar.querySelectorAll("button")]
        .map((button) => button.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
        .map((box) => box.bottom),
    );
    const drawn = probe
      .nodes()
      .filter((node) => !node.hidden && (node.alpha ?? 1) > 0.05)
      .map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        left: canvas.left + (node.x - node.radius) * stretch,
        right: canvas.left + (node.x + node.radius) * stretch,
        top: canvas.top + (node.y - node.radius) * stretch,
        bottom: canvas.top + (node.y + node.radius) * stretch,
      }));
    return {
      canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom },
      toolbarBottom,
      drawn,
    };
  });
  const spine = reading.drawn.filter((node) => node.kind === "domain" || node.kind === "project");
  expect(spine.length, "the spine is not drawn, so this measures nothing").toBeGreaterThan(3);
  const offCanvas = reading.drawn
    .filter(
      (node) =>
        node.left < reading.canvas.left ||
        node.right > reading.canvas.right ||
        node.top < reading.canvas.top ||
        node.bottom > reading.canvas.bottom,
    )
    .map((node) => `${node.label} [${Math.round(node.left)}..${Math.round(node.right)}, ${Math.round(node.top)}..${Math.round(node.bottom)}]`);
  expect(offCanvas, "a candidate target stood off the canvas").toEqual([]);
  const underToolbar = spine.filter((node) => node.top < reading.toolbarBottom).map((node) => node.label);
  expect(underToolbar, "a candidate target stood under the tool row").toEqual([]);
  expect(reading.drawn.some((node) => node.id === source!.id), "the source left the frame").toBe(true);
});

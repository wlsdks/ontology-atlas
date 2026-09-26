import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **Escape keeps the map's order when focus sits on the map's own chrome** (2026-09-26).
 *
 * The map closes one thing per Escape: the node card, then the selection. Focus rarely
 * stays on the canvas while a person works — the gear and the tool tiles keep it after a
 * press, and a closed surface hands it back to the control that opened it. Measured on the
 * product's own map at 1512×949: with a domain selected and its card already closed,
 * Escape on the settings gear left the domain selected however often it was pressed,
 * because the gear's closed sheet still took the key. The tool tiles already passed it on.
 */

const selection = (page: Page) =>
  page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null);

/** Select a domain drawn clear of the panels, then close its card: the next rung is "deselect". */
async function selectDomainWithCardClosed(page: Page) {
  // Aim at the frame the map settled on, not one it is still moving to: on a slow runner the
  // agent dock arrives after the first settle and the map reframes around it, so a point read
  // earlier missed its node in all three CI attempts (2026-09-26).
  await waitForMapStill(page);
  const target = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const canvasEl = document.querySelector('[data-testid="ontology-map-canvas"]')!;
    const canvas = canvasEl.getBoundingClientRect();
    const stretch = canvas.width / probe.camera()!.width;
    const domains = probe
      .nodes()
      .filter((node) => node.kind === "domain" && !node.hidden)
      .map((node) => ({ id: node.id, x: canvas.left + node.x * stretch, y: canvas.top + node.y * stretch }))
      .filter((node) => node.x > canvas.left + 420 && node.x < canvas.right - 420)
      // Only a point the canvas itself receives: nothing drawn over it (the dock, a panel).
      .filter((node) => canvasEl.contains(document.elementFromPoint(node.x, node.y)));
    return domains[0] ?? null;
  });
  expect(target, "no domain drawn in the middle of the canvas to select").not.toBeNull();
  await page.mouse.click(target!.x, target!.y);
  await expect.poll(() => selection(page)).toBe(target!.id);
  await page.keyboard.press("Escape");
  // The card closed and the selection stayed: one Escape, one surface.
  await expect.poll(() => selection(page)).toBe(target!.id);
  return target!.id;
}

test("Escape from the gear and the tool tiles reaches the map's dismissal order", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  // The gear, focused with its sheet closed.
  await selectDomainWithCardClosed(page);
  const gear = page.getByTestId("app-settings-trigger").first();
  await gear.focus();
  await page.keyboard.press("Escape");
  await expect.poll(() => selection(page), { message: "Escape on the closed gear did not reach the map" }).toBeNull();

  // The gear after its sheet closed: the first Escape closes the sheet and hands focus
  // back to the gear, the next one is the map's.
  const id = await selectDomainWithCardClosed(page);
  await gear.click();
  await expect(page.getByTestId("app-settings-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(gear).toHaveAttribute("aria-expanded", "false");
  await expect(gear).toBeFocused();
  expect(await selection(page), "closing the sheet also cleared the selection").toBe(id);
  await page.keyboard.press("Escape");
  await expect.poll(() => selection(page), { message: "Escape after the sheet closed did not reach the map" }).toBeNull();

  // A tool tile after the surface it opened is put away: the view picker.
  await selectDomainWithCardClosed(page);
  const viewChip = page.getByTestId("topology-view-3d");
  await viewChip.click();
  await expect(page.getByTestId("topology-view-3d-choice-flat")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("topology-view-3d-choice-flat")).toHaveCount(0);
  await expect(viewChip).toBeFocused();
  await page.keyboard.press("Escape");
  await expect.poll(() => selection(page), { message: "Escape from the view chip did not reach the map" }).toBeNull();
});

/**
 * **An Escape pressed as the view picker appears still hands focus back to the chip**
 * (2026-09-26).
 *
 * The picker focuses its checked view once its box is in the document. That focus ran as a
 * passive effect, a task after the insert, and an input event is dispatched ahead of such a
 * task: an Escape landing in the gap closed the picker and focused the chip, and then the
 * stale effect focused the closing radio, so focus fell to `<body>` when the box left. The
 * test above caught it once in a full shard run and never in isolation, because a real key
 * rarely lands in that gap. Here the Escape is delivered in exactly that gap, from a mutation
 * observer that fires on the radio's insert, before any later task can run.
 */
test("an Escape pressed as the view picker appears returns focus to its chip", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="topology-view-3d-choice-flat"]')) return;
      observer.disconnect();
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    observer.observe(document, { subtree: true, childList: true });
  });
  const viewChip = page.getByTestId("topology-view-3d");
  await viewChip.click();
  await expect(page.getByTestId("topology-view-3d-choice-flat")).toHaveCount(0);
  await expect(viewChip).toHaveAttribute("aria-expanded", "false");
  await expect(viewChip, "focus fell off the chip once the picker left").toBeFocused();
});

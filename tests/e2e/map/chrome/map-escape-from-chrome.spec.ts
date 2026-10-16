import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { openOwnerState } from "./map-toolbar-popovers-harness";
import { waitForMapStill } from "../../settle";

/** Escape closes one thing per press even when focus sits on map chrome such as the gear. */

const selection = (page: Page) =>
  page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null);

/** Select a domain drawn clear of the panels: on the flat map the next rung is "deselect". */
async function selectDomain(page: Page) {
  // Aim at the settled frame: on a slow runner the agent dock arrives after the first
  // settle and the map reframes.
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
  await selectDomain(page);
  const gear = page.getByTestId("app-settings-trigger").first();
  await gear.focus();
  await page.keyboard.press("Escape");
  await expect.poll(() => selection(page), { message: "Escape on the closed gear did not reach the map" }).toBeNull();

  // The gear after its sheet closed: the first Escape closes the sheet and hands focus
  // back to the gear, the next one is the map's.
  const id = await selectDomain(page);
  await gear.click();
  await expect(page.getByTestId("app-settings-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(gear).toHaveAttribute("aria-expanded", "false");
  await expect(gear).toBeFocused();
  expect(await selection(page), "closing the sheet also cleared the selection").toBe(id);
  await page.keyboard.press("Escape");
  await expect.poll(() => selection(page), { message: "Escape after the sheet closed did not reach the map" }).toBeNull();

  // A tool tile after the surface it opened is put away: the view picker.
  await selectDomain(page);
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
 * An Escape landing as the picker's box is inserted must still hand focus back to the chip.
 * The picker focuses in a passive effect a task later, so the Escape is sent from a
 * mutation observer on the radio's insert.
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

test("the view picker takes focus on open and gives it back after a choice", async ({ page }) => {
  test.setTimeout(180000);
  await openOwnerState(page);
  const chip = page.getByTestId("topology-view-3d");
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("topology-view-3d-choice-flat")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("topology-view-3d-choice-flat")).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chip).toBeFocused();
  await chip.click();
  await page.getByTestId("topology-view-3d-choice-structure").click();
  await expect(chip).toHaveAttribute("data-map-view", "structure");
  await expect(chip).toBeFocused();
});
test("the agent dock closes on Escape and returns focus to its toggle", async ({ page }) => {
  test.setTimeout(180000);
  await openOwnerState(page);
  const toggle = page.getByTestId("topology-vault-agent-toggle");
  await toggle.click();
  const close = page.getByTestId("vault-agent-panel-close");
  await expect(close).toBeVisible();
  await close.focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(close).toBeVisible();
  await close.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

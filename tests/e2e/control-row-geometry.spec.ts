import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installDesktopBridge } from "./rounds-desktop-bridge";
import { waitForAnimationsDone } from "./settle";

type Box = { width: number; height: number; centre: number; glyph: number | null };

const measure = (locator: Locator): Promise<Box> =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const glyph = element.querySelector("svg")?.getBoundingClientRect().width ?? null;
    return { width: rect.width, height: rect.height, centre: rect.top + rect.height / 2, glyph };
  });

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true }).first();

async function expectOneRow(boxes: Box[], what: string) {
  const heights = boxes.map((box) => Math.round(box.height * 2) / 2);
  expect(new Set(heights).size, `${what} heights: ${heights.join(", ")}`).toBe(1);
  const centres = boxes.map((box) => box.centre);
  expect(Math.max(...centres) - Math.min(...centres), `${what} centres: ${centres.join(", ")}`).toBeLessThanOrEqual(0.5);
}

test("a sheet's fields span the sheet and the cadence detents meet the 24px target floor", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto("/en/");
  await page.getByRole("button", { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId("app-nav-rail")).toBeVisible();
  await page.goto("/en/automations/?guides=off&kind=ontology");
  await page.getByTestId("automations-new").click();
  const sheet = page.getByTestId("ontology-automation-sheet");
  await expect(sheet).toBeVisible();
  await waitForAnimationsDone(sheet);

  const column = await measure(sheet.getByTestId("ontology-automation-cadence"));
  for (const field of ["ontology-automation-name", "ontology-automation-focus"]) {
    const box = await measure(sheet.getByTestId(field));
    expect(Math.abs(box.width - column.width), `${field} is ${box.width}px in a ${column.width}px sheet`).toBeLessThanOrEqual(1);
  }

  const detents = sheet.locator("[data-cadence-detent]");
  expect(await detents.count()).toBeGreaterThan(1);
  for (const detent of await detents.all()) {
    const box = await measure(detent);
    expect(Math.min(box.width, box.height), `detent ${await detent.textContent()} is ${box.width}x${box.height}`).toBeGreaterThanOrEqual(24);
  }
});

test("the guide switch and its replay action stand at one height", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/en/git/?guides=off");
  await page.getByTestId("app-settings-trigger").click();
  const replay = page.getByTestId("app-settings-replay-guide-button");
  await expect(replay).toBeVisible();
  await waitForAnimationsDone(page.getByTestId("app-settings-body"));
  await expectOneRow(
    [await measure(page.getByTestId("app-settings-guide-auto-start-switch")), await measure(replay)],
    "guide row",
  );
});

test("the document header's tile and folder chip stand at one height", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/en/docs/?guides=off", { waitUntil: "domcontentloaded" });
  const chip = visible(page, '[data-testid="vault-chip-menu-trigger"]');
  await expect(chip).toBeVisible({ timeout: 15_000 });
  const tile = visible(page, '[data-docs-header-zone="identity"] button[aria-expanded]:not([aria-haspopup])');
  await expectOneRow([await measure(tile), await measure(chip)], "document header");
});

test("the download header's links and language switch stand at one height", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/download/?guides=off");
  const actions = page.getByTestId("download-gnb-actions");
  await expect(actions).toBeVisible();
  await expectOneRow(
    [
      await measure(page.getByTestId("gateway-nav-guide")),
      await measure(page.getByTestId("gateway-github-link")),
      await measure(actions.getByRole("radiogroup")),
    ],
    "download header",
  );
});

test("the concept panel and the harness inspector close with the one 32px close and its 14px glyph", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/?e2e=1&guides=off&p=capability%3Aexchange-request");
  const panelClose = page.getByTestId("map-detail-panel-close");
  await expect(panelClose).toBeVisible({ timeout: 30_000 });
  const panel = await measure(panelClose);

  await page.goto("/en/architecture/?view=architecture&guides=off");
  await page.getByTestId("architecture-inspector-toggle").click();
  const inspectorClose = page.getByTestId("architecture-inspector-close");
  await expect(inspectorClose).toBeVisible();

  for (const close of [panel, await measure(inspectorClose)]) {
    expect(close.width).toBe(32);
    expect(close.height).toBe(32);
    expect(close.glyph).toBe(14);
  }
});

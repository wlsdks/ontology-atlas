import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker, writeFolderBeforePick } from "./vault-picker-stub";

const STOREFRONT = path.resolve(__dirname, "../../samples/storefront");

function storefrontFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else files[path.relative(STOREFRONT, abs)] = readFileSync(abs, "utf8");
    }
  };
  walk(STOREFRONT);
  return files;
}

async function openStorefront(page: Page) {
  await page.setViewportSize({ width: 1512, height: 949 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {});
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await writeFolderBeforePick(page, storefrontFiles());
  await page.waitForFunction(() => "__atlasMap" in window);
  await page.getByTestId("topology-switch-to-my-data").click();
  await expect(page.getByTestId("topology-index-source")).toBeVisible({ timeout: 30_000 });
}

const textStart = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => ((n.textContent ?? "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const node = walker.nextNode();
    if (!node) return null;
    const text = node.textContent ?? "";
    const range = document.createRange();
    const lead = text.length - text.trimStart().length;
    range.setStart(node, lead);
    range.setEnd(node, lead + 1);
    return range.getClientRects()[0]?.x ?? null;
  }, selector);

test("INDEX text starts on one line and its two eyebrows share one ink", async ({ page }) => {
  test.setTimeout(90_000);
  await openStorefront(page);
  await expect(page.getByTestId("topology-index-tidy")).toBeVisible();
  const fold = await textStart(page, '[data-testid="topology-index-fold"] span');
  const source = await textStart(page, '[data-testid="topology-index-source"]');
  const tidy = await textStart(page, '[data-testid="topology-index-tidy"] p');
  expect(fold, "the INDEX eyebrow is missing").not.toBeNull();
  expect(Math.abs(fold! - source!), `INDEX eyebrow ${fold} vs source line ${source}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(tidy! - source!), `tidy eyebrow ${tidy} vs source line ${source}`).toBeLessThanOrEqual(0.5);
  const inks = await page.evaluate(() => [
    getComputedStyle(document.querySelector('[data-testid="topology-index-fold"] span')!).color,
    getComputedStyle(document.querySelector('[data-testid="topology-index-tidy"] p')!).color,
  ]);
  expect(inks[0]).toBe(inks[1]);
  const fill = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="topology-index-fold"]')!.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="topology-index-panel"]')!.getBoundingClientRect();
    return { left: box.left - panel.left, right: panel.right - box.right };
  });
  expect(Math.abs(fill.left - fill.right), "the fold row's hover fill is not centred in the panel").toBeLessThanOrEqual(0.5);
});

test("the node popover puts group headers and rows on one glyph column and one text column", async ({ page }) => {
  test.setTimeout(90_000);
  await openStorefront(page);
  const id = await page.evaluate(
    () =>
      (window as unknown as { __atlasMap: { nodes: () => { id: string; kind: string }[] } }).__atlasMap
        .nodes()
        .find((node) => node.kind === "domain")!.id,
  );
  await page.locator(`[data-index-row="${id}"]`).first().click();
  const panel = page.getByTestId("map-detail-panel");
  await expect(panel.locator("[data-datasheet-group]").first()).toBeVisible();
  const columns = await page.evaluate(() => {
    const x = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().x : null);
    const text = (el: Element | null | undefined) => {
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => ((n.textContent ?? "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      const node = walker.nextNode();
      if (!node) return null;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 1);
      return range.getClientRects()[0]?.x ?? null;
    };
    const panel = document.querySelector('[data-testid="map-detail-panel"]')!;
    return [...panel.querySelectorAll("[data-datasheet-group]")].map((group) => {
      const glyphSlot = group.firstElementChild?.firstElementChild;
      const row = group.querySelector("[data-datasheet-connection],[data-datasheet-evidence]");
      return {
        group: group.getAttribute("data-datasheet-group"),
        headerSlot: x(glyphSlot),
        headerText: text(glyphSlot?.nextElementSibling),
        rowSlot: x(row?.querySelector("span")),
        rowText: text(row),
        title: text(panel.querySelector("h2")),
      };
    });
  });
  expect(columns.length).toBeGreaterThan(1);
  for (const column of columns) {
    expect(Math.abs(column.headerSlot! - column.rowSlot!), `${column.group}: glyph columns differ`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(column.headerText! - column.rowText!), `${column.group}: text columns differ`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(column.headerSlot! - column.title!), `${column.group}: glyphs step in from the title`).toBeLessThanOrEqual(0.5);
  }
});

test("the first-run card is the panel's own surface, with no inner box and no empty band", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("first-run-starter-glossary")).toBeVisible({ timeout: 30_000 });
  const layout = await page.evaluate(() => {
    const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const panel = rect('[data-testid="topology-index-panel"]');
    const card = rect('[data-testid="first-run-starter"]');
    const glossary = document.querySelector('[data-testid="first-run-starter-glossary"]')!.parentElement!.getBoundingClientRect();
    const actions = [...document.querySelectorAll('[data-testid="first-run-starter-dismiss"], [data-testid="first-run-plain-toggle"], [data-testid="first-run-starter-plain-mode-hint"]')]
      .map((el) => el.getBoundingClientRect().bottom);
    const radius = (sel: string) => getComputedStyle(document.querySelector(sel)!).borderTopLeftRadius;
    return {
      insetLeft: card.left - panel.left,
      insetRight: panel.right - card.right,
      band: glossary.top - Math.max(...actions),
      openRadius: radius('[data-testid="first-run-starter-open"]'),
      tourRadius: radius('[data-testid="first-run-tour-cta"]'),
    };
  });
  expect(layout.insetLeft, "the card sits inside the panel as a second box").toBeLessThanOrEqual(1.5);
  expect(layout.insetRight, "the card sits inside the panel as a second box").toBeLessThanOrEqual(1.5);
  expect(layout.band, "an empty band opens between the actions and the glossary").toBeLessThanOrEqual(24);
  expect(layout.tourRadius).toBe(layout.openRadius);
});

test("on a phone the expanded INDEX sheet leaves no caption underneath it", async ({ page }) => {
  test.setTimeout(90_000);
  await openStorefront(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const brand = page.getByTestId("topology-phone-brand");
  await expect(page.getByTestId("topology-index-panel")).toBeVisible();
  await expect(brand).toHaveCount(1);
  await expect(brand, "the brand line stays under the INDEX sheet").toBeHidden();
  await page.getByTestId("topology-index-fold").click();
  await expect(page.getByTestId("topology-index-tab")).toBeVisible();
  await expect(brand, "the phone brand line is missing with INDEX folded").toBeVisible();
});

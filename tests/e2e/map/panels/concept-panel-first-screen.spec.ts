import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const SIDE = 20;
const LONG_REASON = Array.from({ length: 12 }, () => "The hub cannot settle an order until this answers, and a late answer holds the shopper at the last step.").join(" ");
/** Spec section 5, "today" list lines: the panel may never list more than it did before. */
const TODAY_LIST_LINES = { capability: 23, domain: 25, element: 16 } as const;

function generatedVault(): Record<string, string> {
  const files: Record<string, string> = {};
  const body = (title: string) => `\n# ${title}\n\n${title} keeps one boundary of the product honest.\n`;
  const list = (refs: readonly string[]) => `[${refs.join(", ")}]`;
  const needs = Array.from({ length: SIDE }, (_, i) => `need-${String(i).padStart(2, "0")}`);
  const users = Array.from({ length: SIDE }, (_, i) => `user-${String(i).padStart(2, "0")}`);
  const elements = ["hub-form", "hub-store", "hub-clock"];
  files["atlas.md"] = `---\nkind: project\ntitle: Atlas\nslug: atlas\ndomains: [domains/orders, domains/supply, domains/demand]\n---\n${body("Atlas")}`;
  files["domains/orders.md"] = `---\nkind: domain\ntitle: orders\ncapabilities: [capabilities/hub]\n---\n${body("orders")}`;
  files["domains/supply.md"] = `---\nkind: domain\ntitle: supply\ncapabilities: ${list(needs.map((n) => `capabilities/${n}`))}\n---\n${body("supply")}`;
  files["domains/demand.md"] = `---\nkind: domain\ntitle: demand\ncapabilities: ${list(users.map((n) => `capabilities/${n}`))}\n---\n${body("demand")}`;
  const notes = needs.map((n, i) => `capabilities/${n}: "${i === 0 ? LONG_REASON : `The hub asks ${n} first.`}"`).filter((_, i) => i % 2 === 0);
  files["capabilities/hub.md"] = [
    "---",
    "kind: capability",
    "title: Checkout hub",
    "domain: domains/orders",
    `depends_on: ${list(needs.map((n) => `capabilities/${n}`))}`,
    `elements: ${list(elements.map((e) => `elements/${e}`))}`,
    `relation_notes: { ${notes.join(", ")} }`,
    "---",
  ].join("\n") + body("Checkout hub");
  for (const n of needs) files[`capabilities/${n}.md`] = `---\nkind: capability\ntitle: Supply ${n}\ndomain: domains/supply\n---\n${body(n)}`;
  for (const u of users) files[`capabilities/${u}.md`] = `---\nkind: capability\ntitle: Demand ${u}\ndomain: domains/demand\ndepends_on: [capabilities/hub]\n---\n${body(u)}`;
  files["elements/hub-form.md"] = `---\nkind: element\ntitle: Hub form\ndepends_on: [elements/hub-store, elements/hub-clock]\n---\n${body("Hub form")}`;
  files["elements/hub-store.md"] = `---\nkind: element\ntitle: Hub store\n---\n${body("Hub store")}`;
  files["elements/hub-clock.md"] = `---\nkind: element\ntitle: Hub clock\n---\n${body("Hub clock")}`;
  return files;
}

async function openVault(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, generatedVault());
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "networkidle" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await page.waitForFunction((count) => {
    const dial = window.__atlasMap?.dial?.() as DialProbe | undefined;
    const drawn = window.__atlasMap?.nodes().filter((n) => n.kind === "capability").length;
    return dial?.owns === true && dial.placement.state === "settled" && drawn === count && document.querySelector("[data-vault-load-progress]") === null;
  }, 1 + 2 * SIDE, { timeout: 120_000 });
  await waitForMapStill(page);
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((nodeId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("p", nodeId);
    (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push(`${url.pathname}${url.search}`);
  }, id);
  await expect(page.getByTestId("map-detail-panel")).toHaveAttribute("data-selected-node-id", id);
  await waitForMapStill(page);
}

/** Every list line the panel's relations hold: group headings, rows, show-more rows and folded lines. */
const listLines = (page: Page) =>
  page.getByTestId("map-detail-panel").evaluate((panel) => {
    const zone = panel.querySelector("[data-reach-zone]");
    if (!zone) return 1;
    return zone.querySelectorAll("[data-datasheet-group-total], li > button, [data-reach-line]").length;
  });

test.describe("the concept panel's first screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await openVault(page);
  });

  test("a concept with forty relations keeps each group to six one-line rows inside one scroll body", async ({ page }) => {
    test.setTimeout(180_000);
    await select(page, "capability:hub");
    const panel = page.getByTestId("map-detail-panel");
    for (const key of ["needs", "neededBy"]) {
      const group = panel.locator(`[data-datasheet-group="${key}"]`);
      await expect(group.locator(`[data-datasheet-group-total="${key}"]`)).toHaveText(String(SIDE));
      await expect(group.locator("ul > li")).toHaveCount(6);
      await expect(group.locator(`[data-datasheet-group-overflow="${key}"]`)).toHaveText("Show 15 more");
    }
    const heights = await panel.locator("[data-reach-row]").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(heights.length).toBe(10);
    for (const h of heights) expect(h, "a row is one line whatever its reason's length").toBeCloseTo(28, 0);
    const scrollers = await panel.evaluate((root) =>
      [root, ...root.querySelectorAll("*")].filter((el) => /auto|scroll/.test(getComputedStyle(el).overflowY)).length,
    );
    expect(scrollers, "exactly one element in the panel scrolls").toBe(1);
    const lines = await listLines(page);
    console.log(`list lines, 40-relation capability: ${lines}; panel height ${Math.round((await panel.boundingBox())!.height)}px`);
    expect(lines).toBeLessThanOrEqual(TODAY_LIST_LINES.capability);
  });

  test("a pointed row shows its reason beside the panel without moving the list, and a row without one says so", async ({ page }) => {
    test.setTimeout(180_000);
    await select(page, "capability:hub");
    const panel = page.getByTestId("map-detail-panel");
    const list = panel.locator('[data-reach-list="needs"]');
    const before = (await list.boundingBox())!;
    const withReason = panel.locator('[data-datasheet-connection="capability:need-00"]');
    await expect(withReason).toHaveAccessibleDescription(LONG_REASON);
    await withReason.hover();
    const card = page.getByTestId("map-edge-hover-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("map-edge-hover-why")).toContainText("The hub cannot settle an order");
    const [cardBox, panelBox] = [(await card.boundingBox())!, (await panel.boundingBox())!];
    expect(cardBox.x + cardBox.width, "the card stands on the map side of the panel").toBeLessThanOrEqual(panelBox.x + 1);
    const after = (await list.boundingBox())!;
    expect(after.height - before.height, "the list does not grow").toBe(0);
    await expect(panel.locator('[data-datasheet-connection="capability:need-01"]')).toContainText("No reason");

    await withReason.focus();
    await expect(card).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await expect(panel).toBeVisible();
  });

  test("the domain and element selections list no more than the panel did before", async ({ page }) => {
    test.setTimeout(180_000);
    for (const [id, kind] of [["domain:orders", "domain"], ["element:hub-form", "element"]] as const) {
      await select(page, id);
      const lines = await listLines(page);
      console.log(`list lines, ${kind}: ${lines}; panel height ${Math.round((await page.getByTestId("map-detail-panel").boundingBox())!.height)}px`);
      expect(lines).toBeLessThanOrEqual(TODAY_LIST_LINES[kind]);
    }
  });
});

test.describe("the concept panel on a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("gives each reach row a finger-sized target", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1512, height: 949 });
    await openVault(page);
    await select(page, "capability:hub");
    const heights = await page.getByTestId("map-detail-panel").locator("[data-reach-row]").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(heights.length).toBe(10);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  });
});

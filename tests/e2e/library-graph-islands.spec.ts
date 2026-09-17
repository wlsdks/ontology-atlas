import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import "./library-graph-probe";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **The islands overview: a folder past a few hundred marks is a map, a press on an island
 * is its own columns, and the way back is one chip or Escape.** (Owner, 2026-09-18: a wiki
 * piles up thousands of files; plan for tens of thousands.)
 *
 * The folder below is 450 marks — past `ISLANDS_MIN_MARKS` (400) — with three concepts,
 * a page naming none, and files no page has read, so every island kind is on the map.
 * The a11y opener model cannot press a painted island (it presses DOM triggers), so this
 * spec is where the island bar's own checks live; `surface-motion-ratchet` cites it.
 */
function bigFolder(): Record<string, string> {
  const files: Record<string, string> = {
    "project.md": "---\nkind: project\nslug: storefront\ntitle: Storefront\n---\n\n# Storefront\n",
  };
  const topics = ["payments", "refunds", "risk"];
  for (const topic of topics) {
    files[`capabilities/${topic}.md`] = `---\nkind: capability\nslug: ${topic}\ntitle: ${topic[0]!.toUpperCase()}${topic.slice(1)}\n---\n\n# ${topic}\n`;
  }
  const sources = 380;
  const pages = 66;
  for (let i = 0; i < sources; i += 1) files[`sources/doc-${String(i).padStart(3, "0")}.md`] = `# Source ${i}\n`;
  let cursor = 0;
  for (let p = 0; p < pages; p += 1) {
    const topic = p < 60 ? topics[p % 3] : null;
    const cited: string[] = [];
    for (let k = 0; k < 4 && cursor < 300; k += 1, cursor += 1) cited.push(`doc-${String(cursor).padStart(3, "0")}.md`);
    const body = cited.map((s) => `- Fact [[src:sources/${s}#p1]].`).join("\n");
    files[`wiki/page-${String(p).padStart(2, "0")}.md`] = `---\ntitle: ${topic ?? "note"} ${p}\ncreated_by: agent\nsources:\n${cited.map((s) => `  - sources/${s}`).join("\n")}\nsource_hash: fresh\ncompiled_at: 2026-09-10T09:00:00Z\nstatus: draft\n---\n\n## Summary\n\nAbout ${topic ? `[[capabilities/${topic}]]` : "nothing"}.\n\n## Facts\n\n${body}\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n`;
  }
  return files;
}

async function openMap(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, bigFolder());
  await page.goto("/en/library/?guides=off&e2e=1");
  await page.getByTestId("library-open-vault").click();
  await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.nodes().length ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(400);
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.arriving() ?? true), { timeout: 30_000 })
    .toBe(false);
}

/** The island's centre on the page, in the canvas's own pixels plus its offset. */
async function islandPoint(page: Page, label: string): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId("library-graph-canvas").boundingBox())!;
  const at = await page.evaluate((name) => {
    const probe = window.__atlasLibraryGraph!;
    const island = probe.islands()!.find((candidate) => candidate.label === name)!;
    const view = probe.view();
    // The point a third of the way out from the centre, off the concept's own point.
    return { x: (island.x + island.r * 0.3 - view.x) * view.scale + view.width / 2, y: (island.y - view.y) * view.scale + view.height / 2 };
  }, label);
  return { x: box.x + at.x, y: box.y + at.y };
}

test("a folder past four hundred marks is a map of islands, every kind on it and every one named", async ({ page }) => {
  await openMap(page);
  const islands = (await page.evaluate(() => window.__atlasLibraryGraph!.islands()))!;
  expect(islands, "the overview did not report islands").not.toBeNull();
  const kinds = new Set(islands.map((island) => island.kind));
  expect([...kinds].sort()).toEqual(["concept", "unread", "unsorted"]);
  expect(islands.filter((island) => island.kind === "concept").map((island) => island.label).sort()).toEqual(["Payments", "Refunds", "Risk"]);
  const unread = islands.find((island) => island.kind === "unread")!;
  // 66 pages × 4 files = 264 read; the other 116 of 380 are the Unread island.
  expect(unread.sources, "the files no page read are the Unread island").toBe(116);
  // Every island carries its name at this window.
  const named = await page.evaluate(() => window.__atlasLibraryGraph!.islandNames());
  expect(new Set(named).size, "an island lost its name to a collision").toBe(islands.length);
  // No page is named at rest on the overview: the names are the islands'.
  const pageNames = await page.evaluate(() => window.__atlasLibraryGraph!.labels().filter((label) => label.nodeId.startsWith("page:")).length);
  expect(pageNames).toBe(0);
  // Nothing overlaps: every island keeps clear of every other.
  for (const a of islands) for (const b of islands) {
    if (a.id === b.id) continue;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 1e-6);
  }
});

test("a press on an island opens it as columns; the chip and Escape both return the map", async ({ page }) => {
  await openMap(page);
  const at = await islandPoint(page, "Payments");
  const dot = await page.evaluate(() => Math.max(...window.__atlasLibraryGraph!.nodes().filter((node) => node.kind === "page").map((node) => node.radius)));
  await page.mouse.click(at.x, at.y);
  const bar = page.getByTestId("library-graph-island-bar");
  await expect(bar, `the island did not open (widest page dot ${dot.toFixed(1)}px)`).toBeVisible();
  await expect(page.getByTestId("library-graph-island-name")).toContainText("Payments");
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph!.layout()?.columns.map((column) => column.kind) ?? null))
    // The island's own concept is not on its picture: every page names it, the bar says it.
    .toEqual(["source", "page"]);
  await expect.poll(async () => page.evaluate(() => window.__atlasLibraryGraph!.islands())).toBeNull();

  await page.getByTestId("library-graph-island-back").click();
  await expect(bar).toBeHidden();
  await expect.poll(async () => page.evaluate(() => (window.__atlasLibraryGraph!.islands() ?? []).length)).toBeGreaterThan(3);

  const again = await islandPoint(page, "Refunds");
  await page.mouse.click(again.x, again.y);
  await expect(page.getByTestId("library-graph-island-name")).toContainText("Refunds");
  await page.getByTestId("library-graph-canvas").focus();
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
});

test("zooming the wheel into an island opens it, the way a press does", async ({ page }) => {
  await openMap(page);
  const at = await islandPoint(page, "Risk");
  await page.mouse.move(at.x, at.y);
  const bar = page.getByTestId("library-graph-island-bar");
  // Zoom in until the island fills its share of the view or the camera reaches its ceiling.
  for (let step = 0; step < 24; step += 1) {
    await page.mouse.wheel(0, -100);
    if (await bar.isVisible()) break;
  }
  await expect(bar, "zooming into an island did not open it").toBeVisible();
  await expect(page.getByTestId("library-graph-island-name")).toContainText("Risk");
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph!.layout()?.columns.map((column) => column.kind) ?? null))
    .toEqual(["source", "page"]);
});

test("zooming the wheel out of an opened island returns the map", async ({ page }) => {
  await openMap(page);
  const at = await islandPoint(page, "Payments");
  await page.mouse.click(at.x, at.y);
  const bar = page.getByTestId("library-graph-island-bar");
  await expect(bar).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__atlasLibraryGraph!.arriving())).toBe(false);
  const box = (await page.getByTestId("library-graph-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 24; step += 1) {
    await page.mouse.wheel(0, 100);
    if (await bar.isHidden()) break;
  }
  await expect(bar, "zooming out of the island did not return the map").toBeHidden();
  await expect.poll(async () => page.evaluate(() => (window.__atlasLibraryGraph!.islands() ?? []).length)).toBeGreaterThan(3);
});

test("the keyboard walks the islands: arrows step, Enter opens, Escape returns", async ({ page }) => {
  await openMap(page);
  const canvas = page.getByTestId("library-graph-canvas");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  // The legend line names the island the keyboard stands on.
  await expect(page.getByTestId("library-graph-hint")).toContainText(/pages and .* files/);
  await page.keyboard.press("Enter");
  const bar = page.getByTestId("library-graph-island-bar");
  await expect(bar, "Enter on a focused island did not open it").toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph!.layout()?.columns.map((column) => column.kind) ?? null))
    .toEqual(["source", "page"]);
  await canvas.focus();
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
});

test("the Unread island does not open: a press says what it is and where to start", async ({ page }) => {
  await openMap(page);
  const at = await islandPoint(page, "Unread");
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId("library-graph-hint")).toContainText(/no page has read yet/);
  await expect(page.getByTestId("library-graph-island-bar")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => (window.__atlasLibraryGraph!.islands() ?? []).length)).toBeGreaterThan(3);
});

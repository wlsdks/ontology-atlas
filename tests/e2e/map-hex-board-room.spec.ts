import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodEvidenceVault } from "./hex-board-vaults";

/**
 * **The hex board fits the free map it opens in, whatever is selected.**
 *
 * Measured 2026-09-25 through the app's own bridge, on the product's vault at 1512x949:
 *
 * - Opened with a node already selected — a `?view=hex&p=…` link, or a switch of view with a node
 *   chosen — the board drew none of its 37 tiles while the inspector and the footer stood beside
 *   an empty canvas. It read its room only while nothing was selected, so it had no layout and no
 *   camera until the selection cleared.
 * - Opened by its address with nothing selected, the board sat in a strip 277 px tall in the
 *   bottom third. It read its room while INDEX was still fading in: the full-height slot did not
 *   count yet, the panel inside it ends under its last row (shorter than 60% of the canvas, so not
 *   a panel by shape), and the board took it for chrome in the tool lane, pushing the room's top
 *   edge down to the panel's bottom. Nothing made it read again once INDEX had arrived.
 *
 * Claims at 1512x949 and 1280x800: opened by its address the room starts right of the open INDEX
 * and keeps most of the window's height; entered with a node selected, every tile is drawn, the
 * canvas is inked and no tile stands under the inspector; closing the inspector reads the room at
 * rest again. (At 1280 INDEX is tall enough to read as a panel by shape, so only 1512 failed.)
 */

const NODE = "capability:vault-git-history";

interface BoardState {
  tiles: number;
  ready: string | null;
  room: { x: number; y: number; width: number; height: number } | null;
  canvas: { x: number; y: number; width: number; height: number };
  index: { right: number } | null;
  inspector: { left: number } | null;
  marks: { id: string; x: number; y: number; r: number; pressed: boolean }[];
  inked: number;
}

async function readBoard(page: Page): Promise<BoardState> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="hex-board-map"]');
    const canvas = root?.querySelector("canvas");
    const c = canvas?.getBoundingClientRect() ?? new DOMRect();
    const room = root?.dataset.hexRoom?.split(",").map(Number) ?? null;
    const visible = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && Number(getComputedStyle(el).opacity) > 0.05 ? r : null;
    };
    let inked = 0;
    const ctx = canvas && canvas.width > 0 ? canvas.getContext("2d") : null;
    if (ctx && canvas) {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const [r0, g0, b0] = [data[0]!, data[1]!, data[2]!];
      for (let i = 0; i < data.length; i += 16) {
        if (Math.abs(data[i]! - r0) + Math.abs(data[i + 1]! - g0) + Math.abs(data[i + 2]! - b0) > 60) inked += 1;
      }
    }
    const index = visible('[data-testid="topology-index-panel"]');
    const inspector = visible('[data-testid="topology-node-popover-positioner"]');
    return {
      tiles: document.querySelectorAll("[data-hex-id]").length,
      ready: root?.dataset.hexReady ?? null,
      room: room ? { x: room[0]!, y: room[1]!, width: room[2]!, height: room[3]! } : null,
      canvas: { x: c.x, y: c.y, width: c.width, height: c.height },
      index: index ? { right: index.right } : null,
      inspector: inspector ? { left: inspector.left } : null,
      marks: [...document.querySelectorAll<HTMLElement>("[data-hex-id]")]
        .filter((el) => el.dataset.mark)
        .map((el) => {
          const [x, y, r] = el.dataset.mark!.split(",").map(Number);
          return { id: el.dataset.hexId!, x: c.x + x!, y: c.y + y!, r: r!, pressed: el.getAttribute("aria-pressed") === "true" };
        }),
      inked,
    };
  });
}

async function openVault(page: Page, { reducedMotion = true } = {}) {
  const vault = dogfoodEvidenceVault();
  await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("topology-view-3d")).toBeVisible({ timeout: 90_000 });
  return vault;
}

async function chooseHex(page: Page) {
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-hex").click();
}

/** The room is the map at rest: right of the open INDEX, below the tool lane, most of the height. */
function expectRestRoom(board: BoardState, label: string) {
  expect(board.room, `${label}: the board read no room`).not.toBeNull();
  expect(board.index, `${label}: INDEX is not open`).not.toBeNull();
  const room = board.room!;
  expect(board.canvas.x + room.x, `${label}: the room starts under INDEX`).toBeGreaterThanOrEqual(board.index!.right);
  expect(room.height / board.canvas.height, `${label}: the room is a strip (${room.height}px of ${board.canvas.height})`).toBeGreaterThan(0.6);
}

/*
 * Arriving on the board by its address (a reload, a link), with motion on: the board reads its
 * room while INDEX is still fading in, when the full-height slot is not yet counted and only the
 * panel inside it — shorter than 60% of the canvas — stands for INDEX. Nothing moves afterwards
 * to make the board read again.
 */
for (const viewport of [
  { width: 1512, height: 949 },
  { width: 1280, height: 800 },
]) {
  test(`hex board opened by its address fits the map right of the open INDEX at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const vault = await openVault(page, { reducedMotion: false });
    await page.goto("/ko/?guides=off&e2e=1&view=hex", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 90_000 });
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    // INDEX has finished arriving and the board has had every chance to read the room again.
    await page.waitForTimeout(1_500);

    const board = await readBoard(page);
    console.log(`[hex room rest ${viewport.width}] room=${JSON.stringify(board.room)} index=${JSON.stringify(board.index)} canvas=${JSON.stringify(board.canvas)}`);
    expect(board.tiles).toBe(vault.capabilities + vault.domains + 1);
    expectRestRoom(board, "at rest");
    for (const t of board.marks) expect(t.x - t.r, `${t.id} is drawn under INDEX`).toBeGreaterThanOrEqual(board.index!.right);
  });
}

for (const viewport of [
  { width: 1512, height: 949 },
  { width: 1280, height: 800 },
]) {
  test(`hex board entered with a node selected draws every tile beside the inspector at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const vault = await openVault(page);
    const expected = vault.capabilities + vault.domains + 1;

    await page.goto(`/ko/?guides=off&e2e=1&view=hex&p=${encodeURIComponent(NODE)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("topology-node-popover-positioner")).toBeVisible({ timeout: 90_000 });
    await expect.poll(async () => (await readBoard(page)).tiles, { message: "the board drew no tiles", timeout: 30_000 }).toBe(expected);
    await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true");

    let board = await readBoard(page);
    console.log(`[hex room preselected ${viewport.width}] room=${JSON.stringify(board.room)} inspector=${JSON.stringify(board.inspector)} inked=${board.inked}`);
    expect(board.inked, "the canvas is blank").toBeGreaterThan(5_000);
    expect(board.marks.find((t) => t.id === NODE)?.pressed, "the selected tile is not the pressed one").toBe(true);
    for (const t of board.marks) expect(t.x + t.r, `${t.id} stands under the inspector`).toBeLessThanOrEqual(board.inspector!.left);

    // Closing the inspector: the room is read again at rest, beside INDEX as it returns.
    await page.getByTestId("map-detail-panel-close").click();
    await expect(page.getByTestId("topology-node-popover-positioner")).toBeHidden();
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    await expect
      .poll(async () => {
        const b = await readBoard(page);
        return b.room && b.index ? b.canvas.x + b.room.x >= b.index.right : false;
      }, { message: "the room was not read again at rest", timeout: 15_000 })
      .toBe(true);
    board = await readBoard(page);
    expectRestRoom(board, "after the inspector closed");
  });

  test(`hex board chosen with a node already selected on the flat map draws every tile at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const vault = await openVault(page);

    await page.goto(`/ko/?guides=off&e2e=1&p=${encodeURIComponent(NODE)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("topology-node-popover-positioner")).toBeVisible({ timeout: 90_000 });
    await chooseHex(page);
    await expect
      .poll(async () => (await readBoard(page)).tiles, { message: "the board drew no tiles", timeout: 30_000 })
      .toBe(vault.capabilities + vault.domains + 1);
    const board = await readBoard(page);
    expect(board.inked, "the canvas is blank").toBeGreaterThan(5_000);
    expect(board.marks.find((t) => t.id === NODE)?.pressed).toBe(true);
  });
}

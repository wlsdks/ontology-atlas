import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime, type DesktopRuntimeOptions } from "./desktop-rail-arrival-harness";
import { dogfoodEvidenceVault, syntheticVault } from "./hex-board-vaults";

/**
 * **The hex board names every tile, keeps every name inside its own face, counts stale
 * honestly, and walks by keyboard.**
 *
 * One capability is one tile, a domain a region of tiles round its title tile (owner decision,
 * 2026-09-25). This opens the product's own dogfood vault (`docs/ontology`) through the
 * installed-app runtime, with the Git walk answered from this repository's real history, and
 * checks the claim on the drawn result:
 *
 * - every capability is a tile, named, and no two drawn names overlap or leave their face;
 * - the stale count the board shows equals the count this spec computes with the same rule;
 * - hovering shows a one-line tooltip clear of every name; "stale only" keeps the stale tiles
 *   and recedes the rest; clicking a tile opens the flat map's inspector and routes what it
 *   needs; an arrow key moves the selection to the neighbouring tile;
 * - at 300 capabilities the board opens in the far band: one nameplate per region, none over a
 *   tile or another plate.
 *
 * Captures land in the owner's scratch folder when it exists, for the design review.
 */

const CAPTURE_DIR = "/Users/jinan/scratch/map-concepts/app-hex";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function readBoard(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="hex-board-map"]');
    const nums = (value: string | undefined) => (value ? value.split(",").map(Number) : null);
    const tiles = [...document.querySelectorAll<HTMLElement>("[data-hex-id]")].map((el) => {
      const lb = nums(el.dataset.labelBox);
      const pb = nums(el.dataset.plateBox);
      const mark = nums(el.dataset.mark)!;
      return {
        id: el.dataset.hexId!,
        kind: el.dataset.hexKind!,
        domain: el.dataset.hexDomain ?? "",
        cell: el.dataset.hexCell!,
        name: el.textContent ?? "",
        evidence: el.dataset.evidence ?? "",
        pressed: el.getAttribute("aria-pressed") === "true",
        label: lb ? { x: lb[0]!, y: lb[1]!, w: lb[2]!, h: lb[3]! } : null,
        plate: pb ? { x: pb[0]!, y: pb[1]!, w: pb[2]!, h: pb[3]! } : null,
        mark: { x: mark[0]!, y: mark[1]!, r: mark[2]! },
      };
    });
    const canvas = root?.querySelector("canvas");
    const r = canvas?.getBoundingClientRect();
    return {
      ready: root?.dataset.hexReady ?? null,
      band: root?.dataset.hexBand ?? null,
      R: Number(root?.dataset.hexR ?? 0),
      namesFrom: Number(root?.dataset.hexNamesFrom ?? 0),
      room: root?.dataset.hexRoom ?? null,
      drivers: root?.dataset.hexNamesDrivers ?? null,
      stale: root?.dataset.hexStale ?? null,
      evidence: root?.dataset.hexEvidence ?? null,
      frame: JSON.parse(canvas?.dataset.frame ?? "{}") as Record<string, unknown>,
      canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      tiles,
    };
  });
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function openHexBoard(page: Page, files: Record<string, string>, gitPathChanges?: DesktopRuntimeOptions["gitPathChanges"]) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, files, undefined, { replaceFixture: true, gitPathChanges });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("topology-view-3d")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-hex").click();
  const map = page.getByTestId("hex-board-map");
  await expect(map).toHaveAttribute("data-hex-ready", "true", { timeout: 60_000 });
  return map;
}

async function settled(page: Page) {
  // The camera and the dim cross-fade have both stopped: two identical frames in a row.
  let last = "";
  await expect
    .poll(
      async () => {
        const f = await page.locator('[data-testid="hex-board-map"] canvas').getAttribute("data-frame");
        const parsed = JSON.parse(f ?? "{}") as { offset?: number[]; R?: number; dimT?: number };
        const now = JSON.stringify([parsed.offset, parsed.R, parsed.dimT]);
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [250, 250, 250, 250, 250, 250] },
    )
    .toBe(true);
}

for (const viewport of [
  { width: 1512, height: 982 },
  { width: 1280, height: 800 },
]) {
  test(`hex board on the dogfood vault at ${viewport.width}: named, clear, honest, walkable`, async ({ page }) => {
    test.setTimeout(240_000);
    const vault = dogfoodEvidenceVault();
    await page.setViewportSize(viewport);
    const map = await openHexBoard(page, vault.files, vault.changes);
    await expect(map).toHaveAttribute("data-hex-evidence", "measured", { timeout: 30_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("hex");

    // The canvas actually painted (counted inside the page).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas');
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx || canvas.width === 0) return 0;
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const [r0, g0, b0] = [data[0]!, data[1]!, data[2]!];
            let inked = 0;
            for (let i = 0; i < data.length; i += 16) {
              if (Math.abs(data[i]! - r0) + Math.abs(data[i + 1]! - g0) + Math.abs(data[i + 2]! - b0) > 60) inked += 1;
            }
            return inked;
          }),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(5_000);
    await settled(page);

    let board = await readBoard(page);
    console.log(`[hex ${viewport.width}] room=${board.room} drivers=${board.drivers} R=${board.R} namesFrom=${board.namesFrom} band=${board.band} frame=${JSON.stringify(board.frame)}`);
    const caps = board.tiles.filter((t) => t.kind === "capability");
    expect(caps).toHaveLength(vault.capabilities);
    expect(board.tiles.filter((t) => t.kind === "domain")).toHaveLength(vault.domains);
    // The real vault opens with its names on.
    expect(board.band).toBe("names");
    expect(board.frame.spills).toBe(0);

    // Every tile is named, on screen, inside its own face; no two names overlap.
    const W = viewport.width;
    const H = viewport.height;
    for (const t of board.tiles) {
      expect(t.name.trim().length, `${t.id} has no name`).toBeGreaterThan(0);
      expect(t.label, `${t.id} drew no name`).not.toBeNull();
      const l = t.label!;
      expect(l.x >= t.mark.x - t.mark.r && l.x + l.w <= t.mark.x + t.mark.r, `${t.id} name leaves its face`).toBe(true);
      expect(l.y >= t.mark.y - t.mark.r && l.y + l.h <= t.mark.y + t.mark.r, `${t.id} name leaves its face`).toBe(true);
      expect(t.mark.x > 0 && t.mark.x < W && t.mark.y > 0 && t.mark.y < H, `${t.id} is off screen`).toBe(true);
    }
    const hits: string[] = [];
    for (let i = 0; i < board.tiles.length; i++)
      for (let j = i + 1; j < board.tiles.length; j++) if (overlap(board.tiles[i]!.label!, board.tiles[j]!.label!)) hits.push(`${board.tiles[i]!.id} × ${board.tiles[j]!.id}`);
    expect(hits).toEqual([]);

    // The stale count shown is the count the rule gives, per tile and per domain title.
    expect(Number(board.stale)).toBe(vault.expectedStale);
    expect(caps.filter((c) => c.evidence === "stale")).toHaveLength(vault.expectedStale);
    await expect(page.getByTestId("hex-board-evidence-note")).toContainText(`낡음 ${vault.expectedStale}`);
    await expect(page.getByTestId("hex-board-stale-only")).toContainText(String(vault.expectedStale));

    const canCapture = existsSync(path.dirname(CAPTURE_DIR));
    if (canCapture) mkdirSync(CAPTURE_DIR, { recursive: true });
    const shot = async (name: string) => {
      if (canCapture) await page.screenshot({ path: path.join(CAPTURE_DIR, `${name}-${viewport.width}.png`) });
    };
    await shot("a-overview");

    // Hover: a one-line tooltip beside the tile, clear of every drawn name.
    const inView = caps.filter((c) => c.mark.x > board.canvas!.x + 120 && c.mark.x < W - 200 && c.mark.y > 140 && c.mark.y < H - 160);
    const hoverTarget = inView[0]!;
    await page.mouse.move(board.canvas!.x + hoverTarget.mark.x, board.canvas!.y + hoverTarget.mark.y);
    const tip = page.getByTestId("hex-board-tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(hoverTarget.name.trim());
    const tipBox = (await tip.boundingBox())!;
    const tipHits = board.tiles.filter((t) => t.label && overlap({ x: tipBox.x - board.canvas!.x, y: tipBox.y - board.canvas!.y, w: tipBox.width, h: tipBox.height }, t.label));
    expect(tipHits.map((t) => t.id)).toEqual([]);
    await shot("e-hover");
    await page.mouse.move(2, H - 2);
    await expect(tip).toBeHidden();

    // Stale only: stale tiles stay, the rest recede.
    await page.getByTestId("hex-board-stale-only").click();
    await expect(page.getByTestId("hex-board-stale-only")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await readBoard(page)).frame.dimT).toBe(1);
    await settled(page);
    board = await readBoard(page);
    expect(board.frame.staleOnly).toBe(true);
    await shot("d-stale-only");
    await page.getByTestId("hex-board-stale-only").click();
    await expect.poll(async () => (await readBoard(page)).frame.dimT).toBe(0);
    await settled(page);
    board = await readBoard(page);

    // Click a capability: the flat map's inspector opens, its needs are routed.
    const withNeeds = [...caps]
      .filter((c) => c.mark.x > 160 && c.mark.x < W - 420 && c.mark.y > 140 && c.mark.y < H - 160)
      .sort((a, b) => a.mark.x - b.mark.x);
    let clicked: (typeof caps)[number] | null = null;
    for (const c of withNeeds) {
      await page.mouse.click(board.canvas!.x + c.mark.x, board.canvas!.y + c.mark.y);
      await expect(page.getByTestId("topology-node-popover-positioner")).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => page.locator(`[data-hex-id="${c.id}"]`).getAttribute("aria-pressed")).toBe("true");
      await expect.poll(async () => (await readBoard(page)).frame.dimT).toBe(1);
      const f = (await readBoard(page)).frame as { routes?: number };
      if ((f.routes ?? 0) > 0) {
        clicked = c;
        break;
      }
    }
    expect(clicked, "no capability with a relation was clickable").not.toBeNull();
    await expect(page.getByTestId("topology-node-popover-positioner")).toContainText(clicked!.name.trim());
    await settled(page);
    board = await readBoard(page);
    expect(board.frame.focus).toBe(clicked!.id);
    await shot("c-capability");

    // Arrow keys move the selection to the neighbouring tile.
    await page.locator('[data-testid="hex-board-map"] canvas').focus();
    const cellOf = (id: string) => board.tiles.find((t) => t.id === id)!.cell.split(",").map(Number) as [number, number];
    const byCell = new Map(board.tiles.map((t) => [t.cell, t.id] as const));
    const [q, r] = cellOf(clicked!.id);
    const up = byCell.get(`${q},${r - 1}`);
    const down = byCell.get(`${q},${r + 1}`);
    const key = up ? "ArrowUp" : down ? "ArrowDown" : "ArrowRight";
    await page.keyboard.press(key);
    await expect.poll(async () => (await readBoard(page)).tiles.find((t) => t.pressed)?.id).not.toBe(clicked!.id);
    const moved = (await readBoard(page)).tiles.find((t) => t.pressed)!;
    if (up || down) expect(moved.id).toBe(up ?? down);
    await expect(page.getByTestId("topology-node-popover-positioner")).toContainText(moved.name.trim());

    // A domain title: region focus.
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await readBoard(page)).frame.dimT).toBe(0);
    await settled(page);
    board = await readBoard(page);
    const domain = board.tiles.filter((t) => t.kind === "domain").sort((a, b) => a.mark.x - b.mark.x)[0]!;
    await page.mouse.click(board.canvas!.x + domain.mark.x, board.canvas!.y + domain.mark.y);
    await expect.poll(async () => (await readBoard(page)).frame.focus).toBe(domain.id);
    await settled(page);
    await shot("b-domain-focus");
  });
}

test("hex board assembles once per folder, ring by ring, settled within 600 ms", async ({ page }) => {
  test.setTimeout(240_000);
  const vault = dogfoodEvidenceVault();
  await page.setViewportSize({ width: 1512, height: 982 });
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("topology-view-3d")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("topology-view-3d").click();
  // A frame sampler in the page, started before the board mounts: every painted frame's
  // arrival flag and time (the canvas writes its frame stats on every paint).
  await page.evaluate(() => {
    const w = window as unknown as { __hexFrames: { t: number; arrived: boolean }[] };
    w.__hexFrames = [];
    let last = "";
    const tick = (t: number) => {
      const f = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')?.dataset.frame;
      if (f && f !== last) {
        last = f;
        w.__hexFrames.push({ t, arrived: (JSON.parse(f) as { arrived: boolean }).arrived });
      }
      if (w.__hexFrames.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByTestId("topology-view-3d-choice-hex").click();
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 60_000 });
  const frames = await page.evaluate(() => (window as unknown as { __hexFrames: { t: number; arrived: boolean }[] }).__hexFrames);
  const moving = frames.filter((f) => !f.arrived);
  const settledAt = frames.find((f, i) => f.arrived && i > 0 && !frames[i - 1]!.arrived);
  console.log(`[hex arrival] frames=${frames.length} moving=${moving.length} span=${moving.length ? Math.round(moving[moving.length - 1]!.t - moving[0]!.t) : 0}ms`);
  expect(moving.length, "the board never assembled").toBeGreaterThan(3);
  expect(settledAt!.t - moving[0]!.t).toBeLessThanOrEqual(600 + 60);
  // Once per folder: a second visit to the view arrives still.
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-flat").click();
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-hex").click();
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 60_000 });
  const again = JSON.parse((await page.locator('[data-testid="hex-board-map"] canvas').getAttribute("data-frame")) ?? "{}") as { arrived?: boolean };
  expect(again.arrived).toBe(true);
});

test("hex board at 300 capabilities opens on region nameplates, none over a tile or another plate", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  const map = await openHexBoard(page, syntheticVault(300, 18));
  await expect(map).toHaveAttribute("data-hex-capabilities", "300");
  await settled(page);
  const board = await readBoard(page);
  console.log(`[hex 300] R=${board.R} band=${board.band} frame=${JSON.stringify(board.frame)}`);
  expect(board.band).toBe("regions");
  const plates = board.tiles.filter((t) => t.plate).map((t) => ({ id: t.id, box: t.plate! }));
  expect(plates).toHaveLength(19);
  const hits: string[] = [];
  for (let i = 0; i < plates.length; i++) {
    for (let j = i + 1; j < plates.length; j++) if (overlap(plates[i]!.box, plates[j]!.box)) hits.push(`${plates[i]!.id} × ${plates[j]!.id}`);
    for (const t of board.tiles) {
      const r = t.mark.r;
      if (overlap(plates[i]!.box, { x: t.mark.x - r, y: t.mark.y - r * 0.866, w: 2 * r, h: 2 * r * 0.866 })) hits.push(`${plates[i]!.id} × tile ${t.id}`);
    }
  }
  expect(hits).toEqual([]);
  if (existsSync(path.dirname(CAPTURE_DIR))) {
    mkdirSync(CAPTURE_DIR, { recursive: true });
    await page.screenshot({ path: path.join(CAPTURE_DIR, "f-scale-300-1512.png") });
  }
});

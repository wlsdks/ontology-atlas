import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodEvidenceVault } from "./hex-board-vaults";

/**
 * **A hex board route never leaves the free map.**
 *
 * Owner report (2026-09-25, installed app, 1512x949, `docs/ontology`): with the domain
 * meaning layer (`DOMAIN_NAME`) selected, the inspector open and INDEX folded, the routed relation lines left the
 * board, ran along the very top of the canvas under the map toolbar (the trail chip and the
 * tool tiles) and came back down. The router searched a lattice padded two rings past the
 * board, and nothing told it where the chrome was.
 *
 * This opens the product's own dogfood vault through the installed-app runtime and, at 1280
 * and 1512, with a domain and then a capability selected and INDEX folded and then open,
 * holds every drawn route (`canvas[data-route-paths]`, canvas px) to the free map:
 *
 * - below the toolbar's real bottom (the lowest visible control inside it), right of INDEX
 *   (the open panel or the folded tab), left of the inspector, above the board's footer
 *   (the two chips and the legend);
 * - and at every sampled point the element under it is the canvas itself, so no toolbar
 *   control, tab, panel or chip is drawn over a route.
 */

const DOMAIN_NAME = "의미 계층";

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function openHexBoard(page: Page) {
  const vault = dogfoodEvidenceVault();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("topology-view-3d")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-hex").click();
  const map = page.getByTestId("hex-board-map");
  await expect(map).toHaveAttribute("data-hex-ready", "true", { timeout: 60_000 });
  await expect(map).toHaveAttribute("data-hex-evidence", "measured", { timeout: 30_000 });
}

async function settled(page: Page) {
  let last = "";
  await expect
    .poll(
      async () => {
        const canvas = page.locator('[data-testid="hex-board-map"] canvas');
        const now = `${await canvas.getAttribute("data-frame")}|${await canvas.getAttribute("data-route-paths")}`;
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [300, 300, 300, 300, 300, 300, 300, 300] },
    )
    .toBe(true);
  // Panels finish their own transitions (INDEX fold, inspector arrival) before we measure.
  await page.waitForTimeout(700);
  last = "";
  await expect
    .poll(
      async () => {
        const now = (await page.locator('[data-testid="hex-board-map"] canvas').getAttribute("data-route-paths")) ?? "";
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [300, 300, 300, 300, 300, 300] },
    )
    .toBe(true);
}

/** Click a tile: on the canvas when its centre is free, otherwise through its mirror button. */
async function selectTile(page: Page, id: string) {
  const how = await page.evaluate((tileId) => {
    const el = document.querySelector<HTMLElement>(`[data-hex-id="${CSS.escape(tileId)}"]`);
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas');
    if (!el || !canvas) return null;
    const [mx, my] = (el.dataset.mark ?? "").split(",").map(Number);
    const r = canvas.getBoundingClientRect();
    const x = r.x + mx!;
    const y = r.y + my!;
    if (document.elementFromPoint(x, y) === canvas) return { x, y };
    el.click();
    return { x: -1, y: -1 };
  }, id);
  expect(how, `tile ${id} not found`).not.toBeNull();
  if (how!.x >= 0) await page.mouse.click(how!.x, how!.y);
  await expect.poll(() => page.locator(`[data-hex-id="${id}"]`).getAttribute("aria-pressed")).toBe("true");
  await expect(page.getByTestId("topology-node-popover-positioner")).toBeVisible({ timeout: 15_000 });
}

/** The free map, measured from the chrome itself (page px), and every route's sampled points. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      const b = el.getBoundingClientRect();
      return b.width > 1 && b.height > 1;
    };
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')!;
    const c = canvas.getBoundingClientRect();
    let top = c.top;
    const toolbar = document.querySelector('[data-testid="topology-top-toolbar"]');
    const controls: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const el of toolbar ? [...toolbar.querySelectorAll("*")] : []) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.bottom <= c.top || b.top >= c.bottom) continue;
      top = Math.max(top, b.bottom);
      controls.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom });
    }
    let left = c.left;
    for (const sel of ['[data-testid="topology-index-panel"]', '[data-testid="topology-index-tab"]']) {
      for (const el of document.querySelectorAll(sel)) if (visible(el)) left = Math.max(left, el.getBoundingClientRect().right);
    }
    let right = c.right;
    const inspector = document.querySelector('[data-testid="topology-node-popover-positioner"]');
    if (inspector && visible(inspector)) right = Math.min(right, inspector.getBoundingClientRect().left);
    let bottom = c.bottom;
    const footer = document.querySelector('[data-testid="hex-board-footer"]');
    for (const el of footer ? [...footer.children] : []) if (visible(el)) bottom = Math.min(bottom, el.getBoundingClientRect().top);
    const routes = JSON.parse(canvas.dataset.routePaths ?? "[]") as { role: string; stub: boolean; pts: [number, number][] }[];
    const samples = routes.map((r) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < r.pts.length; i += 1) {
        const [x, y] = r.pts[i]!;
        pts.push([c.left + x, c.top + y]);
        const next = r.pts[i + 1];
        if (next) for (const t of [0.25, 0.5, 0.75]) pts.push([c.left + x + (next[0] - x) * t, c.top + y + (next[1] - y) * t]);
      }
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const box = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
      const covered = pts
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) !== canvas)
        .map(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return `${Math.round(x)},${Math.round(y)} under ${hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName}`;
        });
      const underControl = pts.filter(([x, y]) => controls.some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)).length;
      return { role: r.role, stub: r.stub, box, count: pts.length, covered, underControl };
    });
    const index = document.documentElement.dataset.topologyIndex ?? "expanded";
    return { free: { left, top, right, bottom }, index, samples };
  });
}

function outside(box: Rect, free: Rect): string[] {
  const out: string[] = [];
  if (box.top < free.top) out.push(`top ${Math.round(box.top)} < ${Math.round(free.top)}`);
  if (box.left < free.left) out.push(`left ${Math.round(box.left)} < ${Math.round(free.left)}`);
  if (box.right > free.right) out.push(`right ${Math.round(box.right)} > ${Math.round(free.right)}`);
  if (box.bottom > free.bottom) out.push(`bottom ${Math.round(box.bottom)} > ${Math.round(free.bottom)}`);
  return out;
}

async function holdRoutes(page: Page, label: string, minRoutes: number) {
  await settled(page);
  const m = await measure(page);
  const f = m.free;
  console.log(
    `[hex routes ${label}] index=${m.index} free=${Math.round(f.left)},${Math.round(f.top)}–${Math.round(f.right)},${Math.round(f.bottom)} routes=${m.samples.length} stubs=${m.samples.filter((s) => s.stub).length} minTop=${Math.round(Math.min(...m.samples.map((s) => s.box.top)))} minLeft=${Math.round(Math.min(...m.samples.map((s) => s.box.left)))} maxBottom=${Math.round(Math.max(...m.samples.map((s) => s.box.bottom)))}`,
  );
  if (process.env.HEX_ROUTES_SHOTS) await page.screenshot({ path: `${process.env.HEX_ROUTES_SHOTS}/${label.replace(/[^a-z0-9]+/gi, "-")}.png` });
  expect(m.samples.length, `${label}: no routes drawn`).toBeGreaterThanOrEqual(minRoutes);
  const problems: string[] = [];
  m.samples.forEach((s, i) => {
    const o = outside(s.box, f);
    if (o.length) problems.push(`route ${i} (${s.role}) leaves the free map: ${o.join("; ")}`);
    if (s.underControl) problems.push(`route ${i} (${s.role}): ${s.underControl} points under a toolbar control`);
    if (s.covered.length) problems.push(`route ${i} (${s.role}) covered at ${s.covered.slice(0, 3).join(" | ")}`);
  });
  expect(problems, label).toEqual([]);
}

for (const viewport of [
  { width: 1512, height: 949 },
  { width: 1280, height: 800 },
]) {
  test(`hex board routes stay in the free map at ${viewport.width}: domain and capability, INDEX folded and open`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);
    await openHexBoard(page);
    await settled(page);

    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-hex-id]")].map((el) => ({
        id: el.dataset.hexId!,
        kind: el.dataset.hexKind!,
        domain: el.dataset.hexDomain ?? "",
        name: (el.textContent ?? "").trim(),
      })),
    );
    const domain = tiles.find((t) => t.kind === "domain" && t.name === DOMAIN_NAME);
    expect(domain, `${DOMAIN_NAME} is on the board`).toBeTruthy();

    // A domain: INDEX folds itself for the selection.
    await selectTile(page, domain!.id);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.topologyIndex ?? "expanded")).toBe("collapsed");
    await holdRoutes(page, `${viewport.width} domain, INDEX folded`, 3);

    // The same selection with INDEX opened by hand.
    await page.getByTestId("topology-index-tab").click();
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    await holdRoutes(page, `${viewport.width} domain, INDEX open`, 3);

    // A capability of that domain that needs something, INDEX open, then folded.
    const caps = tiles.filter((t) => t.kind === "capability" && t.domain === domain!.id);
    let chosen: string | null = null;
    for (const cap of caps) {
      await selectTile(page, cap.id);
      await settled(page);
      const routes = JSON.parse((await page.locator('[data-testid="hex-board-map"] canvas').getAttribute("data-route-paths")) ?? "[]") as unknown[];
      if (routes.length >= 2) {
        chosen = cap.id;
        break;
      }
    }
    expect(chosen, "a capability of the domain with routes").not.toBeNull();
    if (await page.getByTestId("topology-index-panel").isVisible()) {
      await holdRoutes(page, `${viewport.width} capability, INDEX open`, 1);
      await page.getByTestId("topology-index-fold").click();
    }
    await expect(page.getByTestId("topology-index-tab")).toBeVisible();
    await holdRoutes(page, `${viewport.width} capability, INDEX folded`, 1);
  });
}

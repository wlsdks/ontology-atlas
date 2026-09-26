import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodVaultFiles } from "./dogfood-vault-files";
import { waitForAnimationsDone, waitForBoxStill, waitForDomeEntered, waitForMapStill } from "./settle";

/**
 * **Map canvas surfaces stand where they belong, keep one grammar, and hand focus back**
 * (interaction audit, 2026-09-25). Each case is a defect measured on the product's own vault
 * (`docs/ontology`) and is judged here the way it was found: by rects, computed styles and
 * `document.activeElement`, never by eye.
 *
 * - the node context menu takes focus, so the arrow keys move inside it and not the map;
 * - the edge hover card never lands on the INDEX panel or the utility tiles;
 * - the lit 3D legend holds no drawn node;
 * - in Territories the legend stands between the panels, the selected name stays clear of the
 *   inspector, the element list leaves its domain's title readable, and the evidence note is
 *   never cut off;
 * - the detail panel's action row is one height and one radius, the edge panel shares its width
 *   and primary grammar, and "+N more" is set in body type on the row text's column;
 * - the tour's first step offers no dead [back], and its relation/datasheet cards leave the
 *   nodes they explain in view;
 * - closing full detail, folding INDEX, clearing the INDEX search and ending the tour leave
 *   focus somewhere a keyboard can continue from, not on `<body>`;
 * - "add to map" on a vault that already has a project says so.
 *
 * Captures land in the owner's scratch folder when it exists.
 */

const CAPTURE_DIR = process.env.MAP_CANVAS_CAPTURE_DIR ?? "/Users/jinan/scratch/ix/map-canvas/after";
try {
  mkdirSync(CAPTURE_DIR, { recursive: true });
} catch {
  /* not on the owner's machine */
}
const capture = (page: Page, name: string) => page.screenshot({ path: `${CAPTURE_DIR}/${name}.png` }).catch(() => {});

type Box = { x: number; y: number; w: number; h: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (b: Box, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

async function arrive(page: Page, viewport: { width: number; height: number }, extraFiles: Record<string, string> = {}) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, { ...dogfoodVaultFiles(), ...extraFiles }, undefined, { replaceFixture: true });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await page.waitForFunction(
    () => ((window as unknown as { __atlasMap?: { nodes: () => unknown[] } }).__atlasMap?.nodes().length ?? 0) > 20,
    undefined,
    { timeout: 60_000 },
  );
  await waitForMapStill(page).catch(() => {});
}

type DrawnNode = { id: string; label: string; kind: string; x: number; y: number; hidden: boolean };
/** Drawn nodes in page coordinates. */
async function drawnNodes(page: Page): Promise<DrawnNode[]> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { nodes: () => DrawnNode[] } }).__atlasMap;
    const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
    return m.nodes().filter((n) => !n.hidden).map((n) => ({ ...n, x: n.x + c.x, y: n.y + c.y }));
  });
}

async function rectOf(page: Page, testid: string): Promise<Box | null> {
  return page.evaluate((t) => {
    const el = document.querySelector(`[data-testid="${t}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, testid);
}

const activeTestId = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return "BODY";
    return a.dataset.testid ?? a.getAttribute("role") ?? a.tagName;
  });

/** A domain drawn well inside the canvas, away from INDEX and the right-hand tiles. */
async function pickDomain(page: Page) {
  const nodes = await drawnNodes(page);
  const vw = page.viewportSize()!.width;
  const pick = nodes.find((n) => n.kind === "domain" && n.x > 420 && n.x < vw - 420);
  expect(pick, "no domain drawn in the middle of the canvas").toBeDefined();
  return pick!;
}

test.describe("map canvas interactions on the dogfood vault", () => {
  test.setTimeout(150_000);

  test("MC-01: the context menu takes focus, walks with the arrows, and gives focus back to the canvas", async ({ page }) => {
    await arrive(page, { width: 1512, height: 949 });
    const domain = await pickDomain(page);
    await page.mouse.click(domain.x, domain.y, { button: "right" });
    const menu = page.getByTestId("map-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-label", /.+/);
    // Focus lands on the first item, inside the menu.
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menuitem");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(400);
    // The arrow moved inside the menu; the map did not walk and open a panel behind it.
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="map-context-menu"]') !== null)).toBe(true);
    await expect(page.getByTestId("map-detail-panel")).toHaveCount(0);
    await capture(page, "mc01-ctx-arrowdown");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect.poll(() => activeTestId(page)).toBe("ontology-map-canvas");
  });

  test("MC-04: the edge hover card never lands on INDEX or the utility tiles", async ({ page }) => {
    await arrive(page, { width: 1040, height: 720 });
    const index = await rectOf(page, "topology-index-panel");
    expect(index, "INDEX is open at arrival").not.toBeNull();
    const chrome = (await Promise.all(
      ["topology-index-panel", "topology-replay-growth", "topology-shortcuts-help-button", "topology-tour-button"].map((t) => rectOf(page, t)),
    )).filter((r): r is Box => r !== null);
    const midpoints = await page.evaluate(() => {
      const m = (window as unknown as {
        __atlasMap: { edges: () => Array<{ visible: boolean; hidden: boolean; ax: number; ay: number; bx: number; by: number; controlX: number; controlY: number }> };
      }).__atlasMap;
      const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
      return m
        .edges()
        .filter((e) => e.visible && !e.hidden)
        .map((e) => ({ x: c.x + 0.25 * e.ax + 0.5 * e.controlX + 0.25 * e.bx, y: c.y + 0.25 * e.ay + 0.5 * e.controlY + 0.25 * e.by }));
    });
    // Every edge midpoint on the free map — the ones near INDEX are the ones that used to fail.
    const free = midpoints.filter((p) => !chrome.some((r) => contains(r, p)) && p.x > 0 && p.x < 1040 && p.y > 0 && p.y < 720);
    expect(free.length, "edges to hover").toBeGreaterThan(3);
    let hovered = 0;
    for (const p of free.slice(0, 12)) {
      await page.mouse.move(p.x, p.y);
      const card = page.getByTestId("map-edge-hover-card");
      if (!(await card.isVisible().catch(() => false))) continue;
      const box = (await rectOf(page, "map-edge-hover-card"))!;
      hovered += 1;
      for (const r of chrome) expect(intersects(box, r), `hover card ${JSON.stringify(box)} over chrome ${JSON.stringify(r)} at ${p.x},${p.y}`).toBe(false);
    }
    expect(hovered, "at least one edge answered with its card").toBeGreaterThan(0);
    await capture(page, "mc04-edge-hover-1040");
  });

  test("MC-05: the strata legend holds no drawn node and never breaks a lone syllable", async ({ page }) => {
    await arrive(page, { width: 1040, height: 720 });
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-strata").click();
    await waitForDomeEntered(page, 60_000);
    await waitForMapStill(page).catch(() => {});
    await page.waitForTimeout(600);
    const legend = (await rectOf(page, "topology-light-legend"))!;
    expect(legend).not.toBeNull();
    const nodes = await drawnNodes(page);
    const under = nodes.filter((n) => contains(legend, n));
    expect(under.map((n) => n.label), "drawn nodes under the legend").toEqual([]);
    const note = page.getByTestId("topology-light-legend-note");
    if (await note.count()) await expect(note).toHaveCSS("word-break", "keep-all");
    await capture(page, "mc05-strata-1040");
  });

  test("MC-03/MC-16: Territories keeps the legend, the selected name and the domain title clear", async ({ page }) => {
    await arrive(page, { width: 1280, height: 800 });
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-territories").click();
    const map = page.getByTestId("territories-map");
    await expect(map).toHaveAttribute("data-territories-ready", "true", { timeout: 60_000 });
    // The capability with the most elements — its list is the tallest callout.
    const target = await page.evaluate(() => {
      const caps = [...document.querySelectorAll<HTMLElement>('[data-territory-kind="capability"]')];
      const named = caps.find((c) => c.textContent?.includes("라이브러리 작업대"));
      const el = named ?? caps[0]!;
      const [x, y, w, h] = (el.dataset.labelBox ?? "").split(",").map(Number);
      return { id: el.dataset.territoryId!, domain: el.dataset.territoryDomain!, x: x! + w! / 2, y: y! + h! / 2 };
    });
    const canvas = (await rectOf(page, "territories-map"))!;
    await page.mouse.click(canvas.x + target.x, canvas.y + target.y);
    const panel = page.getByTestId("map-detail-panel");
    await expect(panel).toBeVisible();
    await page.waitForTimeout(900);
    const panelBox = (await rectOf(page, "map-detail-panel"))!;
    const legendPill = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="territories-legend"] > p')!.getBoundingClientRect();
      return { x: p.x, y: p.y, w: p.width, h: p.height };
    });
    expect(intersects(legendPill, panelBox), `legend ${JSON.stringify(legendPill)} under the panel ${JSON.stringify(panelBox)}`).toBe(false);
    const drawn = await page.evaluate((ids) => {
      const read = (id: string) => {
        const el = document.querySelector<HTMLElement>(`[data-territory-id="${id}"]`)!;
        const [x, y, w, h] = (el.dataset.labelBox ?? "").split(",").map(Number);
        return { x: x!, y: y!, w: w!, h: h! };
      };
      const frame = JSON.parse(document.querySelector<HTMLCanvasElement>('[data-testid="territories-map"] canvas')!.dataset.frame ?? "{}");
      return { label: read(ids.id), domain: read(ids.domain), callout: frame.callout as [number, number, number, number] | null };
    }, target);
    const toPage = (b: Box) => ({ x: b.x + canvas.x, y: b.y + canvas.y, w: b.w, h: b.h });
    // The selected name is in the free map, not cut by the panel's edge.
    expect(toPage(drawn.label).x + drawn.label.w, "selected name runs under the panel").toBeLessThanOrEqual(panelBox.x);
    // The element list leaves its domain's title and counts readable.
    if (drawn.callout) {
      const [x, y, w, h] = drawn.callout;
      expect(intersects({ x, y, w, h }, drawn.domain), "element list over its domain title").toBe(false);
    }
    await capture(page, "mc03-territories-select-1280");

    // At 1040 the evidence note is shown whole, however many lines it takes.
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.waitForTimeout(800);
    const note = page.getByTestId("territories-evidence-note");
    const clipped = await note.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === "ellipsis");
    expect(clipped, "the evidence note is cut off").toBe(false);
    await capture(page, "mc16-territories-1040");
  });

  test("MC-07/MC-12/MC-13: one action grammar across the node and edge panels", async ({ page }) => {
    await arrive(page, { width: 1512, height: 949 });
    const domain = await pickDomain(page);
    await page.mouse.click(domain.x, domain.y);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await page.waitForTimeout(500);
    const row = await page.evaluate(() => {
      const actions = document.querySelector('[data-testid="map-detail-panel-actions"]')!;
      return [...actions.querySelectorAll<HTMLElement>(":scope > button, :scope > div > button")].map((b) => {
        const r = b.getBoundingClientRect();
        const text = b.textContent?.trim() ? getComputedStyle(b).fontSize : null;
        return { h: Math.round(r.height), radius: getComputedStyle(b).borderTopLeftRadius, text };
      });
    });
    expect(row.length).toBeGreaterThanOrEqual(2);
    expect(new Set(row.map((r) => r.h)).size, `heights ${JSON.stringify(row)}`).toBe(1);
    expect(new Set(row.map((r) => r.radius)).size, `radii ${JSON.stringify(row)}`).toBe(1);
    // Round 2: the labelled controls set their words in one size ("Edit" was 11px beside a
    // 14px primary), and the footer's full-detail control wears the row's radius, not 9px.
    expect(new Set(row.map((r) => r.text).filter(Boolean)).size, `type sizes ${JSON.stringify(row)}`).toBe(1);
    const fullDetailRadius = await page
      .getByTestId("map-detail-panel-open-full-detail")
      .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(fullDetailRadius).toBe(row[0]!.radius);
    const more = page.locator('[data-testid^="map-group-more-"]').first();
    if (await more.count()) {
      // The words, not the control box: the control spans the row, its label sits on the text column.
      const m = await more.evaluate((el) => {
        const words = el.querySelector(":scope > span:last-child") ?? el;
        return { family: getComputedStyle(words).fontFamily, x: words.getBoundingClientRect().x };
      });
      expect(m.family.toLowerCase()).not.toContain("mono");
      const rowText = await page.evaluate(() => {
        const span = document.querySelector("[data-datasheet-connection] span.truncate, [data-datasheet-connection] span:last-child")!;
        return span.getBoundingClientRect().x;
      });
      expect(Math.abs(m.x - rowText), "'+N more' starts on the row text column").toBeLessThanOrEqual(1);
    }
    const nodePanelWidth = (await rectOf(page, "map-detail-panel"))!.w;
    await capture(page, "mc07-detail-panel");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // The same slot for an edge: same width, same primary grammar. The two Escapes reframe the
    // camera, so the line is read where it rests, not mid-flight.
    await expect(page.getByTestId("map-detail-panel")).toHaveCount(0);
    await waitForMapStill(page).catch(() => {});
    const edge = await page.evaluate(() => {
      const m = (window as unknown as {
        __atlasMap: { edges: () => Array<{ visible: boolean; hidden: boolean; ax: number; ay: number; bx: number; by: number; controlX: number; controlY: number; kind: string }> };
      }).__atlasMap;
      const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
      const e = m.edges().find((x) => x.visible && !x.hidden && Math.hypot(x.bx - x.ax, x.by - x.ay) > 160)!;
      return { x: c.x + 0.25 * e.ax + 0.5 * e.controlX + 0.25 * e.bx, y: c.y + 0.25 * e.ay + 0.5 * e.controlY + 0.25 * e.by };
    });
    await page.mouse.click(edge.x, edge.y);
    const edgePanel = page.getByTestId("map-edge-panel");
    await expect(edgePanel).toBeVisible();
    expect(Math.round((await rectOf(page, "map-edge-panel"))!.w)).toBe(Math.round(nodePanelWidth));
    const edit = page.getByTestId("map-edge-edit");
    if (await edit.count()) {
      const e = await edit.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), radius: getComputedStyle(el).borderTopLeftRadius }));
      expect(e).toEqual({ h: row[0]!.h, radius: row[0]!.radius });
    }
    await capture(page, "mc13-edge-panel");
  });

  test("MC-14/MC-11/MC-10e: the tour offers no dead back, keeps its subjects in view, and ends on its tile", async ({ page }) => {
    await arrive(page, { width: 1512, height: 949 });
    await page.getByTestId("topology-tour-button").click();
    await expect(page.getByTestId("guided-tour-card")).toBeVisible();
    await expect(page.getByTestId("guided-tour-back")).toHaveCount(0);
    const nextBefore = (await rectOf(page, "guided-tour-next"))!;
    for (let i = 0; i < 12; i++) {
      const step = await page.getByTestId("guided-tour-overlay").getAttribute("data-tour-step");
      // Settle on what the step shows, not on a clock: a fixed 700 ms read the card mid-entrance
      // on a slow CI runner and saw the Next button 74 px off (lesson cb5fbfaf).
      const tourCard = page.getByTestId("guided-tour-card");
      await waitForAnimationsDone(tourCard);
      await waitForBoxStill(tourCard);
      await waitForMapStill(page);
      const card = (await rectOf(page, "guided-tour-card"))!;
      if (step === "nodes") {
        // [next] did not move between step 1 and step 2.
        const nextAfter = (await rectOf(page, "guided-tour-next"))!;
        expect(Math.round(nextAfter.x + nextAfter.w)).toBe(Math.round(nextBefore.x + nextBefore.w));
      }
      if (step === "relations" || step === "datasheet") {
        const labels = await page.evaluate(() => {
          const m = (window as unknown as { __atlasMap: { labels: () => Array<{ nodeId: string; minX: number; minY: number; maxX: number; maxY: number }>; selection: () => { nodeId: string | null } } }).__atlasMap;
          const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
          return {
            selected: m.selection().nodeId,
            boxes: m.labels().map((b) => ({ id: b.nodeId, x: c.x + b.minX, y: c.y + b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY })),
          };
        });
        const covered = labels.boxes.filter((b) => intersects(card, b));
        if (step === "datasheet") {
          expect(covered.map((b) => b.id), "the datasheet card covers the node it describes").not.toContain(labels.selected);
        } else {
          const heads = covered.filter((b) => b.id.startsWith("domain:") || b.id.startsWith("project:"));
          expect(heads.map((b) => b.id), "the relations card covers a domain or the project").toEqual([]);
        }
        await capture(page, `mc11-tour-${step}`);
      }
      const finish = page.getByTestId("guided-tour-finish-tour");
      if (await finish.count()) {
        await finish.click();
        break;
      }
      const next = page.getByTestId("guided-tour-next");
      if (await next.count()) await next.click();
      else if (await page.getByTestId("guided-tour-activate-target").count()) await page.getByTestId("guided-tour-activate-target").click();
      else if (await page.getByTestId("guided-tour-finish").count()) {
        await page.getByTestId("guided-tour-finish").click();
        break;
      } else break;
    }
    await expect(page.getByTestId("guided-tour-overlay")).toHaveCount(0);
    await expect.poll(() => activeTestId(page)).toBe("topology-tour-button");
  });

  test("MC-10: full detail, INDEX fold and INDEX search hand focus back", async ({ page }) => {
    await arrive(page, { width: 1512, height: 949 });
    // (f) Esc in a non-empty INDEX search clears it and keeps the caret there.
    const search = page.getByTestId("topology-index-search");
    await search.fill("지도");
    await search.press("Escape");
    await expect(search).toHaveValue("");
    expect(await activeTestId(page)).toBe("topology-index-search");

    // (c) folding INDEX lands on the tab; unfolding lands on the fold button.
    await page.getByTestId("topology-index-fold").click();
    await expect.poll(() => activeTestId(page)).toBe("topology-index-tab");
    await page.getByTestId("topology-index-tab").click();
    await expect.poll(() => activeTestId(page)).toBe("topology-index-fold");

    // (d) full detail closes back to its own button.
    const domain = await pickDomain(page);
    await page.mouse.click(domain.x, domain.y);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await page.getByTestId("map-detail-panel-open-full-detail").click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await expect.poll(() => activeTestId(page)).toBe("map-detail-panel-open-full-detail");
  });

  test("MC-09/MC-10a: adding to an existing map says so, matches its sibling dialog, and returns focus", async ({ page }) => {
    await arrive(page, { width: 1512, height: 949 }, { "notes/loose-note.md": "# A loose note\n\nNo frontmatter yet.\n" });
    const row = page.getByTestId("topology-index-uncataloged-docs");
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const panel = page.getByTestId("ontology-bootstrap-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("aria-label", "지도에 추가");
    await expect(page.getByTestId("ontology-bootstrap-title")).toHaveCount(0);
    // Round 2: with the name field gone, focus still opens inside the dialog, on the first
    // folder choice, never on <body> with the backdrop as the first Tab stop.
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="ontology-bootstrap-panel"]')))
      .toBe(true);
    expect(await activeTestId(page)).toMatch(/^ontology-bootstrap-domain-/);
    const confirm = page.getByTestId("ontology-bootstrap-confirm");
    await expect(confirm).toContainText("지도에 추가");
    expect(Math.round((await rectOf(page, "ontology-bootstrap-confirm"))!.h)).toBe(40);
    await capture(page, "mc09-add-to-map");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect.poll(() => activeTestId(page)).toBe("topology-index-uncataloged-docs");
  });

  for (const viewport of [
    { width: 1040, height: 720 },
    { width: 1280, height: 800 },
    { width: 1512, height: 949 },
  ]) {
    test(`MC-02: every name Territories shows at rest is readable at ${viewport.width}`, async ({ page }) => {
      await arrive(page, viewport);
      await page.getByTestId("topology-view-3d").click();
      await page.getByTestId("topology-view-3d-choice-territories").click();
      await expect(page.getByTestId("territories-map")).toHaveAttribute("data-territories-ready", "true", { timeout: 60_000 });
      await page.waitForTimeout(600);
      // Each name drawn at rest, probed at its four corners and its centre: the canvas must be
      // what is there — not INDEX, a tile, the legend, or the edge of the window.
      const hidden = await page.evaluate(() => {
        const wrap = document.querySelector<HTMLElement>('[data-testid="territories-map"]')!;
        const c = wrap.getBoundingClientRect();
        const out: string[] = [];
        let shown = 0;
        for (const el of document.querySelectorAll<HTMLElement>("[data-territory-id]")) {
          if (!el.dataset.labelBox || el.dataset.labelShown === "on-focus") continue;
          shown += 1;
          const [x, y, w, h] = el.dataset.labelBox.split(",").map(Number) as [number, number, number, number];
          const points = [[x + 2, y + 2], [x + w - 2, y + 2], [x + 2, y + h - 2], [x + w - 2, y + h - 2], [x + w / 2, y + h / 2]];
          for (const [px, py] of points as [number, number][]) {
            const X = c.x + px;
            const Y = c.y + py;
            const onScreen = X >= 0 && Y >= 0 && X <= innerWidth && Y <= innerHeight;
            const hit = onScreen ? document.elementFromPoint(X, Y) : null;
            if (!hit || hit.tagName !== "CANVAS") {
              const by = hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? (onScreen ? hit?.tagName : "off-screen");
              out.push(`${el.textContent} at ${Math.round(X)},${Math.round(Y)} under ${by}`);
              break;
            }
          }
        }
        return { shown, hidden: out };
      });
      expect(hidden.shown, "names drawn at rest").toBeGreaterThan(10);
      expect(hidden.hidden, "names drawn under chrome or off the window").toEqual([]);
    });
  }

  /*
   * Round 2 (2026-09-25). Escape closes the inspector and keeps the selection; INDEX unfolds
   * again. The map must measure again: the legend stretches back between the panels, and the
   * camera returns to the room so no drawn name stands under INDEX. With INDEX folded and the
   * inspector open, the dependency the selection's arrow points at is drawn whole, not cut by
   * the canvas edge.
   */
  test("MC-02/MC-03 round 2: Territories measures again when the chrome moves", async ({ page }) => {
    await arrive(page, { width: 1040, height: 720 });
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-territories").click();
    await expect(page.getByTestId("territories-map")).toHaveAttribute("data-territories-ready", "true", { timeout: 60_000 });
    await page.waitForTimeout(800);
    const legendAtRest = await page.evaluate(() => {
      const r = document.querySelector("[data-territories-legend-pill]")!.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    /** Names drawn (always shown, or lit under the selection) that are not the canvas at a corner. */
    const unreadable = (litOnly: boolean) =>
      page.evaluate((onlyLit) => {
        const wrap = document.querySelector<HTMLElement>('[data-testid="territories-map"]')!;
        const c = wrap.getBoundingClientRect();
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("[data-territory-id]")) {
          if (!el.dataset.labelBox) continue;
          const lit = el.dataset.lit === "true";
          if (onlyLit ? !lit : el.dataset.labelShown === "on-focus" && !lit) continue;
          const [x, y, w, h] = el.dataset.labelBox.split(",").map(Number) as [number, number, number, number];
          for (const [px, py] of [[x + 2, y + 2], [x + w - 2, y + 2], [x + 2, y + h - 2], [x + w - 2, y + h - 2]] as [number, number][]) {
            const X = c.x + px;
            const Y = c.y + py;
            const hit = X >= c.x && Y >= c.y && X <= c.right && Y <= c.bottom ? document.elementFromPoint(X, Y) : null;
            if (!hit || hit.tagName !== "CANVAS") {
              out.push(`${el.textContent} at ${Math.round(X)},${Math.round(Y)} under ${hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? "the canvas edge"}`);
              break;
            }
          }
        }
        return out;
      }, litOnly);
    const target = await page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLElement>('[data-territory-kind="capability"]')].find((c) =>
        c.textContent?.includes("라이브러리 작업대"),
      )!;
      const [x, y, w, h] = (el.dataset.labelBox ?? "").split(",").map(Number);
      const c = document.querySelector('[data-testid="territories-map"]')!.getBoundingClientRect();
      return { x: c.x + x! + w! / 2, y: c.y + y! + h! / 2 };
    });
    await page.mouse.click(target.x, target.y);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await unreadable(true), "a lit name cut by the canvas edge or chrome").toEqual([]);
    await capture(page, "mc02-r2-territories-selected-1040");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-detail-panel")).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(await unreadable(false), "a drawn name under INDEX after Escape").toEqual([]);
    const legendAfter = await page.evaluate(() => {
      const r = document.querySelector("[data-territories-legend-pill]")!.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    expect(Math.abs(legendAfter.w - legendAtRest.w), `legend ${JSON.stringify(legendAfter)} vs rest ${JSON.stringify(legendAtRest)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(legendAfter.x - legendAtRest.x)).toBeLessThanOrEqual(1);
    const index = await rectOf(page, "topology-index-panel");
    if (index) expect(legendAfter.x, "legend under INDEX").toBeGreaterThanOrEqual(index.x + index.w);
    await capture(page, "mc02-r2-territories-escape-1040");
  });

  test("MC-06: in Strata the selected domain's lit neighbourhood stays clear of its panel", async ({ page }) => {
    await arrive(page, { width: 1040, height: 720 });
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-strata").click();
    await waitForDomeEntered(page, 60_000);
    await waitForMapStill(page).catch(() => {});
    await page.waitForTimeout(600);
    const target = (await drawnNodes(page)).find((n) => n.label === "에이전트 접근");
    expect(target, "the domain is drawn").toBeDefined();
    await page.mouse.click(target!.x, target!.y);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await page.waitForTimeout(1800);
    const panel = (await rectOf(page, "map-detail-panel"))!;
    const under = await page.evaluate(
      ({ id, left }) => {
        const m = (window as unknown as {
          __atlasMap: {
            nodes: () => Array<{ id: string; label: string; x: number; y: number; hidden: boolean }>;
            edges: () => Array<{ sourceId: string; targetId: string }>;
          };
        }).__atlasMap;
        const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
        const lit = new Set<string>([id]);
        for (const e of m.edges()) {
          if (e.sourceId === id) lit.add(e.targetId);
          if (e.targetId === id) lit.add(e.sourceId);
        }
        return m
          .nodes()
          .filter((n) => lit.has(n.id) && !n.hidden && n.x + c.x > left)
          .map((n) => n.label);
      },
      { id: target!.id, left: panel.x },
    );
    expect(under, "lit neighbours under the panel").toEqual([]);
    await capture(page, "mc06-strata-focus-1040");
  });

  test("MC-17: every picker view is kept in the address", async ({ page }) => {
    await arrive(page, { width: 1512, height: 949 });
    for (const view of ["strata", "coupling", "galaxy", "hex", "territories"] as const) {
      await page.getByTestId("topology-view-3d").click();
      await page.getByTestId(`topology-view-3d-choice-${view}`).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe(view);
    }
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-flat").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBeNull();
  });
});

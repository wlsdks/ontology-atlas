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
/** The spec's typical concept: five needs, three needed-by, four elements, every reason written. */
const TYPICAL_NEEDED_BY = 3;
const TYPICAL_DEFINITION = "Typical step takes one order through its middle stage and hands it on once its five suppliers answer.";

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
  const typicalNeeds = needs.slice(0, 5);
  const typicalElements = ["typical-a", "typical-b", "typical-c", "typical-d"];
  files["capabilities/typical.md"] = [
    "---",
    "kind: capability",
    "title: Typical step",
    "domain: domains/orders",
    `depends_on: ${list(typicalNeeds.map((n) => `capabilities/${n}`))}`,
    `elements: ${list(typicalElements.map((e) => `elements/${e}`))}`,
    `relation_notes: { ${typicalNeeds.map((n) => `capabilities/${n}: "The step asks ${n} first."`).join(", ")} }`,
    "---",
  ].join("\n") + `\n# Typical step\n\n${TYPICAL_DEFINITION}\n`;
  for (const e of typicalElements) files[`elements/${e}.md`] = `---\nkind: element\ntitle: ${e}\n---\n${body(e)}`;
  for (const n of needs) files[`capabilities/${n}.md`] = `---\nkind: capability\ntitle: Supply ${n}\ndomain: domains/supply\n---\n${body(n)}`;
  for (const [i, u] of users.entries()) {
    const typical = i < TYPICAL_NEEDED_BY;
    const dependsOn = typical ? "[capabilities/hub, capabilities/typical]" : "[capabilities/hub]";
    const notes = typical ? `\nrelation_notes: { capabilities/typical: "${u} waits on the typical step." }` : "";
    files[`capabilities/${u}.md`] = `---\nkind: capability\ntitle: Demand ${u}\ndomain: domains/demand\ndepends_on: ${dependsOn}${notes}\n---\n${body(u)}`;
  }
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
  }, 2 + 2 * SIDE, { timeout: 120_000 });
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

/** Where the first screen's parts sit, and whether the one scroll body has to scroll. */
const firstScreen = (page: Page) =>
  page.getByTestId("map-detail-panel").evaluate((panel) => {
    const box = (selector: string) => {
      const el = panel.querySelector(selector) ?? document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    const body = panel.querySelector<HTMLElement>('[data-testid="map-detail-panel-body"]')!;
    return {
      viewport: window.innerHeight,
      panelHeight: Math.round(panel.getBoundingClientRect().height),
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      emphasis: panel.getAttribute("data-panel-emphasis"),
      parts: {
        definition: box('[data-testid="map-detail-panel-definition"]'),
        needs: box('[data-datasheet-group="needs"]'),
        neededBy: box('[data-datasheet-group="neededBy"]'),
        footer: box('[data-testid="map-detail-panel-footer"]'),
      },
    };
  });

/** WCAG contrast of every text, line sample and pressable in the panel against what it is painted on. */
const contrastAndTargets = (page: Page) =>
  page.getByTestId("map-detail-panel").evaluate((panel) => {
    const probe = document.createElement("canvas").getContext("2d")!;
    const rgba = (css: string): [number, number, number, number] => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = "#000";
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255];
    };
    const over = (top: [number, number, number, number], under: [number, number, number]): [number, number, number] =>
      [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])) as [number, number, number];
    const luminance = (c: [number, number, number]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: [number, number, number], b: [number, number, number]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const surface = over(rgba(getComputedStyle(panel).backgroundColor), [0, 0, 0]);
    const ground = (el: Element): [number, number, number] => {
      const layers: Element[] = [];
      for (let at: Element | null = el; at && at !== panel; at = at.parentElement) layers.unshift(at);
      return layers.reduce((under, layer) => over(rgba(getComputedStyle(layer).backgroundColor), under), surface);
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const texts: { text: string; ratio: number }[] = [];
    for (const el of panel.querySelectorAll("*")) {
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (!own || !visible(el) || el.closest(".sr-only")) continue;
      texts.push({ text: el.textContent!.trim().slice(0, 40), ratio: ratio(over(rgba(getComputedStyle(el).color), ground(el)), ground(el)) });
    }
    const marks: { mark: string; ratio: number }[] = [];
    for (const path of panel.querySelectorAll("[data-reach-sample] path, [data-testid='map-detail-panel-judgment'] svg")) {
      const style = getComputedStyle(path);
      const ink = style.fill !== "none" && path.tagName === "path" && path.getAttribute("fill") ? style.fill : style.stroke !== "none" ? style.stroke : style.color;
      marks.push({ mark: path.closest("[data-reach-sample]")?.getAttribute("data-reach-sample") ?? "judgment", ratio: ratio(over(rgba(ink), ground(path)), ground(path)) });
    }
    const targets = [...panel.querySelectorAll("button, a, [role='button']")].filter(visible).map((el) => {
      const r = el.getBoundingClientRect();
      return { label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30), width: r.width, height: r.height };
    });
    return { texts, marks, targets };
  });

test.describe("the concept panel's first screen holds its parts", () => {
  for (const viewport of [{ width: 1512, height: 949 }, { width: 1920, height: 1080 }]) {
    test(`at ${viewport.width}x${viewport.height} the definition, both reach headings and the footer show without scrolling`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);
      await openVault(page);
      for (const id of ["capability:typical", "capability:hub"]) {
        await select(page, id);
        const screen = await firstScreen(page);
        console.log(`first screen ${id} @${viewport.width}: panel ${screen.panelHeight}px, emphasis ${screen.emphasis}`);
        expect(screen.bodyScrolls, `${id}: the body holds without scrolling`).toBe(false);
        for (const [part, box] of Object.entries(screen.parts)) {
          expect(box, `${id}: ${part} is drawn`).not.toBeNull();
          expect(box!.bottom, `${id}: ${part} sits inside the viewport`).toBeLessThanOrEqual(screen.viewport);
        }
      }
      await expect(page.getByTestId("map-detail-panel-definition")).toHaveText(/one boundary of the product honest/);
    });
  }

  test("a calm concept emphasises nothing, and missing reasons make meaning review the one filled action", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1512, height: 949 });
    await openVault(page);
    await select(page, "capability:typical");
    const panel = page.getByTestId("map-detail-panel");
    await expect(panel).toHaveAttribute("data-panel-emphasis", "none");
    await expect(panel.getByTestId("map-detail-panel-judgment")).toHaveCount(0);
    await expect(panel.getByTestId("map-detail-panel-definition")).toHaveText(TYPICAL_DEFINITION);
    await select(page, "capability:hub");
    await expect(panel).toHaveAttribute("data-panel-emphasis", "meaning-review");
    await expect(panel.getByTestId("map-detail-panel-judgment-action")).toHaveAttribute("data-action-role", "primary");
  });

  test("the reach block stays where it first painted", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1512, height: 949 });
    await openVault(page);
    for (const id of ["capability:typical", "capability:hub"]) {
      const sampling = page.evaluate((nodeId) => new Promise<number[]>((resolve) => {
        const tops: number[] = [];
        let firstAt: number | null = null;
        const tick = (now: number) => {
          const zone = document.querySelector(`[data-testid="map-detail-panel"][data-selected-node-id="${nodeId}"] [data-reach-zone]`);
          if (zone) {
            firstAt ??= now;
            tops.push(zone.getBoundingClientRect().top);
          }
          // measurement window: B4 bounds the reach block's movement over two seconds after first paint.
          if (firstAt !== null && now - firstAt >= 2000) resolve(tops);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), id);
      await select(page, id);
      const tops = await sampling;
      const jumps = tops.slice(1).map((top, i) => Math.abs(top - tops[i]!)).filter((d) => d > 0.5);
      const drift = Math.abs(tops.at(-1)! - tops[0]!);
      console.log(`reach block ${id}: ${tops.length} frames, drift ${drift.toFixed(1)}px, moves ${jumps.length}`);
      expect(drift, `${id}: the reach block moved after first paint`).toBeLessThanOrEqual(4);
    }
  });

  test("text reads at 4.5:1, marks at 3:1, and every pressable is at least 28px square", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1512, height: 949 });
    await openVault(page);
    for (const id of ["capability:typical", "capability:hub", "domain:orders"]) {
      await select(page, id);
      const { texts, marks, targets } = await contrastAndTargets(page);
      expect(texts.length, `${id}: text was measured`).toBeGreaterThan(5);
      expect(marks.length, `${id}: marks were measured`).toBeGreaterThan(0);
      for (const t of texts) expect(t.ratio, `${id}: "${t.text}"`).toBeGreaterThanOrEqual(4.5);
      for (const m of marks) expect(m.ratio, `${id}: ${m.mark} mark`).toBeGreaterThanOrEqual(3);
      for (const t of targets) {
        expect(t.width, `${id}: "${t.label}" width`).toBeGreaterThanOrEqual(28);
        expect(t.height, `${id}: "${t.label}" height`).toBeGreaterThanOrEqual(28);
      }
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

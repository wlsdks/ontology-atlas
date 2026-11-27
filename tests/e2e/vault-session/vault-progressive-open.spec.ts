import { expect, test, type Page } from "@playwright/test";

import type { AtlasMapProbe } from "../atlas-map-probe";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { waitForMapStill } from "../settle";

const DOMAINS = 50;
const CAPABILITIES = 200;
const DIRECT_ELEMENTS = 300;
const ELEMENTS = 1749;
const DOCUMENTS = 1 + DOMAINS + CAPABILITIES + ELEMENTS;
const UNREAD_UNTIL_DRAWN = Array.from(
  { length: Math.ceil(ELEMENTS / 2) },
  (_, at) => `elements/e-${String(ELEMENTS - 1 - at).padStart(5, "0")}.md`,
);

function generatedVault(): Record<string, string> {
  const pad = (n: number) => String(n).padStart(5, "0");
  const body = (title: string) => `\n${title} keeps one boundary of the product honest.\n\n## Includes\n- One responsibility.\n`;
  const files: Record<string, string> = {};
  const domains = Array.from({ length: DOMAINS }, (_, d) => `domains/d-${pad(d)}`);
  files["atlas.md"] = `---\nkind: project\ntitle: Atlas\nslug: atlas\ndomains: [${domains.join(", ")}]\n---\n${body("Atlas")}`;
  for (const domain of domains) files[`${domain}.md`] = `---\nkind: domain\ntitle: ${domain}\n---\n${body(domain)}`;
  const listed: string[][] = Array.from({ length: CAPABILITIES }, () => []);
  for (let e = 0; e < ELEMENTS; e += 1) {
    const element = `elements/e-${pad(e)}`;
    const direct = e < DIRECT_ELEMENTS;
    if (!direct) listed[(e * 7) % CAPABILITIES]!.push(element);
    files[`${element}.md`] = `---\nkind: element\ntitle: ${element}\n${direct ? `domain: ${domains[e % DOMAINS]}\n` : ""}---\n${body(element)}`;
  }
  for (let c = 0; c < CAPABILITIES; c += 1) {
    const capability = `capabilities/c-${pad(c)}`;
    const elements = listed[c]!.length ? `elements: [${listed[c]!.join(", ")}]\n` : "";
    files[`${capability}.md`] = `---\nkind: capability\ntitle: ${capability}\ndomain: ${domains[c % DOMAINS]}\n${elements}---\n${body(capability)}`;
  }
  return files;
}

const WIKI_PAGES = 450;
const WIKI_UNREAD_UNTIL_CHECKED = Array.from(
  { length: WIKI_PAGES / 2 },
  (_, at) => `wiki/p-${String(WIKI_PAGES - 1 - at).padStart(5, "0")}.md`,
);

function generatedWiki(): Record<string, string> {
  const files: Record<string, string> = {};
  for (let p = 0; p < WIKI_PAGES; p += 1) {
    const title = `Page ${p}`;
    files[`wiki/p-${String(p).padStart(5, "0")}.md`] = `---\ntitle: ${title}\nstatus: draft\nsummary: ${title}.\n---\n\n## Summary\n\n${title}.\n`;
  }
  return files;
}

interface ArrivalWindow {
  __atlasMap?: AtlasMapProbe;
  __arrival: {
    pressedAt: number | null;
    firstFrameAt: number | null;
    drawnWhileReading: string | null;
    nodes: number;
    marks: Record<string, { x: number; y: number; travel: number; step: number }>;
  };
}

async function installArrivalSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as ArrivalWindow;
    w.__arrival = { pressedAt: null, firstFrameAt: null, drawnWhileReading: null, nodes: 0, marks: {} };
    type Snapshot = { at: number; reading: string | null; marks: Array<[string, number, number]> };
    const snapshot = (): Snapshot | null => {
      const probe = w.__atlasMap;
      const camera = probe?.camera();
      if (w.__arrival.pressedAt === null || !camera) return null;
      const nodes = probe?.nodes() ?? [];
      if (nodes.length === 0) return null;
      w.__arrival.nodes = nodes.length;
      return {
        at: performance.now(),
        reading: document.querySelector("[data-vault-load-progress]")?.getAttribute("data-vault-load-progress") ?? null,
        marks: nodes
          .filter((node) => !node.hidden && node.appear !== 0)
          .map((node) => [
            node.id,
            (node.x - camera.width / 2) / camera.scale + camera.x,
            (node.y - camera.height / 2) / camera.scale + camera.y,
          ]),
      };
    };
    const commit = (drawn: Snapshot) => {
      const arrival = w.__arrival;
      arrival.firstFrameAt ??= drawn.at;
      if (drawn.reading) arrival.drawnWhileReading ??= drawn.reading;
      for (const [id, x, y] of drawn.marks) {
        const mark = arrival.marks[id];
        if (!mark) {
          arrival.marks[id] = { x, y, travel: 0, step: 0 };
          continue;
        }
        const step = Math.hypot(x - mark.x, y - mark.y);
        mark.travel += step;
        mark.step = Math.max(mark.step, step);
        mark.x = x;
        mark.y = y;
      }
    };
    let frame = -1;
    let lastInFrame: Snapshot | null = null;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      raf((time) => {
        if (time !== frame) {
          if (lastInFrame) commit(lastInFrame);
          frame = time;
        }
        callback(time);
        lastInFrame = snapshot();
      });
  });
}

test.use({ viewport: { width: 1512, height: 982 } });

test("a 2,000-document vault draws its overview while it is still being read, and ends with every concept", async ({ page }) => {
  test.setTimeout(120_000);
  await installDesktopRailRuntime(page, generatedVault(), undefined, {
    replaceFixture: true,
    holdReadsUntilReleased: UNREAD_UNTIL_DRAWN,
  });
  await installArrivalSampler(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").waitFor();
  await page.evaluate(() => {
    (window as unknown as ArrivalWindow).__arrival.pressedAt = performance.now();
    document.querySelector<HTMLElement>('[data-testid="first-run-open"]')!.click();
  });

  await expect
    .poll(() => page.evaluate(() => (window as unknown as ArrivalWindow).__arrival.firstFrameAt !== null), {
      message: `the map draws what has arrived while ${UNREAD_UNTIL_DRAWN.length} documents are still unread`,
      timeout: 60_000,
    })
    .toBe(true);
  await waitForMapStill(page);
  await page.evaluate(() => {
    (window as unknown as ArrivalWindow).__arrival.marks = {};
    (window as unknown as { __releaseHeldReads: () => void }).__releaseHeldReads();
  });
  await page.waitForFunction((total) => (window as unknown as ArrivalWindow).__arrival.nodes === total, DOCUMENTS, { timeout: 60_000 });
  await expect(page.locator("[data-vault-load-progress]")).toHaveCount(0);
  await expect(page.getByTestId("topology-index-source"), "the folder line outlived the read").toHaveCount(0);
  await waitForMapStill(page);

  const arrival = await page.evaluate(() => {
    const { pressedAt, firstFrameAt, drawnWhileReading, marks } = (window as unknown as ArrivalWindow).__arrival;
    const jumped = Object.entries(marks)
      .filter(([, mark]) => mark.travel > 24 && mark.step > mark.travel / 2)
      .map(([id, mark]) => `${id} moved ${Math.round(mark.step)} of ${Math.round(mark.travel)} in one frame`);
    return { firstFrameMs: firstFrameAt! - pressedAt!, drawnWhileReading, jumped };
  });
  console.log(`[perf] first map frame ${Math.round(arrival.firstFrameMs)} ms after the press; drawn while reading ${arrival.drawnWhileReading}`);

  const [read, total] = (arrival.drawnWhileReading ?? "").split("/").map(Number);
  expect(total).toBe(DOCUMENTS);
  expect(read).toBeLessThan(DOCUMENTS);
  expect(arrival.jumped).toEqual([]);

  const reads = await page.evaluate(() =>
    (window as unknown as { __nativeCalls: { command: string }[] }).__nativeCalls.map((call) => call.command),
  );
  expect(reads.filter((command) => command === "read_vault_text_file"), "a batch fell back to single reads").toEqual([]);
  expect(reads.filter((command) => command === "read_vault_text_files").length).toBeGreaterThan(0);
});

test("a large folder of wiki pages that arrives in parts reaches the Library without drawing the map", async ({ page }) => {
  test.setTimeout(120_000);
  await installDesktopRailRuntime(page, generatedWiki(), undefined, {
    replaceFixture: true,
    holdReadsUntilReleased: WIKI_UNREAD_UNTIL_CHECKED,
  });
  await page.addInitScript(() => {
    const mapParts = '[data-testid="map-entry-fallback"], [data-testid="topology-command-chrome"], [data-testid="topology-map-surface"]';
    const seen = window as unknown as { mapMounted?: boolean };
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches(mapParts) || node.querySelector(mapParts))) seen.mapMounted = true;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const mapMounted = () => page.evaluate(() => (window as unknown as { mapMounted?: boolean }).mapMounted ?? false);
  await page.goto("/ko/?guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();

  // The opening frame stops reserving the rail's column once a part has arrived; half the pages are still unread.
  await expect(page.getByTestId("vault-route-identity-pending")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("vault-opening-rail-reserve")).toHaveCount(0, { timeout: 30_000 });
  expect(await mapMounted(), "the map was drawn for a part that held no concept").toBe(false);

  await page.evaluate(() => (window as unknown as { __releaseHeldReads: () => void }).__releaseHeldReads());
  await expect(page.getByTestId("library-workspace-tabs")).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/ko\/library\/?/);
  expect(await mapMounted(), "the map was drawn on the way to the Library").toBe(false);
});

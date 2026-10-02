import { expect, test, type Page } from "@playwright/test";

import type { AtlasMapProbe } from "./atlas-map-probe";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";

const DOMAINS = 15;
const CAPABILITIES = 300;
const ELEMENTS = 1684;
const DOCUMENTS = 1 + DOMAINS + CAPABILITIES + ELEMENTS;
const FIRST_FRAME_BUDGET_MS = 4_500;
const FIRST_FRAME_MEASURED =
  "measured 2026-10-02 on the static export at 120 ms per native answer: 0.87 s, against 16.5 s with one native read per file";

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
    const direct = e % 5 === 4;
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
    const sample = () => {
      const arrival = w.__arrival;
      const probe = w.__atlasMap;
      const camera = probe?.camera();
      const nodes = arrival.pressedAt === null || !camera ? [] : (probe?.nodes() ?? []);
      if (nodes.length > 0) {
        arrival.firstFrameAt ??= performance.now();
        arrival.nodes = nodes.length;
        const reading = document.querySelector("[data-vault-load-progress]")?.getAttribute("data-vault-load-progress");
        if (reading) arrival.drawnWhileReading ??= reading;
        for (const node of nodes) {
          if (node.hidden) continue;
          const x = (node.x - camera!.width / 2) / camera!.scale + camera!.x;
          const y = (node.y - camera!.height / 2) / camera!.scale + camera!.y;
          const mark = arrival.marks[node.id];
          if (!mark) {
            arrival.marks[node.id] = { x, y, travel: 0, step: 0 };
            continue;
          }
          const step = Math.hypot(x - mark.x, y - mark.y);
          mark.travel += step;
          mark.step = Math.max(mark.step, step);
          mark.x = x;
          mark.y = y;
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

test.use({ viewport: { width: 1512, height: 982 } });

test("a 2,000-document vault draws its overview while it is still being read, and ends with every concept", async ({ page }) => {
  test.setTimeout(120_000);
  await installDesktopRailRuntime(page, generatedVault(), undefined, { replaceFixture: true });
  await installArrivalSampler(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").waitFor();
  await page.evaluate(() => {
    (window as unknown as ArrivalWindow).__arrival.pressedAt = performance.now();
    document.querySelector<HTMLElement>('[data-testid="first-run-open"]')!.click();
  });

  await page.waitForFunction(() => (window as unknown as ArrivalWindow).__arrival.firstFrameAt !== null, undefined, { timeout: 60_000 });
  await page.waitForFunction((total) => (window as unknown as ArrivalWindow).__arrival.nodes === total, DOCUMENTS, { timeout: 60_000 });
  await expect(page.locator("[data-vault-load-progress]")).toHaveCount(0);
  await expect(page.getByTestId("topology-index-source")).toContainText(String(DOCUMENTS));

  const arrival = await page.evaluate(() => {
    const { pressedAt, firstFrameAt, drawnWhileReading, marks } = (window as unknown as ArrivalWindow).__arrival;
    const jumped = Object.entries(marks)
      .filter(([, mark]) => mark.travel > 24 && mark.step > mark.travel / 2)
      .map(([id, mark]) => `${id} moved ${Math.round(mark.step)} of ${Math.round(mark.travel)} in one frame`);
    return { firstFrameMs: firstFrameAt! - pressedAt!, drawnWhileReading, jumped };
  });
  console.log(`[perf] first map frame ${Math.round(arrival.firstFrameMs)} ms after the press; drawn while reading ${arrival.drawnWhileReading}`);

  expect(arrival.firstFrameMs, FIRST_FRAME_MEASURED).toBeLessThan(FIRST_FRAME_BUDGET_MS);
  const [read, total] = (arrival.drawnWhileReading ?? "").split("/").map(Number);
  expect(total).toBe(DOCUMENTS);
  expect(read).toBeLessThan(DOCUMENTS);
  expect(arrival.jumped).toEqual([]);
});

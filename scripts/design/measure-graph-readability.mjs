/**
 * Graph readability measurement: collection, not judgement. It pulls coordinates only; the metrics
 * are computed in `scripts/lib/design/graph-readability.mjs`, which is pure and probeable with fixtures.
 * Usage: `node scripts/design/measure-graph-readability.mjs [baseUrl]` on a static export. Each
 * row opens its own folder in the faked app runtime (`scripts/lib/desktop-app/open-folder-in-app.mjs`).
 */

import { chromium } from "@playwright/test";

import { measureReadability } from "../lib/design/graph-readability.mjs";
import { loadDesktopHarness, openFolderInApp } from "../lib/desktop-app/open-folder-in-app.mjs";
import { scaleVaultFiles } from "../perf/lib/vaults.mjs";

const BASE = process.argv[2] ?? "http://localhost:4173";

/**
 * The sizes measured. **The product's own vault is the first row** — measuring only
 * synthetic graphs would leave the screen we look at daily never measured.
 */
const CASES = [
  { files: async () => (await loadDesktopHarness()).atlasSampleFiles(), label: "dogfood vault" },
  { files: async () => scaleVaultFiles(300, "all"), label: "300 files" },
  { files: async () => scaleVaultFiles(3000, "all"), label: "3000 files" },
];

/** Fixed viewport — crossings are counted in screen coordinates, so the window size is part of the measurement condition. */
const VIEWPORT = { width: 1512, height: 900 };

function collectInPage() {
  const api = window.__atlasMap;
  if (!api) return { error: "__atlasMap missing — ?e2e=1 was dropped, or the build is older than this instrument" };
  if (typeof api.edges !== "function") {
    return { error: "no edges() window — the build is older than this instrument" };
  }
  return {
    nodes: api.nodes().filter((n) => !n.hidden),
    edges: api.edges(),
    totalNodes: api.nodes().length,
  };
}

const browser = await chromium.launch({
  headless: true, // The layout is deterministic and needs no real input
});
const rows = [];

for (const { files, label } of CASES) {
  // A fresh context per row: the app restores the folder it last opened.
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await openFolderInApp(page, await files(), { baseUrl: BASE, locale: "ko" });
  await page.goto(`${BASE}/ko/topology/?guides=off&e2e=1`, { waitUntil: "networkidle" });
  await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });
  // Wait for the physics simulation to converge. **Measuring before convergence
  // measures an intermediate state, not the layout.**
  await page.waitForTimeout(6000);
  const raw = await page.evaluate(collectInPage);
  await context.close();
  if (raw.error) {
    rows.push({ label, error: raw.error });
    continue;
  }
  rows.push({
    label,
    totalNodes: raw.totalNodes,
    totalEdges: raw.edges.length,
    ...measureReadability({ ...raw, width: VIEWPORT.width, height: VIEWPORT.height }),
  });
}

await browser.close();

console.log(`\n  graph readability — ${VIEWPORT.width}×${VIEWPORT.height}, after convergence\n`);
for (const r of rows) {
  if (r.error) {
    console.log(`  ${r.label.padEnd(14)} ❌ ${r.error}`);
    continue;
  }
  console.log(
    `  ${r.label.padEnd(14)} nodes ${String(r.visibleNodes).padStart(5)}/${String(r.totalNodes).padEnd(5)}` +
      ` edges ${String(r.visibleEdges).padStart(5)}/${String(r.totalEdges).padEnd(5)}`,
  );
  console.log(
    r.crossingMeasurable
      ? `  ${"".padEnd(14)} crossings ${String(r.crossings).padStart(6)} / possible ${String(r.maxCrossings).padStart(8)}` +
          `  → quality ${r.crossingQuality}   (1 is crossing-free)`
      : // Not a perfect score but **not measurable**. When the density gate folds
        // the graph down to a star shape, crossings become impossible by
        // construction and you get the inverted conclusion that the largest vault
        // is the best.
        `  ${"".padEnd(14)} crossings not measurable — every edge left on screen shares an endpoint (folded)`,
  );
  console.log(
    `  ${"".padEnd(14)} overlaps ${String(r.overlaps).padStart(6)} pairs (${r.overlapRate} per node)` +
      `  worst intrusion ${r.worstOverlapPx}px\n`,
  );
}
console.log("");

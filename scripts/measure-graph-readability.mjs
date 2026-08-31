/**
 * Graph readability measurement — numbers for whether the map reads **as a graph**.
 *
 * **Why this exists.** From the 2026-08-03 audit: this app's primary surface is a
 * node-link graph, and there was **not one number** for whether it read as one.
 * Node specs (shape, radius, parity) had contract tests, the type ramp had lint,
 * motion had frame measurements — but **the layout occupying most of the screen**
 * had no verdict tool beyond "looks complicated".
 *
 * **What this file does — collection, not judgement.** It pulls **coordinates
 * only** from the page. The metrics are computed by
 * `scripts/lib/graph-readability.mjs`, which is pure and therefore probeable with
 * fixtures (`tests/contract/graph-readability.contract.test.ts`). Computing inside
 * the page means **you cannot feed in a known answer**, so "the score is 0 — is the
 * detector idle or is the map good?" can never be settled; the first measurement
 * stood in exactly that spot.
 *
 * **Usage**
 *
 *   node scripts/serve-static-export.mjs --port=4173 &   # after pnpm build
 *   node scripts/measure-graph-readability.mjs [baseUrl]
 */

import { chromium } from "@playwright/test";
import { rmSync } from "node:fs";

import { measureReadability } from "./lib/graph-readability.mjs";

const BASE = process.argv[2] ?? "http://localhost:4173";
const PROFILE = `/tmp/atlas-readability-${process.pid}`;

/**
 * The sizes measured. **The real dogfood vault is the first row** — measuring only
 * synthetic graphs would leave the screen we look at daily never measured.
 */
const CASES = [
  { q: "", label: "dogfood vault" },
  { q: "synth=300", label: "synthetic 300" },
  { q: "synth=3000", label: "synthetic 3000" },
];

/** Fixed viewport — crossings are counted in screen coordinates, so the window size is part of the measurement condition. */
const VIEWPORT = { width: 1512, height: 900 }; // 14" MacBook logical resolution

/** Pulls coordinates out of the page. Makes no judgement. */
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

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true, // The layout is deterministic and needs no real input
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
const rows = [];

for (const { q, label } of CASES) {
  const query = ["guides=off", "e2e=1", q].filter(Boolean).join("&");
  await page.goto(`${BASE}/ko/topology?${query}`, { waitUntil: "networkidle" });
  // Wait for the physics simulation to converge. **Measuring before convergence
  // measures an intermediate state, not the layout.**
  await page.waitForTimeout(6000);
  const raw = await page.evaluate(collectInPage);
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

await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });

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

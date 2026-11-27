/**
 * Node-drag frame cost harness. Uses the CDP mouse (`page.mouse`) only: a synthetic pointer has
 * `isTrusted: false`, so `setPointerCapture` is refused and the gesture becomes a background pan.
 * `work` is synchronous rAF callback time, not the frame gap. Usage:
 * `node scripts/perf/perf-node-drag.mjs [baseUrl] [--headless]`; the window is visible unless
 * `--headless` is given, because a real display pipeline is what a device runs. Each row opens its
 * own generated folder in the faked app runtime (`scripts/lib/desktop-app/open-folder-in-app.mjs`).
 */

import { chromium } from "@playwright/test";

import { openFolderInApp } from "../lib/desktop-app/open-folder-in-app.mjs";
import { scaleVaultFiles } from "./lib/vaults.mjs";

const ARGS = process.argv.slice(2);
const BASE = ARGS.find((arg) => !arg.startsWith("--")) ?? "http://localhost:4173";
const HEADLESS = ARGS.includes("--headless");

/** Vault sizes measured — the small one is the control for "does cost scale with node count". */
const CASES = [
  { files: () => scaleVaultFiles(3000, "all"), label: "3000 files" },
  { files: () => scaleVaultFiles(31, "all"), label: "31 files (control)" },
];

const stat = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return {
    med: +s[s.length >> 1].toFixed(1),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
    max: +s[s.length - 1].toFixed(1),
  };
};

/**
 * Asks the app which nodes are draggable (`window.__atlasMap`, enabled by `?e2e=1`). A
 * cursor-`pointer` hover hit is not grabbability: grabbing must also pass `sim.hasNode()`, or it
 * becomes a background pan.
 */
async function pickDraggable(page) {
  return page.evaluate(() => {
    const api = window.__atlasMap;
    if (!api) return { error: "__atlasMap missing — ?e2e=1 was dropped, or the build is older than this instrument" };
    const vw = innerWidth, vh = innerHeight;
    const cands = api
      .nodes()
      .filter((n) => n.draggable && !n.hidden && n.x > 80 && n.y > 80 && n.x < vw - 80 && n.y < vh - 80);
    if (cands.length === 0) return { error: "no draggable node is on screen" };
    // More neighbours means more simulation load — pick a domain-tier node to measure the worst case.
    const rank = { project: 0, domain: 1, capability: 2, element: 3 };
    cands.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
    const n = cands[0];
    return { id: n.id, kind: n.kind, label: n.label, x: n.x, y: n.y, total: cands.length };
  });
}

/** Drags a node and returns callback times **after confirming a node was really dragged**. */
async function dragNode(page, box, target, moves) {
  await page.evaluate(() => {
    window.__work = [];
    if (!window.__wrapped) {
      window.__wrapped = true;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        raf((t) => {
          const s = performance.now();
          try {
            callback(t);
          } finally {
            window.__work.push(performance.now() - s);
          }
        });
    }
  });
  const sx = box.x + target.x;
  const sy = box.y + target.y;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy + 8); // Cross the hysteresis threshold to commit the grab
  // Post-check — pushing the background reports «pan» here, and that measurement is discarded.
  const grabbed = await page.evaluate(() => window.__atlasMap?.interaction());

  // At human drag speed: one `mouse.move` is a CDP round trip, so 45 separate calls produce slow
  // motion that reads as a slow app. `steps` fires several interpolated moves within one round trip.
  const LEG = 6; // How many segments the trajectory is split into
  const perLeg = Math.max(2, Math.round(moves / LEG));
  for (let leg = 0; leg < LEG; leg += 1) {
    const t = (leg + 1) / LEG;
    await page.mouse.move(sx + Math.sin(t * 6) * 170, sy + Math.cos(t * 8) * 120, {
      steps: perLeg,
    });
  }
  const backing = await page.evaluate(() => window.__atlasMap?.backing());
  await page.mouse.up();
  await page.waitForTimeout(500);
  const work = stat((await page.evaluate(() => window.__work.slice(3))) ?? []);
  return { work, backing, grabbed };
}

const browser = await chromium.launch({
  headless: HEADLESS, // Headed by default: a real display pipeline takes the same path as a real device
  args: ["--start-maximized", "--force-device-scale-factor=2"],
});
const rows = [];

for (const { files, label } of CASES) {
  // A fresh context per row: the app restores the folder it last opened.
  const ctx = await browser.newContext({ viewport: HEADLESS ? { width: 1512, height: 900 } : null });
  // The on-screen meter runs too, so a person can visually confirm that the
  // harness numbers and the on-screen numbers say the same thing.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("atlas.appearance.frameMeter", "on");
    } catch {
      // Private mode and similar — only the meter is missing; the measurement still runs.
    }
  });
  const page = await ctx.newPage();
  await openFolderInApp(page, files(), { baseUrl: BASE, locale: "ko" });
  await page.goto(`${BASE}/ko/topology/?guides=off&e2e=1`, { waitUntil: "networkidle" });
  await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);

  const box = await page.locator("canvas").first().boundingBox();
  const target = await pickDraggable(page);
  if (target.error) {
    rows.push({ label, error: target.error });
    await ctx.close();
    continue;
  }
  // A real mouse. Synthetic events are isTrusted:false, so setPointerCapture is
  // refused, the node grab breaks, and the gesture falls through to a pan — half
  // the reason this harness exists.
  const r = await dragNode(page, box, target, 45);
  rows.push({ label, ...r, target });
  await ctx.close();
}

await browser.close();

console.log("\n  node drag — app rAF callback time (ms)\n");
for (const r of rows) {
  if (r.error) {
    console.log(`  ${r.label.padEnd(20)} ❌ ${r.error}`);
    continue;
  }
  const ok = r.grabbed?.kind === "node";
  console.log(
    `  ${r.label.padEnd(20)} ${ok ? "node grabbed ✓" : `❌ ${r.grabbed?.kind} (pushed the background — this number is invalid)`}` +
      `  [${r.target.kind} ${r.target.label}]`,
  );
  // Read p95 as the representative value: dragging at human speed mixes idle frames into the sample and
  // drags the median down; the cost occurs only on dragging frames.
  console.log(
    `  ${"".padEnd(20)} p95 ${String(r.work.p95).padStart(6)} · worst ${String(r.work.max).padStart(6)} ` +
      `(median ${r.work.med} — includes idle frames, so it is only for reference) · backing ${r.backing?.width}x${r.backing?.height}\n`,
  );
}
console.log("");

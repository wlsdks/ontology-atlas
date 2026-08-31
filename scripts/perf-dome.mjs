#!/usr/bin/env node
/**
 * 3D dome cost harness — the reproduction rig for the 2026-08-19 incident.
 *
 * **What happened.** The 3D view **never fell asleep, even 45 s after the last
 * input.** Its autonomous rotation (48 s per revolution) sat alone outside the
 * `model/ambient-sleep.ts` contract and burned **520 ms per second** (half a core)
 * forever on a 2,000-node vault — 2D in the same state burned 3 ms/s. That is 170×.
 * And a 3D node drag measured p95 **52.1 ms** (≈19 fps), of which 73% was 2D physics
 * **that never appears on screen as a single pixel** (a fully assembled dome's draw
 * coordinates do not depend on world coordinates — `updateDomeFrame`).
 *
 * **Why the eye cannot catch it.** Both defects look normal on screen: the dome
 * rotates prettily and dragging works, only slowly. A spinning fan and a draining
 * battery do not appear in a screenshot, and 19 fps on a node drag gets waved off as
 * "3D is heavy". So measurement decides.
 *
 * **Discipline** (same as `scripts/perf-node-drag.mjs`):
 *
 * 1. **Real mouse only** — a synthetic pointer is `isTrusted:false` and the grab
 *    path breaks.
 * 2. **`headless: false`** — fps measured without the display pipeline does not
 *    predict a real machine.
 * 3. **Quote `work` only** (synchronous time inside the rAF callback) — frame
 *    *intervals* are contaminated by refresh rate.
 * 4. **Measure the control alongside** — without 2D at the same scale next to it,
 *    "3D is like that" and "it is broken" are indistinguishable.
 *
 * **Windowed or headless** (measured 2026-08-19). The default opens a window. A
 * window covers the person's screen, and **on macOS it cannot be moved off-screen**
 * — neither `--window-position=-2400,-2400` nor CDP `Browser.setWindowBounds`
 * survives; the window server pulls it back on screen (requested -2400,-2400 →
 * actual 0,33; requested 3000,60 → actual 288,60). "Open it invisibly" is not an
 * option, so unattended runs and concurrent work use `--headless`.
 *
 * The same vault (synth=2000, 3D rotating), 3 runs each way:
 *
 * | | Frames / 5 s | `work` median | `work` p95 |
 * |---|---|---|---|
 * | Windowed (3D rotating) | **600** (=120 fps, this machine's refresh rate) | 4.3–4.8 ms | 7.4–7.6 ms |
 * | `--headless` (3D rotating) | **120** (=24 fps) | 4.6–4.8 ms | 5.0–5.4 ms |
 * | `--headless` (3D idle) | **600** | ~0 | ~0 |
 *
 * - **Median `work` per frame is the same.** The map-perf skill's "only the JS
 *   compute cost transfers" is confirmed — how expensive one frame is can be
 *   measured headless too.
 * - **Frame *counts* cannot be trusted.** Windowed, they pin to the refresh rate;
 *   headless there is no vsync or compositor backpressure, so the same run yields
 *   24 fps or 120 fps depending on load (the bottom two rows above are both headless
 *   and differ 5×). So **never compare CPU per second (ms/s) across the two modes** —
 *   that value is proportional to frame count.
 * - Therefore **the idle verdict counts busy frames** (`IDLE_BUDGET_BUSY_FRAMES`).
 *   However many frames arrive, asleep means 0 of them do work and awake means all of
 *   them do — only that ratio is stable across run modes. Measured: sleeping 3D
 *   0/600, non-sleeping 3D 300/300.
 * - Do not compare `p95` across modes either — a different sample count is not the
 *   same tail. Use it to compare **before and after within one mode**.
 *
 * Usage:
 *   pnpm build && node scripts/serve-static-export.mjs --port=4173 &
 *   node scripts/perf-dome.mjs [baseUrl] [--synth=2000] [--json] [--headless]
 *
 * The idle check must wait out the ambient-sleep delay (30 s) plus ramp (2 s), so it
 * costs about 45 s per run. `--skip-idle` removes it, but **that item is the first
 * reason this harness exists.**
 */
import { chromium } from "@playwright/test";
import { rmSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => a !== "--");
const BASE = args.find((a) => a.startsWith("http")) ?? "http://localhost:4173";
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const SYNTH = Number(getArg("synth", "2000"));
const HEADLESS = args.includes("--headless");
const JSON_OUT = args.includes("--json");
const SKIP_IDLE = args.includes("--skip-idle");
/** Wait before starting the idle observation — 30 s delay + 2 s ramp + margin. */
const SLEEP_WAIT_MS = Number(getArg("sleep-wait-ms", "38000"));
const IDLE_WINDOW_MS = Number(getArg("idle-window-ms", "5000"));

/**
 * Budgets.
 *
 * **Idle is measured in busy frames** — CPU per second is proportional to refresh
 * rate and swings 5× when the run mode changes (see the mode table above), while
 * "did it fall asleep" splits cleanly between 0 and all. Measured: sleeping 3D
 * 0/300, non-sleeping 3D 300/300. The ceiling of 5 allows only the handful of
 * boundary frames the ramp straddles.
 *
 * The drag p95 is a generous multiple of the 2D control (2.7–3.6 ms). Compare before
 * and after **within one run mode only**.
 */
const IDLE_BUDGET_BUSY_FRAMES = Number(getArg("idle-budget-frames", "5"));
const DRAG_BUDGET_P95_MS = Number(getArg("drag-budget", "20"));

const PROFILE = `/tmp/atlas-dome-perf-${process.pid}`;

const stat = (xs) => {
  if (!xs || xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return {
    med: +s[s.length >> 1].toFixed(2),
    p95: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(2),
    max: +s[s.length - 1].toFixed(2),
  };
};

/** Wraps the rAF callback to collect how long our code held one frame. */
const WRAP = () => {
  window.__work = [];
  if (!window.__wrapped) {
    window.__wrapped = true;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) =>
      raf((t) => {
        const start = performance.now();
        try {
          fn(t);
        } finally {
          window.__work.push({ w: performance.now() - start, t: start });
        }
      });
  }
};

async function openMap(page, view3d) {
  await page.addInitScript((on) => {
    try {
      if (on) localStorage.setItem("atlas.appearance.view3d", "on");
      else localStorage.removeItem("atlas.appearance.view3d");
    } catch {
      // Private mode — if 3D cannot be enabled, dome() below returns null and it surfaces there.
    }
  }, view3d);
  await page.goto(`${BASE}/ko/topology?synth=${SYNTH}&guides=off&e2e=1`, { waitUntil: "load" });
  await page.evaluate(WRAP);
  await page.waitForTimeout(5000);
}

/** CPU per second (ms) over a no-input window — the only honest answer to "did it fall asleep". */
async function measureIdle(page) {
  await page.evaluate(() => {
    window.__work = [];
  });
  await page.waitForTimeout(IDLE_WINDOW_MS);
  return page.evaluate((windowMs) => {
    const now = performance.now();
    const win = window.__work.filter((e) => e.t > now - windowMs);
    const sum = win.reduce((acc, e) => acc + e.w, 0);
    return {
      frames: win.length,
      busyFrames: win.filter((e) => e.w >= 0.4).length,
      cpuMsPerSec: +(sum / (windowMs / 1000)).toFixed(1),
    };
  }, IDLE_WINDOW_MS);
}

/** Drags a node and returns the callback times **after confirming a node was really dragged**. */
async function measureNodeDrag(page) {
  const box = await page.locator("canvas").first().boundingBox();
  const target = await page.evaluate(() => {
    const api = window.__atlasMap;
    if (!api) return { error: "__atlasMap missing — ?e2e=1 was dropped, or the build is older than this instrument" };
    const vw = innerWidth;
    const vh = innerHeight;
    const cands = api
      .nodes()
      .filter((n) => n.draggable && !n.hidden && n.x > 120 && n.y > 120 && n.x < vw - 120 && n.y < vh - 120);
    if (cands.length === 0) return { error: "no draggable node is on screen" };
    // More neighbours means more load — pick the higher tier to measure the worst case.
    const rank = { project: 0, domain: 1, capability: 2, element: 3 };
    cands.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
    return { id: cands[0].id, kind: cands[0].kind, label: cands[0].label, x: cands[0].x, y: cands[0].y };
  });
  if (target.error) return { error: target.error };

  await page.evaluate(() => {
    window.__work = [];
  });
  const sx = box.x + target.x;
  const sy = box.y + target.y;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy + 8); // Cross the hysteresis threshold to commit the grab
  // Post-hoc check — if this is panning the background, the measurement is void.
  const grabbed = await page.evaluate(() => window.__atlasMap?.interaction());
  for (let leg = 0; leg < 6; leg += 1) {
    const t = (leg + 1) / 6;
    await page.mouse.move(sx + Math.sin(t * 6) * 180, sy + Math.cos(t * 8) * 130, { steps: 8 });
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const work = stat((await page.evaluate(() => window.__work.map((e) => e.w))).slice(3));
  return { work, grabbed, target };
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  // Windowed by default — the display pipeline is what makes this take the same path as a real machine.
  headless: HEADLESS,
  viewport: HEADLESS ? { width: 1440, height: 900 } : null,
  deviceScaleFactor: 2,
  args: HEADLESS
    ? ["--force-device-scale-factor=2"]
    : ["--start-maximized", "--force-device-scale-factor=2"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const rows = [];

for (const view3d of [true, false]) {
  const label = view3d ? "3D dome" : "2D (control)";
  await openMap(page, view3d);
  const dome = await page.evaluate(() => window.__atlasMap?.dome?.() ?? null);
  if (view3d && dome === null) {
    rows.push({ label, error: "3D did not turn on — check the localStorage switch" });
    continue;
  }
  const drag = await measureNodeDrag(page);
  let idle = null;
  if (!SKIP_IDLE) {
    // **Move the cursor off the canvas.** Left over the canvas, the autonomous
    // rotation stops for that reason, and "ambient sleep put it to sleep" becomes
    // indistinguishable from "the cursor stopped it".
    await page.mouse.move(2, 2);
    await page.waitForTimeout(SLEEP_WAIT_MS);
    idle = await measureIdle(page);
  }
  rows.push({ label, view3d, drag, idle });
}

await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });

if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE, synth: SYNTH, rows }, null, 2));
}

let failed = 0;
console.log(`\n  3D dome cost — vault of ${SYNTH} nodes, app rAF callback time (ms) · ${HEADLESS ? "headless" : "with a window"}\n`);
for (const row of rows) {
  if (row.error) {
    console.log(`  ${row.label.padEnd(12)} ❌ ${row.error}`);
    failed += 1;
    continue;
  }
  const d = row.drag;
  if (d.error) {
    console.log(`  ${row.label.padEnd(12)} ❌ ${d.error}`);
    failed += 1;
  } else {
    const grabbedNode = d.grabbed?.kind === "node";
    const overBudget = row.view3d && d.work.p95 > DRAG_BUDGET_P95_MS;
    if (!grabbedNode || overBudget) failed += 1;
    console.log(
      `  ${row.label.padEnd(12)} node drag ${grabbedNode ? "grabbed ✓" : `❌ ${d.grabbed?.kind} (pushed the background — invalid)`}` +
        `  p95 ${String(d.work.p95).padStart(6)} · worst ${String(d.work.max).padStart(6)}` +
        (overBudget ? `  ❌ over the ${DRAG_BUDGET_P95_MS}ms budget` : ""),
    );
  }
  if (row.idle) {
    const over = row.idle.busyFrames > IDLE_BUDGET_BUSY_FRAMES;
    if (over) failed += 1;
    console.log(
      `  ${"".padEnd(12)} idle (${Math.round(SLEEP_WAIT_MS / 1000)}s after the last input) ` +
        `busy frames ${row.idle.busyFrames}/${row.idle.frames} · ${String(row.idle.cpuMsPerSec).padStart(6)} ms/s (for reference)` +
        (over ? `  ❌ over the ${IDLE_BUDGET_BUSY_FRAMES}-frame budget — ambient rest is broken` : " ✓"),
    );
  }
  console.log("");
}

if (failed > 0) {
  console.error(`  ${failed} rows went over budget or were measured invalid.\n`);
  process.exit(1);
}

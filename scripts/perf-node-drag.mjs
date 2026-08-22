/**
 * Node-drag frame cost measurement — the reproduction harness for the 2026-07-31
 * lag incident.
 *
 * **Why this file exists.** That incident saw **five failed reproductions**, all
 * for the same reason: a synthetic pointer event
 * (`dispatchEvent(new PointerEvent(...))`) has `isTrusted: false`, so
 * `setPointerCapture` is refused, the node-grab path breaks midway, and the
 * gesture **falls through to a background pan.** A pan never wakes the physics
 * simulation, so it was always fast — and "it isn't slow here" was reported five
 * times. It ended only when the owner looked at the screen and said *"너는 노드가
 * 아니라 그냥 배경을 드래그하던데?"* (you were dragging the background, not a
 * node).
 *
 * > **The code path is only real if the input is real.** So this harness uses the
 * > CDP mouse (`page.mouse`) exclusively and never manufactures events inside the
 * > page.
 *
 * **What is measured.** `work` = the time the app's rAF callback spent
 * **synchronously**. Not the frame gap: the gap is contaminated by display
 * refresh rate and harness round trips, whereas callback time is our code's
 * share. The incident's signal was exactly here (3000 nodes 139.9ms vs 31 nodes
 * 0.9ms).
 *
 * Usage:
 *
 *   node scripts/perf-node-drag.mjs [baseUrl]
 *
 * Defaults to `http://localhost:4173`; a static build (`pnpm build` + a static
 * server) must be running.
 */

import { chromium } from "@playwright/test";
import { rmSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:4173";
// **A fresh profile per run.** With a fixed path, `rmSync` pulls the rug from
// under a Chrome still holding it from the previous run; the window closes
// itself and the symptom reads as "Target page has been closed", which looks
// like a measurement failure (it happened twice).
const PROFILE = `/tmp/atlas-perf-${process.pid}`;

/** Vault sizes measured — the small one is the control for "does cost scale with node count". */
const CASES = [
  { q: "synth=3000&t=freeze", label: "노드 3000" },
  { q: "synth=31&t=freeze", label: "노드 31 (대조)" },
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
 * **Asks the app** which nodes are draggable (`window.__atlasMap`, enabled by
 * `?e2e=1`).
 *
 * This used to sweep the canvas for a point where the cursor became `pointer`.
 * That is a **hover hit**, not **grabbability** — grabbing must also pass
 * `sim.hasNode()`, and failing it silently becomes a background pan. That is how
 * six runs pushed only the background. Now the app states `draggable` directly,
 * which makes that failure impossible in principle.
 */
async function pickDraggable(page) {
  return page.evaluate(() => {
    const api = window.__atlasMap;
    if (!api) return { error: "__atlasMap 없음 — ?e2e=1 가 빠졌거나 빌드가 옛것이다" };
    const vw = innerWidth, vh = innerHeight;
    const cands = api
      .nodes()
      .filter((n) => n.draggable && !n.hidden && n.x > 80 && n.y > 80 && n.x < vw - 80 && n.y < vh - 80);
    if (cands.length === 0) return { error: "끌 수 있는 노드가 화면 안에 없다" };
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
      window.requestAnimationFrame = (fn) =>
        raf((t) => {
          const s = performance.now();
          try {
            fn(t);
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

  // **At human drag speed.** One `mouse.move` is a CDP round trip costing ~24ms,
  // so 45 separate calls produce slow motion rather than a drag, and that slowness
  // reads as the app being slow (owner report: "드래그가 너무 심각하게 느리던데" —
  // the drag is seriously slow). `steps` fires several interpolated moves **within
  // one round trip**, dividing the round-trip cost and coming closer to a real
  // pointer stream.
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

// **Delete the profile before launching, not after.** Deleting afterwards pulls
// the rug from under the running browser; the window closes itself and the
// symptom reads as "Target page has been closed", which looks like a measurement
// failure (it happened once).
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, // A real display pipeline is needed to take the same path as a real device
  viewport: null,
  args: ["--start-maximized", "--force-device-scale-factor=2"],
});

// The on-screen meter runs too, so a person can visually confirm that the
// harness numbers and the on-screen numbers say the same thing.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("atlas.appearance.frameMeter", "on");
  } catch {
    // Private mode and similar — only the meter is missing; the measurement still runs.
  }
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
const rows = [];

for (const { q, label } of CASES) {
  await page.goto(`${BASE}/ko/topology?${q}&guides=off&e2e=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const box = await page.locator("canvas").first().boundingBox();
  const target = await pickDraggable(page);
  if (target.error) {
    rows.push({ label, error: target.error });
    continue;
  }
  // A real mouse. Synthetic events are isTrusted:false, so setPointerCapture is
  // refused, the node grab breaks, and the gesture falls through to a pan — half
  // the reason this harness exists.
  const r = await dragNode(page, box, target, 45);
  rows.push({ label, ...r, target });
}

await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });

console.log("\n  노드 드래그 — 앱 rAF 콜백 시간(ms)\n");
for (const r of rows) {
  if (r.error) {
    console.log(`  ${r.label.padEnd(16)} ❌ ${r.error}`);
    continue;
  }
  const ok = r.grabbed?.kind === "node";
  console.log(
    `  ${r.label.padEnd(16)} ${ok ? "노드 잡음 ✓" : `❌ ${r.grabbed?.kind} (배경을 밀었다 — 이 수치는 무효)`}` +
      `  [${r.target.kind} ${r.target.label}]`,
  );
  // **Read p95 as the representative value.** Dragging at human speed mixes idle
  // frames into the sample and drags the median down to 0.2ms — the app did not get
  // faster, the actual dragging just became a minority of the sample. The cost
  // occurs only on dragging frames, so the tail is what to look at.
  console.log(
    `  ${"".padEnd(16)} p95 ${String(r.work.p95).padStart(6)} · 최악 ${String(r.work.max).padStart(6)} ` +
      `(중앙 ${r.work.med} — 유휴 프레임 포함이라 참고용) · 백킹 ${r.backing?.width}x${r.backing?.height}\n`,
  );
}
console.log("");

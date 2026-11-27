/**
 * Contrast measurement: sweeps the rendered DOM and names text that is not legible. Collection, not
 * judgement: the computation lives in `scripts/lib/design/contrast.mjs`. Here the real background is
 * resolved by walking up the ancestors and compositing translucent backgrounds, because skipping that
 * reports better than reality.
 *
 * The website's pages are measured as a visitor sees them; every other route is measured in the
 * app with the Storefront sample folder open (`scripts/lib/desktop-app/open-folder-in-app.mjs`).
 *
 * Usage (run `pnpm build` first):
 *   node scripts/web/serve-static-export.mjs --port=4173 &
 *   node scripts/design/measure-contrast.mjs [baseUrl] [route...]
 */

import { chromium } from "@playwright/test";

import { judgeText, judgeAdjacentMarks } from "../lib/design/contrast.mjs";
import { collectAdjacentMarks } from "../lib/design/contrast-collect.mjs";
import { loadDesktopHarness, openSurfaces } from "../lib/desktop-app/open-folder-in-app.mjs";


const [, , maybeBase, ...maybeRoutes] = process.argv;
const BASE = maybeBase?.startsWith("http") ? maybeBase : "http://localhost:4173";
const ROUTES = (maybeBase?.startsWith("http") ? maybeRoutes : [maybeBase, ...maybeRoutes]).filter(
  Boolean,
);
/**
 * The default sweep covers every screen a person can reach; an unmeasured screen looks like a
 * clean one. Adding a route means adding it here (gate:
 * tests/contract/routes/contrast-sweep-coverage.contract.test.ts).
 */
export const DEFAULT_ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/architecture/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/projects/",
  "/ko/project/fallback/?slug=storefront",
  "/ko/project/fallback/?slug=storefront&mode=edit",
  "/ko/project/new/",
  "/ko/project/fallback/",
  "/ko/download/",
  "/ko/sample/",
  "/ko/changelog/",
  "/ko/guide/",
  "/ko/guide/what-is-atlas/",
  "/ko/git/",
  "/ko/changes/",
  "/ko/work-status/",
  "/ko/agents/",
  "/ko/agents/?tab=mcp",
  "/ko/agents/?tab=models",
  "/ko/library/",
  "/ko/planning/",
  "/ko/automations/",
  // 404 is two pages, with and without a locale prefix; both are swept.
  "/ko/this-route-does-not-exist/",
  "/this-route-does-not-exist/",
];
const VIEWPORT = { width: 1512, height: 900 };

function collectInPage() {
  const resolveBackground = (element) => {
    const stack = [];
    for (let node = element; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(bg);
      if (!m) continue;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const a = p.length > 3 ? p[3] : 1;
      if (a <= 0) continue;
      stack.push([p[0], p[1], p[2], a]);
      if (a >= 1) break;
    }
    // With no opaque background anywhere up the chain, the canvas colour is the floor.
    const root = getComputedStyle(document.documentElement).getPropertyValue("--color-canvas").trim();
    const rm = /^#([0-9a-f]{6})$/i.exec(root);
    let base = rm
      ? [parseInt(rm[1].slice(0, 2), 16), parseInt(rm[1].slice(2, 4), 16), parseInt(rm[1].slice(4, 6), 16), 1]
      : [0, 0, 0, 1];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const [r, g, b, a] = stack[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];
    }
    return `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
  };

  const out = [];
  const seen = new Set();
  for (const element of document.querySelectorAll("*")) {
    // **Directly owned text only.** Counting ancestors measures the same glyphs several
    // times and still cannot name which element to fix.
    const own = [...element.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;
    const cs = getComputedStyle(element);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
    const key = `${cs.color}|${cs.fontSize}|${cs.fontWeight}|${resolveBackground(element)}`;
    // Each (colour, size, background) combination once — printing 200 repeated cards as
    // 200 lines makes the report unreadable, and the prescription is per combination
    // anyway.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      fg: cs.color,
      bg: resolveBackground(element),
      fontSizePx: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      sample: own.slice(0, 40),
      selector: element.tagName.toLowerCase() + (element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}` : ""),
    });
  }
  return out;
}

const browser = await chromium.launch({ headless: true });
const surfaces = openSurfaces(browser, {
  baseUrl: BASE,
  files: (await loadDesktopHarness()).storefrontFiles(),
  locale: "ko",
  context: { viewport: VIEWPORT, deviceScaleFactor: 2 },
});
const report = [];

for (const route of ROUTES.length > 0 ? ROUTES : DEFAULT_ROUTES) {
  const page = await surfaces.visit(`${route}${route.includes("?") ? "&" : "?"}guides=off`);
  await page.waitForTimeout(2500);
  const samples = await page.evaluate(collectInPage);
  const rawMarks = await page.evaluate(collectAdjacentMarks);
  const marks = rawMarks.filter((m) => !m.separated).map((m) => ({ ...m, ...judgeAdjacentMarks(m) }));
  const separated = rawMarks.filter((m) => m.separated);
  const judged = samples
    .map((s) => ({ ...s, ...judgeText(s) }))
    .filter((s) => s.ratio !== undefined);
  report.push({
    route,
    total: judged.length,
    failures: judged.filter((s) => !s.passes).sort((a, b) => a.ratio - b.ratio),
    /** A parse failure is **unmeasured, not passing** — silencing it makes the instrument optimistic. */
    unmeasured: samples.length - judged.length,
    marks,
    separated,
    markFailures: marks.filter((m) => !m.passes),
  });
}

await surfaces.close();
await browser.close();

console.log(`\n  text contrast — ${VIEWPORT.width}×${VIEWPORT.height} · WCAG 1.4.3 (body 4.5:1 · large text 3:1)\n`);
let totalFail = 0;
for (const r of report) {
  totalFail += r.failures.length;
  const head = `  ${r.route.padEnd(22)} pairs ${String(r.total).padStart(3)}  below ${String(r.failures.length).padStart(3)}`;
  console.log(r.unmeasured > 0 ? `${head}  ⚠️ unmeasured ${r.unmeasured}` : head);
  for (const f of r.failures) {
    console.log(
      `      ${String(f.ratio).padStart(5)}:1 < ${f.required}   ${String(f.fontSizePx) + "px"} ${f.fg} on ${f.bg}`,
    );
    console.log(`              ${f.selector}  «${f.sample}»`);
  }
}
console.log(`\n  ${totalFail} below the threshold in total\n`);

const markTotal = report.reduce((n, r) => n + r.marks.length, 0);
const markFail = report.reduce((n, r) => n + r.markFailures.length, 0);
const sepTotal = report.reduce((n, r) => n + r.separated.length, 0);
console.log(
  `  adjacent data marks — WCAG 1.4.11 (3:1) · touching pairs ${markTotal} · below ${markFail}` +
    `  (the ${sepTotal} pairs already parted by a 1px gap have a color-independent separator and are not judged here)\n`,
);
for (const r of report) {
  if (r.marks.length === 0 && r.separated.length === 0) continue;
  console.log(`  ${r.route.padEnd(22)} touching ${String(r.marks.length).padStart(3)}  below ${String(r.markFailures.length).padStart(3)}  with a gap ${String(r.separated.length).padStart(3)}`);
  for (const m of r.markFailures) {
    console.log(`      ${String(m.ratio).padStart(5)}:1 < 3   ${m.a} ↔ ${m.b}  on ${m.over}`);
    console.log(`              ${m.selector}  ← needs a color-independent separator (shape, label, pattern or order)`);
  }
}
if (markFail > 0) process.exitCode = 1;
console.log("");

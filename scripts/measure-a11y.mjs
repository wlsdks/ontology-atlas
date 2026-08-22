/**
 * Accessibility inventory — **count the violations before switching a rule engine on.**
 *
 * **Why this order.** The `/gate-probe` discipline: take the full inventory before
 * switching a rule on. A rule at a scale one PR cannot clear is noise rather than
 * enforcement, and it buries the existing signal too, neutralising the gate. This
 * repository has already paid that price — banning `shadow-[` wholesale took lint from
 * 144 to 548, most of them legitimate uses.
 *
 * **Why the hand-written checks are not enough.** As of 2026-08-03 `tests/e2e/` holds
 * five accessibility specs (15 cases), each **pinning one defect a person noticed**:
 * heading/landmark structure, unnamed buttons and links, focus return, 44px hit areas.
 * Good checks, but they **cover only what was noticed.** axe-core runs 105 rules. That
 * difference is why this file exists — and also why it is an **inventory**, not a gate.
 *
 * Usage:
 *
 *   node scripts/serve-static-export.mjs --port=4173 &   # after pnpm build
 *   node scripts/measure-a11y.mjs [baseUrl] [route...]
 */

import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");

const [, , maybeBase, ...maybeRoutes] = process.argv;
const BASE = maybeBase?.startsWith("http") ? maybeBase : "http://localhost:4173";
const ROUTES = (maybeBase?.startsWith("http") ? maybeRoutes : [maybeBase, ...maybeRoutes]).filter(Boolean);
const DEFAULT_ROUTES = [
  "/ko",
  "/ko/topology",
  "/ko/docs",
  "/ko/ontology/insights",
  "/ko/projects",
  "/ko/download",
  "/ko/guide",
];
const VIEWPORT = { width: 1512, height: 900 };
const PROFILE = `/tmp/atlas-a11y-${process.pid}`;

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const rows = [];

for (const route of ROUTES.length > 0 ? ROUTES : DEFAULT_ROUTES) {
  await page.goto(`${BASE}${route}?guides=off`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(async () => {
    // WCAG 2.1/2.2 A and AA only. The `best-practice` tag is advice rather than spec, and
    // mixing it into a pre-switch-on inventory **merges spec violations and taste into one
    // number.**
    const run = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
    });
    return run.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      count: v.nodes.length,
      sample: v.nodes[0]?.target?.join(" ") ?? "",
    }));
  });
  rows.push({ route, violations: result });
}

await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });

/** Folded by rule — **the unit of prescription is the rule, not the route.** */
const byRule = new Map();
for (const { route, violations } of rows) {
  for (const v of violations) {
    const e = byRule.get(v.id) ?? { id: v.id, impact: v.impact, help: v.help, nodes: 0, routes: new Set(), sample: v.sample };
    e.nodes += v.count;
    e.routes.add(route);
    byRule.set(v.id, e);
  }
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const ranked = [...byRule.values()].sort(
  (a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9) || b.nodes - a.nodes,
);

console.log(`\n  접근성 센서스 — axe-core, WCAG 2.x A/AA 만 · ${VIEWPORT.width}×${VIEWPORT.height}\n`);
for (const { route, violations } of rows) {
  const nodes = violations.reduce((n, v) => n + v.count, 0);
  console.log(`  ${route.padEnd(24)} 룰 ${String(violations.length).padStart(2)} · 원소 ${String(nodes).padStart(3)}`);
}
console.log(`\n  룰별 (처방 단위):\n`);
for (const r of ranked) {
  console.log(`  [${(r.impact ?? "?").padEnd(8)}] ${r.id.padEnd(34)} 원소 ${String(r.nodes).padStart(3)} · 라우트 ${r.routes.size}`);
  console.log(`             ${r.help}`);
  console.log(`             예: ${r.sample}`);
}
console.log(
  `\n  합계: 룰 ${ranked.length}종 · 원소 ${ranked.reduce((n, r) => n + r.nodes, 0)}건\n` +
    `  ⚠️ 이 수가 한 PR 로 못 치울 규모면 게이트를 켜지 않는다 — 소음은 기존 신호까지 덮는다.\n`,
);

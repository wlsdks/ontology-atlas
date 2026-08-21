/**
 * 접근성 전수 — **룰 엔진을 켜기 전에 위반을 센다.**
 *
 * ## 왜 이 순서인가
 *
 * `/gate-probe` 의 규율: **룰을 켜기 전에 위반을 전수 측정한다.** 한 PR 로 못
 * 치우는 규모의 룰은 강제가 아니라 소음이고, 기존 신호까지 덮어 게이트를
 * 무력화한다. 이 저장소는 이미 그 값을 냈다 — `shadow-[` 를 통째로 금지했더니
 * lint 가 144 → 548 로 뛰었고, 그중 대부분이 정상 사용이었다.
 *
 * ## 왜 손으로 만든 검사로는 부족한가
 *
 * 2026-08-03 기준 `tests/e2e/` 에 접근성 스펙이 다섯 개(15 케이스) 있고, 전부
 * **사람이 알아챈 결함을 하나씩 못박은 것**이다 — heading/landmark, 이름 없는
 * 버튼·링크, 포커스 복귀, 44px 히트 영역. 좋은 검사지만 **알아챈 것만 덮는다.**
 * axe-core 는 105개 룰을 돌린다. 그 차이가 이 파일이 존재하는 이유고, 동시에
 * 이 파일이 게이트가 아니라 **센서스**인 이유이기도 하다.
 *
 * ## 쓰는 법
 *
 *   node scripts/serve-static-export.mjs --port=4173 &   # 먼저 pnpm build
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
    // WCAG 2.1/2.2 A·AA 만. 「best-practice」 태그는 규격이 아니라 권고라, 켜기
    // 전 센서스에 섞으면 **규격 위반과 취향이 한 숫자로 합쳐진다.**
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

/** 룰별로 접는다 — **처방 단위가 룰이지 라우트가 아니기 때문이다.** */
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

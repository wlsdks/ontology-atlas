/**
 * 대비 실측 — 렌더된 DOM 을 쓸어 **읽히지 않는 텍스트**를 지목한다.
 *
 * ## 왜 이 파일이 필요한가
 *
 * `/design-council` 은 「도해」석에게 *"must measure contrast"* 라고 명령하고 그
 * 자리의 브리프도 대비 실측을 판정 전 필수로 건다. **그런데 잴 도구가 없었다** —
 * 2026-08-03 기준 이 저장소의 어떤 스크립트도 대비를 계산하지 않았고,
 * `/design-audit` 은 색을 **토큰 집합과 대조**할 뿐이었다. 토큰을 썼는가와
 * 읽히는가는 다른 질문이다: 정당한 토큰 두 개가 서로 안 갈릴 수 있다.
 *
 * ## 이 파일이 하는 일 — 판정이 아니라 채집
 *
 * 계산은 `scripts/lib/contrast.mjs` 가 한다(순수 함수, fixture 프로브 있음 —
 * `tests/contract/contrast.contract.test.ts`). 여기서는 **실제 배경을 해결**한다:
 * 조상을 거슬러 올라가며 반투명 배경을 차례로 합성한다. 이 앱은 텍스트와 보더를
 * 알파 토큰으로 쓰기 때문에 이 단계를 빼면 수치가 실제보다 **좋게** 나오고,
 * 그 낙관은 조용하다.
 *
 * ## 쓰는 법
 *
 *   node scripts/serve-static-export.mjs --port=4173 &   # 먼저 pnpm build
 *   node scripts/measure-contrast.mjs [baseUrl] [route...]
 */

import { chromium } from "@playwright/test";
import { rmSync } from "node:fs";

import { judgeText, judgeAdjacentMarks } from "./lib/contrast.mjs";
import { collectAdjacentMarks } from "./lib/contrast-collect.mjs";


const [, , maybeBase, ...maybeRoutes] = process.argv;
const BASE = maybeBase?.startsWith("http") ? maybeBase : "http://localhost:4173";
const ROUTES = (maybeBase?.startsWith("http") ? maybeRoutes : [maybeBase, ...maybeRoutes]).filter(
  Boolean,
);
/**
 * 기본 스윕 — **사람이 도달할 수 있는 화면 전부**.
 *
 * 2026-08-04 감사 전까지 이 목록은 다섯 줄이었고, 빠진 여섯 화면 중에는
 * `/ko/ontology/insights` — **데이터 마크가 가장 조밀한 화면** — 이 있었다.
 * 재 보니 미달은 0이었지만 그건 통과가 아니라 **미측정**이었다. 목록이
 * 「오래 보는 화면」이라는 주관으로 좁혀져 있으면, 안 잰 화면과 깨끗한 화면이
 * 같은 초록으로 보인다. 라우트를 더하면 여기에도 더한다
 * (게이트: tests/contract/contrast-sweep-coverage.contract.test.ts).
 */
export const DEFAULT_ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/project/storefront/",
  "/ko/project/storefront/edit/",
  "/ko/project/new/",
  "/ko/project/fallback/",
  "/ko/download/",
  "/ko/changelog/",
  "/ko/guide/",
  "/ko/guide/what-is-atlas/",
  "/ko/git/",
  "/ko/skills/",
  // 404 는 **두 페이지**다 — 로케일이 붙은 것과 안 붙은 것. 2026-08-03 에
  // AA 미달 4.42:1 이 숨어 있던 자리가 정확히 여기고, 그때 두 래칫 모두 이
  // 자리를 한 번도 안 봤다. 하나만 넣으면 그 사고의 절반만 막는다.
  "/ko/this-route-does-not-exist/",
  "/this-route-does-not-exist/",
];
const VIEWPORT = { width: 1512, height: 900 };
const PROFILE = `/tmp/atlas-contrast-${process.pid}`;

/**
 * 페이지에서 **텍스트를 가진 원소의 전경색 · 해결된 배경색 · 폰트**를 꺼내 온다.
 * 판정하지 않는다.
 */
function collectInPage() {
  /** 조상을 거슬러 반투명 배경을 차례로 합성해 **불투명 배경**을 구한다. */
  const resolveBackground = (el) => {
    const stack = [];
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(bg);
      if (!m) continue;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const a = p.length > 3 ? p[3] : 1;
      if (a <= 0) continue;
      stack.push([p[0], p[1], p[2], a]);
      if (a >= 1) break;
    }
    // 아무 불투명 배경도 못 만나면 캔버스 색이 바닥이다.
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
  for (const el of document.querySelectorAll("*")) {
    // **직접 소유한 텍스트만.** 부모까지 세면 같은 글자를 여러 번 재고, 정작
    // 어느 원소를 고쳐야 하는지는 못 짚는다.
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    // 화면 밖은 사용자가 못 읽는다 — 여기 결함을 세면 판정이 오염된다.
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
    const key = `${cs.color}|${cs.fontSize}|${cs.fontWeight}|${resolveBackground(el)}`;
    // 같은 (색 · 크기 · 배경) 조합은 한 번만 — 반복 카드 200개를 200줄로 내면
    // 보고가 읽히지 않고, 처방은 어차피 조합 단위다.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      fg: cs.color,
      bg: resolveBackground(el),
      fontSizePx: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      sample: own.slice(0, 40),
      selector: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : ""),
    });
  }
  return out;
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const report = [];

for (const route of ROUTES.length > 0 ? ROUTES : DEFAULT_ROUTES) {
  await page.goto(`${BASE}${route}?guides=off`, { waitUntil: "networkidle" });
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
    /** 파싱 실패는 **통과가 아니라 미측정**이다 — 침묵시키면 계기가 낙관한다. */
    unmeasured: samples.length - judged.length,
    marks,
    separated,
    markFailures: marks.filter((m) => !m.passes),
  });
}

await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });

console.log(`\n  텍스트 대비 — ${VIEWPORT.width}×${VIEWPORT.height} · WCAG 1.4.3 (본문 4.5:1 · 큰 글자 3:1)\n`);
let totalFail = 0;
for (const r of report) {
  totalFail += r.failures.length;
  const head = `  ${r.route.padEnd(22)} 조합 ${String(r.total).padStart(3)}  미달 ${String(r.failures.length).padStart(3)}`;
  console.log(r.unmeasured > 0 ? `${head}  ⚠️ 미측정 ${r.unmeasured}` : head);
  for (const f of r.failures) {
    console.log(
      `      ${String(f.ratio).padStart(5)}:1 < ${f.required}   ${String(f.fontSizePx) + "px"} ${f.fg} on ${f.bg}`,
    );
    console.log(`              ${f.selector}  «${f.sample}»`);
  }
}
console.log(`\n  합계 미달 ${totalFail}건\n`);

// ── 인접 데이터 마크 (WCAG 1.4.11 비텍스트 3:1)
const markTotal = report.reduce((n, r) => n + r.marks.length, 0);
const markFail = report.reduce((n, r) => n + r.markFailures.length, 0);
const sepTotal = report.reduce((n, r) => n + r.separated.length, 0);
console.log(
  `  인접 데이터 마크 — WCAG 1.4.11 (3:1) · 맞닿은 쌍 ${markTotal} · 미달 ${markFail}` +
    `  (1px 틈으로 이미 갈린 쌍 ${sepTotal} 은 색-무관 구분자가 있어 판정 대상 아님)\n`,
);
for (const r of report) {
  if (r.marks.length === 0 && r.separated.length === 0) continue;
  console.log(`  ${r.route.padEnd(22)} 맞닿음 ${String(r.marks.length).padStart(3)}  미달 ${String(r.markFailures.length).padStart(3)}  틈있음 ${String(r.separated.length).padStart(3)}`);
  for (const m of r.markFailures) {
    console.log(`      ${String(m.ratio).padStart(5)}:1 < 3   ${m.a} ↔ ${m.b}  on ${m.over}`);
    console.log(`              ${m.selector}  ← 색-무관 구분자(심·라벨·패턴·순서)가 있어야 한다`);
  }
}
if (markFail > 0) process.exitCode = 1;
console.log("");

/**
 * 그래프 가독성 실측 — 지도가 **그래프로서** 읽히는지의 수치.
 *
 * ## 왜 이 파일이 필요한가
 *
 * 2026-08-03 감사에서 나온 한 줄: **이 앱의 주 표면이 노드-링크 그래프인데,
 * 그것이 그래프로서 읽히는지에 대한 수치가 하나도 없었다.** 노드 규격(형태 ·
 * 반지름 · parity)에는 계약 테스트가, 타입 램프에는 lint 가, 모션에는 프레임
 * 실측이 있는데 **정작 화면 대부분을 차지하는 배치**에는 "복잡해 보인다" 외에
 * 판정 수단이 없었다.
 *
 * ## 이 파일이 하는 일 — 판정이 아니라 채집
 *
 * 페이지에서 **좌표만** 꺼내 온다. 지표 계산은 `scripts/lib/graph-readability.mjs`
 * 가 하고, 그건 순수 함수라 fixture 로 프로브할 수 있다
 * (`tests/contract/graph-readability.contract.test.ts`). 계산을 페이지 안에 두면
 * **아는 답을 넣어 볼 수 없어** 「0 이 나왔는데 탐지기가 논 건지 지도가 좋은
 * 건지」를 영원히 구분 못 한다 — 첫 실측에서 실제로 그 자리에 섰다.
 *
 * ## 쓰는 법
 *
 *   node scripts/serve-static-export.mjs --port=4173 &   # 먼저 pnpm build
 *   node scripts/measure-graph-readability.mjs [baseUrl]
 */

import { chromium } from "@playwright/test";
import { rmSync } from "node:fs";

import { measureReadability } from "./lib/graph-readability.mjs";

const BASE = process.argv[2] ?? "http://localhost:4173";
const PROFILE = `/tmp/atlas-readability-${process.pid}`;

/**
 * 재는 규모. **실제 도그푸드 볼트가 첫 줄**이다 — 합성만 재면 우리가 매일 보는
 * 화면은 한 번도 안 잰 것이 된다.
 */
const CASES = [
  { q: "", label: "도그푸드 볼트" },
  { q: "synth=300", label: "합성 300" },
  { q: "synth=3000", label: "합성 3000" },
];

/** 뷰포트 고정 — 교차는 화면 좌표에서 세므로 창 크기가 곧 측정 조건이다. */
const VIEWPORT = { width: 1512, height: 900 }; // 14" MacBook 논리 해상도

/** 페이지에서 좌표를 꺼내 온다. 판정하지 않는다. */
function collectInPage() {
  const api = window.__atlasMap;
  if (!api) return { error: "__atlasMap 없음 — ?e2e=1 가 빠졌거나 빌드가 옛것이다" };
  if (typeof api.edges !== "function") {
    return { error: "edges() 창구가 없다 — 빌드가 이 계기보다 옛것이다" };
  }
  return {
    nodes: api.nodes().filter((n) => !n.hidden),
    edges: api.edges(),
    totalNodes: api.nodes().length,
  };
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true, // 배치는 결정론적이고 진짜 입력이 필요 없다
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
const rows = [];

for (const { q, label } of CASES) {
  const query = ["guides=off", "e2e=1", q].filter(Boolean).join("&");
  await page.goto(`${BASE}/ko/topology?${query}`, { waitUntil: "networkidle" });
  // 물리 시뮬 수렴 대기. **수렴 전에 재면 배치가 아니라 중간 상태를 잰다.**
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

console.log(`\n  그래프 가독성 — ${VIEWPORT.width}×${VIEWPORT.height}, 수렴 후\n`);
for (const r of rows) {
  if (r.error) {
    console.log(`  ${r.label.padEnd(14)} ❌ ${r.error}`);
    continue;
  }
  console.log(
    `  ${r.label.padEnd(14)} 노드 ${String(r.visibleNodes).padStart(5)}/${String(r.totalNodes).padEnd(5)}` +
      ` 엣지 ${String(r.visibleEdges).padStart(5)}/${String(r.totalEdges).padEnd(5)}`,
  );
  console.log(
    r.crossingMeasurable
      ? `  ${"".padEnd(14)} 교차 ${String(r.crossings).padStart(6)} / 가능 ${String(r.maxCrossings).padStart(8)}` +
          `  → 품질 ${r.crossingQuality}   (1 이 무교차)`
      : // 만점이 아니라 **잴 수 없음**이다. 밀도 게이트가 접어 별 모양만 남으면
        // 교차가 원천적으로 불가능해져 «가장 큰 볼트가 가장 좋다» 는 정반대
        // 결론이 나온다.
        `  ${"".padEnd(14)} 교차 잴 수 없음 — 화면에 남은 엣지가 전부 끝점을 공유한다 (접힘)`,
  );
  console.log(
    `  ${"".padEnd(14)} 겹침 ${String(r.overlaps).padStart(6)} 쌍 (노드당 ${r.overlapRate})` +
      `  최악 침범 ${r.worstOverlapPx}px\n`,
  );
}
console.log("");

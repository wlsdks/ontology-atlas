#!/usr/bin/env node
// "영역 전개" (realm) 전환 프레임타임 실측 — topology-map-v2 S5 깊이 연출 검증용.
//
// 프로덕션 코드에는 계측을 심지 않는다(오염 금지). 대신 이미 떠 있는 dev 서버
// (:3107)를 읽기 전용으로 재사용해 Playwright 로 실제 화면을 몰고, 페이지 안에
// 주입한 rAF 프로브 + PerformanceObserver(longtask)로 프레임 델타를 수집해
// p95 프레임타임을 출력한다. 자체 빌드/서버를 띄우지 않는다.
//
// 흐름: `/ko/topology/?synth=N&p=<root>` 진입(전체 지도 정착) → 궤도 "영역 전개"
// 버튼 클릭(전개 = entering 전환) → 대기 → 영역 칩 "영역 나가기" 클릭(해제) →
// 대기. 진입 후 클릭으로 전개를 트리거하므로 초기 리빌 연출과 전환이 섞이지
// 않는다.
//
// 사용:
//   node scripts/perf-realm-transition.mjs
//   node scripts/perf-realm-transition.mjs --synth=2000 --root=synth-domain-0
//   node scripts/perf-realm-transition.mjs --base=http://localhost:3107 --json
//   node scripts/perf-realm-transition.mjs --headed --budget-ms=20
//
// 목표: 전환 창 p95 ≤ 20ms. 초과 시 exit 1 + 병목 힌트.

import { chromium } from "@playwright/test";

const args = process.argv.slice(2).filter((a) => a !== "--");
const json = args.includes("--json");
const headed = args.includes("--headed");
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = getArg("base", process.env.PERF_BASE || "http://localhost:3107");
const locale = getArg("locale", "ko");
const synth = Number(getArg("synth", "2000"));
const root = getArg("root", "synth-domain-0");
const budgetMs = Number(getArg("budget-ms", "20"));
// ko 라벨(메시지 파일과 동기 — messages/ko.json realm.enterAction/chipClear).
const enterLabel = getArg("enter-label", "영역 전개");
const exitLabel = getArg("exit-label", "영역 나가기");

if (!Number.isFinite(synth) || synth < 100) {
  console.error("[perf-realm] --synth must be an integer >= 100");
  process.exit(2);
}

const ENTER_WINDOW_MS = 1600; // 전개(entering→active): 봉투 1180 + 여유.
const EXIT_WINDOW_MS = 1400; // 해제(exiting→idle + 호밍): FLIP 660 + 여유.
const SETTLE_MS = 3200; // 초기 지도 정착 대기.

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(deltas) {
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    frames: sorted.length,
    meanMs: sorted.length ? Number((sum / sorted.length).toFixed(2)) : 0,
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
  };
}

// 페이지 안에서 rAF 프레임 델타 + longtask 수집을 켠다(라벨 구간으로 나눈다).
async function startProbe(page) {
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__perfRealm = { deltas: [], marks: [], longtasks: [], running: true };
    let last = performance.now();
    const tick = (now) => {
      if (!w.__perfRealm.running) return;
      w.__perfRealm.deltas.push({ t: now, dt: now - last });
      last = now;
      w.__perfRealm.__raf = requestAnimationFrame(tick);
    };
    w.__perfRealm.__raf = requestAnimationFrame(tick);
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__perfRealm.longtasks.push({ t: entry.startTime, dur: entry.duration });
      });
      obs.observe({ entryTypes: ["longtask"] });
      w.__perfRealm.__obs = obs;
    } catch {
      // longtask 미지원 브라우저 — rAF 델타만으로도 충분.
    }
  });
}

async function mark(page, label) {
  await page.evaluate((l) => {
    const w = /** @type {any} */ (window);
    if (w.__perfRealm) w.__perfRealm.marks.push({ label: l, t: performance.now() });
  }, label);
}

async function stopProbe(page) {
  return page.evaluate(() => {
    const w = /** @type {any} */ (window);
    if (!w.__perfRealm) return { deltas: [], marks: [], longtasks: [] };
    w.__perfRealm.running = false;
    if (w.__perfRealm.__raf) cancelAnimationFrame(w.__perfRealm.__raf);
    if (w.__perfRealm.__obs) w.__perfRealm.__obs.disconnect();
    return { deltas: w.__perfRealm.deltas, marks: w.__perfRealm.marks, longtasks: w.__perfRealm.longtasks };
  });
}

function sliceWindow(deltas, marks, fromLabel, toLabel) {
  const from = marks.find((m) => m.label === fromLabel)?.t;
  const to = marks.find((m) => m.label === toLabel)?.t;
  if (from == null || to == null) return [];
  // 첫 델타는 워밍업(큰 값)이라 mark 이후만. dt 만 뽑는다.
  return deltas.filter((d) => d.t > from && d.t <= to).map((d) => d.dt);
}

async function run() {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const url = `${base}/${locale}/topology/?synth=${synth}&p=${encodeURIComponent(root)}`;
  let usedFallback = false;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(SETTLE_MS);

  await startProbe(page);
  await mark(page, "baseline-start");
  await page.waitForTimeout(400);
  await mark(page, "baseline-end");

  // --- 전개 트리거 ---
  const enterBtn = page.getByRole("button", { name: enterLabel });
  await mark(page, "enter-start");
  if (await enterBtn.count().then((c) => c > 0).catch(() => false)) {
    await enterBtn.first().click({ timeout: 5000 }).catch(async () => {
      usedFallback = true;
      await page.goto(`${url}&realm=${encodeURIComponent(root)}`, { waitUntil: "domcontentloaded" });
    });
  } else {
    // 폴백: 버튼 미노출(=focus 미도달) 시 딥링크로 전개 트리거.
    usedFallback = true;
    await page.goto(`${base}/${locale}/topology/?synth=${synth}&realm=${encodeURIComponent(root)}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("canvas", { timeout: 15000 });
    // 폴백은 remount 라 프로브가 날아간다 — 다시 켠다.
    await startProbe(page);
    await mark(page, "enter-start");
  }
  await page.waitForTimeout(ENTER_WINDOW_MS);
  await mark(page, "enter-end");

  // --- 해제 트리거 ---
  await mark(page, "exit-start");
  const exitBtn = page.getByRole("button", { name: exitLabel });
  if (await exitBtn.count().then((c) => c > 0).catch(() => false)) {
    await exitBtn.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(EXIT_WINDOW_MS);
  }
  await mark(page, "exit-end");

  const { deltas, marks, longtasks } = await stopProbe(page);
  await browser.close();

  const enterDeltas = sliceWindow(deltas, marks, "enter-start", "enter-end");
  const exitDeltas = sliceWindow(deltas, marks, "exit-start", "exit-end");
  const transitionDeltas = [...enterDeltas, ...exitDeltas];

  const result = {
    base,
    synth,
    root,
    usedFallback,
    budgetMs,
    windows: {
      enter: summarize(enterDeltas),
      exit: summarize(exitDeltas),
      transition: summarize(transitionDeltas),
    },
    longtasksDuringTransition: longtasks.filter((lt) => {
      const es = marks.find((m) => m.label === "enter-start")?.t ?? 0;
      const xe = marks.find((m) => m.label === "exit-end")?.t ?? Infinity;
      return lt.t >= es && lt.t <= xe;
    }).length,
    consoleErrors: consoleErrors.slice(0, 5),
  };

  const p95 = result.windows.transition.p95Ms;
  const pass = transitionDeltas.length > 0 && p95 <= budgetMs;

  if (json) {
    console.log(JSON.stringify({ pass, ...result }, null, 2));
  } else {
    console.log(`[perf-realm] "영역 전개" 전환 프레임타임 (synth=${synth}, root=${root}${usedFallback ? ", fallback=deeplink" : ""})`);
    console.log(`[perf-realm] base=${base}  budget p95 <= ${budgetMs}ms`);
    const fmt = (w) => `frames=${w.frames} mean=${w.meanMs} p50=${w.p50Ms} p95=${w.p95Ms} p99=${w.p99Ms} max=${w.maxMs}`;
    console.log(`[perf-realm]   enter      : ${fmt(result.windows.enter)}`);
    console.log(`[perf-realm]   exit       : ${fmt(result.windows.exit)}`);
    console.log(`[perf-realm]   transition : ${fmt(result.windows.transition)}`);
    console.log(`[perf-realm]   longtasks during transition: ${result.longtasksDuringTransition}`);
    if (result.consoleErrors.length) console.log(`[perf-realm]   console errors: ${result.consoleErrors.length} (first: ${result.consoleErrors[0]})`);
    if (transitionDeltas.length === 0) {
      console.error("[perf-realm] FAIL: 전환 프레임을 하나도 못 잡았다 (전개/해제 트리거 실패 — dev 서버·라벨·root id 확인).");
    } else if (!pass) {
      console.error(`[perf-realm] FAIL: transition p95 ${p95}ms > ${budgetMs}ms.`);
      console.error("[perf-realm] 병목 후보: ui/topology-frame-draw.ts(노드/라벨 패스 per-frame), ui/use-topology-loop.ts(FLIP/시차 스텝), render/starfield.ts(dust radialParallax).");
    } else {
      console.log(`[perf-realm] OK: transition p95 ${p95}ms within ${budgetMs}ms.`);
    }
  }

  process.exit(pass ? 0 : 1);
}

run().catch((err) => {
  console.error("[perf-realm] error:", err?.message ?? err);
  process.exit(2);
});

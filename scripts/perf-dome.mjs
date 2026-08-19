#!/usr/bin/env node
/**
 * 3D 돔 비용 하네스 — 2026-08-19 사고의 재현 장치.
 *
 * ## 무엇이 있었나
 *
 * 3D 보기는 **무입력 45초가 지나도 잠들지 않았다.** 자율 회전(48s/바퀴)이
 * `model/ambient-sleep.ts` 계약 밖에 혼자 남아 있어서, 2,000 노드 볼트에서
 * 초당 **520ms**(코어 절반)를 영구히 태웠다 — 같은 상태의 2D 는 3ms/s 였다.
 * 170배다. 그리고 3D 노드 드래그는 p95 **52.1ms**(≈19fps)였는데, 그 비용의
 * 73%가 **화면에 한 픽셀도 나타나지 않는** 2D 물리였다(완전 조립된 돔의
 * 그리는 좌표는 월드 좌표에 의존하지 않는다 — `updateDomeFrame`).
 *
 * ## 왜 눈으로는 못 잡나
 *
 * 두 결함 다 화면은 «정상» 이다. 돔은 예쁘게 돌고 있고, 드래그도 (느릴 뿐)
 * 동작한다. 팬이 도는 것과 배터리가 닳는 것은 스크린샷에 안 찍히고, 노드
 * 드래그의 19fps 는 「원래 3D 는 무겁지」로 넘어간다. 그래서 계측이 판정한다.
 *
 * ## 규율 (scripts/perf-node-drag.mjs 와 같다)
 *
 * 1. **진짜 마우스만** — 합성 포인터는 `isTrusted:false` 라 잡기 경로가 끊긴다.
 * 2. **`headless: false`** — 표시 파이프라인 없이 잰 fps 는 실기기를 예측 못 한다.
 * 3. **`work`(rAF 콜백 동기 시간)만 인용** — 프레임 «간격» 은 주사율에 오염된다.
 * 4. **대조군을 같이 잰다** — 2D 같은 규모가 옆에 없으면 「3D 라서 그렇다」와
 *    「망가졌다」가 구별되지 않는다.
 *
 * ## 실행 방식 — 창을 띄우느냐 (2026-08-19 실측)
 *
 * 기본은 창을 띄운다. 창이 뜨면 사람 화면을 가리는데, **macOS 에서는 창을 화면
 * 밖으로 뺄 수 없다** — `--window-position=-2400,-2400` 도 CDP
 * `Browser.setWindowBounds` 도 윈도우 서버가 화면 안으로 되돌린다(요청
 * -2400,-2400 → 실제 0,33 · 요청 3000,60 → 실제 288,60). 「보이지 않게 띄우기」는
 * 선택지가 아니라서, 무인 실행이나 동시 작업 중에는 `--headless` 를 쓴다.
 *
 * 같은 볼트(synth=2000, 3D 회전)를 두 방식으로 각 3회 잰 값:
 *
 * | | 프레임/5초 | `work` 중앙 | `work` p95 |
 * |---|---|---|---|
 * | 창 있음 (3D 회전 중) | **600** (=120fps, 이 기계 주사율) | 4.3~4.8ms | 7.4~7.6ms |
 * | `--headless` (3D 회전 중) | **120** (=24fps) | 4.6~4.8ms | 5.0~5.4ms |
 * | `--headless` (3D 유휴) | **600** | ~0 | ~0 |
 *
 * - **프레임당 `work` 중앙값은 같다.** map-perf 스킬의 "전이되는 것은 JS 계산
 *   비용뿐"이 그대로 확인된다 — 프레임 하나가 얼마나 비싼지는 헤드리스로도 잰다.
 * - **프레임 «수»는 못 믿는다.** 창이 있으면 주사율에 고정되는데, 헤드리스는
 *   vsync·합성 백프레셔가 없어 부하에 따라 24fps 로도 120fps 로도 나온다
 *   (위 표의 아래 두 줄이 같은 헤드리스인데 5배 차이다). 따라서 **초당
 *   CPU(ms/s)를 두 방식 사이에서 비교하면 안 된다** — 그 값은 프레임 수에
 *   비례하기 때문이다.
 * - 그래서 **유휴 판정은 «일한 프레임 수»로 한다**(`IDLE_BUDGET_BUSY_FRAMES`).
 *   프레임이 몇 개 오든 잠들었으면 그중 0 개가 일하고, 안 잠들었으면 전량이
 *   일한다 — 이 비율만이 실행 방식에 흔들리지 않는다. 실측: 잠든 3D 0/600,
 *   안 잠든 3D 300/300.
 * - `p95` 도 두 방식 사이에서 비교하지 마라 — 표본 수가 다르면 같은 꼬리가
 *   아니다. **한 방식 안에서 전·후**를 비교하는 데 쓴다.
 *
 * 사용:
 *   pnpm build && node scripts/serve-static-export.mjs --port=4173 &
 *   node scripts/perf-dome.mjs [baseUrl] [--synth=2000] [--json] [--headless]
 *
 * 유휴 검사는 앰비언트 휴면 지연(30s)+램프(2s)를 기다려야 하므로 한 번에
 * 약 45초가 든다. `--skip-idle` 로 뺄 수 있지만, **이 하네스가 존재하는
 * 첫째 이유가 그 항목이다.**
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
/** 유휴 관측을 시작하기까지 기다리는 시간 — 지연 30s + 램프 2s + 여유. */
const SLEEP_WAIT_MS = Number(getArg("sleep-wait-ms", "38000"));
const IDLE_WINDOW_MS = Number(getArg("idle-window-ms", "5000"));

/**
 * 예산.
 *
 * **유휴는 «일한 프레임 수»로 잰다** — 초당 CPU 는 주사율에 비례해 실행 방식이
 * 바뀌면 5배씩 움직이지만(위 「실행 방식」 표), 「잠들었나」는 0 이냐 전량이냐로
 * 갈린다. 실측: 잠든 3D 0/300, 안 잠든 3D 300/300. 상한 5 는 램프가 걸치는
 * 경계 프레임 몇 개만 허용하는 값이다.
 *
 * 드래그 p95 는 2D 대조군(2.7~3.6ms)의 여유 배수. **한 실행 방식 안에서만**
 * 전·후를 비교한다.
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

/** rAF 콜백을 감싸 «우리 코드가 한 프레임에 붙잡고 있던 시간» 을 모은다. */
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
      // 프라이빗 모드 — 3D 를 못 켜면 아래 dome() 이 null 이라 그 자리에서 드러난다.
    }
  }, view3d);
  await page.goto(`${BASE}/ko/topology?synth=${SYNTH}&guides=off&e2e=1`, { waitUntil: "load" });
  await page.evaluate(WRAP);
  await page.waitForTimeout(5000);
}

/** 무입력 창의 초당 CPU(ms) — 「잠들었나」의 유일한 정직한 답. */
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

/** 노드를 끌고, **정말 노드를 끌었는지 확인한 뒤** 콜백 시간을 돌려준다. */
async function measureNodeDrag(page) {
  const box = await page.locator("canvas").first().boundingBox();
  const target = await page.evaluate(() => {
    const api = window.__atlasMap;
    if (!api) return { error: "__atlasMap 없음 — ?e2e=1 가 빠졌거나 빌드가 옛것이다" };
    const vw = innerWidth;
    const vh = innerHeight;
    const cands = api
      .nodes()
      .filter((n) => n.draggable && !n.hidden && n.x > 120 && n.y > 120 && n.x < vw - 120 && n.y < vh - 120);
    if (cands.length === 0) return { error: "끌 수 있는 노드가 화면 안에 없다" };
    // 이웃이 많을수록 부하가 크다 — 가장 나쁜 경우를 재려면 위 티어를 고른다.
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
  await page.mouse.move(sx + 12, sy + 8); // 히스테리시스를 넘겨 잡기를 확정
  // ★ 사후 확인 — 배경을 밀고 있으면 그 측정은 무효다.
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
  // 기본은 창을 띄운다 — 표시 파이프라인이 있어야 실기기와 같은 경로를 탄다.
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
  const label = view3d ? "3D 돔" : "2D (대조)";
  await openMap(page, view3d);
  const dome = await page.evaluate(() => window.__atlasMap?.dome?.() ?? null);
  if (view3d && dome === null) {
    rows.push({ label, error: "3D 가 켜지지 않았다 — localStorage 스위치를 확인" });
    continue;
  }
  const drag = await measureNodeDrag(page);
  let idle = null;
  if (!SKIP_IDLE) {
    // **커서를 캔버스 밖으로 뺀다.** 캔버스 위에 두면 자율 회전이 그 이유로
    // 멎어서, 「앰비언트 휴면이 재웠다」와 「커서가 세웠다」가 구별되지 않는다.
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
console.log(`\n  3D 돔 비용 — 볼트 ${SYNTH} 노드, 앱 rAF 콜백 시간(ms) · ${HEADLESS ? "헤드리스" : "창 있음"}\n`);
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
      `  ${row.label.padEnd(12)} 노드 드래그 ${grabbedNode ? "잡음 ✓" : `❌ ${d.grabbed?.kind} (배경을 밀었다 — 무효)`}` +
        `  p95 ${String(d.work.p95).padStart(6)} · 최악 ${String(d.work.max).padStart(6)}` +
        (overBudget ? `  ❌ 예산 ${DRAG_BUDGET_P95_MS}ms 초과` : ""),
    );
  }
  if (row.idle) {
    const over = row.idle.busyFrames > IDLE_BUDGET_BUSY_FRAMES;
    if (over) failed += 1;
    console.log(
      `  ${"".padEnd(12)} 유휴(무입력 ${Math.round(SLEEP_WAIT_MS / 1000)}s 후) ` +
        `일한 프레임 ${row.idle.busyFrames}/${row.idle.frames} · ${String(row.idle.cpuMsPerSec).padStart(6)} ms/s(참고)` +
        (over ? `  ❌ 예산 ${IDLE_BUDGET_BUSY_FRAMES}프레임 초과 — 앰비언트 휴면이 깨졌다` : " ✓"),
    );
  }
  console.log("");
}

if (failed > 0) {
  console.error(`  ${failed}건이 예산을 넘었거나 측정이 무효다.\n`);
  process.exit(1);
}

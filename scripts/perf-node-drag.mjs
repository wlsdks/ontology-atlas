/**
 * 노드 드래그 프레임 비용 측정 — 2026-07-31 렉 사고의 재현 하네스.
 *
 * ## 왜 이 파일이 필요한가
 *
 * 이 사고에서 **다섯 번 재현에 실패했다.** 전부 같은 이유였다: 합성 포인터
 * 이벤트(`dispatchEvent(new PointerEvent(...))`)는 `isTrusted: false` 라
 * `setPointerCapture` 가 거부되고, 노드 잡기 경로가 중간에 끊겨 **배경 팬으로
 * 흘러간다.** 팬은 물리 시뮬을 깨우지 않으므로 언제나 빨랐고, 그래서 "안 느린데요"
 * 를 다섯 번 보고했다. 소유자가 화면을 보고 *"너는 노드가 아니라 그냥 배경을
 * 드래그하던데?"* 라고 짚어준 뒤에야 끝났다.
 *
 * > **입력이 진짜여야 코드 경로도 진짜다.** 그래서 이 하네스는 CDP 마우스
 * > (`page.mouse`)만 쓴다. 페이지 안에서 이벤트를 만들지 않는다.
 *
 * ## 무엇을 재는가
 *
 * `work` = 앱의 rAF 콜백이 **동기적으로** 쓴 시간. 프레임 간격(`gap`)이 아니다 —
 * 간격은 디스플레이 주사율과 하네스 왕복에 오염되지만, 콜백 시간은 우리 코드의
 * 몫이다. 이 사고의 신호가 정확히 여기 있었다(3000노드 139.9ms vs 31노드 0.9ms).
 *
 * ## 쓰는 법
 *
 *   node scripts/perf-node-drag.mjs [baseUrl]
 *
 * 기본 `http://localhost:4173`. 정적 빌드(`pnpm build` + 정적 서버)가 떠 있어야 한다.
 */

import { chromium } from "@playwright/test";
import { rmSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:4173";
// 실행마다 **새 프로필**. 고정 경로를 쓰면 앞 실행의 크롬이 아직 물고 있을 때
// `rmSync` 가 그 발밑을 빼서 창이 스스로 닫히고, 증상이 "Target page has been
// closed" 로 나와 측정 실패처럼 보인다(실제로 두 번 그랬다).
const PROFILE = `/tmp/atlas-perf-${process.pid}`;

/** 재는 볼트 규모 — 작은 쪽이 «노드 수에 비례하는가» 의 대조군이다. */
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
 * 끌 수 있는 노드를 **앱에게 물어본다.** (`?e2e=1` 이 켜는 `window.__atlasMap`)
 *
 * 종전엔 캔버스를 훑어 커서가 `pointer` 인 지점을 찾았다. 그건 **호버 히트**일
 * 뿐 **잡히는지**가 아니다 — 잡기는 `sim.hasNode()` 를 통과해야 하고, 실패하면
 * 조용히 배경 팬이 된다. 그래서 여섯 번을 배경만 밀었다. 이제는 `draggable` 을
 * 앱이 직접 말해 주므로 그 실패가 원리적으로 불가능하다.
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
    // 이웃이 많을수록 시뮬 부하가 크다 — 가장 나쁜 경우를 재려면 도메인 급을 고른다.
    const rank = { project: 0, domain: 1, capability: 2, element: 3 };
    cands.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
    const n = cands[0];
    return { id: n.id, kind: n.kind, label: n.label, x: n.x, y: n.y, total: cands.length };
  });
}

/** 노드를 끌고, **정말 노드를 끌었는지 확인한 뒤** 콜백 시간을 돌려준다. */
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
  await page.mouse.move(sx + 12, sy + 8); // 히스테리시스를 넘겨 잡기를 확정시킨다
  // ★ 사후 확인 — 배경을 밀고 있으면 여기서 «pan» 이 나온다. 그러면 그 측정은 버린다.
  const grabbed = await page.evaluate(() => window.__atlasMap?.interaction());

  // **사람이 끄는 속도로.** `mouse.move` 한 번은 CDP 왕복이라 ~24ms 가 든다 —
  // 45번을 낱개로 부르면 «드래그» 가 아니라 슬로모션이 되고, 그 느림이 앱의
  // 느림처럼 보인다(소유자 실보고: "드래그가 너무 심각하게 느리던데").
  // `steps` 는 **한 왕복 안에서** 보간된 이동을 여러 번 쏘므로 왕복 비용이
  // 그만큼 나뉘고, 실제 포인터 스트림에 가까워진다.
  const LEG = 6; // 궤적을 몇 개의 구간으로 나눌까
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

// **프로필은 띄우기 «전에» 지운다.** 뒤에 지우면 실행 중인 브라우저의 발밑을
// 빼는 셈이라 창이 스스로 닫히고, 그 증상이 "Target page has been closed" 로
// 나와 측정 실패처럼 보인다(실제로 한 번 그랬다).
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, // 표시 파이프라인이 있어야 실기기와 같은 경로를 탄다
  viewport: null,
  args: ["--start-maximized", "--force-device-scale-factor=2"],
});

// 화면 계기도 켠 채로 돈다 — 하네스 숫자와 화면 숫자가 같은 것을 말하는지
// 사람이 눈으로 대조할 수 있어야 한다.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("atlas.appearance.frameMeter", "on");
  } catch {
    // 프라이빗 모드 등 — 계기가 없을 뿐 측정은 그대로 된다.
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
  // ★ 진짜 마우스. 합성 이벤트는 isTrusted:false 라 setPointerCapture 가 거부되고
  //   노드 잡기가 끊겨 팬으로 흘러간다 — 이 하네스가 존재하는 이유의 절반이다.
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
  // **p95 를 대표값으로 읽는다.** 드래그를 사람 속도로 끌면 표본에 유휴 프레임이
  // 섞여 중앙값이 0.2ms 로 내려간다 — 앱이 빨라진 게 아니라 «끄는 동안» 이
  // 표본에서 소수가 된 것이다. 비용은 끄는 프레임에만 나므로 꼬리를 봐야 한다.
  console.log(
    `  ${"".padEnd(16)} p95 ${String(r.work.p95).padStart(6)} · 최악 ${String(r.work.max).padStart(6)} ` +
      `(중앙 ${r.work.med} — 유휴 프레임 포함이라 참고용) · 백킹 ${r.backing?.width}x${r.backing?.height}\n`,
  );
}
console.log("");

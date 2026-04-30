import { test } from "@playwright/test";

/**
 * Sigma zoom-based LOD 전환 후 idle FPS를 측정한다.
 * WebGL 렌더러는 노드별 DOM을 만들지 않으므로 DOM 노드 수가 아니라 캔버스
 * 마운트와 rAF 기준 FPS만 측정한다.
 */

const SIZES = [500, 1000, 2000, 3000];

function makeSynthScript(count: number) {
  return `
    const now = new Date(2026, 3, 1).toISOString();
    const CATS = ["in-progress", "planned"];
    const STATS = ["live", "developing", "planning", "idea"];
    const hubs = ["iam", "reactor"];
    const projects = [];
    for (const slug of hubs) {
      projects.push({
        slug, name: slug.toUpperCase(), category: "in-progress", status: "live",
        description: "hub", tags: [], stack: [], links: [], dependencies: [],
        screenshots: [], timeline: {}, isHub: true, position: { x: 0, y: 0 },
        createdAt: new Date(now), updatedAt: new Date(now),
      });
    }
    const NON_HUB = ${count} - hubs.length;
    for (let i = 0; i < NON_HUB; i++) {
      const deps = [];
      if (i % 10 < 1) deps.push(hubs[i % hubs.length]);
      projects.push({
        slug: "synth-" + i, name: "Synth " + i,
        category: CATS[i % CATS.length], status: STATS[i % STATS.length],
        description: "stress-" + i, tags: [], stack: [], links: [],
        dependencies: deps, screenshots: [], timeline: {}, isHub: false,
        position: { x: 0, y: 0 }, createdAt: new Date(now), updatedAt: new Date(now),
      });
    }
    window.__synthProjects = projects;
  `;
}

for (const N of SIZES) {
  test(`LOD far: N=${N} aggregate 활성 시 FPS`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript({ content: makeSynthScript(N) });

    await page.goto("/dev/stress-topology/", { waitUntil: "domcontentloaded" });
    const sigma = page.getByTestId("sigma-topology-viewport");
    const ok = await sigma
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ok, "Sigma 토폴로지 마운트 불가");

    // zoom out으로 Sigma LOD hide ratio 구간에 진입.
    const vp = page.viewportSize();
    if (vp) {
      await page.mouse.move(vp.width / 2, vp.height / 2);
      for (let i = 0; i < 30; i++) {
        await page.mouse.wheel(0, 500);
      }
    }
    await page.waitForTimeout(600);

    const idleFps = await page.evaluate(async () => {
      let frames = 0;
      const start = performance.now();
      return await new Promise<number>((resolve) => {
        function tick() {
          frames++;
          if (performance.now() - start < 1500) requestAnimationFrame(tick);
          else resolve(Math.round((frames * 1000) / (performance.now() - start)));
        }
        requestAnimationFrame(tick);
      });
    });

    console.log(
      `[STRESS-LOD] N=${N} renderer=sigma idleFps=${idleFps}`,
    );
  });
}

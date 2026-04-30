import { test } from "@playwright/test";

/**
 * 합성 프로젝트 N개를 주입해 홈 토폴로지의 렌더·드래그 프레임을 측정한다.
 * subscribeProjects가 window.__synthProjects를 최우선으로 읽도록 수정됐기에
 * Firestore 접속 없이 실 Sigma 토폴로지 경로를 그대로 돌릴 수 있다.
 */

const SIZES = [500, 1000, 2000, 3000];

function makeSynthProjectsScript(count: number) {
  return `
    const now = new Date(2026, 3, 1).toISOString();
    const CATS = ["in-progress", "planned"];
    const STATS = ["live", "developing", "planning", "idea"];
    const hubs = ["iam", "reactor"];
    const projects = [];
    for (const slug of hubs) {
      projects.push({
        slug,
        name: slug.toUpperCase(),
        category: "in-progress",
        status: "live",
        description: "hub",
        tags: [],
        stack: [],
        links: [],
        dependencies: [],
        screenshots: [],
        timeline: {},
        isHub: true,
        position: { x: 0, y: 0 },
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
    }
    const NON_HUB = ${count} - hubs.length;
    for (let i = 0; i < NON_HUB; i++) {
      const deps = [];
      // 10%는 허브에 의존. 나머지 일부는 다른 노드에.
      if (i % 10 < 1) deps.push(hubs[i % hubs.length]);
      if (i > 20 && i % 7 === 0) deps.push("synth-" + (i - 20));
      projects.push({
        slug: "synth-" + i,
        name: "Synth " + i,
        category: CATS[i % CATS.length],
        status: STATS[i % STATS.length],
        description: "stress-" + i,
        tags: [],
        stack: [],
        links: [],
        dependencies: deps,
        screenshots: [],
        timeline: {},
        isHub: false,
        position: { x: 0, y: 0 },
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
    }
    window.__synthProjects = projects;
  `;
}

for (const N of SIZES) {
  test(`stress: ${N}개 노드 — 렌더·드래그 측정`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript({ content: makeSynthProjectsScript(N) });

    const t0 = Date.now();
    await page.goto("/dev/stress-topology/", { waitUntil: "domcontentloaded" });
    const sigma = page.getByTestId("sigma-topology-viewport");
    const ok = await sigma
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !ok,
      "Sigma 토폴로지가 60초 내 마운트되지 않음 — 이 조합이 실질적으로 사용 불가",
    );

    const mountMs = Date.now() - t0;

    // FPS 측정 — 1.5초 동안 rAF 카운트.
    const fps = await page.evaluate(async () => {
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

    // 드래그 시도: WebGL 캔버스 중앙 부근 → offset. 그동안 FPS 재측정.
    const box = await sigma.boundingBox();
    let dragFps: number | null = null;
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const fpsDuringDrag = page.evaluate(() => {
        let frames = 0;
        const start = performance.now();
        return new Promise<number>((resolve) => {
          function tick() {
            frames++;
            if (performance.now() - start < 1500) requestAnimationFrame(tick);
            else resolve(Math.round((frames * 1000) / (performance.now() - start)));
          }
          requestAnimationFrame(tick);
        });
      });
      // 실제 드래그 이동
      for (const t of [0.25, 0.5, 0.75, 1]) {
        await page.mouse.move(
          box.x + box.width / 2 + 200 * t,
          box.y + box.height / 2 + 100 * t,
          { steps: 6 },
        );
      }
      dragFps = await fpsDuringDrag;
      await page.mouse.up();
    }

    console.log(
      `[STRESS] N=${N} renderer=sigma mount=${mountMs}ms idleFps=${fps} dragFps=${dragFps}`,
    );
  });
}

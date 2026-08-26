import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

type Camera = { x: number; y: number; scale: number; width: number; height: number };

async function readCamera(page: Page): Promise<Camera | null> {
  return page.evaluate(() => window.__atlasMap?.camera() ?? null);
}

/** Measures the screen after the camera target and actual value arrive and stop. */
async function settleCamera(page: Page) {
  await expect
    .poll(
      async () => {
        const samples: Camera[] = [];
        for (let index = 0; index < 3; index += 1) {
          const camera = await readCamera(page);
          if (!camera) return false;
          samples.push(camera);
          if (index < 2) await page.waitForTimeout(250);
        }
        return samples.slice(1).every((camera, index) => {
          const before = samples[index];
          return (
            Math.abs(before.x - camera.x) < 0.02 &&
            Math.abs(before.y - camera.y) < 0.02 &&
            Math.abs(before.scale - camera.scale) < 0.0002
          );
        });
      },
      { timeout: 30_000, message: "카메라가 정착하지 않아 프레이밍을 비교할 수 없다" },
    )
    .toBe(true);
}

test("짧은 선택 인스펙터도 실제 자유 영역으로 카메라를 민다", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("demo:sample-source:v1", "storefront");
    window.sessionStorage.setItem("demo:first-run-starter-dismissed:v1", "1");
  });
  await page.goto(
    "/en/topology/?e2e=1&guides=off&p=element%3Acart-session&open=capability%3Acart%2Cdomain%3Aorder%2Cproject%3Astorefront",
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.getByTestId("topology-v2-detail-panel")).toBeVisible({
    timeout: 20_000,
  });
  await settleCamera(page);

  const measured = await page.evaluate(() => {
    const probe = window.__atlasMap;
    const canvas = document.querySelector<HTMLElement>(
      '[data-testid="topology-map-v2-canvas"]',
    );
    const panel = document.querySelector<HTMLElement>(
      '[data-testid="topology-node-popover-positioner"]',
    );
    const selectedId = probe?.selection().nodeId;
    const selected = probe?.nodes().find((node) => node.id === selectedId);
    if (!probe || !canvas || !panel || !selected) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const selectedX = canvasRect.left + selected.x;
    return {
      marker: panel.dataset.topologyCameraObstacle,
      panelHeightRatio: panelRect.height / canvasRect.height,
      panelWidth: panelRect.width,
      panelLeft: panelRect.left,
      canvasRight: canvasRect.right,
      freeCenterX: (canvasRect.left + panelRect.left) / 2,
      canvasCenterX: canvasRect.left + canvasRect.width / 2,
      selectedX,
    };
  });

  expect(measured, "짧은 선택 인스펙터 기하를 측정하지 못했다").not.toBeNull();
  expect(
    measured!.panelHeightRatio,
    "이 fixture가 60% 휴리스틱 아래의 짧은 인스펙터를 만들지 않았다",
  ).toBeLessThan(0.6);
  expect(measured!.marker).toBe("side-panel");
  expect(measured!.panelWidth).toBeGreaterThan(300);
  expect(measured!.panelLeft).toBeGreaterThan(measured!.canvasCenterX);
  expect(measured!.panelLeft).toBeLessThan(measured!.canvasRight);
  expect(Math.abs(measured!.selectedX - measured!.freeCenterX)).toBeLessThan(
    Math.abs(measured!.selectedX - measured!.canvasCenterX),
  );
});

test("390px의 넓은 하단 시트는 수평 카메라 인셋으로 오인되지 않는다", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("demo:sample-source:v1", "storefront");
    window.sessionStorage.setItem("demo:first-run-starter-dismissed:v1", "1");
  });
  await page.goto(
    "/ko/topology/?e2e=1&guides=off&p=element%3Acart-session&open=capability%3Acart%2Cdomain%3Aorder%2Cproject%3Astorefront",
    { waitUntil: "domcontentloaded" },
  );

  const panel = page.getByTestId("topology-node-popover-positioner");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await settleCamera(page);
  const withWideSheet = await readCamera(page);
  expect(withWideSheet).not.toBeNull();

  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="topology-map-v2-canvas"]');
    const obstacle = document.querySelector<HTMLElement>('[data-testid="topology-node-popover-positioner"]');
    if (!canvas || !obstacle) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const obstacleRect = obstacle.getBoundingClientRect();
    return {
      marker: obstacle.dataset.topologyCameraObstacle,
      widthRatio: obstacleRect.width / canvasRect.width,
      intersects: obstacleRect.left < canvasRect.right && obstacleRect.right > canvasRect.left,
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.marker).toBe("side-panel");
  expect(geometry!.widthRatio).toBeGreaterThanOrEqual(0.6);
  expect(geometry!.intersects).toBe(true);
  expect(
    await page.evaluate(() => window.__atlasMap?.obstacleInsets() ?? null),
    "a full-width mobile sheet must contribute no left/right camera inset",
  ).toEqual({ left: 0, right: 0 });
});

/**
 * Reproduces the actual geometry when the agent dock appears, without an ACP process.
 *
 * `main#main` is the product structure where the map flex area and the right dock are siblings. Attaching a temporary sibling of the same width here makes the map ResizeObserver, canvas backing, and camera follow the same path as in the actual app. This method is more important than a simple viewport resize because the reported defect condition is that **only the map area** shrinks while the window size remains the same.
 */
test("우측 도크로 지도 폭이 줄면 현재 overview를 새 가용영역에 다시 맞춘다", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("demo:sample-source:v1", "dogfood");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap?.nodes().length ?? 0), {
      timeout: 20_000,
      message: "지도 검사 창구가 열리지 않았다",
    })
    .toBeGreaterThan(20);

  const starter = page.getByTestId("first-run-starter");
  if (await starter.isVisible()) {
    await page.getByTestId("first-run-starter-dismiss").click();
    await expect(starter).toHaveCount(0);
  }

  // Create INDEX as a rail to match the reporting condition. This click triggers both the product's token cache update and
  // the normal fit path, so afterwards only dock resize remains as a variable.
  const foldIndex = page.getByTestId("topology-index-fold");
  if (await foldIndex.isVisible()) {
    await foldIndex.click();
  }
  await expect(page.locator("html")).toHaveAttribute("data-topology-index", "collapsed");
  await settleCamera(page);
  const before = await readCamera(page);
  expect(before).not.toBeNull();

  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main#main");
    if (!main) throw new Error("map workbench main not found");
    const dock = document.createElement("aside");
    dock.dataset.e2eViewportDock = "true";
    dock.style.width = "0px";
    dock.style.flex = "0 0 auto";
    main.appendChild(dock);

    const state = window as typeof window & {
      __e2eViewportDockCameraSamples?: Camera[];
      __atlasMap?: { camera: () => Camera | null };
    };
    state.__e2eViewportDockCameraSamples = [];
    let step = 0;
    const advance = () => {
      step += 1;
      dock.style.width = `${(420 * step) / 16}px`;
      const camera = state.__atlasMap?.camera();
      if (camera) state.__e2eViewportDockCameraSamples?.push(camera);
      if (step < 16) requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __e2eViewportDockCameraSamples?: Camera[];
              }
            ).__e2eViewportDockCameraSamples?.length ?? 0,
        ),
      { timeout: 15_000 },
    )
    .toBe(16);
  const samples = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __e2eViewportDockCameraSamples?: Camera[];
        }
      ).__e2eViewportDockCameraSamples ?? [],
  );
  const midTransition = samples[11];
  expect(midTransition).toBeDefined();
  // If the camera starts late, only after the dock is almost fully open, the user sees a stutter of two movements. It must follow along on the same clock from when the width begins to change.
  expect(
    Math.abs(midTransition.x - before!.x) +
      Math.abs(midTransition.y - before!.y) +
      Math.abs(midTransition.scale - before!.scale) * 100,
  ).toBeGreaterThan(0.05);
  await expect
    .poll(async () => (await readCamera(page))?.width ?? 0, { timeout: 15_000 })
    .toBeLessThan(before!.width - 350);
  // Two frames after the last resize, when the expensive viewport layer has settled.
  // Unrelated rerenders like ACP boot should not wake the camera after this point.
  await page.waitForTimeout(100);
  const atResizeSettle = await readCamera(page);
  expect(atResizeSettle).not.toBeNull();
  const postResizeSamples: Camera[] = [atResizeSettle!];
  for (let sample = 0; sample < 6; sample += 1) {
    await page.waitForTimeout(100);
    const camera = await readCamera(page);
    if (camera) postResizeSamples.push(camera);
  }
  await settleCamera(page);
  const automatic = await readCamera(page);
  expect(automatic).not.toBeNull();

  // Locks that this check does not spin. The new width must actually change the fit scale.
  expect(Math.abs(automatic!.scale - before!.scale)).toBeGreaterThan(0.001);

  const totalMotion =
    Math.abs(automatic!.x - before!.x) +
    Math.abs(automatic!.y - before!.y) +
    Math.abs(automatic!.scale - before!.scale) * 100;
  /*
   * **Where the camera is aimed, not how far it has travelled.**
   *
   * This used to assert that under 35% of the motion remained once the dock
   * transition ended. The concern was real — a camera that only starts moving
   * after ACP boot reads as stutter — but it sampled an interpolating position at
   * a wall-clock moment, so it measured the machine as much as the product. On
   * 2026-08-26 it read 0.360 against the 0.35 threshold on one laptop while every
   * CI run passed, and `design-gates.md` already names the mistake: gate by call
   * count, not milliseconds.
   *
   * The invariant that matters is causal and timing-free — the resize must aim
   * the camera at the new area straight away. How many frames the travel takes is
   * the machine's business.
   */
  const targetAtDockEnd = await page.evaluate(
    () => window.__atlasMap?.cameraTarget?.() ?? null,
  );
  expect(targetAtDockEnd, "the map hatch did not expose a camera target").not.toBeNull();
  const targetMiss =
    Math.abs(automatic!.x - targetAtDockEnd!.x) +
    Math.abs(automatic!.y - targetAtDockEnd!.y) +
    Math.abs(automatic!.scale - targetAtDockEnd!.scale) * 100;
  expect(
    targetMiss / totalMotion,
    "the dock resize must aim the camera at the new area at once; only the travel may lag",
  ).toBeLessThan(0.02);
  const motionRemainingAfterResizeSettle =
    Math.abs(automatic!.x - atResizeSettle!.x) +
    Math.abs(automatic!.y - atResizeSettle!.y) +
    Math.abs(automatic!.scale - atResizeSettle!.scale) * 100;
  expect(
    motionRemainingAfterResizeSettle / totalMotion,
    '도크가 정착한 뒤 unrelated work가 카메라 잔여 이동을 다시 깨웠다',
  ).toBeLessThan(0.02);
  const maxPostResizeDrift = Math.max(
    ...postResizeSamples.map(
      (camera) =>
        Math.abs(automatic!.x - camera.x) +
        Math.abs(automatic!.y - camera.y) +
        Math.abs(automatic!.scale - camera.scale) * 100,
    ),
  );
  expect(
    maxPostResizeDrift / totalMotion,
    '도크 정착 뒤 underdamped camera가 되튕겨 두 번째 움직임을 만들었다',
  ).toBeLessThan(0.0001);

  // The correct answer for auto-reframe is the same as the user-triggered "Fit to Map".
  await page.getByRole("button", { name: "지도 전체 맞추기" }).click();
  await settleCamera(page);
  const explicit = await readCamera(page);
  expect(explicit).not.toBeNull();
  expect(automatic!.x).toBeCloseTo(explicit!.x, 1);
  expect(automatic!.y).toBeCloseTo(explicit!.y, 1);
  expect(automatic!.scale).toBeCloseTo(explicit!.scale, 3);
});

test("노드 인스펙터를 닫으면 퇴장 중 패널 폭을 남기지 않고 overview로 돌아간다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("demo:sample-source:v1", "dogfood");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap?.nodes().length ?? 0), { timeout: 20_000 })
    .toBeGreaterThan(20);

  const starter = page.getByTestId("first-run-starter");
  if (await starter.isVisible()) {
    await page.getByTestId("first-run-starter-dismiss").click();
    await expect(starter).toHaveCount(0);
  }
  const foldIndex = page.getByTestId("topology-index-fold");
  if (await foldIndex.isVisible()) await foldIndex.click();
  await expect(page.locator("html")).toHaveAttribute("data-topology-index", "collapsed");
  await settleCamera(page);

  const target = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="topology-map-v2-canvas"]');
    const node = window.__atlasMap
      ?.nodes()
      .find((candidate) => candidate.kind === "domain" && !candidate.hidden);
    if (!canvas || !node) return null;
    const box = canvas.getBoundingClientRect();
    return { x: box.left + node.x, y: box.top + node.y };
  });
  expect(target, "클릭할 도메인 노드를 지도에서 찾지 못했다").not.toBeNull();
  await page.mouse.click(target!.x, target!.y);
  await expect(page.getByTestId("topology-v2-detail-panel")).toBeVisible();
  await settleCamera(page);

  await page.getByTestId("topology-v2-detail-panel-close").click();
  await expect(page.getByTestId("topology-v2-detail-panel")).toHaveCount(0, { timeout: 10_000 });
  await settleCamera(page);
  const automatic = await readCamera(page);
  expect(automatic).not.toBeNull();

  await page.getByRole("button", { name: "지도 전체 맞추기" }).click();
  await settleCamera(page);
  const explicit = await readCamera(page);
  expect(explicit).not.toBeNull();
  expect(automatic!.x).toBeCloseTo(explicit!.x, 1);
  expect(automatic!.y).toBeCloseTo(explicit!.y, 1);
  expect(automatic!.scale).toBeCloseTo(explicit!.scale, 3);
});

import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

type Camera = { x: number; y: number; scale: number; width: number; height: number };

async function readCamera(page: Page): Promise<Camera | null> {
  return page.evaluate(() => window.__atlasMap?.camera() ?? null);
}

/** 카메라 목표뿐 아니라 실제 값이 도착해 멈춘 뒤의 화면을 잰다. */
async function settleCamera(page: Page) {
  await expect
    .poll(
      async () => {
        const before = await readCamera(page);
        await page.waitForTimeout(250);
        const after = await readCamera(page);
        if (!before || !after) return false;
        return (
          Math.abs(before.x - after.x) < 0.02 &&
          Math.abs(before.y - after.y) < 0.02 &&
          Math.abs(before.scale - after.scale) < 0.0002
        );
      },
      { timeout: 30_000, message: "카메라가 정착하지 않아 프레이밍을 비교할 수 없다" },
    )
    .toBe(true);
}

/**
 * 에이전트 도크가 들어오는 실제 기하를 ACP 프로세스 없이 재현한다.
 *
 * `main#main`은 지도 flex 칸과 우측 도크가 형제인 제품 구조다. 여기에 같은 폭의
 * 임시 형제를 붙이면 지도 ResizeObserver·캔버스 백킹·카메라가 실제 앱과 같은
 * 경로를 탄다. 단순 viewport resize보다 이 방법이 중요한 이유는 창 전체 크기는
 * 그대로인데 **지도 칸만** 줄어드는 것이 보고된 결함의 조건이기 때문이다.
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

  // 보고 조건과 같게 INDEX를 레일로 만든다. 이 클릭은 제품의 토큰 캐시 갱신과
  // 정상 fit 경로를 모두 타므로, 이후에는 오직 도크 resize만 변수로 남는다.
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
  // 도크가 거의 다 열린 뒤에야 카메라가 뒤늦게 출발하면 사용자는 두 번
  // 움직이는 버벅임으로 본다. 폭이 변하는 동안부터 같은 클럭으로 따라가야 한다.
  expect(
    Math.abs(midTransition.x - before!.x) +
      Math.abs(midTransition.y - before!.y) +
      Math.abs(midTransition.scale - before!.scale) * 100,
  ).toBeGreaterThan(0.05);
  await expect
    .poll(async () => (await readCamera(page))?.width ?? 0, { timeout: 15_000 })
    .toBeLessThan(before!.width - 350);
  // 마지막 resize를 받은 뒤 expensive viewport layer가 정착하는 두 프레임을
  // 넘긴 시점. 이후 ACP 부팅 같은 unrelated rerender가 카메라를 다시 깨우면 안 된다.
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

  // 이 검사가 공회전하지 않음을 잠근다. 새 폭은 fit 배율을 실제로 바꿔야 한다.
  expect(Math.abs(automatic!.scale - before!.scale)).toBeGreaterThan(0.001);

  const lastTransition = samples.at(-1)!;
  const totalMotion =
    Math.abs(automatic!.x - before!.x) +
    Math.abs(automatic!.y - before!.y) +
    Math.abs(automatic!.scale - before!.scale) * 100;
  const motionRemainingAtDockEnd =
    Math.abs(automatic!.x - lastTransition.x) +
    Math.abs(automatic!.y - lastTransition.y) +
    Math.abs(automatic!.scale - lastTransition.scale) * 100;
  // 패널 폭 전환이 끝날 때 카메라가 대부분 도착해야 한다. 남은 이동이 크면
  // 그 직후 ACP 시작 비용에 멈췄다가 다시 움직여 실제 앱에서 버벅임으로 보인다.
  expect(motionRemainingAtDockEnd / totalMotion).toBeLessThan(0.35);
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

  // 자동 리프레임의 정답은 사용자가 누르는 정본 「지도 전체 맞추기」와 같다.
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

import { expect, test, type Page } from "@playwright/test";

/**
 * Sigma/WebGL 토폴로지 드래그 회귀 방지 spec.
 *
 * Sigma는 노드별 DOM 엘리먼트를 만들지 않으므로 선택 노드의 DOM focus label을
 * 기준으로 대략적인 노드 중심을 계산하고, 드래그 후 localStorage에 저장된
 * Sigma 좌표가 생겼는지 확인한다.
 */

const POSITION_STORAGE_KEY = "demo:sigma-node-positions:v1";

test.use({ viewport: { width: 1920, height: 1080 } });

async function openTopology(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, POSITION_STORAGE_KEY);
  await page.goto("/en/topology/");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(600);
}

async function findDraggableNodePoints(page: Page) {
  const viewport = await page.getByTestId("sigma-topology-viewport").boundingBox();
  if (!viewport) throw new Error("sigma viewport is missing");
  const points: Array<{ x: number; y: number }> = [];
  for (let y = viewport.y + 120; y < viewport.y + viewport.height - 120; y += 48) {
    for (let x = viewport.x + 120; x < viewport.x + viewport.width - 120; x += 48) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(10);
      const cursor = await page
        .getByTestId("sigma-topology-viewport")
        .evaluate((el) => getComputedStyle(el).cursor);
      if (cursor === "pointer") points.push({ x, y });
    }
  }
  if (points.length === 0) throw new Error("no draggable sigma node was found");
  return points;
}

async function storedSigmaPositions(page: Page) {
  return page.evaluate(
    ({ storageKey }) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
      return parsed;
    },
    { storageKey: POSITION_STORAGE_KEY },
  );
}

test("Sigma 토폴로지에서 드래그가 노드 위치를 저장한다", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await openTopology(page);
  expect(await storedSigmaPositions(page)).toBeNull();

  const candidates = await findDraggableNodePoints(page);
  let stored = await storedSigmaPositions(page);
  for (const center of candidates) {
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    for (const t of [0.25, 0.5, 0.75, 1]) {
      await page.mouse.move(center.x - 120 * t, center.y - 80 * t, { steps: 4 });
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
    stored = await storedSigmaPositions(page);
    if (Object.keys(stored ?? {}).length > 0) break;
  }
  await page.waitForTimeout(650);

  stored = await storedSigmaPositions(page);
  const storedValues = Object.values(stored ?? {});
  expect(storedValues, "드래그 후 Sigma 좌표가 저장되어야 한다").toHaveLength(1);
  expect(Number.isFinite(storedValues[0]?.x)).toBe(true);
  expect(Number.isFinite(storedValues[0]?.y)).toBe(true);
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});

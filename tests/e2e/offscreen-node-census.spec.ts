import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * 첫 화면이 노드를 **거의 다 보여 주는가**.
 *
 * ## 왜 (2026-08-17)
 *
 * 「대화창에서 노드 이름에 마우스를 올리면 지도가 그 노드를 밝힌다」를 만들고
 * 나서, 그 노드가 **화면 밖이면 밝혀 봐야 안 보인다**는 것을 재 보려다 나온
 * 시험이다. 세어 보니 20개 중 19개가 화면 안이었다 — 첫 화면 맞춤
 * (`computeOverviewCameraTarget`)이 제 몫을 하고 있었다.
 *
 * 그래서 이 시험은 그 성질을 **잠그는 쪽**으로 남는다. 배치나 첫 화면 맞춤이
 * 어긋나면 첫 화면이 텅 비게 되는데, 그건 캔버스라 아무 검사도 못 보고
 * 사람 눈에도 「원래 이런가」로 보인다.
 *
 * ⚠️ **좌표 함정** — `__atlasMap.nodes()` 는 **이미 화면 좌표**를 준다. 여기에
 * 카메라 변환을 한 번 더 걸면 전부 화면 밖으로 나오고, 실제로 그렇게 재서
 * 「20개 중 0개」라는 거짓 결과를 한 번 얻었다.
 */

/** 첫 화면에 보여야 하는 최소 비율. 실측 19/20 = 95%. */
const MIN_ON_SCREEN_RATIO = 0.8;

test("첫 화면이 노드를 거의 다 보여 준다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("topology-map-v2-canvas")).toBeVisible({ timeout: 30_000 });
  // 배치가 정착할 때까지 — 움직이는 중에 세면 숫자가 매번 다르다.
  await page.waitForTimeout(8_000);

  const census = await page.evaluate(() => {
    const map = (
      window as unknown as {
        __atlasMap?: {
          nodes: () => Array<{ id: string; x: number; y: number }>;
          camera: () => { x: number; y: number; scale: number; width: number; height: number } | null;
        };
      }
    ).__atlasMap;
    if (!map) return null;
    const cam = map.camera();
    if (!cam) return null;
    const nodes = map.nodes();
    // ⚠️ `nodes()` 는 **이미 화면 좌표**를 돌려준다(그 구현이 카메라 변환을
    // 안에서 끝낸다). 여기서 한 번 더 변환하면 전부 화면 밖으로 나온다 —
    // 실제로 그렇게 재서 「20개 중 0개가 화면 안」이라는 거짓 결과를 얻었다.
    const inside = nodes.filter(
      (n) => n.x >= 0 && n.x <= cam.width && n.y >= 0 && n.y <= cam.height,
    );
    return { total: nodes.length, inside: inside.length, outside: nodes.length - inside.length, cam };
  });

  expect(census, "지도 창구가 안 열렸다 — 아무것도 못 쟀다").not.toBeNull();
  const { total, inside, outside } = census as { total: number; inside: number; outside: number };
  console.log(`[census] 노드 ${total} · 화면 안 ${inside} · 화면 밖 ${outside}`);
  expect(total, "노드를 하나도 못 읽었다 — 이 시험은 아무것도 못 잰다").toBeGreaterThan(3);
  expect(
    inside / total,
    `첫 화면이 노드의 ${Math.round((inside / total) * 100)}% 만 보여 준다 ` +
      `(화면 밖 ${outside}개). 첫 화면 맞춤이 어긋났거나 배치가 흩어졌다.`,
  ).toBeGreaterThanOrEqual(MIN_ON_SCREEN_RATIO);
});

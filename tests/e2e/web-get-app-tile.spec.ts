import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 「앱 받기」는 **웹의 모든 목적지에서 같은 자리**에 있다.
 *
 * 소유자 요청: *"웹에서는 다양한곳에 앱 다운로드를 유도하는 버튼을 놔주면
 * 좋을듯? 잘보이게"*. 표면마다 배너를 심으면 유도가 아니라 소음이고, 이
 * 저장소의 디자인 게이트가 "더하기만 하는 패스는 실패" 라 부르는 종류다.
 * 그래서 크롬에 하나를 둔다 — 레일 유틸리티 티어는 어느 목적지에서나 같은
 * 자리라, **한 원소가 이미 "다양한 곳"** 이다.
 *
 * 이 스펙이 지키는 것은 그 주장 자체다: 목적지가 늘었는데 레일이 안 따라오면
 * "어디서나 같은 자리" 가 거짓이 된다.
 *
 * 앱에서의 **부재**는 여기서 못 잰다(브라우저에 Tauri 런타임이 없다). 그 축은
 * `show-get-app-tile.test.ts` 가 판정 규칙으로 고정한다 — 설치한 사람에게
 * "앱 받기" 를 권하는 것은 그 자체로 오정보다.
 */

const WEB_SURFACES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/git/",
];

test("웹의 모든 목적지에서 앱 받기 타일이 같은 자리에 있다", async ({ page }) => {
  await seedFirstRunSeen(page);
  const positions: number[] = [];

  for (const surface of WEB_SURFACES) {
    await page.goto(`${surface}?guides=off`, { waitUntil: "networkidle" });

    const tile = page.getByTestId("app-nav-rail-get-app");
    await expect(tile, `${surface}: 타일이 없다`).toBeVisible({ timeout: 15_000 });

    // 목적지는 `/download` 하나다. 레일에서 방문자의 OS 를 추측하지 않는다 —
    // 그 화면이 macOS 파일과 "Windows 준비 중" 을 이미 정직하게 가른다.
    // 레일이 OS 를 판정하면 틀렸을 때 막다른 CTA 가 된다.
    await expect(tile).toHaveAttribute("href", /\/download\/$/);

    const box = await tile.boundingBox();
    expect(box, `${surface}: 타일의 rect 를 못 읽었다`).not.toBeNull();
    positions.push(Math.round(box!.y));
  }

  // "같은 자리" 는 느낌이 아니라 좌표다.
  expect(new Set(positions).size, `자리가 흔들린다: ${positions.join(", ")}`).toBe(1);
});

test("타일이 실제로 다운로드 화면으로 데려간다 — 죽은 CTA 0", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off", { waitUntil: "networkidle" });

  await page.getByTestId("app-nav-rail-get-app").click();
  await page.waitForURL(/\/download\//);

  // 도착 화면이 Windows 방문자를 빈손으로 돌려보내지 않는지도 같이 본다 —
  // 소유자가 "윈도우는 준비중이라고 적어놔주고" 라고 지시한 그 자리다.
  await expect(page.getByText("Windows").first()).toBeVisible();
});

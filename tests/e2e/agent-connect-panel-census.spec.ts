import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * 「터미널에서 연결」 칸의 첫 화면이 다시 복잡해지지 못하게 잠근다.
 *
 * ## 왜 (2026-08-17)
 *
 * 소유자 지적: *"사용하기 복잡하지는 않을까"*. 소스만 읽고 답했더니 틀렸다 —
 * 파일이 1,468줄이고 복사 상태 훅이 11개라 「복사 버튼 11개가 늘어서 있다」고
 * 읽었는데, **열어서 재 보니 화면의 복사 버튼은 4개, 첫 화면에는 1개**였다.
 * 고급 블록이 이미 접혀 있었기 때문이다(`advancedOpen` 기본 false).
 *
 * > **훅 개수는 화면이 아니다.** 조건부 렌더와 접힌 블록은 소스에서 세면
 * > 전부 보이고 화면에서는 안 보인다. 이 저장소가 이미 여러 번 배운 것과 같다:
 * > 판정하려면 **그려진 것**을 재야 한다.
 *
 * 그래서 이 스펙은 「지금 상태를 기록」이 아니라 **래칫**이다. 오늘 값보다
 * 나빠지면 빨개진다 — 늘리는 것은 막고 줄이는 것은 자유다.
 *
 * ⚠️ **이것은 웹 화면이다.** 설치된 앱에서는 연결 버튼이 실제로 파일을 쓰므로
 * 다른 것이 그려진다. 데스크톱 전용 동작의 증명은 설치본에서만 인정된다
 * (`.claude/rules/surfaces.md`) — 이 스펙은 웹 쪽만 잠근다.
 */

/** 오늘 실측(1512×900, 픽스처 볼트). 줄이는 것은 되고 늘리는 것은 안 된다. */
const CEILING = {
  /** 첫 화면에 한 번에 보이는 복사 버튼 */
  copyVisibleFirstScreen: 1,
  /** 칸 전체의 복사 버튼 */
  copyTotal: 4,
  /** 스크롤해야 하는 배수 — 2.0 이면 두 화면 */
  scrollRatio: 2.0,
};
test("「터미널에서 연결」 칸의 첫 화면 인구조사", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(
    page.getByTestId("first-run-starter"),
    "볼트가 안 물렸다 — 아래 측정은 전부 무의미하다.",
  ).toHaveCount(0, { timeout: 30_000 });

  await page.getByTestId("app-settings-trigger").first().click();
  const nav = page.getByTestId("app-settings-nav-agent");
  await expect(nav).toBeVisible({ timeout: 10_000 });
  await nav.click();

  const pane = page.getByTestId("app-settings-pane-agent");
  await expect(pane).toBeVisible({ timeout: 10_000 });

  const census = await pane.evaluate((root) => {
    const paneRect = root.getBoundingClientRect();
    const visibleInPane = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      // 칸이 스크롤되므로 「첫 화면」은 pane 의 보이는 영역과 겹치는 것.
      return r.bottom > paneRect.top && r.top < paneRect.bottom;
    };
    const buttons = [...root.querySelectorAll("button")];
    const copyish = buttons.filter((b) =>
      /복사|copy/i.test(`${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""}`),
    );
    const filled = buttons.filter((b) => {
      const bg = getComputedStyle(b).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(",").map((n) => Number.parseFloat(n));
      const alpha = parts.length > 3 ? parts[3] : 1;
      // 채워진 브랜드 면 = 불투명에 가깝고 파랑이 확실히 앞선 것.
      return alpha > 0.9 && parts[2] > parts[0] + 30 && parts[2] > 120;
    });
    return {
      buttonsTotal: buttons.length,
      buttonsVisible: buttons.filter(visibleInPane).length,
      copyTotal: copyish.length,
      copyVisibleFirstScreen: copyish.filter(visibleInPane).length,
      filledPrimary: filled.length,
      sectionLabels: [...root.querySelectorAll("h2, h3, [class*='SectionLabel']")]
        .map((el) => (el.textContent ?? "").trim())
        .filter(Boolean),
      scrollHeight: Math.round(root.scrollHeight),
      clientHeight: Math.round(root.clientHeight),
    };
  });

  await testInfo.attach("agent-connect-census.json", {
    body: JSON.stringify(census, null, 2),
    contentType: "application/json",
  });
  await pane.screenshot({ path: testInfo.outputPath("agent-connect-panel.png") });
  // eslint-disable-next-line no-console
  console.log("[census]", JSON.stringify(census));

  // 헛돌지 않는가 — 아무것도 못 찾고 초록으로 지나가면 이 래칫은 없는 것과 같다.
  expect(census.buttonsTotal, "칸에서 버튼을 하나도 못 찾았다 — 셀렉터가 죽었다").toBeGreaterThan(3);
  expect(census.copyTotal, "복사 버튼을 하나도 못 찾았다 — 판별식이 죽었다").toBeGreaterThan(0);

  expect(
    census.copyVisibleFirstScreen,
    "첫 화면의 복사 버튼이 늘었다. 늘려야 한다면 접는 것을 먼저 검토하라",
  ).toBeLessThanOrEqual(CEILING.copyVisibleFirstScreen);
  expect(census.copyTotal).toBeLessThanOrEqual(CEILING.copyTotal);
  expect(
    census.scrollHeight / census.clientHeight,
    "칸이 더 길어졌다 — 새 내용은 접힌 블록으로 간다",
  ).toBeLessThanOrEqual(CEILING.scrollRatio);
});

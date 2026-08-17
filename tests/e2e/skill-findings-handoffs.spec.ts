import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { openStubbedSkillFolder, stubSkillFolder } from "./skills-folder-stub";

/**
 * **요약이 그래프의 존재를 말한다** (2026-08-18).
 *
 * 폴더를 열면 처음 보이는 것이 요약인데, 여기서 세던 셋은 값(매 세션 실리는
 * 글자) · 충돌 · 위험이다. 셋 다 스킬 **하나하나**의 성질이라, 스킬들이 서로
 * 얽혀 있다는 사실 자체는 상세로 한 번 들어가야만 보였다 — 실제로는 18개에서
 * 연결이 25개인데도.
 *
 * 잠그는 것 둘: **가장 얽힌 것이 맨 위에 오는가**(정렬이 곧 이 블록의 주장이다)
 * 와 **누르면 그 스킬로 가는가**. 개수만 띄우고 끝나면 알림이지 그래프가 아니다.
 */

const VAULT = {
  // 중심: hub — beta·gamma 가 부르고, hub 가 leaf 를 부른다(정도 3).
  "hub/SKILL.md": [
    "---", "name: hub", "description: 가운데서 받는다", "---", "",
    "1. **받는다**", "2. **넘긴다**", "", "끝나면 /leaf 로 넘긴다.", "",
  ].join("\n"),
  "beta/SKILL.md": [
    "---", "name: beta", "description: 부르는 쪽", "---", "",
    "1. **본다**", "2. **부른다**", "", "/hub 를 부른다.", "",
  ].join("\n"),
  "gamma/SKILL.md": [
    "---", "name: gamma", "description: 부르는 쪽 둘", "---", "",
    "1. **본다**", "2. **부른다**", "", "/hub 를 부른다.", "",
  ].join("\n"),
  "leaf/SKILL.md": [
    "---", "name: leaf", "description: 끝", "---", "",
    "1. **받는다**", "2. **끝낸다**", "", "여기서 끝난다.", "",
  ].join("\n"),
};

test("요약이 가장 얽힌 스킬을 맨 위에 놓고, 누르면 그리로 간다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, VAULT);

  await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);

  const block = page.getByTestId("skills-findings-handoffs");
  await expect(block, "요약에 넘김 블록이 없다 — 그래프의 존재를 안 말한다").toBeVisible({
    timeout: 30_000,
  });

  // ① 정렬이 이 블록의 주장이다 — 가장 얽힌 것이 맨 위.
  const first = block.locator("li").first();
  await expect(first, "가장 얽힌 스킬이 맨 위가 아니다").toContainText("hub");
  await expect(first, "들어오고 나가는 수를 둘 다 안 센다").toContainText("2");

  // ② 누르면 그 스킬로 간다 — 개수만 띄우면 알림이지 그래프가 아니다.
  await first.locator("button").click();
  await expect(page.getByTestId("skill-detail-heading")).toHaveText(/hub/, { timeout: 15_000 });
  await expect(page.getByTestId("skill-detail-handoffs")).toBeVisible();
});

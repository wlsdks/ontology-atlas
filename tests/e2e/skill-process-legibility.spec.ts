import { expect, test } from "@playwright/test";
import ko from "../../messages/ko.json";
import { seedFirstRunSeen } from "./first-run-seed";
import { openStubbedSkillFolder, stubSkillFolder } from "./skills-folder-stub";

/**
 * **절차 칸이 안쪽 표기를 밖으로 내보내지 않는다** (2026-08-18).
 *
 * 절차가 읽히는 스킬이 9/18 에서 15/18 이 되자, 그다음으로 보이는 것이 «그 안에
 * 무엇이 그려지나» 였다. 실물에서 셋이 나왔고 이 검사가 셋을 잠근다:
 *
 * | 새던 것 | 왜 결함인가 |
 * |---|---|
 * | `script` | 자료 종류가 코드의 영어 enum 그대로 화면에 있었다 |
 * | `design-audit/scripts/x.mjs` | 앞자리는 바로 위 제목이 이미 말했다. 3단 사슬은 같은 이유로 이미 떼고 있었는데 이 칸만 전체 경로였다 |
 * | `L38–L38` | 범위가 아닌 것을 범위로 쓰면 읽는 사람이 두 수를 대조하게 된다. 제목으로 적은 절차가 들어오면서 이 모양이 단계의 절반을 넘었다 |
 *
 * 문구는 **카탈로그에서 가져다** 비교한다 — 문장을 여기 베끼면 다듬을 때마다
 * 터지고, 그건 이 저장소가 이미 겪은 실패다.
 */

const VAULT = {
  "runner/SKILL.md": [
    "---",
    "name: runner",
    "description: 스크립트를 돌리는 스킬",
    "---",
    "",
    "## 1. 잰다",
    "",
    "`scripts/measure.mjs` 를 돌린다.",
    "",
    "## 2. 고친다",
    "",
    "끝.",
    "",
  ].join("\n"),
  "runner/scripts/measure.mjs": "console.log(1);\n",
};

test("자료 줄과 줄번호가 안쪽 표기를 내보내지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, VAULT);

  await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);
  const rows = page.getByTestId("skill-row-toggle");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await rows.filter({ hasText: "runner" }).first().click();

  const steps = page.getByTestId("skill-process-step");
  await expect(steps).toHaveCount(2, { timeout: 15_000 });

  // ① 한 줄짜리는 범위로 쓰지 않는다.
  const railText = async () =>
    ((await page.getByTestId("skill-process-rail").textContent()) ?? "").replace(/\s+/g, " ");
  expect(await railText(), "시작과 끝이 같은데 범위로 적었다").not.toMatch(/L(\d+)–L\1\b/);
  expect(await railText()).toMatch(/L6\b/);

  await page.getByTestId("skill-step-disclosure").first().click();
  const resource = page.getByTestId("skill-process-step").first().locator("li").first();
  await expect(resource).toBeVisible({ timeout: 15_000 });
  const line = ((await resource.textContent()) ?? "").replace(/\s+/g, " ");

  // ② 영어 enum 을 그대로 두지 않는다.
  expect(line, `자료 종류가 영어 enum 그대로다: ${line}`).not.toMatch(
    /\b(reference|script|asset|template|example)\b/,
  );
  expect(line).toContain(ko.agentSkills.process.resourceKindScript);

  // ③ 스킬 폴더 앞자리는 떼고 그린다.
  expect(line, `앞자리를 안 뗐다: ${line}`).not.toContain("runner/scripts/");
  expect(line).toContain("scripts/measure.mjs");
});

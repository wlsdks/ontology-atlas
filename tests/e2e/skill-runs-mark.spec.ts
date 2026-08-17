import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { openStubbedSkillFolder, stubSkillFolder } from "./skills-folder-stub";

/**
 * **「이 스킬은 파일을 돌린다」가 접힘 뒤에 있으면 안 된다** (2026-08-18).
 *
 * ## 무엇을 재나
 *
 * 실측: `design-audit` 은 목록 행에서 `실행 3` 이라고 말하는데, 그 행을 눌러
 * 들어간 상세에는 그 사실이 **한 글자도 없었다** — 「실행됨」 표시는 3단 사슬
 * 안에 있고 그 사슬은 접혀 있다. 남의 코드가 내 기계에서 돈다는 것은 이 화면이
 * 나르는 사실 중 가장 무거운 축인데, 화면에서 가장 깊은 자리에 있었다.
 *
 * ## 「보인다」로 끝내지 않는 이유
 *
 * 숫자만 머리에 띄우고 근거를 못 보게 하면 그건 알림이지 설명이 아니다. 그래서
 * 판정을 둘로 잡는다: ① 안 펼친 상태에서 보이는가 ② **눌렀을 때 그 근거가
 * 열리는가**. 둘째가 없으면 이 표시는 사람을 막다른 곳에 세운다.
 */

const RUNNER = [
  "---",
  "name: runner",
  "description: 스크립트를 돌리는 스킬",
  "---",
  "",
  "1. **잰다**",
  "2. **고친다**",
  "",
  "`scripts/measure.mjs` 를 돌린다. `docs/note.md` 도 읽는다.",
  "",
].join("\n");

const READER = [
  "---",
  "name: reader",
  "description: 읽기만 하는 스킬",
  "---",
  "",
  "1. **읽는다**",
  "2. **적는다**",
  "",
  "`docs/note.md` 를 읽는다.",
  "",
].join("\n");

const VAULT = {
  "runner/SKILL.md": RUNNER,
  "runner/scripts/measure.mjs": "console.log(1);\n",
  "runner/docs/note.md": "# note\n",
  "reader/SKILL.md": READER,
  "reader/docs/note.md": "# note\n",
};

test("돌아가는 파일이 있으면 펼치기 전에 보이고, 누르면 그 근거가 열린다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, VAULT);

  await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);

  const rows = page.getByTestId("skill-row-toggle");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await rows.filter({ hasText: "runner" }).first().click();

  // ① 접힌 상태에서 사실이 보인다.
  const chain = page.getByTestId("skill-invocation-chain");
  await expect(chain, "사슬이 처음부터 펼쳐져 있으면 이 검사가 아무것도 안 잰다").toHaveCount(0);
  const mark = page.getByTestId("skill-detail-runs");
  await expect(
    mark,
    "돌아가는 파일이 있는데 상세가 그 사실을 접힘 뒤에 감췄다",
  ).toBeVisible({ timeout: 15_000 });
  await expect(mark).toHaveText(/1/);

  // ② 누르면 근거가 열린다 — 숫자만 띄우고 끝내면 막다른 곳이다.
  await mark.click();
  await expect(chain, "표시를 눌렀는데 근거가 안 열렸다").toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("skill-executable-mark").first()).toBeVisible();
});

test("돌아가는 파일이 없으면 표시 자체가 없다 — 0을 그리지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, VAULT);

  await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);

  const rows = page.getByTestId("skill-row-toggle");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await rows.filter({ hasText: "reader" }).first().click();

  await expect(page.getByTestId("skill-detail-heading")).toHaveText(/reader/, { timeout: 15_000 });
  await expect(
    page.getByTestId("skill-detail-runs"),
    "돌아가는 것이 없는데 표시를 그렸다",
  ).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { openStubbedSkillFolder, stubSkillFolder } from "./skills-folder-stub";

/**
 * **영어 화면이 「3 run」 · 「1 files」 라고 말하지 않는다** (2026-08-18).
 *
 * 이 화면은 지금까지 한국어로만 재고 있었다. 영어를 열어 보니 개수 문구가
 * 전부 단수/복수를 안 가리고 있었다 — 한국어에는 그 구분이 없어서 문자열을
 * 그대로 옮겨 놓은 결과다.
 *
 * 검사는 **하나짜리와 여럿짜리를 같은 화면에** 놓는다. 한쪽만 두면 통과하는
 * 문자열이 반쪽이라도 초록이 된다.
 */

const skill = (name: string, body: string) =>
  ["---", `name: ${name}`, `description: ${name} covers this situation for the fixture`, "---", "",
   "1. **Do the thing**", "2. **Finish**", "", body, ""].join("\n");

const VAULT = {
  // 딱 하나씩 — 단수형이 나와야 한다.
  "single/SKILL.md": skill("single", "Run `scripts/one.mjs` and read `docs/a.md`."),
  "single/scripts/one.mjs": "console.log(1);\n",
  "single/docs/a.md": "# a\n",
  // 여럿 — 복수형이 나와야 한다.
  "plural/SKILL.md": skill("plural", "Run `scripts/x.mjs` and `scripts/y.mjs`, read `docs/b.md`."),
  "plural/scripts/x.mjs": "console.log(1);\n",
  "plural/scripts/y.mjs": "console.log(2);\n",
  "plural/docs/b.md": "# b\n",
};

test("영어 개수 문구가 단수와 복수를 가린다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, VAULT);

  await page.goto("/en/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);

  const rowText = async (name: string) =>
    ((await page.getByTestId("skill-row-toggle").filter({ hasText: name }).first().textContent()) ??
      "").replace(/\s+/g, " ");

  const one = await rowText("single");
  expect(one, `단수인데 복수형이다: ${one}`).toMatch(/\b1 file\b/);
  expect(one, `단수인데 복수형이다: ${one}`).toMatch(/\b1 run\b/);
  expect(one).not.toMatch(/\b1 files\b/);
  expect(one).not.toMatch(/\b1 runs\b/);

  const many = await rowText("plural");
  expect(many, `복수인데 단수형이다: ${many}`).toMatch(/\b2 files\b/);
  expect(many, `복수인데 단수형이다: ${many}`).toMatch(/\b2 runs\b/);

  // 요약도 같은 문제를 갖고 있었다 — 「1 trigger pairs」.
  await page.getByTestId("skill-row-toggle").filter({ hasText: "single" }).first().click();
  const mark = page.getByTestId("skill-detail-runs");
  await expect(mark).toBeVisible({ timeout: 15_000 });
  const markText = ((await mark.textContent()) ?? "").replace(/\s+/g, " ");
  expect(markText, `단수인데 복수형이다: ${markText}`).toMatch(/\b1 file runs\b/);
});

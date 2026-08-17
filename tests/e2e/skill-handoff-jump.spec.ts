import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { openStubbedSkillFolder, stubSkillFolder } from "./skills-folder-stub";

/**
 * **스킬이 다음 스킬로 넘기는 것을 화면이 세고, 눌러서 건너간다** (2026-08-18).
 *
 * ## 왜 이 검사가 생겼나
 *
 * 소유자: *"스킬도 그래프처럼 연결되는 걸 보여주고 싶었는데 좀 이상하다"* ·
 * *"눌렀을 때 뭔가 효과적인 게 있으면 좋겠다"*.
 *
 * 재 보니 연결이 없어서가 아니라 **세는 어휘가 없어서** 안 보였다. 이 화면이
 * 낼 수 있던 관계는 둘뿐이고 **둘 다 적대적**이었다 — 이름이 겹친다 · 발동
 * 조건이 겹친다. 실제 스킬 18개로 세면 경쟁은 **1개**인데 서로 부르는 관계는
 * **25개**다(`user-walkthrough` → `po-pass` → `po-council` …).
 *
 * ## 이 검사가 잠그는 것
 *
 * 「보인다」가 아니라 **「누르면 그리로 간다」**다. 화면에 글자만 띄우는 것은
 * 이 화면이 이미 하던 일이고, 소유자가 없다고 한 것은 **다음 행동**이다.
 * 그래서 판정은 상세 제목이 실제로 바뀌는지로 한다.
 */

const VAULT = {
  "alpha/SKILL.md": [
    "---",
    "name: alpha",
    "description: 첫 단계. 조사를 먼저 한다",
    "---",
    "",
    "1. **조사한다**",
    "2. **정리한다**",
    "",
    "정리가 끝나면 /beta 로 넘긴다.",
    "",
  ].join("\n"),
  "beta/SKILL.md": [
    "---",
    "name: beta",
    "description: 둘째 단계. 받은 것을 검토한다",
    "---",
    "",
    "1. **받는다**",
    "2. **검토한다**",
    "",
    "혼자 못 정하면 /gamma 를 부른다.",
    "",
  ].join("\n"),
  "gamma/SKILL.md": [
    "---",
    "name: gamma",
    "description: 마지막. 판정만 한다",
    "---",
    "",
    "1. **읽는다**",
    "2. **판정한다**",
    "",
    "여기서 끝난다.",
    "",
  ].join("\n"),
};

test("넘김을 눌러 다음 스킬로 건너간다 — 그리고 되짚어 돌아온다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, VAULT);

  await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);

  const rows = page.getByTestId("skill-row-toggle");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await rows.filter({ hasText: "alpha" }).first().click();

  const handoffs = page.getByTestId("skill-detail-handoffs");
  await expect(
    handoffs,
    "넘김 카드가 없다 — 화면이 여전히 「경쟁」만 세고 있다",
  ).toBeVisible({ timeout: 15_000 });

  /*
   * ⓪ **경고색을 쓰지 않는다.** 이 줄들은 평범한 이동이지 경고가 아니다 —
   *    부품을 「겹쳤어요」 카드에서 물려받는 바람에 앰버 잉크가 따라와서, 이동
   *    링크 일곱 개가 경고 일곱 개로 읽힌 적이 있다(2026-08-18). 클래스 이름이
   *    아니라 **그려진 색**을 잰다: 클래스를 바꿔도 같은 색이면 결함 그대로다.
   */
  const inkVerdict = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    probe.style.color = root.getPropertyValue("--color-amber-source-text-a80").trim();
    document.body.appendChild(probe);
    const warnInk = getComputedStyle(probe).color;
    probe.remove();
    const inks = [
      ...document.querySelectorAll('[data-testid="skill-detail-handoffs"] [data-testid="skill-jump"]'),
    ].map((el) => getComputedStyle(el).color);
    return { warnInk, inks };
  });
  expect(inkVerdict.inks.length).toBeGreaterThan(0);
  expect(
    inkVerdict.inks.filter((ink) => ink === inkVerdict.warnInk),
    `넘김 줄이 경고색으로 그려졌다 (${inkVerdict.warnInk})`,
  ).toHaveLength(0);

  /*
   * ① 누르면 실제로 그 스킬로 간다. 「보인다」만 재면 글자만 띄워도 초록이라,
   *    이 검사의 요점은 도착지가 바뀌는 것이다.
   */
  const heading = page.getByTestId("skill-detail-heading");
  await expect(heading).toHaveText(/alpha/);
  await handoffs.getByRole("button", { name: /beta/ }).click();
  await expect(heading, "넘김을 눌렀는데 그 스킬로 안 갔다").toHaveText(/beta/, {
    timeout: 15_000,
  });

  // ② 한 걸음 더 — 사슬이 이어진다.
  await expect(page.getByTestId("skill-detail-handoffs")).toBeVisible();
  await page.getByTestId("skill-detail-handoffs").getByRole("button", { name: /gamma/ }).click();
  await expect(heading).toHaveText(/gamma/, { timeout: 15_000 });

  /*
   * ③ **되짚는 방향도 있어야 한다.** 「어디로 넘기나」만 있으면 사슬의 절반이고,
   *    사람이 실제로 묻는 것은 「이걸 고치면 누가 영향받나」이기도 하다.
   *    gamma 는 나가는 곳이 없고 beta 에서 들어오는 것만 있다.
   */
  const fromCard = page.getByTestId("skill-detail-handoffs");
  await expect(
    fromCard.getByRole("button", { name: /beta/ }),
    "gamma 를 부르는 곳이 안 보인다 — 되짚는 방향이 빠졌다",
  ).toBeVisible();
  await fromCard.getByRole("button", { name: /beta/ }).click();
  await expect(heading).toHaveText(/beta/, { timeout: 15_000 });
});

test("부르지 않는 스킬에는 넘김 카드가 아예 없다 — 빈 상자를 그리지 않는다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, {
    "solo/SKILL.md": [
      "---",
      "name: solo",
      "description: 아무도 안 부르고 아무도 안 부른다",
      "---",
      "",
      "1. **혼자 한다**",
      "2. **끝낸다**",
      "",
      "여기엔 /없는스킬 만 적혀 있다.",
      "",
    ].join("\n"),
  });

  await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);
  const row = page.getByTestId("skill-row-toggle").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  await expect(page.getByTestId("skill-detail-heading")).toHaveText(/solo/, { timeout: 15_000 });
  // 실재하지 않는 이름은 엣지가 아니다 — 지어내면 카드가 뜬다.
  await expect(
    page.getByTestId("skill-detail-handoffs"),
    "연결이 없는데 넘김 카드를 그렸다 — 없는 이름을 엣지로 세고 있다",
  ).toHaveCount(0);
});

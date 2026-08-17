import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { openStubbedSkillFolder, stubSkillFolder } from "./skills-folder-stub";

/**
 * **넘김으로 건너뛰면 왼쪽 목록이 따라온다** (2026-08-18).
 *
 * 실측: `design-audit` 에서 `zz-last` 로 넘어간 뒤, 「지금 여기」 표시가 붙은 행이
 * 목록이 보이는 칸보다 한참 아래에 있었다. 상세는 바뀌었는데 목록은 떠나온 자리를
 * 가리키고 있어서, 누른 사람이 **자기가 어디에 있는지 잃는다.** 초점도 사라진
 * 버튼과 함께 `<body>` 로 떨어져 다음 Tab 이 문서 맨 위에서 다시 시작했다.
 *
 * ## 이 검사가 «안 바뀌는 것»도 잰다
 *
 * 목록 행을 직접 누른 경우에는 **초점을 건드리면 안 된다.** 이미 그 행에 초점이
 * 있고, 거기서 뺏으면 화살표로 목록을 훑는 흐름이 끊긴다. 고치는 쪽만 재고
 * 안 고치는 쪽을 안 재면, 다음 사람이 「초점을 항상 옮기자」로 단순화하면서
 * 그 흐름을 조용히 깬다.
 */

const skill = (name: string, body: string) =>
  ["---", `name: ${name}`, `description: ${name} 를 위한 예시 스킬이다`, "---", "",
   "1. **한다**", "2. **끝낸다**", "", body, ""].join("\n");

// 목록을 길게 만들어 **끝이 화면 밖으로 나가게** 한다 — 안 그러면 이 검사가 헛돈다.
const VAULT: Record<string, string> = {
  "aa-first/SKILL.md": skill("aa-first", "끝나면 /zz-last 로 넘긴다."),
  "zz-last/SKILL.md": skill("zz-last", "여기서 끝난다."),
};
for (let i = 0; i < 24; i += 1) {
  const name = `filler-${String(i).padStart(2, "0")}`;
  VAULT[`${name}/SKILL.md`] = skill(name, "혼자 한다.");
}

test("넘김으로 건너뛰면 목록이 따라오고 초점이 상세로 간다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubSkillFolder(page, VAULT);

  await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
  await openStubbedSkillFolder(page);
  const rows = page.getByTestId("skill-row-toggle");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });

  const place = async () =>
    page.evaluate(() => {
      const active = document.querySelector<HTMLElement>(
        '[data-testid="skill-row-toggle"][data-active="true"]',
      );
      const scroller = document
        .querySelector('[data-testid="skills-list"]')
        ?.closest<HTMLElement>("[class*=overflow]");
      if (!active || !scroller) return { active: null, inView: null, focused: null };
      const r = active.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      return {
        active: active.getAttribute("data-skill-path"),
        inView: r.top >= s.top - 1 && r.bottom <= s.bottom + 1,
        focused: document.activeElement?.getAttribute("data-testid") ?? null,
      };
    });

  await rows.filter({ hasText: "aa-first" }).first().click();
  const afterRowClick = await place();
  expect(afterRowClick.active).toBe("aa-first/SKILL.md");
  // 목록에서 고른 것은 초점을 그 행에 그대로 둔다 — 뺏으면 화살표 이동이 끊긴다.
  expect(
    afterRowClick.focused,
    "목록 행을 눌렀는데 초점이 상세로 끌려갔다 — 훑는 흐름이 끊긴다",
  ).not.toBe("skill-detail-heading");

  // 목록 맨 끝의 스킬로 건너뛴다. 이 행은 지금 화면 밖에 있다.
  const offScreen = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[data-skill-path="zz-last/SKILL.md"]');
    const scroller = document
      .querySelector('[data-testid="skills-list"]')
      ?.closest<HTMLElement>("[class*=overflow]");
    if (!row || !scroller) return null;
    const r = row.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return r.top > s.bottom || r.bottom < s.top;
  });
  expect(offScreen, "목적지가 이미 화면 안이면 이 검사는 아무것도 안 잰다").toBe(true);

  await page
    .getByTestId("skill-detail-handoffs")
    .getByRole("button", { name: /zz-last/ })
    .click();
  await expect(page.getByTestId("skill-detail-heading")).toHaveText(/zz-last/, { timeout: 15_000 });

  const afterJump = await place();
  expect(afterJump.active).toBe("zz-last/SKILL.md");
  expect(afterJump.inView, "건너뛴 뒤 「지금 여기」 표시가 화면 밖에 있다").toBe(true);
  expect(afterJump.focused, "건너뛴 뒤 초점이 사라졌다").toBe("skill-detail-heading");
});

import { expect, test } from "@playwright/test";

import {
  HARNESS_SOURCE_ROOT,
  installHarnessRuntime,
  installProfilelessHarnessRuntime,
  mountHarnessVault,
} from "./harness-tab-fixture";

/**
 * **The Harness tab, read on a repository that actually has a harness.**
 *
 * The fixture's source tree carries the four shapes this view exists to expose: a nested
 * `AGENTS.md` that Codex merges and Claude Code never auto-loads, a declared skill pair whose two
 * copies differ, a hook script the config names and the disk does not have, and a Codex hook config
 * that repeats one script across three matchers. Each assertion below is about one of those.
 */
test.describe("하네스 탭", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
  });

  test("목적지 이름과 한 줄 설명이 하네스를 말한다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("하네스");
    // Exactly one page headline: the identity travels into the blueprint's own header.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    /*
     * The explainer stands on the document views. In the blueprint the line directly under the
     * title already names the profile and what the view compares, and 20px there is a third of a
     * layer row — the difference between the ladder tightening its seven rows and hiding the
     * seventh (measured 2026-09-13).
     */
    await page.locator("#harness-tab-guides").click();
    await expect(
      page.getByText("에이전트가 이 저장소에서 어떻게 일하도록 되어 있는지"),
    ).toBeVisible();
    // The rail label moved with the tab; the route did not.
    await expect(page.getByTestId("app-nav-rail")).toContainText("하네스");
    expect(new URL(page.url()).pathname).toBe("/ko/architecture/");
  });

  test("기본 보기는 청사진이고, 세그먼트가 보기를 주소에 적는다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByTestId("architecture-flow-panel")).toBeVisible();

    await page.locator("#harness-tab-guides").click();
    await expect(page).toHaveURL(/\?view=guides$/);
    await page.locator("#harness-tab-sensors").click();
    await expect(page).toHaveURL(/\?view=sensors$/);
    await expect(page.getByTestId("harness-sensors-placeholder")).toBeVisible();

    /*
     * The address is rewritten in place, not pushed — switching view inside one destination is not
     * a place a person navigated to, and pushing would make Back walk the segmented control instead
     * of leaving the screen (the grammar `/mcp` already uses for its tabs). What the URL owes is a
     * refresh and a shared link landing on the same view.
     */
    await page.reload();
    await expect(page.getByTestId("harness-sensors-placeholder")).toBeVisible();
    await expect(page).toHaveURL(/\?view=sensors$/);
  });

  test("지침 표가 도구별로 어느 파일을 읽는지 보여준다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const table = page.getByTestId("harness-guides");
    await expect(table).toBeVisible({ timeout: 30_000 });

    // The walker question: which file does Codex read that Claude Code does not?
    const nested = page.getByTestId("harness-guide-row-nested-agents-md");
    await expect(nested).toContainText("Codex");
    await expect(nested).not.toContainText("Claude Code");
    await expect(page.getByTestId("harness-guide-row-claude-md")).toContainText("Claude Code");

    // Every tool claim carries the document it came from.
    await expect(nested.getByRole("link", { name: /출처/ }).first()).toHaveAttribute(
      "href",
      /^https:\/\//,
    );
    await expect(page.getByText(`읽은 곳 ${HARNESS_SOURCE_ROOT}`)).toBeVisible();
  });

  test("어긋난 짝을 세고, 차이 보기가 두 파일을 나란히 연다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const drift = page.getByTestId("harness-drift");
    await expect(drift).toBeVisible({ timeout: 30_000 });
    await expect(drift).toContainText("어긋남");

    await drift.getByText("차이 보기").first().click();
    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toBeVisible();
    await expect(diff).toContainText(".claude/skills/po-pass/SKILL.md");
    await expect(diff).toContainText(".agents/skills/po-pass/SKILL.md");
    await expect(diff).toContainText("Diverged line.");
  });

  test("훅은 연결됨과 없음을 구별하고, Codex 는 초록 대신 승인 필요를 단다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });

    // The script on disk is wired; the one only the config knows about is missing, and a missing
    // guard produces no error at all — which is exactly why it has to be on the screen.
    await expect(page.locator('[data-harness-hook-status="wired"]').first()).toBeVisible();
    await expect(page.locator('[data-harness-hook-status="missing"]').first()).toBeVisible();

    await expect(page.getByTestId("harness-hook-approval-gate")).toContainText(
      "도구 안에서 승인 필요",
    );
  });

  test("문장은 잰 숫자 둘만 말하고, 아무도 안 지키는 곳은 따로 미룬다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const sentence = page.getByTestId("harness-sentence");
    await expect(sentence).toBeVisible({ timeout: 30_000 });
    await expect(sentence).toContainText("문서");
    await expect(sentence).toContainText("검사");
    // The counted sentence never claims a number of unguarded domains.
    await expect(sentence.locator("p").first()).not.toContainText("도메인");
    await expect(page.getByTestId("harness-sentence-deferred")).toContainText(
      "아직 재지 않았습니다",
    );
  });

  test("구조 보기는 카드 폭을 쓰고, 일곱 문장이 끝까지 나온다", async ({ page }) => {
    /*
     * Inspection 122, S8. Before this slice the ladder held its 280/72/240 faces whatever the
     * card's width, so at 1512 the drawn band was 592px inside a 1448px card (41 %), sat 124px
     * left of its centre, and all seven role sentences ended in an ellipsis while 856px of the
     * card stood empty. The owner's standing priority is a finished sentence over box symmetry.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByTestId("architecture-graph-box-views")).toBeVisible({ timeout: 30_000 });

    const measured = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="architecture-flow-panel"]');
      const boxes = [...document.querySelectorAll("[data-graph-box]")].map((box) =>
        box.getBoundingClientRect(),
      );
      const cardRect = card!.getBoundingClientRect();
      const left = Math.min(...boxes.map((b) => b.left));
      const right = Math.max(...boxes.map((b) => b.right));
      const sentences = [
        ...document.querySelectorAll('[data-testid^="architecture-box-line-"]'),
      ].map((node) => node.textContent ?? "");
      return {
        cardWidth: Math.round(cardRect.width),
        bandWidth: Math.round(right - left),
        offCentre: Math.round((left + right) / 2 - (cardRect.left + cardRect.right) / 2),
        truncated: sentences.filter((line) => line.trimEnd().endsWith("…")).length,
        roles: boxes.length,
      };
    });

    expect(measured.roles).toBe(7);
    expect(measured.truncated, "role sentences are cut again").toBe(0);
    // The band used 41 % of the card; more than half of it is the floor this fix has to keep.
    expect(measured.bandWidth / measured.cardWidth).toBeGreaterThan(0.5);
    expect(Math.abs(measured.offCentre), "the drawing slid off the card's centre").toBeLessThanOrEqual(8);
    // And the "not inspected yet" fact is stated once for the column, not once per role.
    await expect(page.getByTestId("architecture-observation-column-note")).toHaveCount(1);
  });

  test("다른 보기로 가는 길은 어떤 화면에서도 사라지지 않는다", async ({ page }) => {
    /*
     * The tab set must never be a property of the panel it switches. With no architecture profile
     * the blueprint returns its empty state early; a tab set rendered inside it vanished, and 지침
     * and 센서 had no path from the screen a person lands on (design-interaction, 2026-09-13).
     */
    await page.setViewportSize({ width: 1512, height: 949 });
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab")).toHaveCount(3);
    // And the tab the open panel names actually exists, so `aria-labelledby` does not dangle.
    const labelledBy = await page
      .locator('[role="tabpanel"]')
      .first()
      .getAttribute("aria-labelledby");
    await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);

    await page.getByRole("tab", { name: "지침" }).click();
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });
  });

  test("키보드로 보기를 옮겨도 초점이 탭에 남는다", async ({ page }) => {
    /*
     * One `TabBar` instance, not one per branch: the two-instance build unmounted the focused tab
     * on activation and the browser reset focus to `<body>`, from where no key did anything.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await page.getByRole("tab", { name: "지침" }).focus();
    for (const key of ["ArrowRight", "ArrowRight", "Home", "End"]) {
      await page.keyboard.press(key);
      const state = await page.evaluate(() => ({
        role: document.activeElement?.getAttribute("role"),
        selected: document.activeElement?.getAttribute("aria-selected"),
      }));
      expect(state.role, `focus left the tab set after ${key}`).toBe("tab");
      expect(state.selected, `focus landed on an unselected tab after ${key}`).toBe("true");
    }
  });
});

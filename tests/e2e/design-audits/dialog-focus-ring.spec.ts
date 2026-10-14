import { expect, test, type Page } from "@playwright/test";

/**
 * Programmatic focus must not draw the browser's default ring. The sheet opens by itself with no
 * click, because Chrome does not apply `:focus-visible` to programmatic focus after a pointer.
 */
/**
 * Opens exactly as a first visit — no `seedFirstRunSeen`, no `?guides=off`, and
 * **nothing is clicked** (see the warning above).
 */
async function openGuideSheetOnFirstRun(page: Page) {
  // Guide auto-display is opt-in, so the enabled state is seeded before opening.
  await page.addInitScript(() => {
    window.localStorage.setItem("ontology-atlas:guide-auto-start:v1", "1");
  });
  await page.goto("/ko/topology/");
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible({ timeout: 20_000 });
}

test("첫 실행 시트 — 프로그램 포커스가 브라우저 기본 링을 그리지 않는다", async ({ page }) => {
  await openGuideSheetOnFirstRun(page);

  const probe = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>("[data-testid='vault-guide-sheet']");
    if (!dialog) return null;
    const cs = getComputedStyle(dialog);
    return {
      focused: document.activeElement === dialog,
      focusVisible: dialog.matches(":focus-visible"),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
    };
  });

  expect(probe, "시트를 못 찾았다").not.toBeNull();

  // ① Focus must **still** be on the container — removing the accessibility handling
  //    along with the ring is breaking something else, not a fix.
  expect(probe!.focused, "시트가 포커스를 안 받는다 — 스크린리더 낭독 시작점이 사라졌다").toBe(
    true,
  );

  // ② And yet no ring is drawn. `outline-style: auto` is exactly the browser default
  //    ring (our token ring is drawn with `solid`/`ring-*`).
  expect(
    probe!.outlineStyle,
    `브라우저 기본 포커스 링이 살아 있다 (outline: ${probe!.outlineStyle} ${probe!.outlineWidth})`,
  ).not.toBe("auto");
});

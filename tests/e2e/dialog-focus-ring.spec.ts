import { expect, test, type Page } from "@playwright/test";

/**
 * Programmatically moved focus **must not draw the browser's default ring.**
 *
 * **Why this gate exists** (design audit, 2026-08-04). The first-run sheet
 * 「Turn my folder into a map」 (turn my folder into a map) moves focus to a
 * `tabIndex={-1}` container when it opens — the correct handling, so a screen reader
 * starts from the title. But that container had nothing switching the ring off, so
 * `:focus-visible` matched and the browser's default focus ring (**system sky blue**
 * `rgb(153, 200, 255)`) was drawn around the modal.
 *
 * Why that is a defect:
 *
 * - The charter is **neutrals + a single indigo** (`forbidden.md` — no second
 *   colour system). System sky blue is outside it.
 * - It is **the very first modal seen on first launch**, and the installed app's
 *   WKWebView draws it thicker (reproduced by measurement on both app and web).
 * - The ring means "you can press this", and this container is not pressable — the
 *   signal is false.
 *
 * ⚠️ **The reproduction path is not "click to open".** The first version of this
 * gate opened the sheet **by clicking a button** and no ring appeared, because
 * Chrome does not apply `:focus-visible` to programmatic focus when the last input
 * was a pointer. The defect actually lives on **the path where the sheet opens by
 * itself on first visit** — there has been no pointer interaction yet, so
 * `:focus-visible` matches and the ring is drawn. That is also exactly what someone
 * launching the app for the first time sees. A check that opens by clicking is
 * **green while the defect is alive**.
 *
 * **Why this is e2e rather than a value rule.** The violation **leaves no value in
 * the code at all**: what is missing is one class, and the thing drawing the ring is
 * the browser's default stylesheet. There is nothing for lint to see — the only way
 * is to open it and read the computed `outline`. (Same family as `design.md`'s
 * "layers lint cannot see are handled by contract tests".)
 */
/**
 * Opens exactly as a first visit — no `seedFirstRunSeen`, no `?guides=off`, and
 * **nothing is clicked** (see the warning above).
 */
async function openGuideSheetOnFirstRun(page: Page) {
  // Auto-display has been opt-in since 2026-08-13. What this spec measures is the
  // sheet's focus ring, not whether it auto-displays, so the enabled state is seeded
  // before opening.
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

/**
 * Checks the detector is not **running on an empty set** (`/gate-probe`).
 *
 * The check above asserts that `outline-style` is not auto. If the sheet stopped
 * receiving focus altogether, that assertion goes **green automatically** and the
 * gate passes while guarding nothing. So an element that really does draw the
 * default ring is created on the same page, confirming this method actually
 * distinguishes auto.
 */
test("판정 방식 자체가 기본 링을 구별한다 — 헛도는 검사가 아님", async ({ page }) => {
  await openGuideSheetOnFirstRun(page);

  const control = await page.evaluate(() => {
    const el = document.createElement("div");
    el.tabIndex = -1;
    el.setAttribute("data-probe", "focus-ring");
    document.body.append(el);
    el.focus();
    const cs = getComputedStyle(el);
    const out = { outlineStyle: cs.outlineStyle, focusVisible: el.matches(":focus-visible") };
    el.remove();
    return out;
  });

  expect(
    control.outlineStyle,
    "링을 끄지 않은 컨테이너가 auto 로 안 나온다 — 이 검사는 아무것도 못 잡는다",
  ).toBe("auto");
});

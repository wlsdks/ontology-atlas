import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { installFrameProbe, readFrameProbe, scrollHostTo } from "./download-frame-probe";

/**
 * The download page without motion and without scripting (2026-10-03). Reduced motion is fully
 * still: no animation exists, no frame loop starts, the hero and the field each draw one frame.
 * With scripting off every section's text is visible, the typed headline included.
 */
test.describe("download — still", () => {
  test("under reduced motion nothing animates and no frame loop starts", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedFirstRunSeen(page);
    await installFrameProbe(page);
    await page.goto("/en/download/?guides=off", { waitUntil: "load" });
    await expect(page.getByTestId("gateway-hero")).toBeVisible();
    await expect(page.getByTestId("download-conduction-figure")).toHaveAttribute("data-conduction-state", "still");

    const animationsSeen: string[] = [];
    const height = await page.evaluate(() => document.querySelector("main")!.scrollHeight);
    for (let top = 0; top <= height; top += 600) {
      await scrollHostTo(page, top);
      await page.waitForTimeout(120);
      animationsSeen.push(
        ...(await page.evaluate(() =>
          document.getAnimations().map((animation) => (animation as CSSAnimation).animationName || "script"),
        )),
      );
    }
    await scrollHostTo(page, "bottom");
    await page.waitForTimeout(300);
    expect(animationsSeen, "an animation exists under reduced motion").toEqual([]);

    const probe = await readFrameProbe(page);
    expect(probe.field, "the field drew more than its one still frame").toBe(1);
    expect(probe.hero, "the hero drew more than its one still frame").toBe(1);
  });

  test.describe("with scripting off", () => {
    test.use({ javaScriptEnabled: false });

    test("the headline and every section's text are visible", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/en/download/", { waitUntil: "load" });
      const h1 = page.locator("h1");
      await expect(h1).toBeVisible();
      const hidden = await h1.evaluate(
        (el) => [...el.querySelectorAll("*")].filter((n) => getComputedStyle(n).visibility === "hidden").length,
      );
      expect(hidden, "headline characters stay hidden without a script to type them").toBe(0);
      for (const id of ["gateway-hero-trust", "gateway-demo-section", "gateway-screens-section"]) {
        const section = page.getByTestId(id);
        await section.scrollIntoViewIfNeeded();
        await expect(section).toBeVisible();
        // The hero's rise is CSS-only (`@starting-style`), so it lands without a script too.
        await expect
          .poll(
            () =>
              section.evaluate((el) => {
                let o = 1;
                for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
                return o;
              }),
            { message: `${id} is drawn transparent without scripting` },
          )
          .toBe(1);
      }
    });
  });
});

import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitFrames } from "./settle";

const FAST_FORWARD = 20;

async function openFigure(page: Page, reducedMotion: "reduce" | "no-preference"): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion });
  await seedFirstRunSeen(page);
  await page.goto("/en/download/?guides=off", { waitUntil: "load" });
  const figure = page.getByTestId("download-conduction-figure");
  await figure.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("download-conduction-scene")).toBeVisible();
  return figure;
}

function sceneState(figure: Locator) {
  return figure.evaluate((element) =>
    [...element.querySelectorAll("[data-conduction-part]")].map((part) => {
      const style = getComputedStyle(part);
      return [part.getAttribute("data-conduction-part"), style.opacity, style.transform, style.strokeDashoffset].join(" ");
    }),
  );
}

async function stillState(browser: Browser): Promise<string[]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const figure = await openFigure(page, "reduce");
  await expect(figure).toHaveAttribute("data-conduction-state", "still");
  const state = await sceneState(figure);
  await context.close();
  return state;
}

test.describe("download — the conduction illustration", () => {
  test("plays three loops, then rests on the reduced-motion frame and runs no animation", async ({ page, browser }) => {
    const figure = await openFigure(page, "no-preference");
    await expect(figure).toHaveAttribute("data-conduction-state", "running");
    const timing = await figure.evaluate((element) => {
      const animations = element.getAnimations({ subtree: true });
      const starts = new Set(animations.map((animation) => animation.effect?.getTiming().iterationStart ?? 0));
      return { count: animations.length, starts: [...starts] };
    });
    expect(timing.count).toBeGreaterThan(60);
    expect(timing.starts, "every part keeps one clock").toHaveLength(1);

    const seen = await figure.evaluate(async (element, rate) => {
      const animations = element.getAnimations({ subtree: true });
      for (const animation of animations) animation.updatePlaybackRate(rate);
      const iterations = new Set<number>();
      const lead = animations[0]!;
      while (lead.playState === "running" || lead.playState === "paused") {
        const current = lead.effect?.getComputedTiming().currentIteration;
        if (typeof current === "number") iterations.add(current);
        await new Promise(requestAnimationFrame);
      }
      const opensOnRest = (lead.effect?.getTiming().iterationStart ?? 0) > 0;
      return iterations.size - (opensOnRest ? 1 : 0);
    }, FAST_FORWARD);
    expect(seen, "the story was built three times").toBe(3);

    await expect(figure).toHaveAttribute("data-conduction-state", "finished");
    expect(await figure.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    const resting = await sceneState(figure);
    await waitFrames(page, 20);
    expect(await sceneState(figure), "nothing moves at rest").toEqual(resting);
    expect(resting).toEqual(await stillState(browser));
    await expect(page.getByRole("button", { name: "Play the illustration again" })).toBeVisible();
  });

  test("under reduced motion the illustration is one still, finished picture with no control", async ({ page }) => {
    const figure = await openFigure(page, "reduce");
    await expect(figure).toHaveAttribute("data-conduction-state", "still");
    expect(await figure.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(page.getByTestId("download-conduction-control")).toHaveCount(0);
    await expect(figure).toHaveAccessibleName(/illustration/i);
    await expect(figure).toHaveAccessibleDescription(/get_concept/);
    const scene = page.getByTestId("download-conduction-scene");
    await expect(scene.getByText("Allow once")).toBeVisible();
    await expect(scene.locator('[data-conduction-part="ring"]')).toHaveCSS("opacity", "1");
    await expect(scene.locator('[data-conduction-part="light:query/core"]')).toHaveCSS("opacity", "0");
  });

  test("pauses off-screen and in a hidden tab, and resumes where it stopped", async ({ page }) => {
    const figure = await openFigure(page, "no-preference");
    await expect(figure).toHaveAttribute("data-conduction-state", "running");

    await page.getByTestId("download-closing-band").scrollIntoViewIfNeeded();
    await expect(figure).not.toBeInViewport();
    await expect(figure).toHaveAttribute("data-conduction-state", "paused");
    const parked = await figure.evaluate((element) =>
      element.getAnimations({ subtree: true }).map((animation) => [animation.playState, animation.currentTime]),
    );
    expect(new Set(parked.map(([playState]) => playState))).toEqual(new Set(["paused"]));
    await waitFrames(page, 20);
    expect(
      await figure.evaluate((element) =>
        element.getAnimations({ subtree: true }).map((animation) => [animation.playState, animation.currentTime]),
      ),
      "no time passes while it is out of view",
    ).toEqual(parked);

    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-conduction-state", "running");

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(figure).toHaveAttribute("data-conduction-state", "paused");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(figure).toHaveAttribute("data-conduction-state", "running");

    await page.getByRole("button", { name: "Pause the illustration" }).click();
    await expect(figure).toHaveAttribute("data-conduction-state", "paused");
    await page.getByRole("button", { name: "Play the illustration" }).click();
    await expect(figure).toHaveAttribute("data-conduction-state", "running");
  });
});

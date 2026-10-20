import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";
import { expectSmoothMotion, startSmoothness, stopSmoothness } from "../motion-sampler";
import { waitForAnimationsDone, waitForBoxStill, waitForMapStill, waitFrames } from "../settle";

const VIEW_TRANSITION_PSEUDOS_ARE_SKIPPED = true;

type Frame = {
  t: number;
  pseudos: string[];
  transform: string | null;
  duration: string | null;
  easing: string | null;
  travel: string | null;
  oldOpacity: string | null;
};

async function openPopover(page: Page, reducedMotion: "reduce" | "no-preference") {
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.emulateMedia({ reducedMotion });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  const pick = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const node = window.__atlasMap!
      .nodes()
      .find((n) => n.kind === "domain" && !n.hidden && n.x > 420 && n.x < box.width - 420);
    return node ? { x: box.left + node.x, y: box.top + node.y } : null;
  });
  expect(pick, "no domain drawn in the middle of the canvas").not.toBeNull();
  await page.mouse.click(pick!.x, pick!.y);
  const panel = page.getByTestId("map-detail-panel");
  await expect(panel).toBeVisible();
  await waitForAnimationsDone(panel);
  await waitForBoxStill(panel);
  const name = await panel.locator("[data-morph-name]").first().getAttribute("data-morph-name");
  expect(name).toMatch(/^morph-concept-[0-9a-z]+$/);
  return name!;
}

async function sampleWhile(page: Page, name: string, press: () => Promise<void>): Promise<Frame[]> {
  await page.evaluate((groupName) => {
    const frames: Frame[] = [];
    (window as unknown as { __morphFrames: Frame[] }).__morphFrames = frames;
    (window as unknown as { __morphDone: boolean }).__morphDone = false;
    const html = document.documentElement;
    const start = performance.now();
    const tick = (t: number) => {
      const pseudos = document
        .getAnimations()
        .map((a) => (a.effect as KeyframeEffect | null)?.pseudoElement ?? "")
        .filter((p) => p.startsWith("::view-transition"));
      const group = getComputedStyle(html, `::view-transition-group(${groupName})`);
      const old = getComputedStyle(html, `::view-transition-old(${groupName})`);
      frames.push({
        t,
        pseudos,
        transform: pseudos.length ? group.transform : null,
        duration: pseudos.length ? group.animationDuration : null,
        easing: pseudos.length ? group.animationTimingFunction : null,
        travel: pseudos.length ? html.style.getPropertyValue("--morph-travel-duration") : null,
        oldOpacity: pseudos.length ? old.opacity : null,
      });
      const seen = frames.some((f) => f.pseudos.length > 0);
      const over = seen && pseudos.length === 0 && !html.classList.contains("morph-transition");
      if (over || t - start > 3000) (window as unknown as { __morphDone: boolean }).__morphDone = true;
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, name);
  await press();
  await page.waitForFunction(() => (window as unknown as { __morphDone: boolean }).__morphDone);
  return page.evaluate(() => (window as unknown as { __morphFrames: Frame[] }).__morphFrames);
}

const activeTestId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null);

test.describe("shared-element morph: concept popover to full detail", () => {
  test.setTimeout(120_000);

  test("the title travels as one object on the surface spring and focus lands inside full detail", async ({ page }) => {
    const name = await openPopover(page, "no-preference");
    await page.getByTestId("map-detail-panel-open-full-detail").focus();
    await startSmoothness(page);
    const frames = await sampleWhile(page, name, () => page.keyboard.press("Enter"));

    const pseudos = new Set(frames.flatMap((f) => f.pseudos));
    expect(pseudos).toContain(`::view-transition-group(${name})`);
    const transforms = new Set(frames.map((f) => f.transform).filter((v): v is string => v !== null && v !== "none"));
    expect(transforms.size).toBeGreaterThanOrEqual(3);
    const running = frames.filter((f) => f.pseudos.length > 0);
    expect(running.length).toBeGreaterThan(0);
    expect(running.filter((f) => f.oldOpacity !== "0")).toEqual([]);
    const travel = [...new Set(running.map((f) => f.travel))];
    expect(travel).toHaveLength(1);
    expect(travel[0]).toMatch(/^\d+ms$/);
    const durations = new Set(running.map((f) => f.duration));
    expect([...durations]).toEqual([`${parseFloat(travel[0]!) / 1000}s`]);
    expect(running.every((f) => f.easing?.startsWith("linear("))).toBe(true);

    const fullDetail = page.getByTestId("full-detail-a1");
    await expect(fullDetail).toBeVisible();
    expectSmoothMotion(await stopSmoothness(page), { still: VIEW_TRANSITION_PSEUDOS_ARE_SKIPPED });
    await waitFrames(page, 2);
    expect(await page.evaluate(() => document.querySelectorAll('[style*="view-transition-name"]').length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.classList.contains("morph-transition"))).toBe(false);
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="full-detail-a1"]')),
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="full-detail-a1"]')),
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect.poll(() => activeTestId(page)).toBe("map-detail-panel-open-full-detail");
  });

  test("reduced motion starts no transition: the title arrives with its surface's fade", async ({ page }) => {
    await openPopover(page, "reduce");
    const started = await page.evaluate(() => {
      const w = window as unknown as { __vtStarted: boolean };
      w.__vtStarted = false;
      const original = document.startViewTransition?.bind(document);
      if (original) {
        document.startViewTransition = ((update: () => void) => {
          w.__vtStarted = true;
          return original(update);
        }) as typeof document.startViewTransition;
      }
      return Boolean(original);
    });
    expect(started, "the browser lacks the View Transition API").toBe(true);
    await page.getByTestId("map-detail-panel-open-full-detail").click();
    const detail = page.getByTestId("full-detail-a1");
    await expect(detail).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __vtStarted: boolean }).__vtStarted)).toBe(false);
    await expect(detail.locator("h1")).toBeVisible();
  });
});

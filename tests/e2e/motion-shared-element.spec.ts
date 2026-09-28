import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForBoxStill, waitForMapStill, waitFrames } from "./settle";

type Frame = { t: number; pseudos: string[]; transform: string | null; duration: string | null };

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
      frames.push({
        t,
        pseudos,
        transform: pseudos.length ? group.transform : null,
        duration: pseudos.length ? group.animationDuration : null,
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

  test("the title travels as one named group and focus lands inside full detail", async ({ page }) => {
    const name = await openPopover(page, "no-preference");
    await page.getByTestId("map-detail-panel-open-full-detail").focus();
    const frames = await sampleWhile(page, name, () => page.keyboard.press("Enter"));

    const pseudos = new Set(frames.flatMap((f) => f.pseudos));
    expect(pseudos).toContain(`::view-transition-old(${name})`);
    expect(pseudos).toContain(`::view-transition-new(${name})`);
    const transforms = new Set(frames.map((f) => f.transform).filter((v): v is string => v !== null && v !== "none"));
    expect(transforms.size).toBeGreaterThanOrEqual(3);
    const base = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--motion-base").trim(),
    );
    const durations = new Set(frames.map((f) => f.duration).filter((v): v is string => v !== null));
    expect([...durations]).toEqual([`${parseFloat(base) / (base.endsWith("ms") ? 1000 : 1)}s`]);

    const fullDetail = page.getByTestId("full-detail-a1");
    await expect(fullDetail).toBeVisible();
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

  test("reduced motion keeps the pair but moves no group", async ({ page }) => {
    const name = await openPopover(page, "reduce");
    const frames = await sampleWhile(page, name, () =>
      page.getByTestId("map-detail-panel-open-full-detail").click(),
    );
    const pseudos = new Set(frames.flatMap((f) => f.pseudos));
    expect(pseudos).not.toContain(`::view-transition-group(${name})`);
    expect(pseudos).toContain(`::view-transition-new(${name})`);
    await expect(page.getByTestId("full-detail-a1")).toBeVisible();
  });
});

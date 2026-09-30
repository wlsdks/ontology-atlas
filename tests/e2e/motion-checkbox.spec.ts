import { expect, test, type Locator, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => window.localStorage.setItem("demo:sample-source:v1", "storefront"));
});

async function openCheckbox(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto("/en/topology/?e2e=1&guides=off&p=capability%3Acart&open=domain%3Aorder%2Cproject%3Astorefront");
  await page.getByTestId("map-detail-panel-action-meaning").click();
  const box = page.getByTestId("analysis-workbench").getByRole("checkbox");
  await expect(box).toBeChecked();
  return box;
}

async function sampleCheckOffsets(page: Page, box: Locator) {
  await box.evaluate((input) => {
    const path = input.parentElement!.querySelector(".motion-checkbox-mark path")!;
    const probe = window as unknown as { __checkFrames: Array<{ t: number; offset: number }> };
    probe.__checkFrames = [];
    const tick = (t: number) => {
      probe.__checkFrames.push({ t, offset: parseFloat(getComputedStyle(path).strokeDashoffset) });
      if (probe.__checkFrames.length < 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await box.check();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __checkFrames: unknown[] }).__checkFrames.length)).toBe(60);
  return page.evaluate(() => (window as unknown as { __checkFrames: Array<{ t: number; offset: number }> }).__checkFrames);
}

function shares(frames: Array<{ t: number; offset: number }>) {
  const moving = frames.findIndex((frame, index) => index > 0 && frame.offset !== frames[index - 1].offset);
  const total = Math.abs(frames[frames.length - 1].offset - frames[moving - 1].offset);
  let mfs = 0;
  let ffs = 0;
  for (let index = moving; index < frames.length; index += 1) {
    const interval = frames[index].t - frames[index - 1].t;
    const share = (Math.abs(frames[index].offset - frames[index - 1].offset) / total) * (16.7 / interval);
    if (index === moving) ffs = share;
    mfs = Math.max(mfs, share);
  }
  return { ffs, mfs, final: frames[frames.length - 1].offset };
}

test("the check draws on the fast clock and the box border holds 3:1 against its ground", async ({ page }) => {
  const box = await openCheckbox(page);
  await box.uncheck();
  const contrast = await box.evaluate((input) => {
    const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
    const luminance = ([r, g, b]: number[]) => {
      const channel = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    let ground: number[] = [0, 0, 0, 0];
    for (let node: Element | null = input.parentElement; node; node = node.parentElement) {
      const rgba = parse(getComputedStyle(node).backgroundColor);
      if ((rgba[3] ?? 1) > 0) {
        ground = rgba;
        break;
      }
    }
    const border = parse(getComputedStyle(input).borderTopColor);
    const alpha = border[3] ?? 1;
    const mixed = [0, 1, 2].map((i) => border[i] * alpha + ground[i] * (1 - alpha));
    const [light, dark] = [luminance(mixed), luminance(ground)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  });
  const frames = await sampleCheckOffsets(page, box);
  const measured = shares(frames);
  test.info().annotations.push({ type: "check", description: JSON.stringify({ contrast: contrast.toFixed(2), ...measured }) });
  expect(contrast).toBeGreaterThanOrEqual(3);
  expect(measured.final).toBe(0);
  expect(measured.ffs).toBeGreaterThan(0);
  expect(measured.ffs).toBeLessThanOrEqual(0.25);
  expect(measured.mfs).toBeLessThanOrEqual(0.35);
});

test("under reduced motion the check is whole at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const box = await openCheckbox(page);
  await box.uncheck();
  await box.check();
  const mark = await box.evaluate((input) => {
    const path = input.parentElement!.querySelector(".motion-checkbox-mark path")!;
    const style = getComputedStyle(path);
    return { name: style.animationName, offset: parseFloat(style.strokeDashoffset) };
  });
  expect(mark).toEqual({ name: "none", offset: 0 });
});

import { expect, test, type Page } from "@playwright/test";

import { HARNESS_SOURCE_COMMANDS, installHarnessRuntime, mountHarnessVault } from "./harness-tab-fixture";
import { expectSmoothMotion, startSmoothness, stopSmoothness } from "./motion-sampler";
import { waitForAnimationsDone, waitForBoxStill } from "./settle";

const SIZES = [
  { width: 1512, height: 900 },
  { width: 1920, height: 1080 },
] as const;
const TOLERANCE = 4;

async function contentArea(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;width:var(--app-nav-rail-width)";
    document.body.append(probe);
    const rail = probe.getBoundingClientRect().width;
    probe.remove();
    return { x: rail, y: 0, width: window.innerWidth - rail, height: window.innerHeight };
  });
}

async function expectCentred(page: Page, scripted = true, selector = "[data-wait-stage]") {
  const block = page.locator(selector).first();
  await expect(block).toBeVisible();
  if (scripted) {
    await waitForAnimationsDone(block);
    await waitForBoxStill(block);
  } else {
    await expect.poll(() => block.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  }
  const [area, box] = await Promise.all([contentArea(page), block.boundingBox()]);
  expect(box, "the wait block has a box").not.toBeNull();
  const dx = box!.x + box!.width / 2 - (area.x + area.width / 2);
  const dy = box!.y + box!.height / 2 - (area.y + area.height / 2);
  test.info().annotations.push({ type: "offset", description: `dx ${dx.toFixed(1)} dy ${dy.toFixed(1)}` });
  expect(Math.abs(dx), `horizontal offset ${dx}`).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(dy), `vertical offset ${dy}`).toBeLessThanOrEqual(TOLERANCE);
}

async function holdNativeReads(page: Page, commands: readonly string[]) {
  await page.addInitScript((held: readonly string[]) => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
    }).__TAURI_INTERNALS__;
    const inner = internals.invoke.bind(internals);
    const waiting: Array<() => void> = [];
    (window as unknown as { __releaseHeld(count: number): number }).__releaseHeld = (count) => {
      const batch = waiting.splice(0, count);
      for (const resume of batch) resume();
      return batch.length;
    };
    internals.invoke = (command, args = {}) => {
      let hold = false;
      try {
        hold = sessionStorage.getItem("wait-hold") === "1";
      } catch {
        hold = false;
      }
      if (!hold || !held.some((name) => command.includes(name))) return inner(command, args);
      return new Promise((resolve, reject) => {
        waiting.push(() => inner(command, args).then(resolve, reject));
      });
    };
  }, commands);
}

const setHold = (page: Page, on: boolean) =>
  page.evaluate((value) => sessionStorage.setItem("wait-hold", value ? "1" : "0"), on);
const releaseHeld = (page: Page, count: number) =>
  page.evaluate((n) => (window as unknown as { __releaseHeld(count: number): number }).__releaseHeld(n), count);

async function openHarnessWait(page: Page, size: (typeof SIZES)[number]) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installHarnessRuntime(page);
  await holdNativeReads(page, HARNESS_SOURCE_COMMANDS);
  await mountHarnessVault(page);
  await setHold(page, true);
  await page.setViewportSize(size);
  await page.goto("/en/architecture/?guides=off");
  const panel = page.getByTestId("harness-scan-progress");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  return panel;
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test("the route loading fallback is centred", async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: size, colorScheme: "dark" });
      const page = await context.newPage();
      try {
        await page.goto("/en/automations/");
        await expectCentred(page, false);
      } finally {
        await context.close();
      }
    });

    test("the vault opening is centred beside a held rail column", async ({ page }) => {
      await page.setViewportSize(size);
      await installHarnessRuntime(page);
      await holdNativeReads(page, ["read_vault_text_file", "list_vault_directory", "read_vault_text_files"]);
      await page.goto("/en/?guides=off");
      await page.waitForLoadState("networkidle");
      await setHold(page, true);
      await page.getByTestId("first-run-open").click();
      await expect(page.getByTestId("vault-route-identity-pending")).toBeVisible({ timeout: 20_000 });
      const reserve = await page.getByTestId("vault-opening-rail-reserve").boundingBox();
      const area = await contentArea(page);
      expect(reserve?.width).toBe(area.x);
      await expectCentred(page);
    });

    test("the analysis loading is centred under a visible header", async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/en/automations/?guides=off");
      await expect(page.getByTestId("automations")).toBeVisible();
      let release!: () => void;
      let held!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      const requested = new Promise<void>((resolve) => { held = resolve; });
      await page.route("**/_next/static/chunks/**", async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        if (body.includes("insights-core-switch")) {
          held();
          await barrier;
        }
        await route.fulfill({ response, body });
      });
      try {
        await page.getByTestId("app-nav-rail-item-insights").click();
        await requested;
        await expect(page.getByTestId("insights-loading")).toBeVisible();
        await expect(page.getByTestId("insights-loading").getByRole("heading", { level: 1 })).toBeVisible();
        await expectCentred(page);
      } finally {
        release();
        await page.unrouteAll({ behavior: "wait" });
      }
    });

    test("the harness wait is centred and its steps line up with its bar", async ({ page }) => {
      const panel = await openHarnessWait(page, size);
      await expectCentred(page);
      const edges = await panel.evaluate((block) => {
        const left = (element: Element | null) => element?.getBoundingClientRect().left ?? Number.NaN;
        const right = (element: Element | null) => element?.getBoundingClientRect().right ?? Number.NaN;
        const bar = block.querySelector('[role="progressbar"]');
        const steps = block.querySelector("ol");
        return { barLeft: left(bar), stepsLeft: left(steps), barRight: right(bar), stepsRight: right(steps) };
      });
      expect(edges.stepsLeft).toBeCloseTo(edges.barLeft, 0);
      expect(edges.stepsRight).toBeCloseTo(edges.barRight, 0);
    });
  });
}

test("the harness bar fills by transform and moves smoothly", async ({ page }) => {
  const panel = await openHarnessWait(page, SIZES[0]);
  const fill = panel.locator("[data-work-fill]");
  const facts = await fill.evaluate((element) => ({
    transition: getComputedStyle(element).transitionProperty,
    origin: getComputedStyle(element).transformOrigin,
    width: (element as HTMLElement).style.width,
  }));
  expect(facts.transition).toContain("transform");
  expect(facts.transition).not.toContain("width");
  expect(facts.width).toBe("");
  expect(facts.origin.startsWith("0px")).toBe(true);

  await startSmoothness(page);
  const hooks = panel.locator('[data-harness-stage="hooks"]');
  await expect
    .poll(
      async () => {
        await releaseHeld(page, 1);
        return (await hooks.getAttribute("data-harness-stage-state")) ?? "gone";
      },
      { timeout: 20_000, intervals: [50] },
    )
    .toBe("done");
  expectSmoothMotion(await stopSmoothness(page));
});

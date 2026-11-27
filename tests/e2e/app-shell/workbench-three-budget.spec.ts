import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "../desktop-rail-arrival-harness";
import { waitForPageSettled } from "../settle";

const THREE_SIGNATURE = /__THREE__|THREE\.WebGLRenderer/;

function recordScripts(page: Page) {
  const paths = new Set<string>();
  const verdicts = new Map<string, Promise<boolean>>();
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.endsWith(".js")) paths.add(pathname);
  });
  const fetchedAgainCarriesThree = (path: string) => {
    if (!verdicts.has(path)) verdicts.set(path, page.request.get(path).then(async (reply) => THREE_SIGNATURE.test(await reply.text())));
    return verdicts.get(path) as Promise<boolean>;
  };
  return {
    paths: () => paths,
    async carryingThree() {
      const all = [...paths];
      const flags = await Promise.all(all.map(fetchedAgainCarriesThree));
      return all.filter((_, index) => flags[index]);
    },
  };
}

test.describe("three.js loads only where a scene draws", () => {
  test.skip(!process.env.PLAYWRIGHT_STATIC, "only the built folder splits the screens into the chunks this reads");

  test("/automations loads none of it", async ({ page }) => {
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page, "en");
    const scripts = recordScripts(page);
    await page.goto("/en/automations/?guides=off");
    await waitForPageSettled(page);
    expect([...scripts.paths()].length, "the screen's own chunks were fetched").toBeGreaterThan(0);
    expect(await scripts.carryingThree()).toEqual([]);
  });

  test("the Library still loads it for its constellation", async ({ page }) => {
    await installDesktopRailRuntime(page);
    const scripts = recordScripts(page);
    await page.goto("/en/library/?guides=off");
    await expect.poll(() => scripts.carryingThree(), { message: "the signature still matches three.js" }).not.toEqual([]);
  });
});

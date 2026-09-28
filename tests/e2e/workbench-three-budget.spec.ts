import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

const THREE_SIGNATURE = /__THREE__|THREE\.WebGLRenderer/;
const CHUNK_PATH = /\/_next\/static\/chunks\/[\w.-]+\.js/g;

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
    has: (path: string) => paths.has(path),
    async carryingThree() {
      const all = [...paths];
      const flags = await Promise.all(all.map(fetchedAgainCarriesThree));
      return all.filter((_, index) => flags[index]);
    },
  };
}

test.describe("three.js loads only where a scene draws", () => {
  test.skip(!process.env.PLAYWRIGHT_STATIC, "only the static export prefetches routes and preloads their chunks");

  test("/automations loads none of it while the rail prefetches the Library", async ({ page }) => {
    await seedFirstRunSeen(page);
    const scripts = recordScripts(page);
    const libraryPage = page.waitForResponse((response) =>
      /\/en\/library\/__next\..*__PAGE__\.txt$/.test(decodeURIComponent(new URL(response.url()).pathname)),
    );
    await page.goto("/en/automations/?guides=off");
    const segment = await (await page.request.get((await libraryPage).url())).text();
    const libraryChunks = [...new Set(segment.match(CHUNK_PATH))];
    expect(libraryChunks.length, "the prefetched Library page names its chunks").toBeGreaterThan(0);
    await expect
      .poll(() => libraryChunks.filter((chunk) => !scripts.has(chunk)), { message: "Next preloads a prefetched page's chunks" })
      .toEqual([]);
    expect(await scripts.carryingThree()).toEqual([]);
  });

  test("the Library still loads it for its constellation", async ({ page }) => {
    await seedFirstRunSeen(page);
    const scripts = recordScripts(page);
    await page.goto("/en/library/?guides=off");
    await expect.poll(() => scripts.carryingThree(), { message: "the signature still matches three.js" }).not.toEqual([]);
  });
});

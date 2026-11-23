import { expect, test, type Locator, type Page } from "@playwright/test";

import { readFileSync } from "node:fs";

import type { workRuns } from "../../../src/features/work-run";
import { seedFirstRunSeen } from "../first-run-seed";
import { installLibraryWorkHarness } from "../library-work-harness";
import { waitForAnimationsDone } from "../settle";
import { goToMap, startCheck } from "../library/library-check-run-fixture";

/** Nine points across the card: each must hit the card itself, not a surface drawn over it. */
async function topmostAtNinePoints(card: Locator) {
  return card.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const misses: string[] = [];
    for (const x of [0.1, 0.5, 0.9]) for (const y of [0.15, 0.5, 0.85]) {
      const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
      if (!hit || !element.contains(hit)) misses.push(`${x},${y}: ${hit?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing"}`);
    }
    return misses;
  });
}

/** Buttons of the map's first-run card that something else is drawn over at their centre. */
function coveredStartButtons(page: Page) {
  return page.evaluate(() => {
    const stack = document.querySelector('[data-testid="vault-start-steps"], [data-testid="map-start-stack-layer"] [role="status"]');
    if (!stack) return ["no first-run card"];
    return [...stack.querySelectorAll<HTMLElement>("button, a[href]")].flatMap((button) => {
      const box = button.getBoundingClientRect();
      if (box.width === 0) return [];
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit && button.contains(hit) ? [] : [`${button.textContent?.trim()}: ${hit?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing"}`];
    });
  });
}

const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
  a !== null && b !== null && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const SIZES = [
  { width: 1040, height: 720 },
  { width: 1512, height: 900 },
  { width: 1920, height: 1080 },
] as const;

test.describe("the work card in the shell's notice seat", () => {
  for (const size of SIZES) {
    test(`at ${size.width}×${size.height} stands down on Check results, covers nothing, sits under no notice, and the update waits for it`, async ({ page }) => {
      await page.setViewportSize(size);
      const harness = await startCheck(page, { offerUpdate: true });
      await expect(page.getByTestId("work-run-card"), "the Library outside Check results is elsewhere").toBeVisible();

      await page.getByTestId("library-open-report").click();
      await expect(page.getByTestId("library-check-stage")).toBeVisible();
      await expect(page.getByTestId("work-run-card")).toHaveCount(0);

      await goToMap(page);
      const card = page.getByTestId("work-run-card");
      await expect(card).toHaveAttribute("data-state", "open");
      await waitForAnimationsDone(card);
      // Dev server only: Next's badge floats at the bottom right; the exported app has none.
      await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
      expect(await topmostAtNinePoints(card), "something covers the card").toEqual([]);
      await expect.poll(() => coveredStartButtons(page), { message: "the card covers a first-run button" }).toEqual([]);
      await expect(page.getByTestId("app-update-toast")).toHaveCount(0);

      await harness.mutateSource(page, "wiki/alpha.md", "---\ntitle: Alpha\n---\n\nEdited elsewhere.\n");
      const notice = page.locator("[data-sonner-toast]").first();
      await expect(notice, "an edit made outside Atlas raises a notice").toBeVisible();
      await waitForAnimationsDone(notice);
      expect(overlaps(await notice.boundingBox() as DOMRect | null, await card.boundingBox() as DOMRect | null), "the notice stands over the card").toBe(false);
      expect(await topmostAtNinePoints(card), "the notice covers the card").toEqual([]);

      await page.getByTestId("work-run-hide").click();
      await expect(card).toHaveCount(0);
      await expect(page.getByTestId("app-update-toast"), "the update notice takes the seat once the card is put away").toBeVisible();
    });
  }

  for (const locale of ["en", "ko", "ja", "zh"] as const) {
    test(`says an unreadable report whole in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 1512, height: 900 });
      const harness = await startCheck(page, { locale });
      await goToMap(page);
      await harness.answer(page, "Prose with no list in it.");
      const card = page.getByTestId("work-run-card");
      await expect(card).toHaveAttribute("data-phase", "unreadable");
      await waitForAnimationsDone(card);
      const cut = await card.evaluate((element) =>
        ["work-run-title", "work-run-detail"].flatMap((id) => {
          const line = element.querySelector<HTMLElement>(`[data-work-run-layer="current"] [data-testid="${id}"]`);
          if (!line) return [`${id}: missing`];
          return line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight ? [`${id}: ${line.textContent}`] : [];
        }));
      expect(cut, "the card cuts its sentence").toEqual([]);
    });
  }
});

type ProbeWindow = { __atlasWorkRuns?: typeof workRuns };

const MAPPING_FILES = {
  "project.md": "---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n",
  "wiki/architecture.md": "---\ntitle: Architecture\n---\n\n## Summary\n\nHow the launch is built.\n",
};

/**
 * Opens the folder with `?e2e`, so the session's runs answer the test, and plants a mapping run on
 * its second request: the row that drives one belongs to the map conversation, not to this card.
 */
async function plantMappingRun(page: Page, locale = "en") {
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: MAPPING_FILES });
  await page.goto(`/${locale}/?e2e=1`);
  await page.getByTestId("first-run-open").click();
  const mapHeading = (JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as { navRail: { map: string } }).navRail.map;
  await expect(page.getByRole("heading", { name: mapHeading, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as ProbeWindow).__atlasWorkRuns?.read().folder))).toBe(true);
  return page.evaluate(() => {
    const runs = (window as unknown as ProbeWindow).__atlasWorkRuns!;
    const folder = runs.read().folder!;
    const figures = (uncovered: number) => ({ widest: { abilitiesUncovered: uncovered, abilitiesTotal: 1240 }, sum: { abilitiesUncovered: uncovered, abilitiesTotal: 1240 } });
    const now = Date.now();
    runs.beginMapping({ folder, folderName: "launch", agent: "Claude Agent", figures: figures(1012), startedAt: now - 130_000 });
    runs.endMappingBatch(folder, { outcome: { kind: "completed" }, figures: figures(828), draft: false, at: now - 10_000 });
    runs.observeMappingWork(folder, { kind: "reading", label: null, target: "src/routes/checkout/payment-intent.ts", asking: false }, now);
    return folder;
  });
}

/** Controls a person can reach outside the card whose centre the card is drawn over; a closed dock's are inert. */
function controlsUnderCard(card: Locator) {
  return card.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role='button'], [role='tab']")]
      .filter((control) => !element.contains(control) && !control.closest("[inert], [aria-hidden='true']"))
      .flatMap((control) => {
        const rect = control.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return [];
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) return [];
        const hit = document.elementFromPoint(x, y);
        return hit && element.contains(hit) ? [`${control.getAttribute("data-testid") ?? control.textContent?.trim() ?? control.tagName}`] : [];
      });
  });
}

test.describe("a mapping run in the notice seat", () => {
  for (const size of SIZES) {
    test(`at ${size.width}×${size.height} covers no control while it runs and once a request put nothing new on the map`, async ({ page }) => {
      await page.setViewportSize(size);
      const folder = await plantMappingRun(page);
      const card = page.getByTestId("work-run-card");
      await expect(card).toHaveAttribute("data-run-kind", "mapping");
      await waitForAnimationsDone(card);
      await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
      expect(await topmostAtNinePoints(card), "something covers the card").toEqual([]);
      expect(await controlsUnderCard(card), "the running card covers a control").toEqual([]);

      await page.evaluate((key) => {
        const runs = (window as unknown as ProbeWindow).__atlasWorkRuns!;
        const figures = { widest: { abilitiesUncovered: 828, abilitiesTotal: 1240 }, sum: { abilitiesUncovered: 828, abilitiesTotal: 1240 } };
        runs.endMappingBatch(key, { outcome: { kind: "completed" }, figures, draft: false, at: Date.now() });
      }, folder);
      await expect(card).toHaveAttribute("data-phase", "stopped");
      await expect(card.getByTestId("work-run-continue")).toBeVisible();
      await waitForAnimationsDone(card);
      expect(await topmostAtNinePoints(card), "something covers the stopped card").toEqual([]);
      expect(await controlsUnderCard(card), "the stopped card covers a control").toEqual([]);
      const cut = await card.evaluate((element) =>
        [...element.querySelectorAll<HTMLElement>('[data-work-run-layer="current"] button')].flatMap((button) => {
          const box = button.getBoundingClientRect();
          const frame = element.getBoundingClientRect();
          return box.right > frame.right || button.scrollWidth > button.clientWidth ? [button.textContent ?? ""] : [];
        }));
      expect(cut, "a door runs past the card").toEqual([]);
    });
  }

  test("redraws at most once a second while the agent reports many times a second", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    const folder = await plantMappingRun(page);
    const card = page.getByTestId("work-run-card");
    await expect(card).toHaveAttribute("data-run-kind", "mapping");
    await waitForAnimationsDone(card);
    const redraws = await card.evaluate((element, key) => new Promise<number>((resolve) => {
      const runs = (window as unknown as ProbeWindow).__atlasWorkRuns!;
      let batches = 0;
      const observer = new MutationObserver(() => { batches += 1; });
      observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
      let step = 0;
      const report = window.setInterval(() => {
        step += 1;
        runs.observeMappingWork(key, { kind: "reading", label: null, target: `src/routes/file-${step}.ts`, asking: false }, Date.now());
      }, 100);
      // measurement window: five seconds of reports ten times a second, the rate a busy agent reaches.
      window.setTimeout(() => {
        window.clearInterval(report);
        observer.disconnect();
        resolve(batches);
      }, 5_000);
    }), folder);
    expect(redraws, "the card redraws faster than once a second").toBeLessThanOrEqual(6);
    expect(redraws, "the line never moved, so the window measured nothing").toBeGreaterThanOrEqual(3);
  });
});

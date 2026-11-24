import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_VAULT } from "../../fixture-vault";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForAnimationsDone } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";

/**
 * The map analysis chip reads the project note's `Not mapped yet` line and
 * `.ontology-atlas/map-analysis.jsonl`; each test plants one row of the spec's States table
 * (`docs/specs/2026-11-24-map-analysis-record.md`) in a picked folder on the web build.
 */

const DAY_MS = 24 * 60 * 60_000;
const RECORD_PATH = ".ontology-atlas/map-analysis.jsonl";

function withLine(uncovered: number, total = 100): string {
  return `${FIXTURE_VAULT["storefront.md"]}\n## Uncertainty\n\n- Not mapped yet: 3 of 9 areas, ${uncovered} of ${total} abilities.\n`;
}

interface PlantedAnalysis {
  number: number;
  agoMs: number;
  offMap?: number | null;
  total?: number;
}

/** One line per analysis; `{{NOW-<ms>}}` resolves when the folder is picked. */
function record(...analyses: PlantedAnalysis[]): string {
  return analyses
    .map(({ number, agoMs, offMap = 38, total = 100 }) =>
      JSON.stringify({
        v: 1,
        analysis: `analysis-${number}`,
        number,
        session: `session-${number}`,
        origin: "session",
        startedAt: `{{NOW-${agoMs + 60_000}}}`,
        at: `{{NOW-${agoMs}}}`,
        agent: "claude-code",
        sourceCommit: null,
        sourceDirty: null,
        abilities: offMap === null ? null : { total, offMap },
        areas: offMap === null ? null : { total: 9, notMapped: 3 },
        concepts: { added: 4, changed: 1, removed: 0 },
      }),
    )
    .join("\n")
    .concat("\n");
}

async function openPlantedFolder(page: Page, files: Record<string, string>, size = { width: 1512, height: 900 }) {
  await page.setViewportSize(size);
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT, ...files });
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 30_000 });
}

const chip = (page: Page) => page.getByTestId("map-analysis-chip");
const trigger = (page: Page) => page.getByTestId("map-analysis-chip-trigger");
const panel = (page: Page) => page.getByTestId("map-analysis-panel");

test.describe("the map analysis chip", () => {
  test.setTimeout(120_000);

  test("reads share, analysis and days since, and toggles its panel while it stays pressed", async ({ page }) => {
    const analyses = Array.from({ length: 7 }, (_, index) => ({ number: index + 1, agoMs: (10 - index) * DAY_MS }));
    analyses[6] = { number: 7, agoMs: 4 * DAY_MS };
    await openPlantedFolder(page, { "storefront.md": withLine(38), [RECORD_PATH]: record(...analyses) });

    await expect(chip(page)).toHaveAttribute("data-pill", "full");
    await expect(trigger(page)).toContainText("62%");
    await expect(trigger(page)).toContainText("7");
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    await page.mouse.move(0, 0);
    await waitForAnimationsDone(chip(page));
    const surfaceOf = () => trigger(page).evaluate((button) => getComputedStyle(button).backgroundColor);
    const resting = await surfaceOf();

    await trigger(page).click();
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
    await page.mouse.move(0, 0);
    await expect.poll(surfaceOf, { message: "the chip does not keep its pressed look while its panel is open" }).not.toBe(resting);
    await expect(page.getByTestId("map-analysis-share")).toContainText("62");
    await expect(page.getByTestId("map-analysis-counted")).toBeVisible();
    await expect(page.getByTestId("map-analysis-row")).toHaveCount(5);
    await expect(page.getByTestId("map-analysis-earlier")).toBeVisible();
    await expect(page.getByTestId("map-analysis-web-analyze"), "the web names where an analysis starts").toBeVisible();
    await expect(page.getByTestId("map-analysis-map-rest")).toHaveCount(0);

    await trigger(page).click();
    await expect(trigger(page), "a second press does not close the panel").toHaveAttribute("aria-expanded", "false");
    await trigger(page).click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger(page), "Escape does not close the panel").toHaveAttribute("aria-expanded", "false");
    await expect(trigger(page)).toBeFocused();
  });

  test("says no analysis is recorded when only the note's line exists", async ({ page }) => {
    await openPlantedFolder(page, { "storefront.md": withLine(38) });
    await expect(chip(page)).toHaveAttribute("data-pill", "shareOnly");
    await expect(chip(page)).toHaveAttribute("data-record", "absent");
    await trigger(page).click();
    await expect(page.getByTestId("map-analysis-no-record")).toBeVisible();
    await expect(page.getByTestId("map-analysis-row")).toHaveCount(0);
  });

  test("keeps the note's share and says the record cannot be read when no line parses", async ({ page }) => {
    await openPlantedFolder(page, { "storefront.md": withLine(38), [RECORD_PATH]: "not a record\n{\"v\":9}\n" });
    await expect(chip(page)).toHaveAttribute("data-pill", "shareOnly");
    await expect(chip(page)).toHaveAttribute("data-record", "unreadable");
    await expect(trigger(page)).toContainText("62%");
    await trigger(page).click();
    await expect(page.getByTestId("map-analysis-unreadable")).toBeVisible();
  });

  test("drops the share when the analyses connected no code", async ({ page }) => {
    await openPlantedFolder(page, { [RECORD_PATH]: record({ number: 1, agoMs: 2 * DAY_MS, offMap: null }) });
    await expect(chip(page)).toHaveAttribute("data-pill", "noShare");
    await expect(trigger(page)).not.toContainText("%");
    await trigger(page).click();
    await expect(page.getByTestId("map-analysis-row")).toHaveCount(1);
    await expect(page.getByTestId("map-analysis-share")).toHaveCount(0);
  });

  test("reads everything on the map once the line is gone and the last count left nothing off", async ({ page }) => {
    await openPlantedFolder(page, { [RECORD_PATH]: record({ number: 4, agoMs: DAY_MS, offMap: 0, total: 383 }) });
    await expect(chip(page)).toHaveAttribute("data-pill", "full");
    await expect(trigger(page)).toContainText("100%");
    await trigger(page).click();
    await expect(page.getByTestId("map-analysis-share")).toContainText("383");
    await expect(page.getByTestId("map-analysis-web-analyze"), "nothing is left to map").toHaveCount(0);
  });

  test("reads as analyzing now while the latest line is minutes old", async ({ page }) => {
    await openPlantedFolder(page, { "storefront.md": withLine(38), [RECORD_PATH]: record({ number: 2, agoMs: 60_000 }) });
    await expect(chip(page)).toHaveAttribute("data-pill", "running");
  });

  test("changes its label once, never blinking, as an agent's lines arrive while the map is open", async ({ page }) => {
    await openPlantedFolder(page, { "storefront.md": withLine(38), [RECORD_PATH]: record({ number: 2, agoMs: 2 * DAY_MS }) });
    await expect(chip(page)).toHaveAttribute("data-pill", "full");
    await trigger(page).click();
    await expect(page.getByTestId("map-analysis-row")).toHaveCount(1);
    await waitForAnimationsDone(chip(page));

    await page.evaluate(() => {
      const frames: string[] = [];
      const sample = () => {
        const button = document.querySelector<HTMLElement>('[data-testid="map-analysis-chip-trigger"]');
        if (button) frames.push(`${Math.round(button.getBoundingClientRect().width)}|${button.textContent ?? ""}`);
        requestAnimationFrame(sample);
      };
      (window as unknown as { __chipFrames: string[] }).__chipFrames = frames;
      requestAnimationFrame(sample);
    });
    const appendLine = (number: number) =>
      page.evaluate(async (number) => {
        const root = await navigator.storage.getDirectory();
        let folder: FileSystemDirectoryHandle | null = null;
        for await (const [name, handle] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
          if (name.startsWith("stub-vault-") && handle.kind === "directory") folder = handle as FileSystemDirectoryHandle;
        }
        const sidecar = await folder!.getDirectoryHandle(".ontology-atlas");
        const file = await sidecar.getFileHandle("map-analysis.jsonl");
        const text = await (await file.getFile()).text();
        const at = new Date().toISOString();
        const line = JSON.stringify({ v: 1, analysis: `terminal-${number}`, number, session: `terminal-${number}`, origin: "session", startedAt: at, at, agent: "claude-code", sourceCommit: null, sourceDirty: null, abilities: { total: 100, offMap: 38 }, areas: { total: 9, notMapped: 3 }, concepts: { added: 1, changed: 0, removed: 0 } });
        const writable = await file.createWritable();
        await writable.write(`${text}${line}\n`);
        await writable.close();
        window.dispatchEvent(new Event("focus"));
      }, number);

    await appendLine(3);
    await expect(page.getByTestId("map-analysis-row")).toHaveCount(2, { timeout: 30_000 });
    await expect(chip(page)).toHaveAttribute("data-pill", "running");
    await appendLine(4);
    await expect(page.getByTestId("map-analysis-row")).toHaveCount(3, { timeout: 30_000 });
    await waitForAnimationsDone(chip(page));

    const frames = await page.evaluate(() => (window as unknown as { __chipFrames: string[] }).__chipFrames);
    const labels = frames.map((frame) => frame.slice(frame.indexOf("|") + 1)).filter((label, index, list) => index === 0 || label !== list[index - 1]);
    expect(labels, `the label changed ${labels.length - 1} times: ${labels.join(" -> ")}`).toHaveLength(2);
    const widths = frames.map((frame) => frame.slice(0, frame.indexOf("|"))).filter((width, index, list) => index === 0 || width !== list[index - 1]);
    expect(new Set(widths).size, `the width came back to a value it left: ${widths.join(" -> ")}`).toBe(widths.length);
  });

  test("moves the share from the value last drawn when the note's line changes", async ({ page }) => {
    await openPlantedFolder(page, { "storefront.md": withLine(38), [RECORD_PATH]: record({ number: 3, agoMs: 4 * DAY_MS }) });
    await expect(trigger(page)).toContainText("62%");
    await waitForAnimationsDone(chip(page));

    await page.evaluate(async () => {
      const percentOf = () => Number(/(\d+)%/.exec(document.querySelector('[data-testid="map-analysis-chip-trigger"]')?.textContent ?? "")?.[1]);
      const samples: Array<{ at: number; percent: number }> = [];
      const sample = (at: number) => {
        samples.push({ at, percent: percentOf() });
        if (samples.at(-1)?.percent !== 90 || samples.length < 3) requestAnimationFrame(sample);
      };
      (window as unknown as { __shareSamples: typeof samples }).__shareSamples = samples;
      requestAnimationFrame(sample);
      const root = await navigator.storage.getDirectory();
      let folder: FileSystemDirectoryHandle | null = null;
      for await (const [name, handle] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (name.startsWith("stub-vault-") && handle.kind === "directory") folder = handle as FileSystemDirectoryHandle;
      }
      const note = await folder!.getFileHandle("storefront.md");
      const text = await (await note.getFile()).text();
      const writable = await note.createWritable();
      await writable.write(text.replace("38 of 100 abilities", "10 of 100 abilities"));
      await writable.close();
      window.dispatchEvent(new Event("focus"));
    });

    await expect(trigger(page)).toContainText("90%", { timeout: 30_000 });
    const samples = await page.evaluate(() => (window as unknown as { __shareSamples: Array<{ at: number; percent: number }> }).__shareSamples);
    const moving = samples.filter((entry, index) => index > 0 && entry.percent !== samples[index - 1]!.percent);
    const percents = samples.map((entry) => entry.percent);
    expect(percents.every((percent, index) => index === 0 || percent >= percents[index - 1]!), `the share went back: ${percents.join(",")}`).toBe(true);
    expect(percents.some((percent) => percent > 62 && percent < 90), "the share jumped to its new value").toBe(true);
    const firstMove = samples.findIndex((entry) => entry.percent !== 62);
    const intervals = samples.slice(Math.max(1, firstMove)).map((entry, index, list) => (index === 0 ? 0 : entry.at - list[index - 1]!.at));
    expect(Math.max(...intervals), `a frame took over 50 ms while the share moved (${moving.length} changes)`).toBeLessThanOrEqual(50);
  });

  for (const size of [
    { width: 1040, height: 720 },
    { width: 1512, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`overlaps no control at ${size.width}x${size.height}`, async ({ page }) => {
      await openPlantedFolder(page, { "storefront.md": withLine(38), [RECORD_PATH]: record({ number: 3, agoMs: 4 * DAY_MS }) }, size);
      await expect(chip(page)).toBeVisible();
      await waitForAnimationsDone(chip(page));
      const covered = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-testid="map-analysis-chip"]')!;
        const box = root.querySelector("button")!.getBoundingClientRect();
        const points = [
          [box.left + 2, box.top + 2],
          [box.right - 2, box.top + 2],
          [box.left + 2, box.bottom - 2],
          [box.right - 2, box.bottom - 2],
          [box.left + box.width / 2, box.top + box.height / 2],
        ];
        const hidden = points.filter(([x, y]) => !root.contains(document.elementFromPoint(x!, y!))).map(([x, y]) => `${Math.round(x!)},${Math.round(y!)}`);
        const overlapping = [...document.querySelectorAll<HTMLElement>("button, a[href], input")]
          .filter((control) => !root.contains(control) && control.checkVisibility())
          .filter((control) => {
            const other = control.getBoundingClientRect();
            return other.width > 0 && other.left < box.right && other.right > box.left && other.top < box.bottom && other.bottom > box.top;
          })
          .map((control) => control.getAttribute("data-testid") ?? control.getAttribute("aria-label") ?? control.tagName);
        return { hidden, overlapping, width: box.width };
      });
      expect(covered.hidden, "another surface covers the chip").toEqual([]);
      expect(covered.overlapping, "the chip overlaps a control").toEqual([]);
    });
  }
});

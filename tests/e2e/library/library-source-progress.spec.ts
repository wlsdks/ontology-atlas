import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { installLibraryWorkHarness } from "../library-work-harness";
import { waitFrames } from "../settle";
import { stubDirectoryPicker } from "../vault-picker-stub";

/**
 * The Sources home's progress band and its state presses, drawn from a real folder: 37 sources, 10
 * with a wiki page dated on three days, 27 waiting; four of the waiting ones and two of the written
 * ones carry Hangul names, so a Hangul search narrows a filtered list.
 */

const TOTAL = 37;
const COMPILED = 10;
const HANGUL_WAITING = 4;
const HANGUL_COMPILED = 2;

function localDate(daysAgo: number): string {
  const day = new Date(Date.now() - daysAgo * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function oneSourceVault(): Record<string, string> {
  const path = "sources/refund-policy-2026.md";
  const body = "# Refund policy\n\nRefunds close after 30 days.\n";
  return {
    "project.md": "---\nkind: project\nslug: one-demo\ntitle: One demo\n---\n\n# One demo\n",
    [path]: body,
    "wiki/refund-policy.md": [
      "---",
      "title: Refund policy, 2026",
      "created_by: agent:claude",
      `compiled_at: ${localDate(0)}`,
      "sources:",
      `  - ${path}`,
      "source_hash:",
      `  ${path}: ${createHash("sha256").update(body).digest("hex")}`,
      "status: draft",
      "summary: Refunds close after 30 days.",
      "---",
      "",
      "## Summary",
      "",
      "Refunds close after 30 days.",
      "",
      "## Facts",
      "",
      `- Thirty days. [[src:${path}#p1]]`,
      "",
      "## Decisions",
      "",
      "## Open questions",
      "",
      "## Not in sources",
      "",
    ].join("\n"),
  };
}

function buildVault(): Record<string, string> {
  const files: Record<string, string> = {
    "project.md": "---\nkind: project\nslug: progress-demo\ntitle: Progress demo\n---\n\n# Progress demo\n",
  };
  for (let i = 0; i < TOTAL; i += 1) {
    const compiled = i < COMPILED;
    const hangul = compiled ? i < HANGUL_COMPILED : i < COMPILED + HANGUL_WAITING;
    const name = `${hangul ? "회의록" : "memo"}-${String(i + 1).padStart(2, "0")}.md`;
    const path = `sources/${name}`;
    const body = `# ${name}\n\nOne decision, one figure.\n`;
    files[path] = body;
    if (!compiled) continue;
    const hash = createHash("sha256").update(body).digest("hex");
    files[`wiki/page-${i + 1}.md`] = [
      "---",
      `title: Page ${i + 1}`,
      "created_by: agent:claude",
      `compiled_at: ${localDate([4, 2, 0][i % 3]!)}`,
      "sources:",
      `  - ${path}`,
      "source_hash:",
      `  ${path}: ${hash}`,
      "status: draft",
      "summary: One decision.",
      "---",
      "",
      "## Summary",
      "",
      "One decision.",
      "",
      "## Facts",
      "",
      `- A figure. [[src:${path}#p1]]`,
      "",
      "## Decisions",
      "",
      "## Open questions",
      "",
      "## Not in sources",
      "",
    ].join("\n");
  }
  return files;
}

async function openSources(page: Page, { vault = buildVault(), locale = "en" }: { vault?: Record<string, string>; locale?: string } = {}) {
  // Tall enough that the windowed list draws every row, so a count of rows is a count of the list.
  await page.setViewportSize({ width: 1440, height: 2000 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, vault);
  await page.goto(`/${locale}/library/?tab=sources`);
  await page.waitForLoadState("networkidle");
  const picker = page.getByTestId("library-open-vault");
  await picker.waitFor({ timeout: 25_000 });
  await picker.click();
  await page.locator('[data-testid="library-page"][data-library-state="nothing-open"]').waitFor({ timeout: 25_000 });
  // Hashes are read lazily; the band counts once no source is still being checked.
  await expect(page.getByTestId("library-source-states-checking")).toHaveCount(0, { timeout: 25_000 });
}

const rows = (page: Page) => page.getByTestId("library-source-list").locator("li > button[data-row-index]");

test.describe("source progress on the Sources home", () => {
  test("a state press filters the list; Show all and Escape clear it", async ({ page }) => {
    await openSources(page);
    await expect(rows(page)).toHaveCount(TOTAL);
    const band = page.getByTestId("library-progress");

    // The presses live in the band, in bar order; the column draws no state line of its own.
    await expect(band.getByTestId("library-source-states")).toBeVisible();
    await expect(page.getByTestId("library-index").getByTestId("library-source-states")).toHaveCount(0);
    const order = await band.locator("[data-testid^='library-source-states-'][aria-pressed]").evaluateAll((presses) =>
      presses.map((press) => press.getAttribute("data-testid")),
    );
    expect(order).toEqual(["library-source-states-compiled", "library-source-states-not-compiled"]);

    const waiting = page.getByTestId("library-source-states-not-compiled");
    await expect(waiting).toHaveText(new RegExp(`^no wiki page\\D*${TOTAL - COMPILED}$`));
    await waiting.click();
    await expect(waiting).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(TOTAL - COMPILED);
    await expect(page.getByTestId("library-source-state-compiled")).toHaveCount(0);

    // The clear press is a glyph whose name is the Show all sentence.
    const all = page.getByTestId("library-source-states-all");
    await expect(all).toHaveAccessibleName(`Show all ${TOTAL}`);
    await expect(all).toHaveAttribute("title", `Show all ${TOTAL}`);
    await all.click();
    await expect(rows(page)).toHaveCount(TOTAL);
    await expect(waiting).toHaveAttribute("aria-pressed", "false");
    // At rest its slot stays, invisible and out of reach.
    await expect(all).toHaveAttribute("aria-hidden", "true");
    await expect(all).toHaveAttribute("tabindex", "-1");

    // Escape clears it too.
    await waiting.click();
    await expect(rows(page)).toHaveCount(TOTAL - COMPILED);
    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(TOTAL);
    await expect(waiting).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("library-source-states-compiled").click();
    await expect(rows(page)).toHaveCount(COMPILED);
    await page.keyboard.press("Escape");

    // The filter narrows what the search left; the counts are the folder's, and so is Show all.
    await page.getByTestId("library-search").fill("회의록");
    await expect(page.getByTestId("library-source-list")).not.toHaveAttribute("data-phase", "reading");
    await expect(rows(page)).toHaveCount(HANGUL_WAITING + HANGUL_COMPILED);
    await waiting.click();
    await expect(rows(page)).toHaveCount(HANGUL_WAITING);
    await expect(all).toHaveAccessibleName(`Show all ${TOTAL}`);
    await all.click();
    await expect(rows(page)).toHaveCount(HANGUL_WAITING + HANGUL_COMPILED);
  });

  test("a press while the column is folded unfolds it to show the filtered list", async ({ page }) => {
    await openSources(page);
    await page.getByTestId("library-index-collapse").click();
    await expect(page.getByTestId("library-index")).toBeHidden();
    await expect(page.getByTestId("library-index-tab")).toBeVisible();
    await page.getByTestId("library-source-states-not-compiled").click();
    await expect(page.getByTestId("library-index")).toBeVisible();
    await expect(rows(page)).toHaveCount(TOTAL - COMPILED);
  });

  test("the band counts what has a page and, on the web, offers the app instead of Continue", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSources(page);
    const band = page.getByTestId("library-progress");
    // 10 of 37 is 27.0%, rounded down.
    await expect(band.getByTestId("library-progress-percent")).toHaveText("27%");
    await expect(band.getByTestId("library-progress-sentence")).toHaveText(`${COMPILED} of ${TOTAL} sources have a wiki page`);
    // Three dated days, one point each.
    await expect(band.getByTestId("library-progress-chart")).toHaveAttribute("data-points", "5");
    await expect(band.getByTestId("library-progress-today")).toHaveText("+3 today");
    // The chart's draw-in, the landing ring and the 100% light are never applied under reduced motion.
    await expect(page.locator(".motion-progress-reveal, .motion-progress-ripple, .motion-progress-light")).toHaveCount(0);

    // The chart's one line says what it counts and since which day, and repeats no count.
    await expect(band.getByTestId("library-progress-chart-title")).toHaveText(/^Sources with a wiki page since \D+ \d{1,2}$/);
    // Each state's press wears its colour in the bar.
    const swatch = (state: string) => page.getByTestId(`library-source-states-swatch-${state}`).evaluate((node) => getComputedStyle(node).backgroundColor);
    const segment = (index: number) => band.getByTestId("library-progress-bar").locator("span.motion-progress-segment").nth(index).evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(await swatch("compiled")).toBe(await segment(0));

    // On the web nothing here can write: one line says so, and the one action is the app.
    await expect(band.getByTestId("library-progress-continue")).toHaveCount(0);
    await expect(band.getByTestId("library-progress-blocked")).toHaveText("Only the app writes wiki pages. Reading works here.");
    await expect(band.getByTestId("library-progress-get-app")).toHaveAttribute("href", /\/download\/?$/);
    // The press replaced the home strip's clause.
    await expect(page.getByTestId("library-strip-compile")).toHaveCount(0);
  });

  for (const locale of ["en", "ko"]) {
    /*
     * The home is exactly the band and the overview, at every desktop width: the band is 124px
     * beside the panel and 136px when the pane stacks, its last cell stands on the panel's edges,
     * the overview takes the rest of the pane with no canvas, and nothing overflows.
     */
    test(`one source reads 100% with no chart, and the home is band and overview (${locale})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openSources(page, { vault: oneSourceVault(), locale });
      const band = page.getByTestId("library-progress");
      await expect(band.getByTestId("library-progress-percent")).toHaveText("100%");
      // The noun follows the total and the verb the count.
      if (locale === "en") await expect(band.getByTestId("library-progress-sentence")).toHaveText("1 of 1 source has a wiki page");
      await expect(band.getByTestId("library-progress-chart")).toHaveCount(0);
      // One state has no legend: the number, the sentence and the bar say it. Its row stays as a reserve.
      await expect(band.getByTestId("library-source-states")).toHaveCount(0);
      expect((await band.getByTestId("library-source-states-reserve").boundingBox())!.height).toBe(24);
      for (const width of [1040, 1280, 1512, 1920]) {
        await page.setViewportSize({ width, height: 901 });
        await expect(page.getByTestId("sources-overview")).toBeVisible();
        const geometry = await page.evaluate(() => {
          const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null;
          const overflow = [...document.querySelectorAll('[data-testid="library-progress"] *, [data-testid="sources-overview"] *, [data-testid="library-doors"] *')]
            .filter((node) => (node as HTMLElement).offsetWidth > 0)
            // A page sheet's format tab sits past its paper edge by design; it is a drawing, not cut text.
            .filter((node) => !node.closest('.sr-only, [data-testid="library-progress-bar"], [data-sheet]'))
            .filter((node) => node.scrollWidth > node.clientWidth + 0.5)
            .map((node) => node.getAttribute("data-testid") ?? node.tagName);
          const action = box("library-progress-action")!;
          const panel = box("sources-panel")!;
          return {
            band: box("library-progress")!.height,
            actionOffPanel: Math.max(Math.abs(action.left - panel.left), Math.abs(action.right - panel.right)),
            overview: box("sources-overview")!.height,
            pane: box("library-reader-landing")!.height,
            canvases: document.querySelectorAll('[data-testid="library-reader-landing"] canvas').length,
            overflow,
          };
        });
        expect(geometry.band, `band at ${width}`).toBe(width >= 1512 ? 124 : 136);
        if (width >= 1512) expect(geometry.actionOffPanel, `the action cell on the panel's edges at ${width}`).toBeLessThanOrEqual(0.5);
        expect(geometry.overview / geometry.pane, `overview share at ${width}`).toBeGreaterThanOrEqual(0.75);
        expect(geometry.canvases, `canvases at ${width}`).toBe(0);
        expect(geometry.overflow, `overflow at ${width}`).toEqual([]);
        // No work lane above the pane and no doors row inside it: the doors are in the page header.
        await expect(page.getByTestId("library-work-lane")).toHaveCount(0);
        await expect(page.getByTestId("library-home-strip")).toHaveCount(0);
        await expect(page.getByTestId("library-doors")).toBeVisible();
        await expect(page.getByTestId("library-questions-open")).toHaveCount(1);
        // The header's pills cast no shadow across its border into the band.
        const shadows = await page.getByTestId("library-doors").locator("button").evaluateAll((buttons) =>
          buttons.filter((button) => (button as HTMLElement).offsetWidth > 0).map((button) => getComputedStyle(button).boxShadow),
        );
        expect(shadows.length).toBeGreaterThan(0);
        // Tailwind composes `shadow-none` as transparent layers; each layer must draw nothing.
        const drawn = shadows.flatMap((shadow) => (shadow === "none" ? [] : shadow.split(/,(?![^(]*\))/)))
          .filter((layer) => !layer.includes("rgba(0, 0, 0, 0)"));
        expect(drawn).toEqual([]);
        // No chevron disclosure anywhere on the Sources home.
        await expect(page.getByTestId("library-reader-landing").locator("svg.lucide-chevron-down, svg.lucide-chevron-right")).toHaveCount(0);
      }
    });
  }

  /*
   * A press resizes nothing in the band: the clear press holds its slot from the first paint. The
   * number cell, the bar cell, the chart and the action cell keep their boxes before a press, while
   * pressed, and after clearing.
   */
  for (const locale of ["en", "ko"]) {
    test(`a press resizes nothing in the band (${locale})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openSources(page, { locale });
      for (const width of [1512, 1920]) {
        await page.setViewportSize({ width, height: width === 1920 ? 1080 : 901 });
        await expect(page.getByTestId("sources-overview")).toBeVisible();
        await expectStillBand(page, `${locale}@${width}`);
      }
    });

    test(`a press resizes nothing in the band with the conversation open (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 1512, height: 901 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installLibraryWorkHarness(page, { files: buildVault() });
      await page.goto(`/${locale}/`);
      await page.getByTestId("first-run-open").or(page.getByRole("button", { name: /^Open (?:a|my) folder/ })).first().click();
      await page.getByTestId("app-nav-rail").waitFor();
      await page.goto(`/${locale}/library/?tab=sources&guides=off`);
      await expect(page.getByTestId("library-source-states-checking")).toHaveCount(0, { timeout: 25_000 });
      await page.getByTestId("library-open-conversation").click();
      await expect(page.getByTestId("library-agent-dock")).toBeVisible();
      await expectStillBand(page, `${locale}@1512 with the dock`);
    });
  }

  test("aiming at Continue lights the share its sources would add on the bar", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 901 });
    await installLibraryWorkHarness(page, { files: buildVault() });
    await page.goto("/en/");
    await page.getByTestId("first-run-open").or(page.getByRole("button", { name: /^Open (?:a|my) folder/ })).first().click();
    await page.getByTestId("app-nav-rail").waitFor();
    await page.goto("/en/library/?tab=sources&guides=off");
    await expect(page.getByTestId("library-source-states-checking")).toHaveCount(0, { timeout: 25_000 });
    const next = page.getByTestId("library-progress-next");
    const press = page.getByTestId("library-progress-continue");
    await expect(press).toHaveText("Write wiki pages for the next 10");
    await expect(next).toHaveCSS("opacity", "0");
    await press.hover();
    await expect(next).toHaveCSS("opacity", "0.5");
    // It starts where the written pages end and is ten sources wide, as shares of the folder.
    const [cutRight, cutLeft] = await next.evaluate((node) => ((node as HTMLElement).style.clipPath.match(/[\d.]+(?=%)/g) ?? []).map(Number));
    expect(cutLeft).toBeCloseTo((COMPILED * 100) / TOTAL, 1);
    expect(100 - cutRight!).toBeCloseTo(((COMPILED + 10) * 100) / TOTAL, 1);
    await page.mouse.move(0, 0);
    await expect(next).toHaveCSS("opacity", "0");
    await press.focus();
    await expect(next).toHaveCSS("opacity", "0.5");
  });
});

const BAND_CELLS = ["library-progress-number-cell", "library-progress-bar-cell", "library-progress-chart", "library-progress-action"];

async function bandRects(page: Page) {
  // Two frames apart and equal, so a layout still settling is never read as the press's doing.
  let last = "";
  for (;;) {
    await waitFrames(page, 2);
    const now = JSON.stringify(
      await page.evaluate((ids) => ids.map((id) => {
        const rect = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
        return rect ? [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10) : null;
      }), BAND_CELLS),
    );
    if (now === last) return JSON.parse(now) as Array<number[] | null>;
    last = now;
  }
}

async function expectStillBand(page: Page, where: string) {
  const before = await bandRects(page);
  expect(before.filter(Boolean).length, `${where}: band cells drawn`).toBeGreaterThanOrEqual(3);
  const press = page.getByTestId("library-source-states-not-compiled");
  await press.click();
  await expect(page.getByTestId("library-source-states-all")).toHaveAttribute("data-shown", "");
  expect(await bandRects(page), `${where}: while pressed`).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(press).toHaveAttribute("aria-pressed", "false");
  expect(await bandRects(page), `${where}: after clearing`).toEqual(before);
}

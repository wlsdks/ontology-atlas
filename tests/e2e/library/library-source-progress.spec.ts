import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

/**
 * The Sources home's progress band and the state line's filters, drawn from a real folder: 37
 * sources, 10 with a wiki page dated on three days, 27 waiting; four of the waiting ones and two of
 * the written ones carry Hangul names, so a Hangul search narrows a filtered list.
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

async function openSources(page: Page) {
  // Tall enough that the windowed list draws every row, so a count of rows is a count of the list.
  await page.setViewportSize({ width: 1440, height: 2000 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, buildVault());
  await page.goto("/en/library/?tab=sources");
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
  test("the state line filters the list, and Show all restores it, with Hangul search text too", async ({ page }) => {
    await openSources(page);
    await expect(rows(page)).toHaveCount(TOTAL);

    const waiting = page.getByTestId("library-source-states-not-compiled");
    // The majority state folds into a badge, so its count reads "no wiki page · 27".
    await expect(waiting).toHaveText(new RegExp(`^no wiki page\\D+${TOTAL - COMPILED}$`));
    await waiting.click();
    await expect(waiting).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(TOTAL - COMPILED);
    await expect(page.getByTestId("library-source-state-compiled")).toHaveCount(0);

    const all = page.getByTestId("library-source-states-all");
    await expect(all).toHaveText(`Show all ${TOTAL}`);
    await all.click();
    await expect(rows(page)).toHaveCount(TOTAL);
    await expect(waiting).toHaveAttribute("aria-pressed", "false");

    // The filter narrows what the search left; the counts are the search's.
    await page.getByTestId("library-search").fill("회의록");
    await expect(page.getByTestId("library-source-list")).not.toHaveAttribute("data-phase", "reading");
    await expect(rows(page)).toHaveCount(HANGUL_WAITING + HANGUL_COMPILED);
    await expect(waiting).toHaveText(`no wiki page ${HANGUL_WAITING}`);
    await waiting.click();
    await expect(rows(page)).toHaveCount(HANGUL_WAITING);
    await expect(all).toHaveText(`Show all ${HANGUL_WAITING + HANGUL_COMPILED}`);
    await all.click();
    await expect(rows(page)).toHaveCount(HANGUL_WAITING + HANGUL_COMPILED);
  });

  test("the band counts what has a page and, on the web, says why Continue cannot run", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSources(page);
    const band = page.getByTestId("library-progress");
    // 10 of 37 is 27.0%, rounded down.
    await expect(band.getByTestId("library-progress-percent")).toHaveText("27%");
    await expect(band.getByTestId("library-progress-sentence")).toHaveText(`${COMPILED} of ${TOTAL} sources have a wiki page`);
    // Three dated days, one point each.
    await expect(band.getByTestId("library-progress-chart")).toHaveAttribute("data-points", "5");
    await expect(band.getByTestId("library-progress-today")).toHaveText("+3 today");

    const press = band.getByTestId("library-progress-continue");
    await expect(press).toHaveText("Write wiki pages for the next 10");
    await expect(press).toBeDisabled();
    await expect(band.getByTestId("library-progress-blocked")).toContainText("only the app can start");
    await expect(band.getByTestId("library-progress-get-app")).toHaveAttribute("href", /\/download\/?$/);
    // The press replaced the home strip's clause.
    await expect(page.getByTestId("library-strip-compile")).toHaveCount(0);
  });
});

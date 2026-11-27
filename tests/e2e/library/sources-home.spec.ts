import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  installDesktopRailRuntime,
  listDesktopFiles,
  mountDesktopVault,
  renameDesktopFile,
} from "../desktop-rail-arrival-harness";

/**
 * The Sources home on a real folder: 54 sources in five first-level folders, 14 with a wiki page.
 * A row press narrows the index list to that folder and Escape gives both back; the home draws no
 * canvas and cuts no text at the two desktop sizes, in English and Korean.
 */

const FOLDERS = ["decks", "contracts", "회의록", "research", "inbox"] as const;
const PER_FOLDER = [16, 12, 10, 9, 7] as const;
const WRITTEN_PER_FOLDER = [6, 4, 2, 2, 0] as const;

function localDate(daysAgo: number): string {
  const day = new Date(Date.now() - daysAgo * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function wikiPage(title: string, path: string, body: string, daysAgo: number): string {
  return [
    "---",
    `title: ${title}`,
    "created_by: agent:claude",
    `compiled_at: ${localDate(daysAgo)}`,
    "sources:",
    `  - ${path}`,
    "source_hash:",
    `  ${path}: ${createHash("sha256").update(body).digest("hex")}`,
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

function buildVault({ written = true }: { written?: boolean } = {}): Record<string, string> {
  const files: Record<string, string> = {
    "project.md": "---\nkind: project\nslug: home-demo\ntitle: Home demo\n---\n\n# Home demo\n",
  };
  FOLDERS.forEach((folder, f) => {
    for (let i = 0; i < PER_FOLDER[f]!; i += 1) {
      const path = `sources/${folder}/note-${String(i + 1).padStart(2, "0")}.md`;
      const body = `# ${folder} ${i + 1}\n\nOne decision, one figure.\n`;
      files[path] = body;
      if (written && i < WRITTEN_PER_FOLDER[f]!) files[`wiki/${f}-${i + 1}.md`] = wikiPage(`${folder} page ${i + 1}`, path, body, i % 3);
    }
  });
  return files;
}

async function openSources(page: Page, { vault = buildVault(), locale = "en", width = 1920, height = 1080 } = {}) {
  await page.setViewportSize({ width, height });
  await installDesktopRailRuntime(page, vault, undefined, { replaceFixture: true, writable: true });
  await mountDesktopVault(page, locale);
  await page.goto(`/${locale}/library/?tab=sources`);
  await page.locator('[data-testid="library-page"][data-library-state="nothing-open"]').waitFor({ timeout: 25_000 });
  await expect(page.getByTestId("library-source-states-checking")).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByTestId("sources-meta")).toBeVisible();
}

const listRows = (page: Page) => page.getByTestId("library-source-list").locator("li > button[data-row-index]");
const total = PER_FOLDER.reduce((sum, n) => sum + n, 0);

test.describe("the Sources home", () => {
  test("a row press narrows the list to its folder with a chip, and Escape gives both back", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSources(page, { height: 2400 });
    const overview = page.getByTestId("sources-overview");
    await expect(overview.getByTestId("sources-row")).toHaveCount(FOLDERS.length);
    await expect(listRows(page)).toHaveCount(total);

    // Rows sort by what waits, most first: decks waits 10 of 16.
    const first = overview.getByTestId("sources-row").first();
    await expect(first).toHaveAttribute("data-key", "folder:decks");
    await first.click();
    await expect(first).toHaveAttribute("data-picked", "");
    await expect(page.getByTestId("library-source-group-chip")).toHaveText("Folder: decks");
    await expect(listRows(page)).toHaveCount(PER_FOLDER[0]);
    await expect(overview.getByTestId("sources-panel-file")).toHaveCount(PER_FOLDER[0] - WRITTEN_PER_FOLDER[0]);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("library-source-group-chip")).toHaveCount(0);
    await expect(listRows(page)).toHaveCount(total);
    await expect(first).not.toHaveAttribute("data-picked", "");

    // The chip's own press clears the pick as well.
    await first.click();
    await page.getByTestId("library-source-group-chip").click();
    await expect(listRows(page)).toHaveCount(total);
    await expect(first).not.toHaveAttribute("data-picked", "");
  });

  test("a file the panel names opens in the reader", async ({ page }) => {
    await openSources(page);
    await page.getByTestId("sources-overview").getByTestId("sources-panel-file").first().click();
    await expect(page.getByTestId("sources-overview")).toHaveCount(0);
    await expect(page.getByTestId("library-page")).toHaveAttribute("data-library-state", "source");
    await expect(page.getByTestId("library-source-list").locator('[aria-current="true"]')).toHaveCount(1);
  });

  for (const locale of ["en", "ko"]) {
    for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
      test(`draws no canvas and cuts no text at ${width} (${locale})`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await openSources(page, { locale, width, height });
        const found = await page.evaluate(() => {
          const home = document.querySelector('[data-testid="sources-overview"]')!;
          const cut = [...home.querySelectorAll("*")]
            .filter((node) => (node as HTMLElement).offsetWidth > 0)
            .filter((node) => !node.closest(".sr-only"))
            .filter((node) => getComputedStyle(node).overflowX !== "visible")
            .filter((node) => node.scrollWidth > node.clientWidth + 0.5)
            .map((node) => `${node.getAttribute("data-testid") ?? node.tagName}: ${(node.textContent ?? "").slice(0, 60)}`);
          const canvases = document.querySelectorAll('[data-testid="library-reader-landing"] canvas').length;
          return { canvases, cut };
        });
        expect(found.canvases).toBe(0);
        expect(found.cut).toEqual([]);
      });
    }
  }

  test("in a narrow pane the next-to-write panel starts on screen, above the table", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSources(page, { width: 1040, height: 800 });
    const panel = page.getByTestId("sources-panel");
    const top = (await panel.boundingBox())!.y;
    expect(top, "panel top at 1040x800").toBeLessThan(800);
    const firstFile = (await panel.getByTestId("sources-panel-file").first().boundingBox())!;
    expect(firstFile.y + firstFile.height, "first named file at 1040x800").toBeLessThanOrEqual(800);
    expect(top).toBeLessThan((await page.getByTestId("sources-table").boundingBox())!.y);
  });

  test("a return from Wiki draws the row bars at their values, not from empty", async ({ page }) => {
    await openSources(page);
    const decks = page.locator('[data-testid="sources-row"][data-key="folder:decks"]').getByTestId("sources-row-share");
    await expect(decks).not.toHaveText("0%");
    await page.getByTestId("library-workspace-wiki").click();
    await expect(page.getByTestId("sources-overview")).toHaveCount(0);
    // The first committed text of the row, before any frame could move it.
    await page.evaluate(() => {
      const w = window as unknown as { __firstDecksShare?: string };
      const observer = new MutationObserver(() => {
        const share = document.querySelector('[data-testid="sources-row"][data-key="folder:decks"] [data-testid="sources-row-share"]');
        if (!share) return;
        w.__firstDecksShare = share.textContent ?? "";
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.getByTestId("library-workspace-sources").click();
    await expect(decks).toBeVisible();
    const first = await page.evaluate(() => (window as unknown as { __firstDecksShare?: string }).__firstDecksShare);
    expect(first).toBe(await decks.textContent());
    expect(first).not.toBe("0%");
  });

  test("a picked folder renamed on disk says so and shows every source again", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSources(page, { height: 2400 });
    await page.locator('[data-testid="sources-row"][data-key="folder:inbox"]').click();
    await expect(page.getByTestId("library-source-group-chip")).toHaveText("Folder: inbox");
    for (const path of ((await listDesktopFiles(page)) ?? []).filter((file) => file.startsWith("sources/inbox/"))) {
      await renameDesktopFile(page, path, path.replace("sources/inbox/", "sources/inbox-archive/"));
    }
    // The app rereads the folder when it is told of a change and on focus; each poll offers one.
    await expect
      .poll(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        return page.getByTestId("sources-pick-gone").count();
      }, { timeout: 20_000 })
      .toBe(1);
    await expect(page.getByTestId("sources-pick-gone")).toHaveText("inbox is no longer in sources/. Showing all sources.");
    await expect(page.getByTestId("library-source-group-chip")).toHaveCount(0);
    await expect(listRows(page)).toHaveCount(total);
  });

  test("on the first day the band's sentence raises no title of its own", async ({ page }) => {
    await openSources(page, { vault: buildVault({ written: false }) });
    const sentence = page.getByTestId("library-progress-sentence");
    await expect(sentence).toHaveText("No source has a wiki page yet");
    await expect(sentence).not.toHaveAttribute("title", /.*/);
  });
});

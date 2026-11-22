import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import { stubDirectoryPicker } from "../../vault-picker-stub";

/**
 * The Wiki column is the wiki's index (`docs/specs/2026-11-21-library-index-column.md`, criteria
 * 2-4): rows of one height that never overflow, no agent doors in the column, groups capped at five
 * above 200 pages with "Show all" and Escape, and an open page whose file leaves said once.
 */

const SHARED_SOURCE = "sources/shared.md";
const SHARED_BODY = "# Shared\n\nOne figure.\n";
const SHARED_HASH = createHash("sha256").update(SHARED_BODY).digest("hex");

function wikiPage(title: string, sources: readonly string[], compiledAt: string, { sections = true } = {}): string {
  return [
    "---",
    `title: ${title}`,
    "created_by: agent:claude",
    `compiled_at: ${compiledAt}`,
    sources.length ? "sources:" : "sources: []",
    ...sources.map((path) => `  - ${path}`),
    sources.length ? "source_hash:" : "source_hash: {}",
    ...sources.map((path) => `  ${path}: ${SHARED_HASH}`),
    "status: draft",
    "summary: What it commits to.",
    "---",
    "",
    "## Summary",
    "",
    "One decision.",
    "",
    "## Facts",
    "",
    sources.length ? `- A figure. [[src:${sources[0]}#p1]]` : "",
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
    ...(sections ? ["## Not in sources", ""] : []),
  ].join("\n");
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");
}

/** Sixty pages: answers, a sub-folder, pages from one, several and no source, long Hangul and NFD titles. */
function sixtyPages(): Record<string, string> {
  const files: Record<string, string> = {
    "project.md": "---\nkind: project\nslug: index-demo\ntitle: Index demo\n---\n\n# Index demo\n",
    [SHARED_SOURCE]: SHARED_BODY,
  };
  const longKo = "야간 근무 일정과 교대 규칙, 그리고 예외 처리 절차를 한 번에 정리한 아주 긴 제목";
  for (let i = 0; i < 49; i += 1) {
    const title = i % 7 === 0 ? `${longKo} ${i}` : i % 7 === 1 ? `회의록 정리 ${i}`.normalize("NFD") : `Carrier terms ${i}`;
    files[`wiki/page-${i}.md`] = wikiPage(title, [SHARED_SOURCE], daysAgo(i * 0.5), { sections: i % 11 !== 5 });
  }
  for (let i = 0; i < 5; i += 1) files[`wiki/synthesis-${i}.md`] = wikiPage(`Synthesis ${i}`, [SHARED_SOURCE, `sources/other-${i}.md`], daysAgo(i));
  for (let i = 0; i < 5; i += 1) files[`sources/other-${i}.md`] = SHARED_BODY;
  files["wiki/glossary.md"] = wikiPage("Glossary", [], daysAgo(9));
  files["wiki/meetings/kickoff.md"] = wikiPage("Kickoff meeting", [SHARED_SOURCE], daysAgo(2));
  files["wiki/meetings/review.md"] = wikiPage("Quarter review meeting", [SHARED_SOURCE], daysAgo(40));
  for (let i = 0; i < 3; i += 1) files[`wiki/answers/answer-${i}.md`] = wikiPage(`Saved answer ${i}`, [SHARED_SOURCE], daysAgo(i));
  return files;
}

/** Pages all citing one shared source, so they land in one group with no finding. */
function manyPages(count: number): Record<string, string> {
  const files: Record<string, string> = {
    "project.md": "---\nkind: project\nslug: index-scale\ntitle: Index scale\n---\n\n# Index scale\n",
    [SHARED_SOURCE]: SHARED_BODY,
  };
  const at = daysAgo(1);
  for (let i = 0; i < count; i += 1) files[`wiki/p${i}.md`] = wikiPage(`Page ${i}`, [SHARED_SOURCE], at);
  return files;
}

async function openWiki(page: Page, vault: Record<string, string>, { locale = "en", width = 1920, height = 1080 } = {}) {
  await page.setViewportSize({ width, height });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, vault);
  await page.goto(`/${locale}/library/?tab=wiki`);
  await page.waitForLoadState("networkidle");
  const picker = page.getByTestId("library-open-vault");
  await picker.waitFor({ timeout: 25_000 });
  await picker.click();
  await page.getByTestId("wiki-index").locator("[data-index-row]").first().waitFor({ timeout: 60_000 });
}

const currentFrame = (page: Page) => page.locator("[data-index-frame][data-current]");

/** Elements wider than their box, other than scrollers and text cut with an ellipsis on purpose. */
async function overflowing(page: Page): Promise<string[]> {
  return page.getByTestId("library-index").evaluate((column) =>
    [...column.querySelectorAll<HTMLElement>("*")]
      .filter((node) => {
        if (node.scrollWidth <= node.clientWidth) return false;
        const style = getComputedStyle(node);
        if (/auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY)) return false;
        return !(style.textOverflow === "ellipsis" && style.overflowX === "hidden");
      })
      .map((node) => `${node.tagName.toLowerCase()} ${node.textContent?.slice(0, 40) ?? ""}`),
  );
}

test.describe("the Wiki column is the wiki's index", () => {
  for (const locale of ["en", "ko"] as const) {
    for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
      test(`every page row is 44px, nothing overflows and no shelf word is drawn (${locale}, ${width}x${height})`, async ({ page }) => {
        await openWiki(page, sixtyPages(), { locale, width, height });
        const heights = await currentFrame(page).locator("[data-index-row]").evaluateAll((rows) => rows.map((row) => Math.round(row.getBoundingClientRect().height)));
        expect(heights.length).toBeGreaterThan(5);
        expect(new Set(heights)).toEqual(new Set([44]));
        expect(await overflowing(page)).toEqual([]);
        const text = (await page.getByTestId("library-index").textContent()) ?? "";
        expect(text).not.toMatch(locale === "en" ? /off-template|Source review needed|Source not checked/ : /서식 벗어남/);
      });
    }
  }

  test("holds no agent door: Check wiki stands in the report's head and writing pages in the Sources band", async ({ page }) => {
    await openWiki(page, sixtyPages());
    const column = page.getByTestId("library-index");
    await expect(column.getByTestId("library-lint")).toHaveCount(0);
    await expect(column.getByTestId("library-compile")).toHaveCount(0);
    await page.getByTestId("library-open-report").click();
    const head = page.getByTestId("library-check-report").locator("header");
    await expect(head.getByTestId("library-check-report-lint").or(head.getByTestId("library-check-report-agent-missing"))).toHaveCount(1);
    await page.getByTestId("library-reader-back").click();
    await page.getByTestId("library-workspace-sources").click();
    await expect(page.getByTestId("library-progress").or(page.getByTestId("sources-overview")).first()).toBeVisible();
    await expect(column.getByText(/Write wiki pages for/)).toHaveCount(0);
  });

  test("an open page whose file leaves wiki/ is said once and the selection clears", async ({ page }) => {
    await openWiki(page, sixtyPages());
    await page.getByTestId("library-wiki-wiki/answers/answer-0").click();
    await expect(page.getByTestId("library-page")).toHaveAttribute("data-library-state", "wiki");
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const [name, handle] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (name.startsWith("stub-vault-") && handle.kind === "directory") {
          const wiki = await (handle as FileSystemDirectoryHandle).getDirectoryHandle("wiki");
          await (await wiki.getDirectoryHandle("answers")).removeEntry("answer-0.md");
        }
      }
    });
    // The web rereads the folder on focus; each poll offers one.
    await expect
      .poll(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        return page.getByTestId("library-page").getAttribute("data-library-state");
      }, { timeout: 20_000 })
      .toBe("nothing-open");
    await expect(page.locator("[data-sonner-toast]", { hasText: "Saved answer 0 is no longer in wiki/" })).toHaveCount(1);
    await expect(page.getByTestId("library-wiki-wiki/answers/answer-0")).toHaveCount(0);
  });

  test("past 200 pages each group shows five, Show all shows one group alone, and Escape returns to the same scroll", async ({ page }) => {
    test.setTimeout(240_000);
    const count = 20_000;
    await openWiki(page, manyPages(count));
    await expect(page.getByTestId("library-workspace-wiki")).toHaveAccessibleName(`Wiki, ${count.toLocaleString("en-US")}`, { timeout: 120_000 });
    const index = page.getByTestId("wiki-index");
    await expect(index.getByRole("button", { name: `Show all ${count.toLocaleString("en-US")}` })).toBeVisible({ timeout: 60_000 });
    const perGroup = await currentFrame(page).locator("[data-index-row]").evaluateAll((rows) => {
      const counts: Record<string, number> = {};
      for (const row of rows) {
        const group = row.closest("[data-index-group]")?.getAttribute("data-index-group") ?? "";
        counts[group] = (counts[group] ?? 0) + 1;
      }
      return counts;
    });
    expect(Object.values(perGroup).every((n) => n <= 5)).toBe(true);

    const scroller = currentFrame(page).locator("[data-index-scroller]");
    const before = await scroller.evaluate((node) => node.scrollTop);
    await index.getByRole("button", { name: `Show all ${count.toLocaleString("en-US")}` }).click();
    await expect(index).toHaveAttribute("data-state", "alone");
    await expect(index.locator("[data-index-chip]")).toBeVisible();

    // Scrolled end to end, the window never holds more than 60 rows.
    const most = await currentFrame(page).locator("[data-index-scroller]").evaluate(async (node) => {
      let peak = 0;
      const step = node.clientHeight;
      for (let top = 0; top <= node.scrollHeight; top += step * 40) {
        node.scrollTop = top;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        peak = Math.max(peak, node.querySelectorAll("[data-index-row]").length);
      }
      node.scrollTop = node.scrollHeight;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Math.max(peak, node.querySelectorAll("[data-index-row]").length);
    });
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(60);

    await page.keyboard.press("Escape");
    await expect(index).toHaveAttribute("data-state", "index");
    await expect.poll(() => currentFrame(page).locator("[data-index-scroller]").evaluate((node) => node.scrollTop)).toBe(before);
  });
});

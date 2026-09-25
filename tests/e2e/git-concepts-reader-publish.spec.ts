import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";
import { FIXTURE_VAULT } from "./fixture-vault";

/**
 * **The Git screen reads a step's change in its default lens, and a saved remote is not a dead
 * end** (real-bridge QA, 2026-09-25).
 *
 * Three defects, measured in the rendered page:
 *
 * - The concepts lens (the default) drew a concept's card and its other steps but never the
 *   change itself; the whole document with its changed line was one lens away. The reader now
 *   sits between the card and the document's own steps, on the card's start line, uncovered.
 * - The vault README (`vault-readme`) counted as a concept of the step that touched it.
 * - After "Connect a remote" the header still said there was no remote and offered nothing to
 *   press: only a first push creates the upstream, and nothing here could make one. A saved
 *   origin now reads as such, with "Publish branch" in the slot Fetch, Pull and Push arrive in —
 *   one row, one control height, one type size, its hint under it.
 */

const README = [
  "---",
  "uid: 7e4c2a10-5b9d-4c3e-8f21-0a6b3c9d2e41",
  "slug: README",
  "kind: vault-readme",
  "title: Storefront vault",
  "display_en: Storefront vault",
  "---",
  "",
  "# Storefront vault",
  "",
].join("\n");

const ADDED = "A declined payment keeps the cart exactly as it was.";
const CHECKOUT = FIXTURE_VAULT["capabilities/checkout.md"].split("\n");
/** What the step did to the checkout document: the whole document, one line added at its end. */
const CHECKOUT_DIFF = `${[
  "diff --git a/capabilities/checkout.md b/capabilities/checkout.md",
  "index 1111111..2222222 100644",
  "--- a/capabilities/checkout.md",
  "+++ b/capabilities/checkout.md",
  `@@ -1,${CHECKOUT.length} +1,${CHECKOUT.length + 1} @@`,
  ...CHECKOUT.map((line) => ` ${line}`),
  `+${ADDED}`,
].join("\n")}\n`;

const STEP = {
  shortHash: "c0ffee1",
  hash: `c0ffee1${"0".repeat(33)}`,
  subject: "docs: say what a declined payment leaves behind",
  relativeTime: "2 hours ago",
  isoTime: "2026-09-24T06:00:00.000Z",
  author: "stark",
  files: [
    { path: "README.md", status: "modified", kind: "vault-readme", slug: "README", renamedFrom: null },
    { path: "capabilities/checkout.md", status: "modified", kind: "capability", slug: "capabilities/checkout", renamedFrom: null },
  ],
};

const SIZES: Array<[number, number]> = [
  [1512, 949],
  [1280, 800],
];

async function openGit(page: Page) {
  await mountDesktopVault(page);
  await page.getByTestId("app-nav-rail-item-git").click();
  await expect(page.getByTestId("atlas-git-location")).toBeVisible({ timeout: 60_000 });
}

for (const [width, height] of SIZES) {
  test(`the default lens reads what the step changed, between the card and the other steps (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await installDesktopRailRuntime(page, { "README.md": README }, undefined, {
      commits: [STEP],
      documentDiffs: { "capabilities/checkout.md": CHECKOUT_DIFF },
    });
    await openGit(page);
    await page.getByTestId("atlas-git-history-item").click();
    const concepts = page.getByTestId("atlas-git-lens-concepts");
    await expect(concepts).toHaveAttribute("aria-selected", "true");
    // README is a file of the step, not one of its concepts.
    await expect(concepts).toHaveText(/1$/);
    await expect(page.getByTestId("atlas-git-lens-files")).toHaveText(/2$/);
    await expect(page.getByTestId("atlas-git-concept-chip")).toHaveCount(1);

    const reader = page.getByTestId("atlas-git-concept-diff");
    const line = reader.locator("p", { hasText: ADDED });
    await expect(line).toHaveCount(1);
    await line.scrollIntoViewIfNeeded();
    const geometry = await page.evaluate((added) => {
      const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
      const reader = q("atlas-git-concept-diff").getBoundingClientRect();
      const card = q("atlas-git-concept-ego").getBoundingClientRect();
      const history = q("atlas-git-document-history").getBoundingClientRect();
      const evidence = q("atlas-git-evidence").getBoundingClientRect();
      const measure = q("atlas-git-concept-diff").querySelector("article > div")!.getBoundingClientRect();
      const lineEl = [...q("atlas-git-concept-diff").querySelectorAll("p")].find((p) => p.textContent?.includes(added))!;
      const box = lineEl.getBoundingClientRect();
      const hits = [0.1, 0.5, 0.9].map((f) =>
        q("atlas-git-concept-diff").contains(document.elementFromPoint(box.left + box.width * f, box.top + box.height / 2)),
      );
      return {
        cardAbove: card.bottom <= reader.top + 1,
        historyBelow: reader.bottom <= history.top + 1,
        insideColumn: reader.left >= evidence.left - 1 && reader.right <= evidence.right + 1,
        startLine: Math.abs(measure.left - card.left),
        hits,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, ADDED);
    expect(geometry.cardAbove, "the reader starts under the concept's card").toBe(true);
    expect(geometry.historyBelow, "the document's other steps and door close the reader").toBe(true);
    expect(geometry.insideColumn).toBe(true);
    expect(geometry.startLine, "the reader's text starts on the card's line").toBeLessThanOrEqual(1);
    expect(geometry.hits, "the changed line is uncovered along its width").toEqual([true, true, true]);
    expect(geometry.overflowX).toBeLessThanOrEqual(0);
    // The restore door still closes what was just read.
    await expect(page.getByTestId("atlas-git-document-history").getByTestId("atlas-git-restore")).toBeVisible();
  });

  test(`a saved origin offers its first send in the header and the dock (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await installDesktopRailRuntime(page, {}, undefined, {
      gitStatus: { upstream: null, ahead: null, behind: null, hasOrigin: true },
    });
    await openGit(page);
    const location = page.getByTestId("atlas-git-location");
    await expect(location.getByTestId("atlas-git-remote-unsent")).toBeVisible();
    await expect(location).not.toContainText("No remote repository yet");
    const publish = location.getByTestId("atlas-git-remote-publish");
    await expect(publish).toBeVisible();

    const header = await page.evaluate(() => {
      const line = document.querySelector('[data-testid="atlas-git-location"]') as HTMLElement;
      const title = document.querySelector("h1")!.getBoundingClientRect();
      const l = line.getBoundingClientRect();
      const controls = [...line.querySelectorAll("button")].map((button) => {
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { h: Math.round(r.height), top: Math.round(r.top), font: getComputedStyle(button).fontSize, onTop: !!hit && button.contains(hit) };
      });
      return {
        controls,
        overTitle: !(l.right <= title.left || l.left >= title.right || l.bottom <= title.top || l.top >= title.bottom),
        inside: l.right <= window.innerWidth,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(header.controls).toHaveLength(2);
    expect(new Set(header.controls.map((c) => c.h)).size, "one control height in the row").toBe(1);
    expect(new Set(header.controls.map((c) => c.font)).size, "one type size in the row").toBe(1);
    expect(new Set(header.controls.map((c) => c.top)).size, "one row").toBe(1);
    expect(header.controls.every((c) => c.h >= 24 && c.onTop)).toBe(true);
    expect(header.overTitle).toBe(false);
    expect(header.inside).toBe(true);
    expect(header.overflowX).toBeLessThanOrEqual(0);

    // The dock's last line names the same next step, with a pressable door.
    const door = page.getByTestId("atlas-git-dock-publish");
    await expect(door).toBeVisible();
    const doorHit = await door.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { h: r.height, onTop: !!hit && el.contains(hit) };
    });
    expect(doorHit.h).toBeGreaterThanOrEqual(24);
    expect(doorHit.onTop).toBe(true);

    // The hint opens under the button that owns it and names the command it runs.
    await publish.focus();
    const hint = page.getByTestId("atlas-git-remote-publish-hint").first();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("git push -u origin main");
    const anchor = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="atlas-git-remote-publish"]')!.getBoundingClientRect();
      const panel = document.querySelector('[data-testid="atlas-git-remote-publish-hint"]')!.getBoundingClientRect();
      return { gap: panel.top - button.bottom, inside: panel.left >= 0 && panel.right <= window.innerWidth };
    });
    expect(anchor.gap).toBeGreaterThanOrEqual(0);
    expect(anchor.gap).toBeLessThan(24);
    expect(anchor.inside).toBe(true);
  });
}

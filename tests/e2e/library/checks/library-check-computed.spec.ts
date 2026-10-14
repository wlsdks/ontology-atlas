import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import { installLibraryCheckBridge, openLibraryCheckFolder } from "./library-check-fixture";

/**
 * No runtime (`acp_detect_runtimes` answers `[]`) and no `wiki/_log.md` make this a proof.
 * The reload stands for quit and reopen. `library-check-fixture.ts` owns the fixture and bridge.
 */

/**
 * Every `(code, page)` pair the folder must produce — the same set
 * `tests/fixtures/wiki-report-folder.mjs` hands the contract test, so the screen and the
 * three code paths are held to one list.
 */
const EXPECTED: ReadonlyArray<{ code: string; page: string; line: string; advisory: boolean }> = [
  { code: "citation-target-missing", page: "refund-timing", line: "", advisory: false },
  /*
   * Rows sharing a page and an identical sentence collapse into one door,
   * so findings are identified by line.
   */
  { code: "uncited-fact", page: "merchant-onboarding", line: ":19", advisory: false },
  { code: "uncited-fact", page: "merchant-onboarding", line: ":20", advisory: false },
  // Advisory kinds live behind the closed fold, so the proof presses it open (below).
  { code: "orphan-page", page: "settlement-ko", line: "", advisory: true },
  { code: "shared-source-unlinked", page: "settlement-ko", line: "", advisory: true },
  { code: "shared-source-unlinked", page: "settlement", line: "", advisory: true },
];

/**
 * Reads one triple per finding from the door's paragraph, taking the number out of the describer's
 * wording and keeping the `:19` shape `EXPECTED` is written in.
 */
async function readReport(page: Page) {
  return page.evaluate(() => {
    const out: Array<{ code: string; page: string; line: string }> = [];
    for (const group of document.querySelectorAll('[data-testid="library-structural-group"]')) {
      const code = group.getAttribute("data-code") ?? "";
      for (const row of group.querySelectorAll('[data-testid="library-structural-finding"]')) {
        for (const door of row.querySelectorAll('[data-testid="library-finding-page"]')) {
          const name = (door.textContent ?? "").trim();
          const suffixes = [...((door.closest("p")?.textContent ?? "").matchAll(/line (\d+)/g))].map(
            (match) => `:${match[1]}`,
          );
          if (suffixes.length === 0) out.push({ code, page: name, line: "" });
          else for (const line of suffixes) out.push({ code, page: name, line });
        }
      }
    }
    // Field by field, never a concatenated key: `source-is-text.contract.test.ts` records
    // why a separator character is the wrong tool for an ordering key.
    return out.sort(
      (a, b) => a.code.localeCompare(b.code) || a.page.localeCompare(b.page) || a.line.localeCompare(b.line),
    );
  });
}

const sortRows = <T extends { code: string; page: string; line: string }>(rows: readonly T[]) =>
  [...rows]
    .map(({ code, page, line }) => ({ code, page, line }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.page.localeCompare(b.page) || a.line.localeCompare(b.line));

/** Every planted finding, advisory ones included — what the page holds with the fold open. */
const expectedRows = sortRows(EXPECTED);
/** What the page holds with the fold closed, which is how it opens in every state. */
const expectedBlockingRows = sortRows(EXPECTED.filter((row) => !row.advisory));

/** The advisory fold is closed on arrival; pressing it also asserts it is a disclosure, not a filter. */
async function openAdvisoryFold(page: Page) {
  const fold = page.getByTestId("library-advisory-fold");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
}

test.describe("the structural check is the app's own", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installLibraryCheckBridge(page);
  });

  test("with no agent and no press, the landing opens a report listing every planted finding", async ({ page }) => {
    await openLibraryCheckFolder(page);
    await page.getByTestId("library-workspace-wiki").click();
    await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });

    /* Nothing here can start a turn: one notice says why and links to the agents page. */
    const notice = page.getByTestId("library-agent-missing");
    await expect(notice).toBeVisible({ timeout: 25_000 });
    await expect(notice).toContainText("check page format");
    await expect(notice.getByTestId("library-agent-missing-door")).toHaveAttribute("href", /\/agents/);
    await expect(page.getByTestId("library-lint")).toHaveCount(0);

    /* The installed app must not offer its own download (`.claude/rules/surfaces.md`). */
    await expect(page.getByTestId("library-compile-web-limit")).toHaveCount(0);
    await expect(page.getByTestId("library-compile-web-get-app")).toHaveCount(0);
    /*
     * The reason is on screen once per screen: the home makes no agent claim, and the blocked press is
     * Check the wiki, whose sentence stands in the guide.
     */
    await expect(page.getByText(/No verified coding agent is set up on this computer/)).toHaveCount(0);
    await page.getByTestId("library-workspace-sources").click();
    await page.getByTestId("library-guide-open").click();
    const guide = page.getByTestId("library-guide-popover");
    await expect(guide.locator("[data-landing-blocked-reason]")).toHaveCount(1);
    await expect(guide.getByText(/No verified coding agent is set up on this computer/)).toHaveCount(1);
    await expect(page.getByText(/No verified coding agent is set up on this computer/)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);

    /*
     * The index row and the strip's `N off-template` both go through `LibraryPage`'s `choose`, so either
     * must leave the row in the same state; `unseen: true` is unreachable in a browser.
     */
    const rowState = () =>
      page.getByTestId("library-open-report").evaluate((node) => ({
        state: node.getAttribute("data-report-state"),
        current: node.getAttribute("aria-current"),
        running: node.querySelector('[data-testid="library-report-running"]') !== null,
        unseen: node.querySelector('[data-testid="library-report-unseen"]') !== null,
      }));

    await page.getByTestId("library-strip-offtemplate").click();
    await page.getByTestId("library-workspace-wiki").click();
    await expect(page.getByTestId("library-check-structural")).toBeVisible({ timeout: 25_000 });
    const afterClause = await rowState();
    expect(afterClause).toEqual({ state: null, current: "page", running: false, unseen: false });
    // And the strip never grew a second door to the same screen.
    await expect(page.getByTestId("library-report-open")).toHaveCount(0);

    // Back to the home, then in again through the row itself: the same state, both ways.
    await page.getByTestId("library-reader-back").click();
    await expect(page.getByTestId("library-question-desk")).toBeVisible();
    const door = page.getByTestId("library-open-report");
    await expect(door).toBeVisible();
    await door.click();
    await expect(page.getByTestId("library-check-structural")).toBeVisible({ timeout: 25_000 });
    expect(await rowState()).toEqual(afterClause);

    // The blocking kinds are open and complete; the advisory ones are counted, not listed.
    await expect
      .poll(() => readReport(page), { timeout: 20_000 })
      .toEqual(expectedBlockingRows);
    await expect(page.getByTestId("library-advisory-fold")).toContainText("3");

    // Every planted finding, grouped by the code `wiki-validate` prints, with a page door.
    await openAdvisoryFold(page);
    await expect
      .poll(() => readReport(page), { timeout: 20_000 })
      .toEqual(expectedRows);

    // The head states both totals and says what each counts.
    const head = page.getByTestId("library-check-structural-head");
    await expect(head).toContainText("4 pages");
    await expect(head).toContainText("2 off-template");
    await expect(head).toContainText("6 findings");

    // The computed half never wears the agent's empty words, and the agent's half says
    // plainly that it has not read anything — directly below a live list of six rows.
    await expect(page.getByTestId("library-check-structural")).not.toContainText("has not read these pages yet");
    await expect(page.getByTestId("library-check-semantic")).toContainText("has not read these pages yet");

    const reportNotice = page.getByTestId("library-check-report-agent-missing");
    await expect(reportNotice).toBeVisible();
    await expect(reportNotice).toContainText("check page format");
    await expect(reportNotice.getByTestId("library-check-report-agent-missing-door")).toHaveAttribute("href", /\/agents/);
    await expect(page.getByTestId("library-check-report-lint")).toHaveCount(0);
    const card = (testId: string) =>
      page.getByTestId(testId).evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.borderTopLeftRadius, style.borderTopColor, style.backgroundColor, style.paddingLeft, style.paddingTop, style.fontSize];
      });
    expect(await card("library-check-report-agent-missing")).toEqual(await card("library-agent-missing"));

    // A structural row's door opens its page; Fix and Propose write, so they stay on the agent's half.
    await expect(page.getByTestId("library-finding-fix")).toHaveCount(0);
    await page
      .locator('[data-testid="library-structural-group"][data-code="citation-target-missing"]')
      .getByTestId("library-finding-page")
      .first()
      .click();
    await expect(page.getByTestId("library-reading-pane")).toBeVisible({ timeout: 20_000 });
  });

  test("the same list is there after quitting and reopening the app", async ({ page }) => {
    await openLibraryCheckFolder(page);
    await page.getByTestId("library-workspace-wiki").click();
    await page.getByTestId("library-open-report").click();
    await openAdvisoryFold(page);
    await expect
      .poll(() => readReport(page), { timeout: 20_000 })
      .toEqual(expectedRows);

    // Quit and reopen: the page is torn down and the folder is restored from IndexedDB.
    // The index switch is remembered, so the column comes back on the Wiki half rather
    // than on Sources — waiting for the wrong list here would time out on a healthy app.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });
    await page.getByTestId("library-open-report").click();
    /* The fold's state is not remembered, and should not be: a reopened app is a person
       arriving, and what they arrive at is the blocking half. */
    await openAdvisoryFold(page);
    await expect
      .poll(() => readReport(page), { timeout: 20_000 })
      .toEqual(expectedRows);
  });
});

/**
 * A fresh element per condition: a transition returns the previous computed value.
 * jsdom has no computed hover, so the selected row's hover contrast is measured in a browser.
 */
test.describe("the index row's own state", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installLibraryCheckBridge(page);
  });

  test("hover does not undo selection on the report row", async ({ page }) => {
    let opened = false;
    const read = async (condition: "current-rest" | "current-hover" | "other-hover") => {
      /* A fresh document each time, and the folder is picked only once: after the first
         pass the handle is restored from IndexedDB, so the first-run door is not drawn and
         waiting for it would time out on a healthy app. */
      if (opened) {
        await page.goto("/en/library/?guides=off");
        /* The switch is remembered, so wait for the switch itself: `library-sources` is
           drawn only while that half is the chosen one. */
        await page.getByTestId("library-workspace-wiki").waitFor({ timeout: 30_000 });
      } else {
        await openLibraryCheckFolder(page);
        opened = true;
      }
      await page.getByTestId("library-workspace-wiki").click();
      await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });
      if (condition !== "other-hover") {
        await page.getByTestId("library-open-report").click();
        await expect(page.getByTestId("library-check-structural")).toBeVisible({ timeout: 25_000 });
      }
      await page.addStyleTag({ content: "*,*::before,*::after{transition:none !important}" });
      const row = page.getByTestId("library-open-report");
      const box = (await row.boundingBox())!;
      // Away from the column entirely, never `(2,2)`: that point hovers the rail and
      // corrupts the next resting measurement (`design-gates.md`).
      if (condition === "current-rest") await page.mouse.move(box.x + box.width + 200, box.y + 400);
      else await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      return row.evaluate((node) => {
        const marker = node.querySelector("span[aria-hidden]");
        return {
          background: getComputedStyle(node).backgroundColor,
          colour: getComputedStyle(node).color,
          edge: marker ? getComputedStyle(marker).backgroundColor : null,
          edgeWidth: marker ? getComputedStyle(marker).width : null,
        };
      });
    };

    const currentRest = await read("current-rest");
    const currentHover = await read("current-hover");
    const otherHover = await read("other-hover");

    // Selected is indigo and it stays indigo under the pointer.
    expect(currentRest.background).toBe("rgba(94, 106, 210, 0.16)");
    expect(currentHover.background, "hover changed the current row's fill").toBe(currentRest.background);
    expect(currentHover.colour).toBe(currentRest.colour);
    // The durable mark is the edge, not the tint: 2px of indigo ink, 5.18:1 on canvas.
    expect(currentRest.edgeWidth).toBe("2px");
    expect(currentRest.edge).toBe("rgb(113, 112, 255)");
    // An unselected row still answers the pointer — one step, from the axis.
    expect(otherHover.background).toBe("rgba(255, 255, 255, 0.02)");
    expect(otherHover.edge).toBeNull();
  });
});

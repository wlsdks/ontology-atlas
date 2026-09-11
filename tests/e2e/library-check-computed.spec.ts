import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installLibraryCheckBridge, openLibraryCheckFolder } from "./library-check-fixture";

/**
 * **The recovery proof, in the runtime: no agent, no press, and it survives a restart.**
 *
 * `docs/DECISIONS.md` 2026-09-11 ("The Library keeps its spine, and computes the
 * structural check itself") decides that *"the structural check is aggregated from the
 * local per-page verdict, always available and persistent; the agent adds only semantic
 * findings"*. Before this, every row on the Check-results page came from an agent turn
 * held in memory: after quitting the app the page said so and listed nothing, and a person
 * with **no** agent never reached the page at all, because its door was drawn only once a
 * check had run.
 *
 * So this spec plants the folder from
 * `/Users/jinan/scratch/atlas-library-fixture-20260911/vault` — the four codes it fires —
 * and holds the whole product to the proof the PO pass wrote before implementation.
 * `library-check-fixture.ts` owns those bytes and the bridge that serves them, because the
 * touch-target contract now measures the same page and a spec may not import a spec:
 *
 *   Given this folder opened with **no coding agent connected and no button pressed**, a
 *   person reaching the Library landing can open one report that lists every structural
 *   finding, grouped by code, each naming and linking the page it concerns; and the same
 *   list is there after quitting and reopening the app.
 *
 * Two deliberate absences make it a proof rather than a demonstration:
 *
 * 1. **No runtime.** `acp_detect_runtimes` answers `[]`, so `agent.route` is never
 *    `"agent"` and nothing on this screen can start a turn. Both PO seats (2026-09-12)
 *    named this as the frame the old capture never showed.
 * 2. **No `wiki/_log.md`.** The real fixture already carries two `lint` lines, which alone
 *    satisfied the old door condition — so a proof run against it would have passed
 *    whether or not the door was fixed. The folder here has no log, which is the state a
 *    person who has never run a check is actually in.
 *
 * **Why a browser rather than the installed app.** The app is a WKWebView running this
 * same static export and the render boundary is what is measured, which is the reason
 * `library-compile-dock.spec.ts` records. Beyond that, on 2026-09-12 the one installed
 * instance on this machine belonged to somebody else's inspection session, and driving a
 * window this session did not launch is how a blind coordinate loop presses another
 * person's app.
 *
 * The reload stands for quitting and reopening: the page is torn down, the vault handle is
 * restored from IndexedDB, and every verdict is computed again from the folder's bytes.
 * Nothing about the structural half is written anywhere, so a list that comes back
 * identical is the whole claim.
 */

/**
 * Every `(code, page)` pair the folder must produce — the same set
 * `tests/fixtures/wiki-report-folder.mjs` hands the contract test, so the screen and the
 * three code paths are held to one list.
 */
const EXPECTED: ReadonlyArray<{ code: string; page: string; line: string; advisory: boolean }> = [
  { code: "citation-target-missing", page: "refund-timing", line: "", advisory: false },
  /*
   * Two uncited bullets on one page, with one row of ink and **two line numbers**: since
   * 2026-09-12 rows that share a page and an identical sentence collapse into one door
   * reading `merchant-onboarding · :19 · :20`. A person still fixes two bullets, so the
   * finding is identified by its line — which is why this proof reads the suffix and not
   * only the door. Counting doors here would silently assert five findings for six.
   */
  { code: "uncited-fact", page: "merchant-onboarding", line: ":19", advisory: false },
  { code: "uncited-fact", page: "merchant-onboarding", line: ":20", advisory: false },
  // Advisory kinds live behind the closed fold, so the proof presses it open (below).
  { code: "orphan-page", page: "settlement-ko", line: "", advisory: true },
  { code: "shared-source-unlinked", page: "settlement-ko", line: "", advisory: true },
  { code: "shared-source-unlinked", page: "settlement", line: "", advisory: true },
];

/**
 * Read the screen's own enumeration: one `(code, page, line)` triple per **finding**, not
 * per row. A collapsed row names one page and carries a `:line` for each finding inside
 * it, so the line is read from the door's own paragraph — where the suffix lives — rather
 * than from the row, whose rule sentence is prose this proof must not parse.
 */
async function readReport(page: Page) {
  return page.evaluate(() => {
    const out: Array<{ code: string; page: string; line: string }> = [];
    for (const group of document.querySelectorAll('[data-testid="library-structural-group"]')) {
      const code = group.getAttribute("data-code") ?? "";
      for (const row of group.querySelectorAll('[data-testid="library-structural-finding"]')) {
        for (const door of row.querySelectorAll('[data-testid="library-finding-page"]')) {
          const name = (door.textContent ?? "").trim();
          const suffixes = [...((door.closest("p")?.textContent ?? "").matchAll(/:\d+/g))].map(
            (match) => match[0],
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

/**
 * The advisory fold is **closed on arrival** (council 2026-09-12, unanimous), so a proof
 * that never presses it would assert three findings for six. Pressing it is also the
 * assertion that it is a disclosure and not a filter: nothing is removed from the page.
 */
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
    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });

    // Nothing on this screen can start a turn: the check is drawn with its reason, disabled.
    const lint = page.getByTestId("library-lint");
    await expect(lint).toBeVisible({ timeout: 25_000 });
    await expect(lint).toBeDisabled();

    /*
     * **This is the installed app, so it must not offer its own download**
     * (`.claude/rules/surfaces.md`). The stub sets `isTauri`, and with no runtime
     * `onCompile` is null — the state in which the Compile slot used to print "which only
     * the app can start… Get the app" at a person already running the app, directly under
     * Check's own true reason (measured 2026-09-12,
     * `.claude/shots-2026-09-12/library-check/1512-report-folded.png`). One paragraph now,
     * and it is the one that is true of this surface.
     */
    await expect(page.getByTestId("library-compile-web-limit")).toHaveCount(0);
    await expect(page.getByTestId("library-compile-web-get-app")).toHaveCount(0);
    await expect(page.getByTestId("library-lint-blocked")).toHaveCount(1);

    // The door exists although no check has ever run and there is no log to remember one.
    const door = page.getByTestId("library-open-report");
    await expect(door).toBeVisible();
    await door.click();
    await expect(page.getByTestId("library-check-structural")).toBeVisible({ timeout: 25_000 });

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

    // A structural row's door is the page name, and it opens that page. No Fix, no Propose:
    // those write, so they stay on the agent's half (owner decision 4).
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
    await page.getByTestId("library-index-segment-wiki").click();
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
 * **The row that says "you are here" must not dim when a finger or a pointer is on it.**
 *
 * Measured at 1512 on 2026-09-12 (`design-interaction`, council): the selected report row
 * was `--color-overlay-2` at 1.14:1 and fell to 1.03:1 while the pointer rested on it,
 * because a `hover:bg-…` written into `className` outranked the `{shape:'row',
 * active:true}` compound — the value layer gates every hover compound on `active: false`
 * for exactly this reason and the class bypassed the axis. The repair routes hover through
 * `hoverSurface`/`hoverInk` and draws selection in the grammar this column already uses:
 * an indigo tint plus the 2px inline-start edge the docs tree, the palette and the hub rail
 * carry, whose ink clears the 3:1 non-text floor on canvas where the tint alone does not.
 *
 * It lives beside the recovery proof because it needs this folder's report row and a real
 * browser: jsdom has no computed hover. **A fresh element per condition** — a transition
 * returns the previous value, which is where this repository measured 1,240 false
 * positives from reusing one element.
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
        await page.getByTestId("library-index-segment-wiki").waitFor({ timeout: 30_000 });
      } else {
        await openLibraryCheckFolder(page);
        opened = true;
      }
      await page.getByTestId("library-index-segment-wiki").click();
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

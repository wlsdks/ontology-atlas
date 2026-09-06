import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * The Library destination — **Sources** and **Wiki**, and the reader beside them.
 *
 * A vault holds three kinds of file and only one is the graph (`docs/DECISIONS.md`,
 * 2026-09-05); the other two became `/library` on 2026-09-06. Unit tests prove the state
 * derivation and the discovery filter; this spec proves what only a rendered folder can:
 *
 * 1. a non-Markdown file in `sources/` reaches the screen as a row **and never the Docs
 *    document tree**, so the two lists cannot quietly merge — and that assertion is now
 *    across two destinations, which is the split itself;
 * 2. each state word is derived from the file on disk rather than declared — the fixture
 *    plants a page citing a hash that does not match, and the row must say so;
 * 3. "Find documents" proposes real files and **never a secret**, on the surface a
 *    person actually sees rather than in a filter function;
 * 4. the right pane branches on the kind of file: a wiki page renders, and a source shows
 *    the facts the folder holds about a file nothing ever opened.
 */

const VAULT = {
  "project.md": [
    "---",
    "kind: project",
    "slug: library-demo",
    "title: Library demo",
    "---",
    "",
    "# Library demo",
    "",
  ].join("\n"),
  "capabilities/checkout.md": [
    "---",
    "kind: capability",
    "slug: checkout",
    "title: Checkout",
    "---",
    "",
    "# Checkout",
    "",
  ].join("\n"),

  // Raw sources: any format, kept verbatim, never parsed.
  "sources/quarter-plan.pdf": "%PDF-1.7 quarter plan bytes\n",
  "sources/budget.xlsx": "PK budget bytes\n",

  // A page citing a hash that cannot match those bytes, so the row must report `stale`
  // rather than trusting the claim.
  "wiki/quarter-plan.md": [
    "---",
    "title: Quarter plan",
    "created_by: agent:claude",
    "compiled_at: 2026-09-05T10:00:00Z",
    "sources:",
    "  - sources/quarter-plan.pdf",
    "source_hash:",
    "  sources/quarter-plan.pdf: 0000000000000000000000000000000000000000000000000000000000000000",
    "status: draft",
    "summary: What the quarter plan commits the team to.",
    "---",
    "",
    "## Summary",
    "",
    "Three deliverables.",
    "",
    "## Facts",
    "",
    "- Three deliverables are named. [[src:sources/quarter-plan.pdf#p2]]",
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
    "## Not in sources",
    "",
  ].join("\n"),

  // A page missing `## Not in sources`, so the row must carry its problem code.
  "wiki/handover.md": [
    "---",
    "title: Handover notes",
    "created_by: human",
    "compiled_at: 2026-09-04T09:00:00Z",
    "sources: []",
    "source_hash: {}",
    "status: reviewed",
    "summary: Notes handed over by the previous owner.",
    "---",
    "",
    "## Summary",
    "",
    "Handover.",
    "",
    "## Facts",
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
  ].join("\n"),

  // Candidates for discovery, and three files it must never propose.
  "inbox/Requirements v3.pdf": "%PDF-1.7 requirements\n",
  "inbox/.env": "SECRET=never-propose-me\n",
  "inbox/id_rsa": "PRIVATE KEY never-propose-me\n",
  "inbox/credentials.json": '{"token":"never-propose-me"}\n',
};

/**
 * Open the fixture folder **on the Library itself**.
 *
 * One press, not the two `/docs` needed. With no folder open the Library is a single
 * centred stage whose one control is the picker, so there is no read-only sample to step
 * past first — the destination has no sample state, because a library of somebody else's
 * documents is not a demo of anything.
 */
async function openLibrary(
  page: import("@playwright/test").Page,
  vault: Record<string, string> = VAULT,
) {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, vault);
  await page.goto("/en/library/");
  await page.waitForLoadState("networkidle");
  // The stage is drawn only after the IndexedDB handle restore has decided there is no
  // folder. Waiting on the control rather than on a duration is what stops the flake.
  const picker = page.getByTestId("library-open-vault");
  await picker.waitFor({ timeout: 25_000 });
  await picker.click();
  /*
   * The folder decides which shape arrives, so the wait is on the state rather than on a
   * box that only one of them has: a folder with sources or pages opens the workbench,
   * and one with neither opens the centred start stage (2026-09-06).
   */
  await page
    .locator(
      '[data-testid="library-page"][data-library-state="nothing-open"], [data-testid="library-page"][data-library-state="empty-folder"]',
    )
    .waitFor({ timeout: 25_000 });
}

test.describe("the Library destination", () => {
  test("lists raw sources with a state, and keeps them out of the document tree", async ({
    page,
  }) => {
    await openLibrary(page);

    const sources = page.getByTestId("library-source-list");
    await expect(sources.getByRole("button")).toHaveCount(2);
    await expect(sources).toContainText("quarter-plan.pdf");
    await expect(sources).toContainText("budget.xlsx");
    // Format and size come from the listing; the file is never opened to produce them.
    await expect(sources).toContainText("PDF");
    await expect(sources).toContainText("XLSX");

    // The one invariant the whole library rests on: a raw source is not a document. It is
    // now measured across the split — the tree lives on the other destination, and the
    // rail is how a person crosses, so that is how this crosses too.
    await page.getByTestId("app-nav-rail").getByRole("link", { name: "Docs" }).click();
    const tree = page.getByRole("navigation", { name: "Document list" });
    await expect(tree).toBeVisible({ timeout: 25_000 });
    await expect(tree).not.toContainText("quarter-plan.pdf");
    await expect(tree).not.toContainText("budget.xlsx");
    // And the row that says where they went, which below `lg` is the only way in.
    await expect(page.getByTestId("docs-sidebar-library-link")).toHaveAttribute(
      "href",
      /\/library\//,
    );
  });

  test("says compiled, not compiled or stale from the file rather than the claim", async ({
    page,
  }) => {
    await openLibrary(page);

    const planRow = page.getByTestId("library-source-sources/quarter-plan.pdf");
    // A page cites it, so it is not "not compiled" — and the recorded hash does not match
    // these bytes, so the honest word is "stale".
    await expect(planRow).toContainText("stale");

    const budgetRow = page.getByTestId("library-source-sources/budget.xlsx");
    await expect(budgetRow).toContainText("not compiled");

    // The honest count, in the section rather than in a tooltip — and the two states apart:
    // one source nobody wrote up, one whose page has fallen behind its bytes. "2 not written
    // up" was the sentence this line used to accept, and it was false for the stale one.
    const footer = page.getByTestId("library-needs-compile");
    await expect(footer).toContainText("1 not written up yet");
    await expect(footer).toContainText("1 page behind its source");
  });

  test("lists wiki pages and names the first problem of one that is off-template", async ({
    page,
  }) => {
    await openLibrary(page);

    const wiki = page.getByTestId("library-wiki-list");
    await expect(wiki.getByRole("button")).toHaveCount(2);
    await expect(wiki).toContainText("Quarter plan");
    await expect(wiki).toContainText("Handover notes");
    // The pill says one fixed word. A badge carrying the code changed shape row by row
    // and asked a reader to learn a vocabulary just to scan the list, so the code moved
    // off it — and this asserts that it stays off.
    await expect(page.getByTestId("library-wiki-off-template")).toHaveText("off-template");
    // Which rule the page missed is a different fact, announced with the row rather than
    // reachable only by a pointer that hovers. `handover.md` has no `## Not in sources`.
    await expect(page.getByTestId("library-wiki-wiki/handover")).toHaveAttribute(
      "aria-description",
      /section-order/,
    );
    await expect(page.getByTestId("library-off-template-count")).toBeVisible();
  });

  test("a wiki page opens in the reader, because it is ordinary Markdown", async ({ page }) => {
    await openLibrary(page);
    await page.getByTestId("library-wiki-wiki/quarter-plan").click();
    const main = page.getByRole("main");
    await expect(main).toContainText("Three deliverables");
    // The page says which page it is, and what it was built from. Without the header the
    // reader opened straight into `## Summary` and a page whose body begins with a
    // heading looked identical to one that does not.
    await expect(page.getByTestId("library-wiki-header")).toContainText("Quarter plan");
    await expect(
      page.getByTestId("library-wiki-source-sources/quarter-plan.pdf"),
    ).toBeVisible();
  });

  test("a source opens as the facts the folder holds, not as a failed render", async ({
    page,
  }) => {
    await openLibrary(page);
    await page.getByTestId("library-source-sources/quarter-plan.pdf").click();

    const summary = page.getByTestId("library-source-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("quarter-plan.pdf");
    await expect(summary).toContainText("sources/quarter-plan.pdf");
    await expect(summary).toContainText("PDF");
    /*
     * **Which page cites it, and whether that page still describes these bytes.**
     *
     * Until 2026-09-06 this pane listed the citing pages as slugs inside a `Cited by`
     * fact row, and the assertion read `wiki/quarter-plan` out of the pane's text. The
     * fact did not leave: it became a pressable row under `View write-up`, carrying the
     * page's title — the name every other surface in this product uses for a page — and
     * one word for how it stands to the file. The slug is still the row's `title`, so
     * the address a person can copy did not go with the old spelling.
     *
     * This fixture's page records a 64-zero `source_hash`, which the frontmatter parser
     * types as a number rather than a string, so no usable hash reaches the model: the
     * source reads `stale` and its write-up reads `behind`, which are the same fact said
     * from the two ends. Asserting both is what would catch them drifting apart.
     */
    const writeUp = page.getByTestId("library-source-writeup-wiki/quarter-plan");
    await expect(writeUp).toBeVisible();
    await expect(writeUp).toContainText("Quarter plan");
    await expect(writeUp).toContainText("behind");
    await expect(writeUp).toHaveAttribute("title", "wiki/quarter-plan");
    await expect(summary).toContainText("stale");
    // The one door: a browser cannot reveal in Finder, so it offers the bytes instead.
    await expect(page.getByTestId("library-source-open")).toBeVisible();
  });

  test("Find documents proposes real documents and never a credential", async ({ page }) => {
    await openLibrary(page);
    await page.getByTestId("library-find-documents").click();

    const list = page.getByTestId("find-documents-list");
    await expect(list).toContainText("Requirements v3.pdf");
    // The three files `.claude/rules/local-first.md` forbids reading. Asserted on the
    // rendered dialog, not on the filter that produced it: the rule that matters is what
    // a person is shown.
    await expect(list).not.toContainText(".env");
    await expect(list).not.toContainText("id_rsa");
    await expect(list).not.toContainText("credentials.json");

    // Every box starts unticked, so the primary action cannot act yet.
    await expect(page.getByTestId("find-documents-add")).toBeDisabled();
    for (const box of await page.getByRole("checkbox").all()) {
      await expect(box).not.toBeChecked();
    }
  });

  test("ticking a candidate and confirming copies it into sources/", async ({ page }) => {
    await openLibrary(page);
    await page.getByTestId("library-find-documents").click();
    await page.getByTestId("find-documents-candidate-inbox/Requirements v3.pdf").check();
    await page.getByTestId("find-documents-add").click();

    // The copy is the artifact: the row appears in the library because the walk found a
    // new file, not because anything recorded that an import happened.
    await expect(
      page.getByTestId("library-source-sources/Requirements v3.pdf"),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("library-source-list")).toContainText("not compiled");
  });
});


/**
 * **The pane is the graph; the guide is a compact stepper; an empty folder is neither.**
 *
 * The shape shipped on 2026-09-06 and the owner read it the same day, in the installed
 * app, on a folder with nothing in it: *"why does this design look like this? It looks
 * broken … the sizes inside the right panel are no good … and it overlaps this text."*
 * Measured on that frame at 1512×982 — the panel was 560px of a 1168px pane, its lower
 * half lay over the canvas's own legend, its first card carried ~130px of empty space
 * between its numbers and its buttons, and it raised itself over a folder whose every
 * other surface was already saying the same emptiness.
 *
 * These cases hold what the redesign has to keep true, and every one of them is a number
 * from that frame rather than a preference:
 *
 * 1. a folder with no sources **and no pages** is one centred stage, and nothing raises
 *    itself over anything;
 * 2. a folder with files opens on the picture, with the guide one press away;
 * 3. the guide is narrow, its rows are equal by anatomy, and it stands **clear of the
 *    caption and the legend** — proven with `elementsFromPoint`, not by looking;
 * 4. Escape closes it and hands focus back to the chip;
 * 5. choosing a file still swaps the pane for the reader, and the way back returns the
 *    picture rather than a blank column.
 *
 * The narrow bands stay in the list because the whole rule is "the same at every width".
 */
const NARROW_VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: narrow-demo", "title: Narrow demo", "---", "", "# Narrow demo", ""].join("\n"),
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `sources/report-${String(index + 1).padStart(2, "0")}.pdf`,
      `%PDF-1.7 report ${index + 1}\n`,
    ]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [
      `wiki/note-${String(index + 1).padStart(2, "0")}.md`,
      [
        "---",
        `title: Note ${index + 1}`,
        "created_by: human",
        "compiled_at: 2026-09-05T10:00:00Z",
        "sources: []",
        "source_hash: {}",
        "status: draft",
        `summary: Note ${index + 1}.`,
        "---",
        "",
        "## Summary",
        "",
        `Note ${index + 1}.`,
        "",
        "## Facts",
        "",
        "## Decisions",
        "",
        "## Open questions",
        "",
        "## Not in sources",
        "",
      ].join("\n"),
    ]),
  ),
};

const NO_SOURCE_VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: empty-demo", "title: Empty demo", "---", "", "# Empty demo", ""].join("\n"),
};

test.describe("the Library pane", () => {
  test("an empty folder is one centred stage, not a workbench with a popup over it", async ({
    page,
  }) => {
    await openLibrary(page, NO_SOURCE_VAULT);

    await expect(page.getByTestId("library-page")).toHaveAttribute(
      "data-library-state",
      "empty-folder",
    );
    const stage = page.getByTestId("library-start-stage");
    await expect(stage).toBeVisible();

    /*
     * The whole point of the state: none of the five other surfaces that used to state
     * the same emptiness is drawn, and the guide is not raised over anything.
     */
    for (const gone of [
      "library-index",
      "library-graph",
      "library-graph-empty",
      "library-status-strip",
      "library-shelf-open",
      "library-shelf-popover",
    ]) {
      await expect(page.getByTestId(gone), `${gone} still draws over an empty folder`).toHaveCount(
        0,
      );
    }

    // The three doors, and the one quiet line that names where a drop goes.
    await expect(stage.getByTestId("library-start-add-files")).toBeVisible();
    await expect(stage.getByTestId("library-start-find-documents")).toBeVisible();
    await expect(stage.getByTestId("library-start-import")).toBeVisible();
    await expect(stage.getByTestId("library-start-drop")).toContainText("sources/");

    /*
     * Anchored, not spread to the walls — the 2026-08-12 empty-state verdict. The column
     * is the repository's 640px stage, and its centre is the viewport's within a
     * half-column, which is what "centred" means when a nav rail takes the left edge.
     */
    const box = (await stage.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(640);
    const viewport = page.viewportSize()!;
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(60);

    // Exactly one title. A tie between two headings is what the hierarchy gate reads as
    // two, and this stage's own name is on the rail.
    expect(await stage.locator("h1, h2, h3").count()).toBe(1);
  });

  test("opens on the graph, with the guide behind one chip", async ({ page }) => {
    await openLibrary(page);

    // 1 — the picture, not a strip: it is drawn, and it is most of the pane's height.
    const canvas = page.getByTestId("library-graph-canvas");
    await expect(canvas).toBeVisible();
    const readerBox = (await page.getByTestId("library-reader").boundingBox())!;
    const canvasBox = (await canvas.boundingBox())!;
    expect(canvasBox.height).toBeGreaterThan(readerBox.height * 0.6);

    /*
     * Small enough to hold them, so every mark wears its name. The attribute is the
     * canvas's own account of which policy is in force — there is no DOM to read a
     * painted name out of, so without it the rule would be unfalsifiable.
     */
    await expect(canvas).toHaveAttribute("data-labels", "standing");

    /*
     * 2 — the header says **one** verdict, not three turns. The triplet shipped as
     * "Gather done · Compile next · Read next", which on an untouched folder read as a
     * run of not-yet-my-turn beside a caption of zeroes.
     */
    const strip = page.getByTestId("library-status-strip");
    await expect(strip).toContainText("Compile next");
    // The count that decides it stays — it is the half a person can go and check.
    await expect(strip).toContainText("2 waiting");
    // The other two steps' turns do not. Their words are in the guide, one press away.
    await expect(strip).not.toContainText("Gather");
    await expect(strip).not.toContainText("Read");

    // 3 — one press away, and nothing was auto-raised.
    await expect(page.getByTestId("library-shelf-popover")).toHaveCount(0);
    await page.getByTestId("library-shelf-open").click();
    const shelf = page.getByTestId("library-shelf-popover");
    await expect(shelf).toBeVisible();
    for (const step of ["gather", "compile", "read"]) {
      await expect(shelf.getByTestId(`library-stage-${step}`)).toBeVisible();
    }

    /*
     * 4 — narrow, and **equal by anatomy**. The old panel stretched three cards to one
     * height with `auto-rows-fr`, which bought equality with ~130px of empty space inside
     * the shortest card. The rows now match because each is head, one caption line and
     * one action row of reserved height; step two is allowed to be taller, because what
     * it adds is a state of the folder (a blocked reason, the runner's card, the transfer
     * sentence) rather than a longer paragraph. So the measured slot is that fixed core.
     */
    const shelfBox = (await shelf.boundingBox())!;
    expect(shelfBox.width).toBeLessThanOrEqual(360);
    const cores: number[] = [];
    for (const step of ["gather", "compile", "read"]) {
      cores.push(
        (await shelf
          .getByTestId(`library-stage-${step}`)
          .getByTestId("library-step-core")
          .boundingBox())!.height,
      );
    }
    for (const height of cores) expect(Math.abs(height - cores[0]!)).toBeLessThanOrEqual(2);
    // No four-row table survived the move: those counts live in the index beside the files.
    expect(await shelf.locator("dl").count()).toBe(0);

    /*
     * 5 — **nothing of it lies over the picture's own writing.** The defect the owner
     * named was the panel across the canvas's sentence, so this reads the stack at three
     * points of the caption and the legend rather than trusting a rect comparison.
     */
    const overlap = await page.evaluate(() => {
      const covered = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        return [rect.left + 4, rect.left + rect.width / 2, rect.right - 4].some((x) =>
          document
            .elementsFromPoint(x, y)
            .some((node) => node.closest('[data-testid="library-shelf-popover"]')),
        );
      };
      return {
        caption: covered('[data-testid="library-graph-counts"]'),
        legend: covered('[data-testid="library-graph-hint"]'),
      };
    });
    expect(overlap.caption, "the guide covers the graph caption").toBe(false);
    expect(overlap.legend, "the guide covers the graph legend").toBe(false);

    /*
     * It is a popover, never a modal — and `toBeVisible()` cannot say that, because
     * Playwright's visibility ignores occlusion and a full-screen scrim would still pass
     * (design-interaction, 2026-09-06). What proves it is the stack: at a point on the
     * canvas outside the panel, the canvas is what a press would reach.
     */
    await expect(shelf).not.toHaveAttribute("aria-modal", /.*/);
    const canvasReachable = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="library-graph-canvas"]');
      const rect = element!.getBoundingClientRect();
      return (
        document.elementsFromPoint(rect.left + 20, rect.top + rect.height / 2)[0] === element
      );
    });
    expect(canvasReachable, "something is drawn over the picture").toBe(true);

    // Escape closes it and hands focus back to the chip that opened it.
    await page.keyboard.press("Escape");
    await expect(shelf).toHaveCount(0);
    await expect(page.getByTestId("library-shelf-open")).toBeFocused();
  });

  test("a press settles the guide either way, and it never returns by itself", async ({
    page,
  }) => {
    await openLibrary(page);

    const shelf = page.getByTestId("library-shelf-popover");
    await expect(shelf).toHaveCount(0);
    await page.getByTestId("library-shelf-open").click();
    await expect(shelf).toBeVisible();
    await page.getByTestId("library-shelf-close").click();
    await expect(shelf).toHaveCount(0);

    // Re-rendering the pane by opening and closing something else must not raise it.
    await page.getByTestId("library-wiki-wiki/quarter-plan").click();
    await expect(page.getByTestId("library-wiki-header")).toBeVisible();
    await page.getByTestId("library-reader-back").click();
    await expect(shelf).toHaveCount(0);
  });

  /**
   * **The index is one column, and it scrolls once** (owner, 2026-09-06).
   *
   * > *"I don't like this left panel being split into a top and a bottom like this and
   * > drawn oddly either. Improve it!"*
   *
   * The folder here is the narrow fixture on purpose: it is the only one with enough rows
   * to overflow 280px at a desktop height, which is the state the owner sent — two lists
   * that each owned their overflow, the longer one cut mid-row, and the transfer sentence
   * pinned under the cut. A column that has nothing to scroll cannot fail any of this.
   */
  test("the index is one scroller with sticky section heads, and no row is cut", async ({
    page,
  }) => {
    await openLibrary(page, NARROW_VAULT);

    const aside = page.getByTestId("library-index");
    // 280px at `lg` is unchanged; this rewrite is about the column's insides.
    expect(Math.round((await aside.boundingBox())!.width)).toBe(280);

    // 1 — exactly one box inside the index scrolls, and it is the column itself.
    const scrollers = await aside.evaluate((element) =>
      [...element.querySelectorAll("*")]
        .filter((node) => {
          const style = getComputedStyle(node);
          return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
        })
        .map((node) => node.getAttribute("data-testid") ?? node.tagName.toLowerCase()),
    );
    expect(scrollers, "the index still has nested scrollers").toEqual(["library-index-scroll"]);

    // 2 — the head of the list a person is inside stays with them.
    const scroller = page.getByTestId("library-index-scroll");
    const sticky = await scroller.evaluate((element) => {
      const head = element.querySelector('[data-testid="library-sources"] .sticky');
      const before = head!.getBoundingClientRect().top;
      element.scrollTop = 240;
      return { before, after: head!.getBoundingClientRect().top, top: element.getBoundingClientRect().top };
    });
    expect(sticky.after, "the Sources head scrolled away with its rows").toBeCloseTo(
      sticky.top,
      0,
    );
    expect(sticky.after).toBeLessThan(sticky.before);

    /*
     * 3 — every row is a whole row: 36px, none crosses the column's side edges, and every
     * one of them can be brought fully into view.
     *
     * ⚠️ **This case first asked the wrong question and CI caught it** (2026-09-07). It
     * counted rows straddling the column's **bottom** edge — which is the scroller's own
     * fold, something every scrolled list has exactly one of, and whose presence depends
     * on nothing but where the row grid happens to land. Measured on the built export at
     * 1280 wide: 0 straddling rows at heights 700-800, 1 at 900 and 982, with the layout
     * identical and no row ever past the right edge. It passed on macOS at Playwright's
     * default 720 and failed on CI's chromium shard at the same width, because Linux font
     * metrics move the header block a few pixels and the fold lands on a row instead of
     * between two.
     *
     * The two claims that are actually about this column, and cannot pass by accident:
     * a row must not cross the 280px column sideways, and — the owner's complaint, which
     * was never about the fold but about rows two nested scrollers could not reach —
     * every row must be scrollable fully into the box.
     */
    const rows = await aside.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll('[data-control="row"]')].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          height: Math.round(rect.height),
          past: rect.left < box.left - 1 || rect.right > box.right + 1,
        };
      });
    });
    expect(new Set(rows.map((row) => row.height))).toEqual(new Set([36]));
    expect(rows.filter((row) => row.past).length, "a row crosses the column's side edge").toBe(0);

    const unreachable = await scroller.evaluate((element) => {
      const names: string[] = [];
      for (const row of element.querySelectorAll('[data-control="row"]')) {
        row.scrollIntoView({ block: "nearest" });
        const box = element.getBoundingClientRect();
        const rect = row.getBoundingClientRect();
        if (rect.top < box.top - 1 || rect.bottom > box.bottom + 1) {
          names.push(row.getAttribute("data-testid") ?? "(unnamed row)");
        }
      }
      element.scrollTop = 0;
      return names;
    });
    expect(unreachable, "a row cannot be scrolled fully into the column").toEqual([]);

    // 4 — the column never hands its overflow to the page.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1),
    ).toBe(false);
  });

  /**
   * **The two close paths a pointer test cannot see** (design-interaction, 2026-09-06).
   *
   * The outside-press listener is `pointerdown`, so every pointer route closed the panel
   * and the keyboard route did not: Enter on an index row left it open over a reader whose
   * canvas — and therefore whose anchor chip — had just been hidden, so focus returned to a
   * `display:none` control and Escape took two presses. And the return itself was wrong in
   * the other direction: closing by pressing something else handed focus **back to the
   * chip**, out from under the control just used.
   */
  test("a choice closes the guide from the keyboard too, and an outside press leaves focus alone", async ({
    page,
  }) => {
    await openLibrary(page);
    const shelf = page.getByTestId("library-shelf-popover");

    // 1 — Enter on a row is not a pointerdown, and it still closes the panel.
    await page.getByTestId("library-shelf-open").click();
    await expect(shelf).toBeVisible();
    await page.getByTestId("library-wiki-wiki/quarter-plan").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-wiki-header")).toBeVisible();
    await expect(shelf).toHaveCount(0);

    /*
     * 2 — an outside **press** onto another control keeps focus where the press put it.
     * `Find documents` is the target because it is focusable, it is outside the panel, and
     * it changes nothing about the selection, so the only thing this can measure is where
     * focus ends up. The panel used to drag it back to the chip one exit window later.
     */
    await page.getByTestId("library-reader-back").click();
    await page.getByTestId("library-shelf-open").click();
    await expect(shelf).toBeVisible();
    await page.getByTestId("library-find-documents").click();
    await expect(shelf).toHaveCount(0);
    // The dialog that press opens owns focus now; the point is that the chip does not take
    // it back. Waiting past the exit window is what makes the assertion able to fail.
    await page.waitForTimeout(400);
    await expect(page.getByTestId("library-shelf-open")).not.toBeFocused();
  });

  test("choosing a file swaps the pane for the reader, and the way back returns the graph", async ({
    page,
  }) => {
    await openLibrary(page);
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await page.getByTestId("library-wiki-wiki/quarter-plan").click();
    await expect(page.getByTestId("library-wiki-header")).toContainText("Quarter plan");
    // The canvas stands aside rather than unmounting — it keeps its settled positions.
    await expect(page.getByTestId("library-graph-canvas")).toBeHidden();

    await page.getByTestId("library-reader-back").click();
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await expect(page.getByTestId("library-wiki-header")).toHaveCount(0);
  });
});

const NARROW_VIEWPORTS = [
  { label: "390×844", width: 390, height: 844 },
  { label: "768×1024", width: 768, height: 1024 },
] as const;

/**
 * The same rule below `lg`, where the column is one thing at a time.
 *
 * The folder here is its own fixture with **enough files to overflow both lists**, because
 * the index's scroll model changes at this width — the two lists shared half a phone and
 * measured 30px and **zero**, so the index scrolls as one box and the lists stand at their
 * natural height. A scroller with nothing to scroll cannot fail that assertion.
 */

for (const viewport of NARROW_VIEWPORTS) {
  test(`the graph takes the top of the column at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openLibrary(page, NARROW_VAULT);

    // 1 — the picture is drawn here too. It used not to be: the pane holding it was
    // hidden whenever nothing was chosen, so a phone got two lists and nothing else.
    const canvas = page.getByTestId("library-graph-canvas");
    await expect(canvas).toBeVisible();
    const canvasBox = (await canvas.boundingBox())!;
    const indexBox = (await page.getByTestId("library-index").boundingBox())!;
    expect(canvasBox.y).toBeLessThan(indexBox.y);
    /*
     * Height, not width: the canvas is cut to the **picture's** width so a uniform fit
     * leaves no gutters, and a folder of unconnected files settles into a squarer cloud
     * than a tall column. What has to be true here is that the graph really took the top
     * of the column rather than a strip of it.
     */
    const readerBox = (await page.getByTestId("library-reader").boundingBox())!;
    expect(canvasBox.height).toBeGreaterThan(readerBox.height * 0.6);

    /*
     * 2 — the popup hangs from the row, not from the graph's half of the column, so it is
     * not cut: at 390 the pane it is drawn over is 373px tall and all three rows are
     * inside the panel and inside the window. It is also **not** allowed to reach the
     * bottom tab bar, which is the reserve this surface pays for itself.
     */
    await page.getByTestId("library-shelf-open").click();
    const shelf = page.getByTestId("library-shelf-popover");
    await expect(shelf).toBeVisible();
    const shelfBox = (await shelf.boundingBox())!;
    expect(shelfBox.width).toBeLessThanOrEqual(360);
    for (const step of ["gather", "compile", "read"]) {
      const row = shelf.getByTestId(`library-stage-${step}`);
      await expect(row).toBeVisible();
      await expect(row).toBeInViewport();
    }
    /*
     * The reserve, not merely the window: the bottom tab bar stands over this column, and a
     * panel whose last row ends behind it is a row nobody can press. Reading the token is
     * what stops the assertion idling — the panel's height is its content's, so "inside the
     * viewport" carries hundreds of pixels of slack and would pass with the cap deleted.
     */
    const reserve = await page.evaluate(() => {
      /*
       * The token is a `calc()`, so reading it off `:root` returns the unresolved
       * expression and parses to `NaN`. A fresh element with `transition: none` is this
       * repository's own way of resolving a length — fresh because a reused one reports the
       * value it is transitioning **from**.
       */
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;left:-9999px;transition:none;height:var(--topology-mobile-bottom-tab-reserve)";
      document.body.append(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });
    expect(reserve, "the bottom-tab reserve token is not readable").toBeGreaterThan(0);
    expect(shelfBox.y + shelfBox.height).toBeLessThanOrEqual(viewport.height - reserve);

    /*
     * And the picture's legend yields rather than being covered. Below `lg` the canvas is
     * the top half of one column and the panel reaches the sentence at its foot; measured
     * with `elementsFromPoint` before the fix, the panel was over all three of its probe
     * points. It stays in the document as the canvas's own description — a reader with no
     * picture at all must still be told what the marks mean.
     */
    const legend = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="library-graph-hint"]');
      const rect = element!.getBoundingClientRect();
      const canvas = document.querySelector('[data-testid="library-graph-canvas"]');
      return {
        drawn: rect.width > 1 && rect.height > 1,
        describes: (canvas?.getAttribute("aria-describedby") ?? "").includes("library-graph-hint"),
        text: (element!.textContent ?? "").trim().length,
      };
    });
    expect(legend.drawn, "the legend is still painted under the guide").toBe(false);
    expect(legend.describes, "the canvas lost its description with the legend").toBe(true);
    expect(legend.text).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(shelf).toHaveCount(0);
    // And it comes back the moment the panel does not need the room.
    expect(
      await page.evaluate(() => {
        const rect = document
          .querySelector('[data-testid="library-graph-hint"]')!
          .getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      }),
      "the legend stayed hidden after the guide closed",
    ).toBe(true);

    // 3 — the index still owns its own overflow, in one scroller rather than two.
    const scroller = page.getByTestId("library-index-scroll");
    const scrolled = await scroller.evaluate((element) => {
      const before = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      return {
        overflowY: getComputedStyle(element).overflowY,
        overflows: element.scrollHeight > element.clientHeight + 1,
        moved: element.scrollTop > before,
      };
    });
    expect(scrolled.overflowY, "the index is not a scroller").toBe("auto");
    expect(scrolled.overflows, "the index has nothing to scroll — the case is idling").toBe(true);
    expect(scrolled.moved, "the index did not scroll").toBe(true);
    await expect(page.getByTestId("library-wiki-wiki/note-08")).toBeInViewport();
    const pageScrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    );
    expect(pageScrolls, "the narrow column handed its overflow to the page").toBe(false);
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });

    // 4 — choosing swaps the whole column, and the way back returns the picture.
    await page.getByTestId("library-source-sources/report-01.pdf").click();
    await expect(page.getByTestId("library-source-summary")).toBeVisible();
    await expect(page.getByTestId("library-index")).toBeHidden();
    await page.getByTestId("library-reader-back").click();
    await expect(canvas).toBeVisible();
    await expect(page.getByTestId("library-index")).toBeVisible();
  });
}

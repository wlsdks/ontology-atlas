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
  await page.getByTestId("library-sources").waitFor({ timeout: 25_000 });
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
 * **The pane is the graph, and the guide is a popup over it.**
 *
 * The owner opened the installed app on 2026-09-06 — two sources, two pages a local
 * `qwen3:8b` had compiled — and read the screen as two half-screens: the graph as a strip
 * on top and the three-step shelf stacked under it. *"Shouldn't the Library tab's default
 * be the graph? Why is the area split above and below? The area underneath should come up
 * as a popup."* (`docs/DECISIONS.md`, 2026-09-06.)
 *
 * These cases hold the four things that shape has to keep true, and every one of them was
 * a real state of the old build rather than a hypothetical:
 *
 * 1. the picture is the default and fills the pane — not a band with a shelf beneath it;
 * 2. the shelf is one press away and comes back with its three steps intact;
 * 3. it raises **itself** only over a folder with nothing in it, and a person's own press
 *    settles it either way for the session — a guide that reappears every visit is the
 *    spent answer the shelf itself was written to replace;
 * 4. choosing a file still swaps the pane for the reader, and the way back returns the
 *    picture rather than a blank column.
 *
 * The narrow bands stay in the list because the whole rule is "the same at every width":
 * below `lg` the graph takes the top of the column, the index keeps the bottom, and the
 * popup hangs from the row so it is not cut to half a phone.
 */
const NO_SOURCE_VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: empty-demo", "title: Empty demo", "---", "", "# Empty demo", ""].join("\n"),
};

test.describe("the Library pane", () => {
  test("opens on the graph, with the shelf behind one chip", async ({ page }) => {
    await openLibrary(page);

    // 1 — the picture, not a strip: it is drawn, and it is most of the pane's height.
    const canvas = page.getByTestId("library-graph-canvas");
    await expect(canvas).toBeVisible();
    const readerBox = (await page.getByTestId("library-reader").boundingBox())!;
    const canvasBox = (await canvas.boundingBox())!;
    expect(canvasBox.height).toBeGreaterThan(readerBox.height * 0.6);

    // The shelf's verdict stayed behind on the header when its copy left for the popup.
    const strip = page.getByTestId("library-status-strip");
    await expect(strip).toContainText("Gather done");
    await expect(strip).toContainText("Compile next");

    // 2 — one press away, and nothing was auto-raised over a folder that has files.
    await expect(page.getByTestId("library-shelf-popover")).toHaveCount(0);
    await page.getByTestId("library-shelf-open").click();
    const shelf = page.getByTestId("library-shelf-popover");
    await expect(shelf).toBeVisible();
    for (const step of ["gather", "compile", "read"]) {
      await expect(shelf.getByTestId(`library-stage-${step}`)).toBeVisible();
    }
    /*
     * Equal height survived the move into a 560px panel. The tolerance is 2px, not 0:
     * `auto-rows-fr` distributes a fractional remainder, and the dev server and the static
     * export round it differently (measured 1.33px apart). What this case exists to catch
     * is a height decided by copy length, which differs by tens of pixels.
     */
    const heights = [];
    for (const step of ["gather", "compile", "read"]) {
      heights.push((await shelf.getByTestId(`library-stage-${step}`).boundingBox())!.height);
    }
    for (const height of heights) expect(Math.abs(height - heights[0]!)).toBeLessThanOrEqual(2);
    // It is a popover, never a modal: the picture behind it stays in the accessibility
    // tree and stays visible, which is the whole reason "1 waiting" is readable here.
    await expect(canvas).toBeVisible();
    expect((await shelf.boundingBox())!.width).toBeLessThanOrEqual(560);

    // Escape closes it and hands focus back to the chip that opened it.
    await page.keyboard.press("Escape");
    await expect(shelf).toHaveCount(0);
    await expect(page.getByTestId("library-shelf-open")).toBeFocused();
  });

  test("raises itself over a folder with no sources, and only until it is answered", async ({
    page,
  }) => {
    await openLibrary(page, NO_SOURCE_VAULT);

    // The one state where there is nothing else to look at.
    const shelf = page.getByTestId("library-shelf-popover");
    await expect(shelf).toBeVisible();
    await expect(shelf.getByTestId("library-stage-gather")).toContainText("next");

    // Closing it is an answer, and the answer holds: re-rendering the pane by opening and
    // closing something else must not raise it again.
    await page.getByTestId("library-shelf-close").click();
    await expect(shelf).toHaveCount(0);
    await page.getByTestId("library-shelf-open").click();
    await expect(shelf).toBeVisible();
    await page.getByTestId("library-shelf-close").click();
    await expect(shelf).toHaveCount(0);
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

    // 2 — the popup hangs from the row, so it is not cut to the graph's half.
    await page.getByTestId("library-shelf-open").click();
    const shelf = page.getByTestId("library-shelf-popover");
    await expect(shelf).toBeVisible();
    const shelfBox = (await shelf.boundingBox())!;
    expect(shelfBox.height).toBeGreaterThan(canvasBox.height);
    for (const step of ["gather", "compile", "read"]) {
      await expect(shelf.getByTestId(`library-stage-${step}`)).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(shelf).toHaveCount(0);

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

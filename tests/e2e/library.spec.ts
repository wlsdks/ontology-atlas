import { createHash } from "node:crypto";

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
 * A folder whose one source **matches its page's hash and was still only half read**.
 *
 * This is the case no hash can catch on its own. The page records the sha256 of the whole
 * file, so hash comparison says *this page describes this file* — and it does, for the
 * part that was read. `sources_truncated:` is the writer's record of where it stopped, and
 * without it the row said `compiled` while the rest of a long document had reached no page
 * and nobody was told.
 *
 * The hash is computed here from the exact bytes the picker stub writes, so the fixture
 * cannot drift from the file: change the source text and the page still matches.
 */
const PARTIAL_PLAN = "%PDF-1.7 a two hundred page plan, of which forty were read\n";
const PARTIAL_PLAN_HASH = createHash("sha256").update(PARTIAL_PLAN).digest("hex");

const PARTIAL_VAULT = {
  "project.md": [
    "---",
    "kind: project",
    "slug: partial-demo",
    "title: Partial demo",
    "---",
    "",
    "# Partial demo",
    "",
  ].join("\n"),
  "sources/long-plan.pdf": PARTIAL_PLAN,
  "wiki/long-plan.md": [
    "---",
    "title: Long plan",
    "created_by: agent:claude",
    "compiled_at: 2026-09-07T10:00:00Z",
    "sources:",
    "  - sources/long-plan.pdf",
    "source_hash:",
    `  sources/long-plan.pdf: ${PARTIAL_PLAN_HASH}`,
    "sources_truncated:",
    "  - sources/long-plan.pdf",
    "status: draft",
    "summary: What the first part of the plan commits the team to.",
    "---",
    "",
    "## Summary",
    "",
    "The first pages name three deliverables.",
    "",
    "## Facts",
    "",
    "- Three deliverables are named. [[src:sources/long-plan.pdf#p2]]",
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
    "## Not in sources",
    "",
    "- Only the first part of `sources/long-plan.pdf` was read, so anything later in that file is not covered here.",
    "",
  ].join("\n"),
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

  test("distinguishes unwritten sources from source versions needing review", async ({
    page,
  }) => {
    await openLibrary(page);

    const planRow = page.getByTestId("library-source-sources/quarter-plan.pdf");
    // A page cites it, but its all-zero YAML value is not a usable string receipt.
    // The screen asks for review without asserting a proven byte change.
    await expect(planRow).toContainText("needs review");

    const budgetRow = page.getByTestId("library-source-sources/budget.xlsx");
    await expect(budgetRow).toContainText("not compiled");

    /*
     * The honest count, and the two states apart: one source nobody wrote up, one whose
     * page has fallen behind its bytes. "2 not written up" was the sentence this line used
     * to accept, and it was false for the cited one.
     *
     * ⚠️ **Where the line is read moved on 2026-09-12.** It was a caption at the foot of
     * the Sources list, and the owner read it there: *"written like this, who is ever
     * going to look at it?"* It is now under the press it is about — one press from the
     * clause on the home that names the file Compile would start on.
     */
    await page.getByTestId("library-strip-compile").click();
    const footer = page.getByTestId("library-needs-compile");
    await expect(footer).toContainText("1 not written up yet");
    await expect(footer).toContainText("1 source version needs review");
  });

  test("says read in part when the page matches the bytes but stopped short", async ({
    page,
  }) => {
    await openLibrary(page, PARTIAL_VAULT);

    const row = page.getByTestId("library-source-sources/long-plan.pdf");
    // Not `compiled`. The hash matches every byte of the file and the page still covers
    // only its first part, which is the one thing a hash can never say.
    await expect(page.getByTestId("library-source-state-partial")).toHaveText("read in part", {
      timeout: 25_000,
    });
    await expect(row).not.toContainText("needs review");

    // And the folder's own summary line counts it as work Compile can still do, in its own
    // clause — never folded into "not written up yet", which is false of a file with a page.
    // Under the press it is about since 2026-09-12; see the case above.
    await page.getByTestId("library-strip-compile").click();
    const footer = page.getByTestId("library-needs-compile");
    await expect(footer).toContainText("1 read only in part");
    await expect(footer).not.toContainText("not written up yet");
  });

  test("shelves the wiki pages with their freshness on them, before any of them is opened", async ({
    page,
  }) => {
    await openLibrary(page);
    // The index draws one list and opens on Sources (2026-09-07); the wiki is one press.
    await page.getByTestId("library-index-segment-wiki").click();

    const wiki = page.getByTestId("library-wiki-list");
    // Two spines; New page is the list's own last control (council 2026-09-07), not a page.
    await expect(wiki.locator('[data-testid^="library-wiki-wiki/"]')).toHaveCount(2);
    await expect(wiki.getByTestId("library-new-page")).toBeVisible();
    await expect(wiki).toContainText("Quarter plan");
    await expect(wiki).toContainText("Handover notes");

    /*
     * **The state is on the shelf, not behind a press.** `quarter-plan.md` records a hash
     * these bytes cannot match, so its row is marked; `handover.md` cites nothing, so
     * nothing has ever checked it against a file and nothing is wrong there. Both are
     * derived from the folder, so this measures the derivation as well as the drawing.
     *
     * ⚠️ **The mark is a dot beside a word, not a coloured rim** (2026-09-09). The rim
     * was a full-bleed amber bar across the row's head, and the owner read it — and a
     * first repair that moved it to the row's start edge — as generic: *"that yellow line
     * looks so AI… do it our way."* `docs/DESIGN-SYSTEM.md` lists full-height coloured
     * rails among the Don'ts and asks for a small marker and a label instead.
     */
    const plan = page.getByTestId("library-wiki-wiki/quarter-plan");
    await expect(plan).toHaveAttribute("data-freshness", "stale");
    await expect(plan).toContainText("Source review needed");
    /*
     * ⚠️ **A stale row carries no dot** (guardian, 2026-09-09). The dot shipped on
     * `stale || ownProblem` and landed on 3 of 3 rows of the owner's folder: a folder
     * somebody is working in *rests* stale, so the union puts the warning ink on every
     * row and marks nothing. The word stays; only the marker contracted to the page's own
     * defect, which is the fact this row's caption can lose to its own truncation.
     */
    await expect(plan.getByTestId("library-spine-attention-dot")).toHaveCount(0);
    await expect(page.getByTestId("library-wiki-wiki/handover")).toHaveAttribute(
      "data-freshness",
      "unverified",
    );
    // And no row anywhere wears a rail.
    await expect(page.getByTestId("library-spine-stale-rim")).toHaveCount(0);
    await expect(page.getByTestId("library-spine-off-template-rim")).toHaveCount(0);

    /*
     * Every spine is one height — the shelf is a shelf, not a bar chart — and the only
     * thing that varies is width, which is how long the page is.
     */
    const boxes = await wiki.locator('[data-testid^="library-wiki-wiki/"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { w: Math.round(rect.width), h: Math.round(rect.height) };
      }),
    );
    expect(new Set(boxes.map((box) => box.h)).size).toBe(1);

    /*
     * A row truncates, so the whole title and every mark it draws are in its accessible
     * name — the reason the page missed the template included. `handover.md` has no
     * `## Not in sources`, and the caption says so beside the source state rather than
     * carrying it as a second coloured edge (2026-09-09).
     */
    const handover = page.getByTestId("library-wiki-wiki/handover");
    await expect(handover).toHaveAttribute("aria-label", /Handover notes/);
    await expect(handover).toHaveAttribute("aria-label", /section-order/);
    await expect(handover.getByTestId("library-spine-attention-dot")).toBeAttached();
    await expect(handover).toContainText("off-template");
    await expect(page.getByTestId("library-off-template-count")).toBeVisible();

    /*
     * A search is an answer to a question, so the rows come back — and with them the pill
     * that says one fixed word, which is the shape a row has always used.
     */
    await page.getByTestId("library-search").fill("handover");
    await expect(page.getByTestId("library-wiki-shelf")).toHaveCount(0);
    await expect(page.getByTestId("library-wiki-off-template")).toHaveText("off-template");
  });

  test("a wiki page opens in the reader, because it is ordinary Markdown", async ({ page }) => {
    await openLibrary(page);
    // The index draws one list and opens on Sources (2026-09-07); the wiki is one press.
    await page.getByTestId("library-index-segment-wiki").click();
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
     * source asks for review and its write-up reads `behind`. Neither can establish
     * current coverage without a usable receipt. Both ends must expose that gap.
     */
    const writeUp = page.getByTestId("library-source-writeup-wiki/quarter-plan");
    await expect(writeUp).toBeVisible();
    await expect(writeUp).toContainText("Quarter plan");
    await expect(writeUp).toContainText("behind");
    await expect(writeUp).toHaveAttribute("title", "wiki/quarter-plan");
    await expect(summary).toContainText("needs review");
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
 * Direction B keeps the reader and its guidance in the pane; the graph opens on request.
 * These probes retain the measurable contracts: one empty state, equal step anatomy,
 * graph labels and hit ownership, full graph height, stable focus, and independent narrow
 * index scrolling. The retired popup geometry is replaced by viewport-dialog geometry,
 * not waived. Closing a page restores guidance without starting a graph by itself.
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
      "library-reader-landing",
      "library-home-strip",
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

  /**
   * **The home is the folder's graph, and the guide is behind a door** (owner,
   * 2026-09-12; `docs/DECISIONS.md` 2026-09-06 `:587`, restored).
   *
   * This case used to read the opposite way round — three guide cards drawn on every
   * visit, the canvas absent until a `Graph` chip opened a viewport dialog. The owner read
   * that: *"is this gather-compile-read screen just the main one? why does it come up
   * every time…?"*, and of the dialog *"pressing a button gets an ugly popup, which is
   * very poor."* So the claims invert: the canvas is present and fills the pane, the three
   * steps are one press away, and the strip's clauses are the only place the step facts
   * are stated.
   */
  test("opens on the folder's graph with the guide one press away", async ({ page }) => {
    await openLibrary(page);
    const canvas = page.getByTestId("library-graph-canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-labels", "standing");
    // Not raised over the picture: the guide's self-raise is once per machine and seeded.
    await expect(page.getByTestId("library-guide-popover")).toHaveCount(0);
    await expect(page.getByTestId("library-stage")).toHaveCount(0);

    /*
     * The picture is the pane. `> 0.6` of the reader's height is the same floor the old
     * dialog was held to, read against the box the canvas now lives in.
     */
    const reader = (await page.getByTestId("library-reader").boundingBox())!;
    expect((await canvas.boundingBox())!.height).toBeGreaterThan(reader.height * 0.6);
    const reachable = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.left + 20, rect.top + rect.height / 2) === element;
    });
    expect(reachable, "the home's graph is covered by another surface").toBe(true);
    for (const id of ["library-graph-counts", "library-graph-hint"]) {
      const label = page.getByTestId(id);
      await expect(label).toBeVisible();
      const hit = await label.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      });
      expect(hit, `${id} is occluded`).toBe(true);
    }

    // One strip, and the step facts are on it — not in a second header row.
    const strip = page.getByTestId("library-home-strip");
    await expect(strip).toContainText("Compile next");
    await expect(page.getByTestId("library-status-strip")).toHaveCount(0);
    await expect(page.getByTestId("library-needs-compile")).toHaveCount(0);

    /*
     * The three steps, still with one shell each, now inside the popup. The heights are
     * read at a pane tall enough to draw all of it, for the reason the fold gives
     * (`library-spine.spec.ts` owns the folded geometry).
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByTestId("library-guide-open").click();
    const guide = page.getByTestId("library-guide-popover");
    await expect(guide).toBeVisible();
    await expect(guide).toHaveAttribute("data-transient-surface", "anchored");
    // Anchored, not centred: it hangs under the door that opened it.
    const door = (await page.getByTestId("library-guide-open").boundingBox())!;
    const panel = (await guide.boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(door.y + door.height);
    expect(panel.width).toBeLessThanOrEqual(560);
    const stage = guide.getByTestId("library-stage");
    await expect(stage).toBeVisible();
    const cores: number[] = [];
    for (const step of ["gather", "compile", "read"]) {
      const row = stage.getByTestId(`library-stage-${step}`);
      await expect(row).toBeVisible();
      cores.push((await row.getByTestId("library-step-core").boundingBox())!.height);
    }
    for (const height of cores) expect(Math.abs(height - cores[0]!)).toBeLessThanOrEqual(2);
    expect(await stage.locator("dl").count()).toBe(0);

    // Escape closes it and the door takes focus back — the anchored contract.
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    await expect(page.getByTestId("library-guide-open")).toBeFocused();
    await expect(canvas).toBeVisible();
    // And the machine remembers, so it never raises itself again.
    expect(
      await page.evaluate(() => window.localStorage.getItem("atlas.library.guide-seen")),
    ).toBe("on");
  });

  test("a page replaces the canvas, and closing it brings the canvas back", async ({ page }) => {
    await openLibrary(page);
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-wiki-wiki/quarter-plan").click();
    await expect(page.getByTestId("library-wiki-header")).toBeVisible();
    await expect(page.getByTestId("library-reader-landing")).toHaveCount(0);
    // The reading state keeps its own header row: a way back and the status strip.
    await expect(page.getByTestId("library-status-strip")).toBeVisible();
    await expect(page.getByTestId("library-graph-canvas")).toHaveCount(0);
    await page.getByTestId("library-reader-back").click();
    await expect(page.getByTestId("library-reader-landing")).toBeVisible();
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
  });

  /**
   * **The index is a switch, and it draws one list** (owner, 2026-09-07).
   *
   * > *"I hate this structure: sources on top, wiki underneath, one long scroll. A switch
   * > at the top is better."*
   *
   * This case is the rewrite of the 2026-09-06 "one scrolling column with sticky heads"
   * case, not its deletion: the claims that survived the stacking are the ones the owner
   * never complained about — 280px, one scroller, whole 36px rows, nothing crossing the
   * column's side edge, no overflow handed to the page. What replaces the sticky-head
   * claim is the switch: the inactive list is **not in the document**, so the column's
   * height and its tab order both belong to the list on screen.
   *
   * The folder here is the narrow fixture on purpose: it is the only one with enough rows
   * to overflow 280px at a desktop height. A column that has nothing to scroll cannot fail
   * any of this.
   */
  test("the index is a switch that draws one list, and no row is cut", async ({ page }) => {
    /*
     * A short window on purpose. Drawing **one** list is exactly what stops this column
     * overflowing at Playwright's default height, and a scroller with nothing to scroll
     * cannot fail the claims below — measured: 12 rows plus the head fit 720px with room
     * to spare once the other list left. 560px is what a 13-inch laptop leaves after the
     * browser's own chrome, so it is not an invented number either.
     */
    await page.setViewportSize({ width: 1280, height: 560 });
    await openLibrary(page, NARROW_VAULT);

    const aside = page.getByTestId("library-index");
    // 280px at `lg` is unchanged; this rewrite is about the column's insides.
    expect(Math.round((await aside.boundingBox())!.width)).toBe(280);

    /*
     * 1 — one list, and the other one is nowhere. `hidden` would not do: a hidden list
     * keeps its rows in the tab order and its doors reachable from a keyboard while
     * nothing on screen names them, which is the state the switch exists to prevent.
     */
    const sources = page.getByTestId("library-source-list");
    const wiki = page.getByTestId("library-wiki-list");
    await expect(sources).toBeVisible();
    await expect(wiki).toHaveCount(0);
    await expect(page.getByTestId("library-add-files")).toBeVisible();

    // The switch names both lists with their counts, so nothing is lost by drawing one.
    const segment = page.getByTestId("library-index-segment");
    await expect(segment).toContainText("Sources 12");
    await expect(segment).toContainText("Wiki 8");
    await expect(page.getByTestId("library-index-segment-sources")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // 2 — exactly one box inside the index scrolls, and it is the column itself.
    const scrollers = await aside.evaluate((element) =>
      [...element.querySelectorAll("*")]
        .filter((node) => {
          const style = getComputedStyle(node);
          return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
        })
        .map((node) => node.getAttribute("data-testid") ?? node.tagName.toLowerCase()),
    );
    expect(scrollers, "the index still has nested scrollers").toEqual(["library-index-scroll"]);

    /*
     * 3 — the switch does not scroll away with the rows. The sticky head it replaces
     * existed to answer "which list am I in" from inside the list; a control that leaves
     * the screen answers it worse than the eyebrow did.
     */
    const scroller = page.getByTestId("library-index-scroll");
    const switchStayed = await scroller.evaluate((element) => {
      const control = document.querySelector('[data-testid="library-index-segment"]')!;
      const before = control.getBoundingClientRect().top;
      element.scrollTop = 240;
      return { before, after: control.getBoundingClientRect().top, moved: element.scrollTop > 0 };
    });
    expect(switchStayed.moved, "the column had nothing to scroll — the case is idling").toBe(true);
    expect(switchStayed.after).toBeCloseTo(switchStayed.before, 0);
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });

    /*
     * 4 — every row is a whole row: 36px, none crosses the column's side edges, and every
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
    const measureRows = async () => {
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
    };
    await measureRows();

    // 5 — the other segment, and the same geometry claims on the list it draws.
    await page.getByTestId("library-index-segment-wiki").click();
    await expect(wiki).toBeVisible();
    await expect(sources).toHaveCount(0);
    // The doors travel with the list: Add files acts on sources and is not on this half.
    await expect(page.getByTestId("library-add-files")).toHaveCount(0);
    await measureRows();

    // 6 — the column never hands its overflow to the page, on either half.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1),
    ).toBe(false);
  });

  /**
   * **The three controls the column grew on 2026-09-07**, each from one owner sentence:
   * the description behind a glyph, the fold, and the switch that is remembered.
   */
  test("the description is a tooltip, the column folds to a rail, and the switch is remembered", async ({
    page,
  }) => {
    await openLibrary(page, NARROW_VAULT);

    /*
     * 1 — *"put one icon beside the title and show the explanation in a tooltip on
     * hover."* The sentence is not deleted, it is behind a real focusable control: the
     * paragraph is gone from the column and the sentence is still the glyph's accessible
     * name, so a keyboard and a screen reader reach it as a pointer does.
     */
    const head = page.getByTestId("library-header");
    await expect(head).not.toContainText("A source is kept byte for byte");
    const info = page.getByTestId("library-lede-info");
    await expect(info).toHaveAttribute("aria-label", /kept byte for byte/);
    await info.hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toContainText("kept byte for byte");

    /*
     * ⚠️ **The head is one row, and the fold stands on the title's own line** (owner,
     * 2026-09-12: *"the fold icon's size and position — why is it like this? It should be
     * centred the same as the text beside it, and bigger. And a label like 'in this
     * folder' is not even needed"*).
     *
     * Measured at 1512 before the change: an `IN THIS FOLDER` eyebrow on its own 14px row,
     * with the fold sitting on that row — 9px of ink whose centre was **29.5px above** the
     * title's, and a right edge 4px past the column's box edge. All three are geometry, so
     * all three are measured here rather than trusted to a class name.
     *
     * The ink ratio is the part that would rot quietly: `ICON_SIZE.sm` is still what most
     * of this column's glyphs take, and a copy-paste back to it would leave every other
     * assertion green. The bound is the title's own ink height, which is what the glyph is
     * being sized to.
     */
    const headGeometry = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { y: r.y, bottom: r.bottom, right: r.right, cy: r.y + r.height / 2, h: r.height };
      };
      const header = document.querySelector('[data-testid="library-header"]')!;
      const title = header.querySelector("h1")!;
      const fold = document.querySelector('[data-testid="library-index-collapse"]')!;
      const svg = fold.querySelector("svg")!;
      const style = getComputedStyle(title);
      const metrics = document
        .createElement("canvas")
        .getContext("2d")!;
      metrics.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const measured = metrics.measureText(title.textContent ?? "");
      const viewBox = (svg.getAttribute("viewBox") ?? "0 0 24 24").split(/\s+/).map(Number);
      const bbox = (svg as SVGGraphicsElement).getBBox();
      return {
        header: box(header),
        title: box(title),
        fold: box(fold),
        eyebrowRows: header.querySelectorAll("p").length,
        titleInk: measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent,
        glyphInk: (bbox.height * svg.getBoundingClientRect().width) / (viewBox[2] || 24),
      };
    });
    // Nothing above the title: the head's box starts where the title's does.
    expect(headGeometry.eyebrowRows, "no eyebrow paragraph in the head").toBe(0);
    expect(Math.abs(headGeometry.header!.y - headGeometry.title!.y)).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(headGeometry.fold!.cy - headGeometry.title!.cy),
      "the fold is centred on the title's row",
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(headGeometry.fold!.right - headGeometry.header!.right),
      "the fold stops at the column's box edge",
    ).toBeLessThanOrEqual(0.5);
    const inkRatio = headGeometry.glyphInk / headGeometry.titleInk;
    expect(inkRatio, `glyph ink ${headGeometry.glyphInk} vs title ink ${headGeometry.titleInk}`)
      .toBeGreaterThan(0.85);
    expect(inkRatio).toBeLessThan(1.15);
    /*
     * ⚠️ **And it yields the moment the pointer moves, including onto the panel itself.**
     * Radix's default keeps a tooltip open while the pointer is over its content, and that
     * content takes pointer events — so a panel lying over the next control makes that
     * control unpressable for as long as a hand rests anywhere on the panel. This asserts
     * the `disableHoverableContent` that removes it: the pointer is moved **into** the
     * description, which is the one motion the default would treat as "still reading".
     */
    const tipBox = (await tip.boundingBox())!;
    await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2);
    await expect(tip).toHaveCount(0);

    /*
     * The index fold gives width to the reader, and its control returns keyboard focus.
     * Measure the pane rather than a graph that now opens only in a dialog.
     */
    const pane = page.getByTestId("library-reader");
    const wide = (await pane.boundingBox())!.width;
    await page.getByTestId("library-index-collapse").click();
    await expect(page.getByTestId("library-index")).toBeHidden();
    const tab = page.getByTestId("library-index-tab");
    await expect(tab).toBeVisible();
    // Focus followed the control that vanished, so the keyboard is not back at the top.
    await expect(tab).toBeFocused();
    await expect
      .poll(async () => Math.round((await pane.boundingBox())!.width))
      .toBeGreaterThan(Math.round(wide) + 200);

    await tab.click();
    await expect(page.getByTestId("library-index")).toBeVisible();
    await expect(page.getByTestId("library-index-collapse")).toBeFocused();

    /*
     * 3 — the switch is remembered per machine, and opening a file from the picture moves
     * it to that file's own list. Both are what stop the index naming one thing while the
     * reader shows another.
     */
    await page.getByTestId("library-index-segment-wiki").click();
    /*
     * The stored answer, not a reload: reopening this fixture means driving the picker
     * again, which is a different journey and would measure the folder-restore path
     * instead of the preference. The key is what survives the machine either way.
     */
    expect(
      await page.evaluate(() => window.localStorage.getItem("atlas.library.index-segment")),
    ).toBe("wiki");
    await page.getByTestId("library-wiki-wiki/note-01").click();
    await page.getByTestId("library-reader-back").click();
    await expect(page.getByTestId("library-index-segment-wiki")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("keyboard selection gives the reader focus and discovery keeps its own focus", async ({ page }) => {
    await openLibrary(page);
    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-wiki-wiki/quarter-plan").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-wiki-header")).toBeVisible();
    await expect(page.getByTestId("library-reader-landing")).toHaveCount(0);
    await expect(page.getByTestId("library-reader")).toBeFocused();
    await page.getByTestId("library-reader-back").click();
    await page.getByTestId("library-index-segment-sources").click();
    await page.getByTestId("library-find-documents").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(page.getByTestId("library-guide-open")).not.toBeFocused();
  });

  test("choosing a file opens the reader and closing returns the canvas home", async ({ page }) => {
    await openLibrary(page);
    await expect(page.getByTestId("library-reader-landing")).toBeVisible();
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-wiki-wiki/quarter-plan").click();
    await expect(page.getByTestId("library-wiki-header")).toContainText("Quarter plan");
    await expect(page.getByTestId("library-reader-landing")).toHaveCount(0);
    await page.getByTestId("library-reader-back").click();
    await expect(page.getByTestId("library-reader-landing")).toBeVisible();
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
  test(`the canvas home and its doors remain reachable at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openLibrary(page, NARROW_VAULT);
    const landing = page.getByTestId("library-reader-landing");
    await expect(landing).toBeVisible();
    const indexBox = (await page.getByTestId("library-index").boundingBox())!;
    expect((await landing.boundingBox())!.y).toBeLessThan(indexBox.y);

    /*
     * The picture is the pane here too, in the top half of the one column. Its own box,
     * not the viewport's: below `lg` the index takes the rest of the screen.
     */
    const canvas = page.getByTestId("library-graph-canvas");
    await expect(canvas).toBeVisible();
    const canvasBox = (await canvas.boundingBox())!;
    expect(canvasBox.x).toBeGreaterThanOrEqual(0);
    expect(canvasBox.y).toBeGreaterThanOrEqual(0);
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(viewport.width);
    expect((await page.getByTestId("library-graph-hint")).isVisible()).toBeTruthy();
    await expect(canvas).toHaveAttribute("aria-describedby", /library-graph-hint/);

    /*
     * Below `lg` the strip keeps its lead clause and the doors fold into one `…`, because
     * four chips plus three clauses on a phone is the header row this screen replaced.
     * Every destination is still reachable, one press deeper.
     */
    const overflow = page.getByTestId("library-home-overflow");
    await expect(overflow).toBeVisible();
    for (const gone of ["library-guide-open", "library-questions-open"]) {
      expect(
        await page.getByTestId(gone).evaluate((el) => el.getBoundingClientRect().width),
        `${gone} still takes room on the narrow strip`,
      ).toBe(0);
    }
    await overflow.click();
    const list = page.getByTestId("library-home-overflow-popover");
    await expect(list).toBeVisible();
    await expect(list).toHaveAttribute("data-transient-surface", "anchored");
    const listBox = (await list.boundingBox())!;
    expect(listBox.x).toBeGreaterThanOrEqual(0);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(viewport.width);
    await expect(list.getByTestId("library-guide-open-overflow")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(overflow).toBeFocused();

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
    // The last row of the list the switch is on, reached by that scroll (2026-09-07: the
    // column draws one list, so the row that used to be last here is on the other half).
    await expect(page.getByTestId("library-source-sources/report-12.pdf")).toBeInViewport();
    const pageScrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    );
    expect(pageScrolls, "the narrow column handed its overflow to the page").toBe(false);
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });

    // Choosing swaps the column; closing brings the picture and the same index back.
    await page.getByTestId("library-source-sources/report-01.pdf").click();
    await expect(page.getByTestId("library-source-summary")).toBeVisible();
    await expect(page.getByTestId("library-index")).toBeHidden();
    await expect(page.getByTestId("library-graph-canvas")).toHaveCount(0);
    await page.getByTestId("library-reader-back").click();
    await expect(landing).toBeVisible();
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await expect(page.getByTestId("library-index")).toBeVisible();
  });
}

/**
 * **A toast stands in the corner of the pane it is about** (owner, 2026-09-12: *"the
 * toast at the top — its position is odd too, right? (and of course a toast should
 * adjust its position adaptively)"*).
 *
 * The two constants this replaced were the measurement of the problem rather than a cure
 * for it: a top-centred box on this surface had to be pushed 124px down (601px and up)
 * and 173px down (below it) just to miss the pane's own chrome, and at the end of that
 * push it was still a notification about the **right** pane's work resting above the
 * **left** column's title. `docs/DECISIONS.md`, 2026-09-12.
 *
 * Three things are measured, at two window sizes, because each has its own way of going
 * wrong: the corner (a plain `position` change), the pane (a box standing over the index
 * instead of the reader), and a full-surface dialog (a dismissible aside laid across a
 * surface a person is reading). The conversation dock's own wall is measured by
 * `library-compile-dock.spec.ts`, which is where a dock can be opened.
 */
for (const viewport of [
  { label: "1512x901", width: 1512, height: 901 },
  { label: "1040x720", width: 1040, height: 720 },
]) {
  test(`a toast stands in the reader pane's own corner at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openLibrary(page, NARROW_VAULT);

    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-new-page").click();
    await page.getByTestId("library-new-page-title").fill("Toast corner probe");
    await page.getByTestId("library-new-page-make").click();

    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 20_000 });
    /*
     * ⚠️ **Poll, do not read once.** The box rises into place (`app-toast`, the repository's
     * own ramp over sonner's 400ms `ease`), so the first `boundingBox()` after it becomes
     * visible is a frame of that entrance: measured 41px below the window's floor at 1512
     * and 44 at 1040. What this test is about is where the box comes to **rest**.
     */
    const corner = async () => {
      const box = (await toast.boundingBox())!;
      return {
        right: Math.round(viewport.width - (box.x + box.width)),
        bottom: Math.round(viewport.height - (box.y + box.height)),
      };
    };
    await expect.poll(corner, { timeout: 10_000 }).toEqual({ right: 16, bottom: 16 });

    const box = (await toast.boundingBox())!;
    const reader = (await page.getByTestId("library-reader").boundingBox())!;
    const head = (await page.getByTestId("library-header").boundingBox())!;
    // The pane it is about, not the column beside it.
    expect(box.x, "the toast starts inside the reader pane").toBeGreaterThanOrEqual(reader.x);
    // And never over the page title, which is the whole of what the owner was reading.
    expect(box.y, "the toast is below the index head").toBeGreaterThan(head.y + head.height);

    /*
     * ⚠️ **A dialog that *shows* keeps the toast and takes it inside its own safe area; a
     * dialog that *asks* clears it instead** (`useToast().dismiss`, which
     * `handleFindDocuments` calls). Both of this view's full-surface dialogs are
     * `size="viewport"`: `--chrome-inset` from each window edge with `p-4` inside that, so
     * at the plain gutter the box came to rest on the dialog's own padding.
     */
    await page.getByTestId("library-graph-open").click();
    const graph = page.getByTestId("library-graph-dialog");
    await expect(graph).toBeVisible();
    await expect(toast).toBeVisible();
    const safeArea = async () => {
      const dialogBox = (await graph.boundingBox())!;
      const inDialog = (await toast.boundingBox())!;
      return {
        insideLeftEdge: inDialog.x > dialogBox.x,
        right: Math.round(dialogBox.x + dialogBox.width - (inDialog.x + inDialog.width)),
        bottom: Math.round(dialogBox.y + dialogBox.height - (inDialog.y + inDialog.height)),
      };
    };
    /*
     * 32 from the dialog's own border box: the gutter is `--chrome-inset` (24, the dialog's
     * distance from the window) plus its `p-4` (16) plus the same 16 the pane gets, so 56
     * from the window edge — and the dialog's border stands at 24 of that. What is left,
     * 32, is the dialog's padding plus one gutter, which is what "inside the safe area"
     * means here. The dialog springs in and the box moves with the gutter, so this settles
     * as well.
     */
    await expect
      .poll(safeArea, { timeout: 10_000 })
      .toEqual({ insideLeftEdge: true, right: 32, bottom: 32 });
    await page.keyboard.press("Escape");
    await expect(graph).toHaveCount(0);
  });
}

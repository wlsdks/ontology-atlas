import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

/**
 * Proves what only a rendered folder can: a non-Markdown source is a Library row and never in the
 * Docs tree, state words derive from disk, Find documents never proposes a secret.
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
  /* The folder decides which shape arrives, so wait on the state rather than on a box only one has. */
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
    // Format comes from the listing; a name already ending in it is not followed by a second copy.
    await expect(sources.getByTestId("library-source-format")).toHaveCount(0);

    // The one invariant the whole library rests on: a raw source is not a document. It is
    // measured across the Library tabs: only ontology documents belong in this tree.
    await page.getByTestId("library-workspace-ontology").click();
    const tree = page.getByRole("navigation", { name: "Document list" });
    await expect(tree).toBeVisible({ timeout: 25_000 });
    await expect(tree).not.toContainText("quarter-plan.pdf");
    await expect(tree).not.toContainText("budget.xlsx");
    await expect(page.getByTestId("library-workspace-sources")).toBeVisible();
    await expect(page.getByTestId("docs-sidebar-library-link")).toHaveCount(0);
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
     * The count keeps two states apart: one source nobody wrote up and one whose page is behind its
     * bytes. It is read under the strip's Compile press.
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

    // The summary counts it as work Compile can still do, never folded into "not written up yet".
    await page.getByTestId("library-strip-compile").click();
    const footer = page.getByTestId("library-needs-compile");
    await expect(footer).toContainText("1 read only in part");
    await expect(footer).not.toContainText("not written up yet");
  });

  test("shelves the wiki pages with their freshness on them, before any of them is opened", async ({
    page,
  }) => {
    await openLibrary(page);
    // The index opens on Sources; the wiki is one press.
    await page.getByTestId("library-workspace-wiki").click();

    const wiki = page.getByTestId("library-wiki-list");
    // Two spines; New page is the list's own last control, not a page.
    await expect(wiki.locator('[data-testid^="library-wiki-wiki/"]')).toHaveCount(2);
    await expect(wiki.getByTestId("library-new-page")).toBeVisible();
    await expect(wiki).toContainText("Quarter plan");
    await expect(wiki).toContainText("Handover notes");

    /*
     * The state is on the shelf: `quarter-plan.md` records a hash these bytes cannot match, so its row is
     * marked, while `handover.md` cites nothing. The mark is a dot beside a word, not a coloured rim.
     */
    const plan = page.getByTestId("library-wiki-wiki/quarter-plan");
    await expect(plan).toHaveAttribute("data-freshness", "stale");
    await expect(plan).toContainText("Source review needed");
    /*
     * A stale row carries no dot: a folder in use rests stale, so a union with `ownProblem` would put the
     * warning ink on every row. The word stays; only the page's own defect gets the marker.
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
     * A row truncates, so the whole title and every mark are in its accessible name. `handover.md` has no
     * `## Not in sources`, and the caption says so beside the source state.
     */
    const handover = page.getByTestId("library-wiki-wiki/handover");
    await expect(handover).toHaveAttribute("aria-label", /Handover notes/);
    await expect(handover).toHaveAttribute("aria-label", /section-order/);
    await expect(handover.getByTestId("library-spine-attention-dot")).toBeAttached();
    await expect(handover).toContainText("off-template");
    // The card says it and the header strip counts it; there is no third copy under the shelf.
    await expect(page.getByTestId("library-off-template-count")).toHaveCount(0);

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
    // The index opens on Sources; the wiki is one press.
    await page.getByTestId("library-workspace-wiki").click();
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
    // The format is the extension the headline already ends in, so it is not printed again as a fact row.
    await expect(summary.locator('[data-fact="format"]')).toHaveCount(0);
    /*
     * Citing pages are pressable rows under `View write-up` with the page title and one word for how it
     * stands to the file. A 64-zero `source_hash` parses as a number, so the write-up reads `behind`.
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
    await openLibrary(page, { ...VAULT,
      'inbox/Schedule.pdf': '%PDF-1.7 schedule\n',
      'other/Notes.pdf': '%PDF-1.7 notes\n',
    });
    await page.getByTestId("library-find-documents").click();
    const dialog = page.getByRole('dialog');
    const query = dialog.getByRole('searchbox');
    await query.fill(' REQUIREMENTS ');
    await page.getByTestId("find-documents-candidate-inbox/Requirements v3.pdf").check();
    await query.fill('inbox/schedule');
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await page.getByTestId('find-documents-candidate-inbox/Schedule.pdf').check();
    await query.fill('not-present');
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await dialog.getByTestId('find-documents-clear-search').click();
    await expect(query).toBeFocused();
    await expect(page.getByTestId('find-documents-candidate-inbox/Requirements v3.pdf')).toBeChecked();
    await expect(page.getByTestId('find-documents-candidate-inbox/Schedule.pdf')).toBeChecked();
    await query.fill('schedule');
    await page.getByTestId("find-documents-add").click();

    // The copy is the artifact: the row appears in the library because the walk found a
    // new file, not because anything recorded that an import happened.
    await expect(
      page.getByTestId("library-source-sources/Requirements v3.pdf"),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('library-source-sources/Schedule.pdf')).toBeVisible();
    await expect(page.getByTestId("library-source-list")).toContainText("not compiled");
    await page.getByTestId('library-find-documents').click();
    await expect(dialog.getByRole('searchbox')).toHaveValue('');
    await expect(page.getByTestId('find-documents-candidate-other/Notes.pdf')).toBeVisible();
    await expect(page.getByTestId('find-documents-add')).toBeDisabled();
  });

  for (const empty of [true, false]) {
    test(`document discovery returns focus to its ${empty ? 'empty-stage' : 'index'} opener after an unfocused pointer click`, async ({ page }) => {
      await openLibrary(page, empty ? {
        'project.md': VAULT['project.md'],
        'inbox/Requirements.pdf': '%PDF-1.7 requirements\n',
      } : VAULT);
      const opener = page.getByTestId(empty ? 'library-start-find-documents' : 'library-find-documents');
      await opener.evaluate((button) => {
        (document.activeElement as HTMLElement)?.blur();
        button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true });
      });
      await opener.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('searchbox')).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(opener).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialog.getByRole('searchbox')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(opener).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialog.getByRole('searchbox')).toBeVisible();
      await dialog.getByTestId('find-documents-close').click();
      await expect(opener).toBeFocused();
    });
  }
});


/**
 * Measurable contracts for the narrow index: one empty state, equal step anatomy, graph labels and hit
 * ownership, full graph height, stable focus, and independent index scrolling.
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

    /* None of the other surfaces that state emptiness is drawn, and the guide is not raised. */
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
     * The column is the 640px stage, and its centre is the viewport's within half a column, which is what
     * centred means when a nav rail takes the left edge.
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
   * The home is the folder's graph: the canvas fills the pane, the three steps are one press away, and
   * the strip's clauses are the only place step facts are stated.
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

  test("a Wiki page returns to its question desk while Sources retains the canvas", async ({ page }) => {
    await openLibrary(page);
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await page.getByTestId("library-workspace-wiki").click();
    await page.getByTestId("library-wiki-wiki/quarter-plan").click();
    await expect(page.getByTestId("library-wiki-header")).toBeVisible();
    await expect(page.getByTestId("library-reader-landing")).toHaveCount(0);
    // The reading state keeps its own header row: a way back and the status strip.
    await expect(page.getByTestId("library-status-strip")).toBeVisible();
    await expect(page.getByTestId("library-graph-canvas")).toHaveCount(0);
    await page.getByTestId("library-reader-back").click();
    await expect(page.getByTestId("library-question-desk")).toBeVisible();
    await expect(page.getByTestId("library-graph-canvas")).toHaveCount(0);
    await page.getByTestId("library-workspace-sources").click();
    await expect(page.getByTestId("library-reader-landing")).toBeVisible();
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
  });

  /**
   * The active tab draws one list; the inactive list is not in the document, so the column's height and
   * tab order belong to the list on screen. The narrow fixture has enough rows to overflow 280px.
   */
  test("the active tab draws one list, and no row is cut", async ({ page }) => {
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

    // The tabs name both lists with their counts, so nothing is lost by drawing one.
    await expect(page.getByTestId("library-workspace-sources")).toHaveAccessibleName("Sources, 12");
    await expect(page.getByTestId("library-workspace-wiki")).toHaveAccessibleName("Wiki, 8");
    await expect(page.getByTestId("library-workspace-sources")).toHaveAttribute(
      "aria-selected",
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
     * 3 — the tabs do not scroll away with the rows. The sticky head they replace
     * existed to answer "which list am I in" from inside the list; a control that leaves
     * the screen answers it worse than the eyebrow did.
     */
    const scroller = page.getByTestId("library-index-scroll");
    const switchStayed = await scroller.evaluate((element) => {
      const control = document.querySelector('[data-testid="library-workspace-tabs"]')!;
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
     * Every row is a whole row: 36px, none crossing the column's side edges, each scrollable fully
     * into the box. A row straddling the bottom fold is not a defect; it varies with font metrics.
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

    // 5 — the other tab, and the same geometry claims on the list it draws.
    await page.getByTestId("library-workspace-wiki").click();
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

  /** The description behind a glyph, the fold to a rail, and the remembered switch. */
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
     * The fold and the glyph stand in the strip on the tabs' line: centred on the selected tab's row,
     * the fold stops at the strip's inner edge, and the two are one size step.
     */
    const headGeometry = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { y: r.y, bottom: r.bottom, right: r.right, cy: r.y + r.height / 2, h: r.height, w: r.width };
      };
      const header = document.querySelector('[data-testid="library-header"]')!;
      const tools = document.querySelector('[data-testid="library-strip-tools"]')!;
      const strip = tools.closest("[data-page-header-row]")!;
      const tab = document.querySelector('[data-testid="library-workspace-sources"]')!;
      const info = document.querySelector('[data-testid="library-lede-info"]')!;
      const fold = document.querySelector('[data-testid="library-index-collapse"]')!;
      return {
        inStrip: tools.contains(header),
        visibleTitles: [...header.querySelectorAll("p")].filter((p) => p.getBoundingClientRect().width > 1).length,
        strip: box(strip),
        stripPaddingRight: parseFloat(getComputedStyle(strip).paddingRight),
        tab: box(tab),
        info: box(info),
        fold: box(fold),
        infoGlyph: box(info.querySelector("svg")),
        foldGlyph: box(fold.querySelector("svg")),
      };
    });
    expect(headGeometry.inStrip, "the column's head is seated in the strip").toBe(true);
    // No name in the strip: the head's title is for assistive tech only.
    expect(headGeometry.visibleTitles, "no visible title beside the tabs").toBe(0);
    expect(
      Math.abs(headGeometry.fold!.cy - headGeometry.tab!.cy),
      "the fold is centred on the tabs' row",
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(headGeometry.info!.cy - headGeometry.tab!.cy),
      "the glyph is centred on the tabs' row",
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(headGeometry.fold!.right + headGeometry.stripPaddingRight - headGeometry.strip!.right),
      "the fold stops at the strip's inner edge",
    ).toBeLessThanOrEqual(0.5);
    expect(headGeometry.foldGlyph!.w, "the fold and the glyph are one size step").toBe(headGeometry.infoGlyph!.w);
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
     * 3 — the tab is remembered per machine, and opening a file from the picture moves
     * it to that file's own list. Both are what stop the index naming one thing while the
     * reader shows another.
     */
    await page.getByTestId("library-workspace-wiki").click();
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
    await expect(page.getByTestId("library-workspace-wiki")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("keyboard selection gives the reader focus and discovery keeps its own focus", async ({ page }) => {
    await openLibrary(page);
    await page.getByTestId("library-workspace-wiki").click();
    await page.getByTestId("library-wiki-wiki/quarter-plan").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-wiki-header")).toBeVisible();
    await expect(page.getByTestId("library-reader-landing")).toHaveCount(0);
    await expect(page.getByTestId("library-reader")).toBeFocused();
    await page.getByTestId("library-reader-back").click();
    await page.getByTestId("library-workspace-sources").click();
    await page.getByTestId("library-find-documents").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(page.getByTestId("library-guide-open")).not.toBeFocused();
  });
});

/**
 * A toast stands in the corner of the pane it is about, not top-centred over the index. Measured: the
 * corner, the pane, and a full-surface dialog. The dock's wall is in `library-compile-dock.spec.ts`.
 */
// The app's minimum window, where the index column leaves the reader pane the least room.
for (const viewport of [{ label: "1040x720", width: 1040, height: 720 }]) {
  test(`a toast stands in the reader pane's own corner at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openLibrary(page, NARROW_VAULT);

    await page.getByTestId("library-workspace-wiki").click();
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
    // Never over the page title.
    expect(box.y, "the toast is below the index head").toBeGreaterThan(head.y + head.height);

    /*
     * A dialog that asks clears the toast: `handleFindDocuments` calls `useToast().dismiss()` first, so
     * no toast floats above the scrim. The `size="viewport"` case is in `library-answer-refresh.spec.ts`.
     */
    await page.getByTestId("library-workspace-sources").click();
    await page.getByTestId("library-find-documents").click();
    await expect(page.getByTestId("find-documents-list")).toBeVisible();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
}

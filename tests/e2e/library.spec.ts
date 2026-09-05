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
async function openLibrary(page: import("@playwright/test").Page) {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
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

    // The honest count, in the section rather than in a tooltip.
    await expect(page.getByTestId("library-needs-compile")).toContainText("2");
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
    // The page that cites it, and the one door: a browser cannot reveal in Finder, so it
    // offers the bytes instead.
    await expect(summary).toContainText("wiki/quarter-plan");
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

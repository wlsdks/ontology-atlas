import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * The library in the Docs sidebar — **Sources** and **Wiki**, above the graph tree.
 *
 * A vault holds three kinds of file and only one is the graph (`docs/DECISIONS.md`,
 * 2026-09-05). Unit tests prove the state derivation and the discovery filter; this spec
 * proves the three things only a rendered folder can:
 *
 * 1. a non-Markdown file in `sources/` reaches the screen as a row **and never the
 *    document tree**, so the two lists cannot quietly merge;
 * 2. each state word is derived from the file on disk rather than declared — the fixture
 *    plants a page citing a hash that does not match, and the row must say so;
 * 3. "Find documents" proposes real files and **never a secret**, on the surface a
 *    person actually sees rather than in a filter function.
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
 * Open the fixture folder.
 *
 * **Two presses, not one.** Beside the read-only sample, "Open my folder" switches the
 * source preference to local; the folder picker is offered by the card that then
 * appears, "Open existing workspace". Pressing only the first leaves the sample on
 * screen, which is exactly how this helper failed the first time it was written. Both
 * are tried in order, and whichever is on screen is pressed.
 */
async function openLibrary(page: import("@playwright/test").Page) {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto("/en/docs/");
  await page.waitForLoadState("networkidle");
  // The door only works after the surface has decided which card it is drawing, and that
  // decision waits for the IndexedDB handle restore. A control present in every state is
  // the signal; clicking before it is the flake this replaced.
  await page.getByTestId("docs-sidebar-new-doc").waitFor({ timeout: 25_000 });
  const sampleDoor = page.getByRole("button", { name: "Open my folder" });
  if ((await sampleDoor.count()) > 0 && (await sampleDoor.first().isVisible().catch(() => false))) {
    await sampleDoor.first().click();
  }
  // Waiting on the picker door rather than on a duration: the welcome card is rendered
  // after the source preference changes, and a fixed pause is a race with that render.
  const pickerDoor = page.getByRole("button", { name: /Open existing workspace/ });
  await pickerDoor.first().waitFor({ timeout: 25_000 });
  await pickerDoor.first().click();
  await page.getByTestId("docs-library-sources").waitFor({ timeout: 25_000 });
}

test.describe("the Docs library", () => {
  test("lists raw sources with a state, and keeps them out of the document tree", async ({
    page,
  }) => {
    await openLibrary(page);

    const sources = page.getByTestId("docs-library-source-list");
    await expect(sources.getByRole("button")).toHaveCount(2);
    await expect(sources).toContainText("quarter-plan.pdf");
    await expect(sources).toContainText("budget.xlsx");
    // Format and size come from the listing; the file is never opened to produce them.
    await expect(sources).toContainText("PDF");
    await expect(sources).toContainText("XLSX");

    // The one invariant the whole library rests on: a raw source is not a document.
    const tree = page.getByRole("navigation", { name: "Document list" });
    await expect(tree).not.toContainText("quarter-plan.pdf");
    await expect(tree).not.toContainText("budget.xlsx");
  });

  test("says compiled, not compiled or stale from the file rather than the claim", async ({
    page,
  }) => {
    await openLibrary(page);

    const planRow = page.getByTestId("docs-library-source-sources/quarter-plan.pdf");
    // A page cites it, so it is not "not compiled" — and the recorded hash does not match
    // these bytes, so the honest word is "stale".
    await expect(planRow).toContainText("stale");

    const budgetRow = page.getByTestId("docs-library-source-sources/budget.xlsx");
    await expect(budgetRow).toContainText("not compiled");

    // The honest count, in the section rather than in a tooltip.
    await expect(page.getByTestId("docs-library-needs-compile")).toContainText("2");
  });

  test("lists wiki pages and names the first problem of one that is off-template", async ({
    page,
  }) => {
    await openLibrary(page);

    const wiki = page.getByTestId("docs-library-wiki-list");
    await expect(wiki.getByRole("button")).toHaveCount(2);
    await expect(wiki).toContainText("Quarter plan");
    await expect(wiki).toContainText("Handover notes");
    // `handover.md` has no `## Not in sources`, and the row says which rule it missed
    // using the same code `wiki-validate` prints.
    await expect(page.getByTestId("docs-library-wiki-off-template")).toContainText("section-order");
    await expect(page.getByTestId("docs-library-off-template-count")).toBeVisible();
  });

  test("a wiki page opens in the reader, because it is ordinary Markdown", async ({ page }) => {
    await openLibrary(page);
    await page.getByTestId("docs-library-wiki-wiki/quarter-plan").click();
    await expect(page.getByRole("main")).toContainText("Three deliverables");
  });

  test("Find documents proposes real documents and never a credential", async ({ page }) => {
    await openLibrary(page);
    await page.getByTestId("docs-library-find-documents").click();

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
    await page.getByTestId("docs-library-find-documents").click();
    await page.getByTestId("find-documents-candidate-inbox/Requirements v3.pdf").check();
    await page.getByTestId("find-documents-add").click();

    // The copy is the artifact: the row appears in the library because the walk found a
    // new file, not because anything recorded that an import happened.
    await expect(
      page.getByTestId("docs-library-source-sources/Requirements v3.pdf"),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("docs-library-source-list")).toContainText("not compiled");
  });
});

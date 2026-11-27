import { expect, test, type Page } from "@playwright/test";

import { dropOnApp, installDesktopRailRuntime, listDesktopFiles, mountDesktopVault } from "../desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "../first-run-seed";

/**
 * The empty Library in the app: documents already in the folder lead with one Copy all, files and
 * folders dropped on the window are copied into the sources folder in the background, and what a
 * drop skipped is counted by reason and listed by name.
 */

const FOLDERS = ["meetings", "contracts", "research", "reports", "notes"] as const;
const body = (label: string) => `${label}\n\nOne decision and the figure behind it, long enough to be a real file.\n`;

/** Forty files in five folders: in each, seven documents and one log that is not one. */
function fortyFiles(): Record<string, string> {
  const files: Record<string, string> = {
    "project.md": "---\nkind: project\nslug: first-run-drop\ntitle: First run drop\n---\n",
  };
  for (const folder of FOLDERS) {
    files[`${folder}/agenda.md`] = body(`# ${folder} agenda`);
    files[`${folder}/minutes.md`] = body(`# ${folder} minutes`);
    files[`${folder}/summary.txt`] = body(`${folder} summary`);
    files[`${folder}/follow-up.txt`] = body(`${folder} follow-up`);
    files[`${folder}/figures.csv`] = `item,amount\n${folder},120\nshipping,40\nreview,30\nbuffer,10\nlong enough to count,1\n`;
    files[`${folder}/figures.tsv`] = `item\tamount\n${folder}\t120\nshipping\t40\nreview\t30\nlong enough to count\t1\n`;
    files[`${folder}/page.html`] = `<!doctype html><title>${folder}</title><p>${body(folder)}</p>`;
    files[`${folder}/build.log`] = body(`${folder} build output`);
  }
  // A concept the ontology owns: Markdown with `kind:` is never offered as a source.
  files["research/minutes.md"] = `---\nkind: element\nslug: research-minutes\ntitle: Research minutes\n---\n\n${body("Minutes")}`;
  return files;
}
const IN_FOLDER_DOCUMENTS = FOLDERS.length * 7 - 1;

async function openFolder(page: Page, files: Record<string, string>, options: { refuseWritesNamed?: string } = {}) {
  await seedFirstRunSeen(page);
  await installDesktopRailRuntime(page, files, undefined, {
    replaceFixture: true,
    writable: true,
    proposeSources: true,
    refuseImportsNamed: options.refuseWritesNamed,
  });
  await mountDesktopVault(page, "en");
  await page.goto("/en/library/?guides=off");
  await expect(page.getByTestId("library-start-stage")).toBeVisible();
}

test.describe("the empty Library brings documents in", () => {
  test("documents already in the folder lead, and Copy all lands them under their folders", async ({ page }) => {
    await openFolder(page, fortyFiles());
    const stage = page.getByTestId("library-start-stage");
    const found = stage.getByTestId("library-found-in-folder");
    await expect(found).toHaveAttribute("data-found-count", String(IN_FOLDER_DOCUMENTS));
    await expect(found.getByTestId("library-found-folder")).toHaveCount(FOLDERS.length);
    await expect(found.getByTestId("library-found-folder").filter({ hasText: "research" })).toHaveText("research 6");
    await expect(stage.getByTestId("library-found-suggestion")).toHaveCount(0);

    await found.getByTestId("library-found-copy-all").click();
    await expect(page.getByTestId("library-page")).not.toHaveAttribute("data-library-state", "empty-folder", { timeout: 20_000 });
    const rows = page.getByTestId("sources-row");
    await expect(rows).toHaveCount(FOLDERS.length);
    for (const folder of FOLDERS) {
      await expect(page.locator(`[data-testid="sources-row"][data-key="folder:${folder}"]`)).toBeVisible();
    }
  });

  test("two dropped files are copied whatever their format and the stage hands over to the home", async ({ page }) => {
    await openFolder(page, { "project.md": fortyFiles()["project.md"]! });
    await dropOnApp(page, {
      files: [
        { name: "Requirements.pdf", body: "%PDF-1.7 requirements" },
        { name: "whiteboard.png", body: "a photo of the whiteboard" },
      ],
    });
    await expect(page.getByTestId("library-page")).not.toHaveAttribute("data-library-state", "empty-folder", { timeout: 20_000 });
    const list = page.getByTestId("library-source-list");
    await expect(list).toContainText("Requirements.pdf");
    await expect(list).toContainText("whiteboard.png");
  });

  test("a dropped folder keeps its structure and lists what it skipped by reason", async ({ page }) => {
    await openFolder(page, { "project.md": fortyFiles()["project.md"]! });
    await dropOnApp(page, {
      folder: {
        name: "Field notes",
        files: {
          "visits/site-a.txt": body("Site A"),
          "visits/site-b.md": body("# Site B"),
          "photo.png": body("not a document"),
          "LICENSE.txt": body("Licence text"),
          "api-token.txt": body("named like a key"),
          ".env": "SHOULD_NEVER_BE_READ=1\n",
        },
      },
    });
    const strip = page.getByTestId("library-copy-strip");
    const skipped = strip.getByTestId("library-copy-skipped");
    await expect(skipped).toHaveAttribute("data-skipped-count", "4", { timeout: 20_000 });
    await skipped.click();
    const dialog = page.getByTestId("library-skipped-files");
    await expect(dialog.getByTestId("library-skipped-group")).toHaveCount(3);
    await expect(dialog.locator('[data-reason="secretName"]')).toContainText("Field notes/api-token.txt");
    await expect(dialog.locator('[data-reason="secretName"]')).toContainText("Field notes/.env");
    await expect(dialog.locator('[data-reason="licence"]')).toContainText("Field notes/LICENSE.txt");
    await expect(dialog.locator('[data-reason="notDocument"]')).toContainText("Field notes/photo.png");

    await page.keyboard.press("Escape");
    const landed = ((await listDesktopFiles(page)) ?? []).filter((path) => path.startsWith("sources/")).sort();
    expect(landed).toEqual(["sources/Field notes/visits/site-a.txt", "sources/Field notes/visits/site-b.md"]);
  });

  test("a drop of 500 files asks first, and Cancel copies nothing", async ({ page }) => {
    await openFolder(page, { "project.md": fortyFiles()["project.md"]! });
    await dropOnApp(page, { files: Array.from({ length: 500 }, (_, i) => ({ name: `note-${i}.txt`, body: body(`note ${i}`) })) });
    const confirm = page.getByTestId("library-copy-confirm");
    await expect(confirm).toContainText("Copy 500 files");
    await confirm.getByTestId("library-copy-confirm-cancel").click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId("library-copy-line")).toHaveCount(0);
    await expect(page.getByTestId("library-page")).toHaveAttribute("data-library-state", "empty-folder");
  });

  test("a refused write says how many files were not copied and why", async ({ page }) => {
    await openFolder(page, { "project.md": fortyFiles()["project.md"]! }, { refuseWritesNamed: "refused" });
    await dropOnApp(page, { files: [{ name: "refused.txt", body: "refused by the disk" }] });
    const failed = page.getByTestId("library-start-drop").getByTestId("library-copy-failed");
    await expect(failed).toContainText("1 file could not be copied: the sources folder could not be written");
    await expect(failed).toContainText("refused.txt");
    // The refused file leaves nothing behind, so the folder still has no sources.
    await expect(page.getByTestId("library-page")).toHaveAttribute("data-library-state", "empty-folder");
  });
});

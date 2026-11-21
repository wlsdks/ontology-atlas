import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

/**
 * The empty Library on the web: documents already in the folder lead with one Copy all, files and
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

async function openFolder(page: Page, files: Record<string, string>) {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, files);
  await page.goto("/en/library/?guides=off");
  const picker = page.getByTestId("library-open-vault");
  await picker.waitFor({ timeout: 25_000 });
  await picker.click();
  await expect(page.getByTestId("library-start-stage")).toBeVisible();
}

/** Drops files, and optionally one folder built in the origin's private storage, on the window. */
async function dropOnWindow(
  page: Page,
  files: { name: string; body: string }[],
  folder?: { name: string; files: Record<string, string> },
) {
  await page.evaluate(async ({ files, folder }) => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([file.body], file.name));
    if (folder) {
      const storage = await navigator.storage.getDirectory();
      const root = await storage.getDirectoryHandle(folder.name, { create: true });
      for (const [path, text] of Object.entries(folder.files)) {
        const segments = path.split("/");
        const name = segments.pop() as string;
        let cursor = root;
        for (const segment of segments) cursor = await cursor.getDirectoryHandle(segment, { create: true });
        const writable = await (await cursor.getFileHandle(name, { create: true })).createWritable();
        await writable.write(text);
        await writable.close();
      }
      transfer.items.add(new File(["folder"], "__dropped-folder__"));
      const item = DataTransferItem.prototype as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
      item.getAsFileSystemHandle = function (this: DataTransferItem) {
        return Promise.resolve(this.getAsFile()?.name === "__dropped-folder__" ? root : null);
      };
    }
    for (const type of ["dragenter", "dragover", "drop"]) {
      window.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }
  }, { files, folder });
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
    await dropOnWindow(page, [
      { name: "Requirements.pdf", body: "%PDF-1.7 requirements" },
      { name: "whiteboard.png", body: "a photo of the whiteboard" },
    ]);
    await expect(page.getByTestId("library-page")).not.toHaveAttribute("data-library-state", "empty-folder", { timeout: 20_000 });
    const list = page.getByTestId("library-source-list");
    await expect(list).toContainText("Requirements.pdf");
    await expect(list).toContainText("whiteboard.png");
  });

  test("a dropped folder keeps its structure and lists what it skipped by reason", async ({ page }) => {
    await openFolder(page, { "project.md": fortyFiles()["project.md"]! });
    await dropOnWindow(page, [], {
      name: "Field notes",
      files: {
        "visits/site-a.txt": body("Site A"),
        "visits/site-b.md": body("# Site B"),
        "photo.png": body("not a document"),
        "LICENSE.txt": body("Licence text"),
        "api-token.txt": body("named like a key"),
        ".env": "SHOULD_NEVER_BE_READ=1\n",
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
    const landed = await page.evaluate(async () => {
      const storage = await navigator.storage.getDirectory();
      for await (const [name, handle] of storage.entries()) {
        if (!name.startsWith("stub-vault-") || handle.kind !== "directory") continue;
        const paths: string[] = [];
        const walk = async (folder: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
          for await (const [child, entry] of folder.entries()) {
            if (entry.kind === "directory") await walk(entry as FileSystemDirectoryHandle, `${prefix}${child}/`);
            else paths.push(`${prefix}${child}`);
          }
        };
        await walk(await (handle as FileSystemDirectoryHandle).getDirectoryHandle("sources"), "sources/");
        return paths.sort();
      }
      return [];
    });
    expect(landed).toEqual(["sources/Field notes/visits/site-a.txt", "sources/Field notes/visits/site-b.md"]);
  });

  test("a drop of 500 files asks first, and Cancel copies nothing", async ({ page }) => {
    await openFolder(page, { "project.md": fortyFiles()["project.md"]! });
    await dropOnWindow(page, Array.from({ length: 500 }, (_, i) => ({ name: `note-${i}.txt`, body: body(`note ${i}`) })));
    const confirm = page.getByTestId("library-copy-confirm");
    await expect(confirm).toContainText("Copy 500 files");
    await confirm.getByTestId("library-copy-confirm-cancel").click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId("library-copy-line")).toHaveCount(0);
    await expect(page.getByTestId("library-page")).toHaveAttribute("data-library-state", "empty-folder");
  });

  test("a refused write says how many files were not copied and why", async ({ page }) => {
    await page.addInitScript(() => {
      const original = FileSystemWritableFileStream.prototype.write;
      FileSystemWritableFileStream.prototype.write = async function (data) {
        if (data instanceof ArrayBuffer && new TextDecoder().decode(data).startsWith("refused")) throw new Error("Simulated write refusal");
        return original.call(this, data);
      };
    });
    await openFolder(page, { "project.md": fortyFiles()["project.md"]! });
    await dropOnWindow(page, [{ name: "refused.txt", body: "refused by the disk" }]);
    const failed = page.getByTestId("library-start-drop").getByTestId("library-copy-failed");
    await expect(failed).toContainText("1 file could not be copied: Simulated write refusal");
    await expect(failed).toContainText("refused.txt");
    // The refused file leaves nothing behind, so the folder still has no sources.
    await expect(page.getByTestId("library-page")).toHaveAttribute("data-library-state", "empty-folder");
  });
});

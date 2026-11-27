import { expect, test, type Page } from "@playwright/test";

import {
  DESKTOP_VAULT_ROOT,
  addExternalFile,
  atlasSampleFiles,
  chooseDesktopFolder,
  chooseSourceFiles,
  chooseSourceFolder,
  installDesktopRailRuntime,
  listDesktopFiles,
  readDesktopBytes,
  readDesktopFile,
  removeDesktopFile,
  renameDesktopFile,
  storefrontFiles,
  writeDesktopFile,
} from "../desktop-rail-arrival-harness";

/**
 * The faked app runtime is the substrate every other spec stands on, so each thing the slice
 * promises is proved here once: several folders by path, writes that outlive a reload, create,
 * remove and rename, and both source pickers.
 */

const ALPHA = "/Users/probe/alpha-folder";
const BETA = "/Users/probe/beta-folder";

const project = (title: string) =>
  ["---", `uid: ${title === "Alpha Shop" ? "aaaaaaaa" : "bbbbbbbb"}-0000-4000-8000-000000000001`, "kind: project", `title: ${title}`, "---", "", `# ${title}`, ""].join("\n");

const FOLDERS = {
  [ALPHA]: { "project.md": project("Alpha Shop") },
  [BETA]: { "project.md": project("Beta Studio"), "notes/one.md": "# One\n" },
};

/** Calls the native bridge exactly as the app's bridge files do. */
async function native<T>(page: Page, command: string, args: Record<string, unknown>): Promise<T> {
  return page.evaluate(
    ({ name, params }) =>
      (window as unknown as { __TAURI_INTERNALS__: { invoke(c: string, a: Record<string, unknown>): Promise<unknown> } }).__TAURI_INTERNALS__.invoke(name, params),
    { name: command, params: args },
  ) as Promise<T>;
}

async function nativeError(page: Page, command: string, args: Record<string, unknown>): Promise<string> {
  return page.evaluate(
    ({ name, params }) =>
      (window as unknown as { __TAURI_INTERNALS__: { invoke(c: string, a: Record<string, unknown>): Promise<unknown> } }).__TAURI_INTERNALS__
        .invoke(name, params)
        .then(() => "resolved", (error: unknown) => String(error instanceof Error ? error.message : error)),
    { name: command, params: args },
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
});

test("two folders are served by path, and the test chooses which one the picker returns", async ({ page }) => {
  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true, folders: FOLDERS, vaultPick: ALPHA });
  await page.goto("/en/?guides=off", { waitUntil: "domcontentloaded" });

  expect(await native(page, "list_vault_directory", { rootPath: ALPHA, relativePath: "" })).toEqual([{ name: "project.md", kind: "file" }]);
  expect(await native(page, "list_vault_directory", { rootPath: BETA, relativePath: "" })).toEqual(
    expect.arrayContaining([
      { name: "notes", kind: "directory" },
      { name: "project.md", kind: "file" },
    ]),
  );
  expect(await nativeError(page, "read_vault_text_file", { rootPath: "/Users/probe/not-served", relativePath: "project.md" })).toContain("No such file or directory");
  expect(await native(page, "pick_vault_directory", {})).toBe(ALPHA);

  await chooseDesktopFolder(page, BETA);
  expect(await native(page, "pick_vault_directory", {})).toBe(BETA);
  await chooseDesktopFolder(page, null);
  expect(await native(page, "pick_vault_directory", {}), "a cancelled dialog answers nothing").toBeNull();

  await chooseDesktopFolder(page, ALPHA);
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("vault-switch-rail-tile")).toHaveAttribute("aria-label", /alpha-folder/, { timeout: 60_000 });
  await expect(page.locator("main")).toContainText("Alpha Shop", { timeout: 30_000 });
  await expect(page.locator("main")).not.toContainText("Beta Studio");

  await chooseDesktopFolder(page, BETA);
  await page.getByTestId("vault-switch-rail-tile").click();
  await page.getByTestId("vault-switch-pick-other").click();
  await expect(page.getByTestId("vault-switch-rail-tile")).toHaveAttribute("aria-label", /beta-folder/, { timeout: 60_000 });
  await expect(page.locator("main")).toContainText("Beta Studio", { timeout: 30_000 });
});

test("a write survives a reload and the seed is not laid over it again", async ({ page }) => {
  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true, folders: FOLDERS, vaultPick: ALPHA });
  await page.goto("/en/?guides=off", { waitUntil: "domcontentloaded" });

  await native(page, "write_vault_text_file", { rootPath: ALPHA, relativePath: "project.md", content: "# Rewritten\n" });
  await writeDesktopFile(page, "capabilities/ship.md", "# Ship\n", ALPHA);
  await removeDesktopFile(page, "project.md", BETA);
  await native(page, "ensure_vault_directory", { rootPath: ALPHA, relativePath: "empty/inside" });

  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await readDesktopFile(page, "project.md", ALPHA), "the seed was laid over a write").toBe("# Rewritten\n");
  expect(await readDesktopFile(page, "capabilities/ship.md", ALPHA)).toBe("# Ship\n");
  expect(await readDesktopFile(page, "project.md", BETA), "the seed revived a removed file").toBeNull();
  expect(await readDesktopFile(page, "notes/one.md", BETA), "an untouched seed file is still served").toBe("# One\n");
  expect(await native(page, "vault_path_exists", { rootPath: ALPHA, relativePath: "empty/inside", kind: "directory" })).toBe(true);

  // A navigation in the same tab is a new document too.
  await page.goto("/en/library/?guides=off", { waitUntil: "domcontentloaded" });
  expect(await readDesktopFile(page, "project.md", ALPHA)).toBe("# Rewritten\n");
});

test("a file is created once, removed, and renamed, as the native commands answer", async ({ page }) => {
  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true, folders: FOLDERS, vaultPick: ALPHA });
  await page.goto("/en/?guides=off", { waitUntil: "domcontentloaded" });

  expect(await native(page, "create_vault_text_file", { rootPath: ALPHA, relativePath: "notes/new.md", content: "# New\n" })).toBe(true);
  expect(await native(page, "create_vault_text_file", { rootPath: ALPHA, relativePath: "notes/new.md", content: "# Other\n" }), "create never replaces").toBe(false);
  expect(await readDesktopFile(page, "notes/new.md", ALPHA)).toBe("# New\n");

  await renameDesktopFile(page, "notes/new.md", "notes/renamed.md", ALPHA);
  expect(await listDesktopFiles(page, ALPHA)).toEqual(["notes/renamed.md", "project.md"]);
  expect(await readDesktopFile(page, "notes/renamed.md", ALPHA)).toBe("# New\n");
  await expect(renameDesktopFile(page, "notes/new.md", "notes/again.md", ALPHA)).rejects.toThrow(/No such file/);
  await expect(renameDesktopFile(page, "notes/renamed.md", "project.md", ALPHA)).rejects.toThrow(/File exists/);

  expect(await nativeError(page, "remove_vault_entry", { rootPath: BETA, relativePath: "notes", recursive: false })).toContain("not empty");
  await native(page, "remove_vault_entry", { rootPath: BETA, relativePath: "notes/one.md", recursive: false });
  expect(await native(page, "vault_path_exists", { rootPath: BETA, relativePath: "notes/one.md", kind: "file" })).toBe(false);
  await native(page, "remove_vault_entry", { rootPath: ALPHA, relativePath: "notes", recursive: true });
  expect(await listDesktopFiles(page, ALPHA)).toEqual(["project.md"]);
  expect(await nativeError(page, "remove_vault_entry", { rootPath: ALPHA, relativePath: "", recursive: true })).toContain("vault root");

  const bytes = Uint8Array.of(0x23, 0x20, 0xb0, 0xe1, 0x0a);
  await writeDesktopFile(page, "planning/legacy.md", bytes, ALPHA);
  expect(await readDesktopBytes(page, "planning/legacy.md", ALPHA)).toEqual([...bytes]);
  expect(await readDesktopFile(page, "planning/legacy.md", ALPHA), "bytes that are not UTF-8 have no text").toBeNull();
  expect(await nativeError(page, "read_vault_text_file", { rootPath: ALPHA, relativePath: "planning/legacy.md" })).toContain("UTF-8");
});

test("both source pickers answer what the test chose, and the import copies from outside the folder", async ({ page }) => {
  const notes = "/Users/probe/Downloads/Checkout notes.md";
  const wire = "/Users/probe/Downloads/wire.png";
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x00, 0xff);
  await installDesktopRailRuntime(page, {}, undefined, {
    replaceFixture: true,
    folders: FOLDERS,
    vaultPick: ALPHA,
    externalFiles: { [notes]: "# Checkout notes\n" },
  });
  await page.goto("/en/?guides=off", { waitUntil: "domcontentloaded" });
  await addExternalFile(page, wire, png);

  expect(await nativeError(page, "pick_source_directory", {}), "an unchosen dialog is unstubbed, not a silent cancel").toContain("unstubbed");
  await chooseSourceFolder(page, "/Users/probe/code/storefront");
  expect(await native(page, "pick_source_directory", {})).toBe("/Users/probe/code/storefront");
  await chooseSourceFolder(page, null);
  expect(await native(page, "pick_source_directory", {}), "a cancelled folder dialog answers nothing").toBeNull();

  await chooseSourceFiles(page, []);
  expect(await native(page, "pick_source_files", {}), "a cancelled file dialog answers no paths").toEqual([]);
  await chooseSourceFiles(page, [notes, wire]);
  const picked = await native<string[]>(page, "pick_source_files", {});
  expect(picked).toEqual([notes, wire]);

  const copy = (sourcePaths: string[], destination: string) =>
    native<{ pickedName: string; status: string; relativePath: string | null; reason: string | null }[]>(page, "import_source_files", {
      rootPath: ALPHA,
      sourcePaths,
      destination,
    });
  const first = await copy(picked, "planning");
  expect(first.map(({ pickedName, status, relativePath }) => [pickedName, status, relativePath])).toEqual([
    ["Checkout notes.md", "added", "planning/Checkout notes.md"],
    ["wire.png", "added", "planning/wire.png"],
  ]);
  expect(await readDesktopBytes(page, "planning/wire.png", ALPHA), "the image is copied byte for byte").toEqual([...png]);
  expect((await copy([notes], "planning"))[0].status, "bytes already there are not copied twice").toBe("duplicate");

  await addExternalFile(page, "/Users/probe/Other/Checkout notes.md", "# A different note with the same name\n");
  const renamed = await copy(["/Users/probe/Other/Checkout notes.md"], "planning");
  expect(renamed[0]).toMatchObject({ status: "renamed", relativePath: "planning/Checkout notes (2).md" });

  await addExternalFile(page, "/Users/probe/Other/tool.exe", "binary");
  expect((await copy(["/Users/probe/Other/tool.exe"], "planning"))[0]).toMatchObject({ status: "failed", reason: "unsupported-type" });
  expect((await copy(["/Users/probe/Other/missing.md"], "planning"))[0]).toMatchObject({ status: "failed" });

  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await listDesktopFiles(page, ALPHA), "the copies outlive a reload").toEqual([
    "planning/Checkout notes (2).md",
    "planning/Checkout notes.md",
    "planning/wire.png",
    "project.md",
  ]);
  expect(await native<string[]>(page, "pick_source_files", {}), "the chosen answers outlive a reload").toEqual([notes, wire]);
});

test("the Storefront and Atlas sample folders are served as the folder they are", async ({ page }) => {
  const storefront = storefrontFiles();
  const atlas = atlasSampleFiles();
  expect(Object.keys(storefront).length).toBeGreaterThan(5);
  expect(Object.keys(atlas).length).toBeGreaterThan(50);

  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true, folders: { [DESKTOP_VAULT_ROOT]: storefront, [BETA]: atlas } });
  await page.goto("/en/?guides=off", { waitUntil: "domcontentloaded" });
  expect(await listDesktopFiles(page, DESKTOP_VAULT_ROOT)).toEqual(Object.keys(storefront).sort());
  expect(await listDesktopFiles(page, BETA)).toEqual(Object.keys(atlas).sort());
});

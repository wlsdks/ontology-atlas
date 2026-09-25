import { expect, test, type Locator, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";
import { FIXTURE_VAULT } from "./fixture-vault";

/**
 * **A jump along one document's history keeps that document** (2026-09-25).
 *
 * Found with the real-bridge QA harness on a real git vault: in a step's detail, "Other steps that
 * changed this document" → a press on a step opened that step with its FIRST document selected,
 * because the jump cleared the focused concept. In a vault's first commit that is the vault guide,
 * and "Restore this version" there named and restored `README.md` — not the document the person
 * was following.
 *
 * What is measured is the promise, in the rendered page: after the jump the followed document is
 * the one selected (the pressed chip, or the open file row in the files lens), it is inside the
 * window, the restore door names that file, and the native restore command is sent that path and
 * nothing else.
 *
 * The import step here holds every fixture document plus eighty source notes, so its file list
 * runs far past the window — a followed file at the end of it is only on screen if the jump
 * brings it there.
 */

type Entry = { path: string; status: string; kind: string | null; slug: string; renamedFrom: null };

const entry = (path: string, status: string, text?: string): Entry => ({
  path,
  status,
  kind: text ? (/^kind: (\S+)$/m.exec(text)?.[1] ?? null) : null,
  slug: (text ? /^slug: (\S+)$/m.exec(text)?.[1] : null) ?? path.replace(/\.md$/, ""),
  renamedFrom: null,
});

const IMPORT_FILES: Entry[] = [
  ...Object.entries(FIXTURE_VAULT).map(([path, text]) => entry(path, "added", text)),
  ...Array.from({ length: 80 }, (_, i) => entry(`notes/source-${String(i + 1).padStart(2, "0")}.md`, "added")),
].sort((a, b) => (a.path < b.path ? -1 : 1));

const step = (n: number, subject: string, files: Entry[]) => ({
  shortHash: `e${n}00000`,
  hash: `e${n}${"0".repeat(38)}`,
  subject,
  relativeTime: `${n} days ago`,
  isoTime: new Date(Date.parse("2026-09-24T06:00:00.000Z") - n * 86_400_000).toISOString(),
  author: "stark",
  files,
});

const INVOICE = "capabilities/invoice.md";
const STOREFRONT = "storefront.md";
/** A body line only the storefront document carries: the reader reading it proves which one is open. */
const STOREFRONT_LINE = "세 도메인이 서로를 가로질러 참조하는 볼트다.";
// Newest first: a step that sharpened two documents, then the import that added every document.
const NEWER = step(1, "docs: say what an invoice and the storefront carry", [
  entry(INVOICE, "modified", FIXTURE_VAULT[INVOICE]),
  entry(STOREFRONT, "modified", FIXTURE_VAULT[STOREFRONT]),
]);
const IMPORT = step(2, "docs: import the storefront vault", IMPORT_FILES);

/** Each document reads back as itself, so the reader's title proves which one is open. */
const documentDiffs = Object.fromEntries(
  Object.entries(FIXTURE_VAULT).map(([path, text]) => [
    path,
    [
      `diff --git a/${path} b/${path}`,
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -1,${text.split("\n").length} +1,${text.split("\n").length} @@`,
      ...text.split("\n").map((line) => ` ${line}`),
      "",
    ].join("\n"),
  ]),
);

async function openStep(page: Page) {
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page, {}, undefined, {
    commits: [NEWER, IMPORT],
    scopeHistoryByPath: true,
    documentDiffs,
  });
  // After the runtime's own script, so it wraps that `invoke`: the restore command is answered
  // here and every call it receives is kept — the gate is what the screen asked git to put back,
  // not what the screen said.
  await page.addInitScript(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
      __restoreCalls: Record<string, unknown>[];
    };
    w.__restoreCalls = [];
    const invoke = w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
    w.__TAURI_INTERNALS__.invoke = (command, args = {}) => {
      if (command !== "git_restore_file") return invoke(command, args);
      w.__restoreCalls.push(args);
      return Promise.resolve({ restored: true, path: args.relativePath, source: args.source, previousStatus: null });
    };
  });
  await mountDesktopVault(page);
  await page.getByTestId("app-nav-rail-item-git").click();
  const rows = page.getByTestId("atlas-git-history-item");
  await expect(rows).toHaveCount(2, { timeout: 60_000 });
  await rows.first().click();
  await expect(page.getByTestId("atlas-git-detail-headline")).toContainText("Say what an invoice and the storefront carry");
}

/** The element's centre lies inside the scrolling evidence column and inside the window. */
async function inView(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const column = el.closest('[data-testid="atlas-git-evidence"]')?.getBoundingClientRect();
    const middle = box.top + box.height / 2;
    return box.height > 0 && middle >= Math.max(column?.top ?? 0, 0) && middle <= Math.min(column?.bottom ?? innerHeight, innerHeight);
  });
}

async function restoreCalls(page: Page) {
  return page.evaluate(() => (window as unknown as { __restoreCalls: Record<string, unknown>[] }).__restoreCalls);
}

async function jumpToImport(page: Page) {
  const history = page.getByTestId("atlas-git-document-history");
  await expect(history.getByTestId("atlas-git-document-step")).toHaveCount(1);
  await history.getByTestId("atlas-git-document-step").click();
  await expect(page.getByTestId("atlas-git-history-item").nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("atlas-git-detail-headline")).toContainText("Import the storefront vault");
}

async function restoreFromDoor(page: Page, path: string) {
  const door = page.getByTestId("atlas-git-restore");
  await expect(door, "the restore door does not name the file it puts back").toContainText(path);
  await door.click();
  await expect(page.getByTestId("atlas-git-restore-step")).toContainText(path);
  await page.getByTestId("atlas-git-restore-confirm").click();
  await expect.poll(() => restoreCalls(page)).toHaveLength(1);
  expect((await restoreCalls(page))[0]).toMatchObject({ relativePath: path, source: IMPORT.hash });
}

test("concepts lens: a jump to the document's older step keeps its concept pressed and restores that document", async ({ page }) => {
  await openStep(page);
  const invoiceChip = page.getByTestId("atlas-git-concept-chip").filter({ hasText: /^청구서 발행$/ });
  await invoiceChip.click();
  await jumpToImport(page);

  // The import names every fixture concept, the project first; the one being followed is still
  // the pressed one.
  await expect.poll(() => page.getByTestId("atlas-git-concept-chip").count()).toBeGreaterThan(10);
  await expect(invoiceChip).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-testid="atlas-git-concept-chip"][aria-checked="true"]')).toHaveCount(1);
  expect(await inView(invoiceChip), "the followed chip is not in the window").toBe(true);

  await restoreFromDoor(page, INVOICE);
});

test("files lens: a jump keeps the same file open, brings its row into the window, and restores that file", async ({ page }) => {
  await openStep(page);
  await page.getByTestId("atlas-git-lens-files").click();
  await page.getByTestId("atlas-git-commit-file").filter({ hasText: STOREFRONT }).click();
  await expect(page.getByTestId("atlas-git-commit-diff")).toContainText(STOREFRONT_LINE);
  await jumpToImport(page);

  await expect(page.getByTestId("atlas-git-lens-files")).toHaveAttribute("aria-selected", "true");
  const open = page.locator('[data-testid="atlas-git-commit-file"][aria-current="true"]');
  await expect(open).toHaveCount(1);
  await expect(open).toContainText(STOREFRONT);
  // The storefront document sorts last among a hundred-odd rows; it is on screen only because the
  // jump brought it there.
  expect(await inView(open), "the followed file's row is not in the window").toBe(true);
  await expect(page.getByTestId("atlas-git-commit-diff")).toContainText(STOREFRONT_LINE);

  await restoreFromDoor(page, STOREFRONT);
});

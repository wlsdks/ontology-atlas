import { expect, test } from "@playwright/test";

import {
  installDesktopRailRuntime,
  mountDesktopVault,
  readDesktopBytes,
  readDesktopFile,
} from "../desktop-rail-arrival-harness";

const LEGACY = "capabilities/legacy.md";

function capability(slug: string, uid: string, extra: string[] = []): string {
  return ["---", "kind: capability", `slug: capabilities/${slug}`, `title: ${slug}`, `uid: ${uid}`, ...extra, "---", "", `# ${slug}`, ""].join("\n");
}

const VAULT = {
  "project.md": ["---", "kind: project", "slug: shop", "title: Shop", "uid: 11111111-1111-4111-8111-111111111111", "---", "", "# Shop", ""].join("\n"),
  "capabilities/x.md": capability("x", "22222222-2222-4222-8222-222222222222"),
  // Sorted after the legacy note, so its rewrite on disk says the backlink pass has passed that note.
  "capabilities/notes.md": capability("notes", "33333333-3333-4333-8333-333333333333", ["dependencies:", "  - capabilities/x"]),
};

/** ASCII frontmatter naming `capabilities/x`, then a body in EUC-KR: two bytes that are not UTF-8. */
const LEGACY_BYTES = [
  ...new TextEncoder().encode(
    ["---", "kind: capability", "slug: capabilities/legacy", "title: legacy", "uid: 44444444-4444-4444-8444-444444444444", "dependencies:", "  - capabilities/x", "---", "", ""].join("\n"),
  ),
  0xb0,
  0xe1,
  0x0a,
];

test("renaming a concept leaves the bytes of a note that is not UTF-8 as they were", async ({ page }) => {
  await installDesktopRailRuntime(page, VAULT, undefined, {
    replaceFixture: true,
    writable: true,
    binaryFiles: { [LEGACY]: LEGACY_BYTES },
  });
  await mountDesktopVault(page, "en");
  await page.goto("/en/docs/?guides=off&slug=capabilities%2Fx");
  await expect(page.getByTestId("docs-editor-path")).toHaveText("capabilities/x.md", { timeout: 20_000 });

  await page.getByTestId("docs-file-rename").click();
  await page.getByTestId("docs-rename-input").fill("y");
  await page.getByTestId("docs-rename-confirm").click();
  await expect(page.getByTestId("docs-rename-dialog")).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => readDesktopFile(page, "capabilities/notes.md")).toContain("capabilities/y");

  expect(await readDesktopBytes(page, LEGACY), "the note that is not UTF-8 keeps its bytes").toEqual(LEGACY_BYTES);
});

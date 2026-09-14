import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installLibraryWorkHarness } from "./library-work-harness";
import { parseFrontmatter } from '../../src/shared/lib/parse-frontmatter';

const SOURCE = "sources/room-capacity.md";
const ORIGINAL = "The room allows 24 participants.\n";
const REVISED = "The room now allows 18 participants, replacing the previous limit of 24.\n";
const ORIGINAL_PAGE = [
  "---", "title: Room capacity", "created_by: agent:claude-code",
  "compiled_at: 2026-09-08T00:00:00Z", "sources:", `  - ${SOURCE}`,
  "source_hash:", `  ${SOURCE}: ${createHash("sha256").update(ORIGINAL).digest("hex")}`,
  "status: draft", "summary: Room capacity.", "---", "",
  "## Summary", "", "The room allows 24 participants.", "",
  "## Facts", "", `- The room allows 24 participants. [[src:${SOURCE}#l1]]`, "",
  "## Decisions", "", "## Open questions", "", "## Not in sources", "",
].join("\n");

test("filing a retained answer preserves unmeasured evidence and the outstanding source revision; Undo restores the answer", async ({ page }) => {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, { files: {
    "project.md": "---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n",
    [SOURCE]: ORIGINAL,
    "wiki/room.md": ORIGINAL_PAGE,
  } });
  await page.goto("/en/docs/");
  await page.getByRole("button", { name: /Open my folder/i }).click();
  await page.getByRole("heading", { name: "Map", level: 1 }).waitFor();
  await page.getByTestId("app-nav-rail-item-library").click();
  const sourceRow = page.getByTestId(`library-source-${SOURCE}`);
  await expect(sourceRow.getByTestId("library-source-state-compiled")).toHaveCount(1);

  await page.getByTestId("library-workspace-wiki").click();
  await page.getByTestId("library-wiki-wiki/room").click();
  const paragraph = page.getByTestId("library-reading-pane").locator("p").filter({ hasText: ORIGINAL.trim() }).first();
  await expect(paragraph).toBeVisible();
  const box = (await paragraph.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("library-selection-ask")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("library-ask-evidence").click();
  await expect(page.getByTestId("library-agent-dock")).toHaveAttribute("data-agent-request-kind", "ask");
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === "session/prompt")).toBe(true);
  await harness.answer(page, `${ORIGINAL.trim()} [[src:${SOURCE}#l1]]`);
  await expect(page.getByTestId("library-file-answer")).toBeVisible();

  // This happens after the answer, through the same file/watch path as any source edit.
  await harness.mutateSource(page, SOURCE, REVISED);
  await expect(page.getByTestId("library-wiki-wiki/room")).toHaveAttribute("title", /changed/i);
  await page.getByTestId("library-file-answer").click();
  await expect.poll(async () => Object.keys((await harness.snapshot(page)).files).filter((path) => path.startsWith("wiki/answers/"))).toHaveLength(1);
  const filed = await harness.snapshot(page);
  const answerPath = Object.keys(filed.files).find((path) => path.startsWith("wiki/answers/"))!;
  expect(filed.files[answerPath]).toContain(`${SOURCE}: unmeasured`);
  expect(filed.files[answerPath]).toContain(`${ORIGINAL.trim()} [[src:${SOURCE}#l1]]`);
  const retained = parseFrontmatter(filed.files[answerPath]).frontmatter;
  expect(retained.source_hash).toEqual({ [SOURCE]: 'unmeasured' });
  expect(retained.answer_source_observations).toEqual({ [SOURCE]: createHash("sha256").update(REVISED).digest("hex") });
  expect(filed.files["wiki/room.md"]).toBe(ORIGINAL_PAGE);
  expect(filed.files[SOURCE]).toBe(REVISED);

  if (!(await page.getByTestId("library-workspace-sources").isVisible())) {
    await page.getByTestId("library-index-tab").click();
  }
  await page.getByTestId("library-workspace-sources").click();
  await expect(sourceRow.getByTestId("library-source-state-compiled")).toHaveCount(0);
  await expect(sourceRow).toHaveAttribute("title", /different version|recorded no hash/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => answerPath in (await harness.snapshot(page)).files).toBe(false);
  await expect(page.getByTestId("library-file-answer")).toBeVisible();
  const undone = await harness.snapshot(page);
  expect(undone.files["wiki/room.md"]).toBe(ORIGINAL_PAGE);
  expect(undone.files[SOURCE]).toBe(REVISED);
});

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installLibraryWorkHarness } from "./library-work-harness";

const SOURCE = "# Release decision\n\nRelease is September 22, approved by Mira on September 10.\n";
const HASH = createHash("sha256").update(SOURCE).digest("hex");
const existingPath = "wiki/research/release-date.md";
const READ_RECEIPT_PLACEHOLDER = "__ATLAS_READ_RECEIPT__";
const page = (title: string, hash: string, value: string) => `---\ntitle: ${title}\ncreated_by: agent:claude\ncompiled_at: 2026-09-01T00:00:00Z\nsources:\n  - sources/release.md\nsource_hash:\n  sources/release.md: ${hash}\nstatus: draft\nsummary: Release timing.\n---\n\n## Summary\n\n${value}\n\n## Facts\n\n- ${value} [[src:sources/release.md#p2]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n`;
const call = (id: string, name: string, args: unknown) => JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: "", tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });
const captureEvidence = async (browser: import("@playwright/test").Page, name: string) => {
  const directory = process.env.ATLAS_INCREMENTAL_EVIDENCE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  await browser.screenshot({ path: directory + "/" + name + ".png", animations: "disabled" });
  writeFileSync(directory + "/" + name + "-ax.txt", await browser.locator("body").ariaSnapshot());
};

test("a current source write-up revises an outdated related page; approval updates its existing path", async ({ page: browser }) => {
  await seedFirstRunSeen(browser);
  const oldPage = page("Release research", "unmeasured", "Release is September 15.");
  const currentPage = page("Release decision", HASH, "Release is September 22.");
  const harness = await installLibraryWorkHarness(browser, {
    files: { "sources/release.md": SOURCE, "wiki/release.md": currentPage, [existingPath]: oldPage },
    localResponses: [
      call("r1", "read_source_text", { path: "sources/release.md" }),
      call("r2", "read_wiki_page", { slug: "wiki/research/release-date" }),
      call("p1", "propose_wiki_page", { slug: "wiki/research/release-date", title: "Release research", summary: "The updated release date.", overview: ["The dated approval moved the release."], facts: ["Release is September 22. [[src:sources/release.md#p2]]"], decisions: ["Mira approved it on September 10. [[src:sources/release.md#p2]]"], open_questions: [], not_in_sources: [], receipt: READ_RECEIPT_PLACEHOLDER }),
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Revised answer proposed." } }] }),
    ],
  });
  await browser.goto("/en/docs/?guides=off");
  await browser.getByRole("button", { name: /Open my folder/i }).click();
  await browser.getByTestId("app-nav-rail-item-library").click();
  await browser.getByTestId("library-index-segment-wiki").click();
  /*
   * ⚠️ **The waiting line left the index's foot on 2026-09-12** (owner: *"written like
   * this, who is ever going to look at it?"*). The home is the folder's graph, and this
   * sentence is under the press it is about — one press from the strip clause that names
   * the file Compile would start on. Escape closes the popover so the rest of the walk
   * begins from the home, as it did before.
   */
  await browser.getByTestId("library-strip-compile").click();
  await expect(browser.getByText("1 existing page needs rechecking", { exact: false }).first()).toBeVisible();
  await browser.keyboard.press("Escape");
  await expect(browser.getByTestId("library-compile")).toBeEnabled();
  // Begin from the old related page, where the local review used to remain hidden.
  await browser.getByRole("button", { name: /Release research/ }).first().click();
  await captureEvidence(browser, "01-before-compile");
  await browser.getByTestId("library-compile").click();
  const card = browser.getByTestId("library-local-compile-card");
  await expect(card).toBeVisible();
  await expect(browser.getByTestId("library-work-current")).toContainText("wiki/research/release-date");
  await expect(card).toContainText(existingPath);
  await expect(card.getByTestId("library-local-compile-preview")).toContainText("Release is September 22.");
  await captureEvidence(browser, "02-ready-proposal");
  await browser.getByRole("radio", { name: "Previous page" }).click();
  await expect(card.getByTestId("library-local-compile-preview")).toContainText("Release is September 15.");
  await browser.getByRole("radio", { name: "Proposed page" }).click();
  await expect(card.getByTestId("library-local-compile-preview")).toContainText("Release is September 22.");
  expect((await harness.snapshot(browser)).files[existingPath]).toBe(oldPage);
  await browser.getByTestId("library-local-compile-allow").click();
  await expect(browser.getByTestId("library-local-compile-written")).toBeVisible();
  /* And the sentence is gone from the one surface that prints it: the local review holds
     the pane, so the strip's clause — and with it the popover — is not drawn at all. */
  await expect(browser.getByText("1 existing page needs rechecking", { exact: false })).toHaveCount(0);
  await expect(browser.getByTestId("library-strip-compile")).toHaveCount(0);
  const saved = await harness.snapshot(browser);
  const sourceResult = saved.calls.filter((entry) => entry.method === "llm_chat")
    .flatMap((entry) => JSON.parse(String((entry.params as { body: string }).body)).messages)
    .find((message: { role: string; content: string }) => message.role === "tool" && message.content.includes('"relatedPages"'));
  expect(sourceResult).toBeDefined();
  const related = JSON.parse(sourceResult.content).relatedPages;
  expect(related.searchedPages).toBe(2);
  expect(related.fullTextPages).toBe(2);
  expect(related.candidates.map((candidate: { slug: string }) => candidate.slug)).toContain("wiki/research/release-date");
  expect(saved.files[existingPath]).toContain("Release is September 22.");
  expect(saved.files[existingPath]).toContain(HASH);
  expect(saved.files["wiki/release.md"]).toBe(currentPage);
  expect(saved.writes.filter((entry) => entry.relativePath === existingPath)).toHaveLength(1);
  expect(Object.keys(saved.files).filter((path) => path.startsWith("wiki/") && !path.includes("/_")).sort()).toEqual([existingPath, "wiki/release.md"].sort());
  await browser.getByTestId("library-reader-back").click();
  await browser.getByRole("button", { name: /Release research/ }).first().click();
  await expect(browser.getByText("Release is September 22.", { exact: false }).last()).toBeVisible();
});

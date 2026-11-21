import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import { installLibraryWorkHarness, type LibraryWorkHarness } from "../../library-work-harness";

/*
 * Every Compile door sends what it names, through the real brief and the real ACP prompt: the band
 * names the next ten, a source's own door names that source. Sixteen waiting sources, in list order.
 */
const NAMED = Array.from({ length: 16 }, (_, index) => `sources/doc-${String(index + 1).padStart(2, "0")}.md`);
const FILES: Record<string, string> = {
  "project.md": "---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n",
  ...Object.fromEntries(NAMED.map((path, index) => [path, `# Document ${index + 1}\n\nBody ${index + 1}.\n`])),
};

async function openSources(page: Page): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, { files: FILES });
  await page.goto("/en/");
  await page.getByRole("button", { name: /Open (?:a|my) folder/i }).click();
  await page.getByRole("heading", { name: "Map" }).waitFor();
  await page.goto("/en/library/?guides=off&e2e=1");
  await page.getByTestId("library-workspace-sources").click();
  return harness;
}

/** The text of the first `session/prompt` the agent received. */
async function promptSent(page: Page, harness: LibraryWorkHarness): Promise<string> {
  await expect
    .poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === "session/prompt"), { timeout: 30_000 })
    .toBe(true);
  const call = (await harness.snapshot(page)).calls.find((entry) => entry.method === "session/prompt");
  return JSON.stringify(call?.params ?? null);
}

test.describe("a Compile door sends exactly the sources it names", () => {
  test("the band's press sends the next ten, and the vault log records those ten", async ({ page }) => {
    const harness = await openSources(page);
    const band = page.getByTestId("library-progress");
    await expect(band.getByTestId("library-progress-continue")).toHaveText("Write wiki pages for the next 10");
    await expect(page.getByTestId("sources-panel-foot")).toHaveText("6 more wait after these.");
    await band.getByTestId("library-progress-continue").click();

    const prompt = await promptSent(page, harness);
    for (const path of NAMED.slice(0, 10)) expect(prompt, path).toContain(path);
    for (const path of NAMED.slice(10)) expect(prompt, path).not.toContain(path);
    await expect(page.getByTestId("library-source-list").getByTestId("library-source-running-running")).toHaveCount(10);

    // A turn that completes writes the log line; one write under Allow once is enough for that.
    await harness.read(page);
    await harness.wait(page);
    await page.getByTestId("acp-permission-allow").click();
    await harness.write(page);
    await expect.poll(async () => (await harness.snapshot(page)).writes.some((write) => write.relativePath === "wiki/architecture.md")).toBe(true);
    await harness.finish(page);
    await expect.poll(async () => (await harness.snapshot(page)).files["wiki/_log.md"] ?? "", { timeout: 30_000 }).toContain("compile |");
    const log = (await harness.snapshot(page)).files["wiki/_log.md"]!;
    for (const path of NAMED.slice(0, 10)) expect(log, path).toContain(path);
    for (const path of NAMED.slice(10)) expect(log, path).not.toContain(path);
  });

  test("a source's own Write wiki page sends that source alone", async ({ page }) => {
    const harness = await openSources(page);
    // The twelfth source is outside the band's next ten.
    await page.getByTestId("library-source-list").getByRole("button", { name: /^doc-12\.md/ }).click();
    await page.getByTestId("library-source-compile").click();

    const prompt = await promptSent(page, harness);
    expect(prompt).toContain("sources/doc-12.md");
    for (const path of NAMED.filter((path) => path !== "sources/doc-12.md")) expect(prompt, path).not.toContain(path);
  });
});

import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Select a passage, ask the agent about it.**
 *
 * Owner direction 2026-09-07: dragging over a sentence in a wiki page offers a question at
 * once. This spec proves the bar appears only after a selection inside the page body, stands
 * above it, and that pressing a question reaches the docked agent with an
 * `ask` request. The brief's wording is `ask-brief.test.ts`'s to pin; the popover's own
 * keyboard path is `SelectionAsk.test.tsx`'s.
 *
 * (Harness shared with `library-lint-dock.spec.ts`: the desktop bridge is stubbed because
 * the app is a WKWebView running this same static export.)
 *
 * Original note of the harness:
 *
 * The second door beside Compile (2026-09-06). It reads `wiki/` and reports; it writes
 * nothing, so it does not wait on an uncompiled source — it waits on there being two
 * pages, because one page has nothing to disagree with. This spec proves the chip is
 * offered under the same runtime conditions as Compile, is disabled with one page and
 * enabled with two, and that pressing it reaches the dock with a `lint` request. The
 * brief's content is `lint-brief.test.ts`'s to pin.
 *
 * The desktop bridge is stubbed in the browser for the reason
 * `library-compile-dock.spec.ts` records: the app is a WKWebView running this same static
 * export, and the render boundary is what is being measured.
 */

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

const VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: launch", "title: Launch", "---", "", "# Launch", ""].join("\n"),
  "sources/architecture.docx": "PK architecture\n",
  "sources/release-dates.csv": "date,name\n2026-09-05,launch\n",
  // The app's own record of what happened; furniture like the template, read for the header line.
  "wiki/_log.md": "# Wiki log\n\n## [2026-09-06T09:05:00Z] compile | sources/architecture.docx → architecture (new) | agent:claude\n## [2026-09-06T09:40:00Z] lint | disagreement 0 · superseded 1 | agent:claude\n",
  // The shape `init` writes. It must not count as a page or open as one.
  "wiki/_template.md": "---\ntitle: <the page name>\ncreated_by: agent:claude\ncompiled_at: 2026-01-01T00:00:00Z\nsources:\n  - sources/<file>\nsource_hash:\n  sources/<file>: <sha256>\nstatus: draft\nsummary: <one sentence>\n---\n\n## Summary\n\n<x>\n\n## Facts\n\n- <c> [[src:sources/<file>#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
  "wiki/architecture.md": "---\ntitle: Architecture\ncreated_by: agent:claude\ncompiled_at: 2026-09-06T10:00:00Z\nsources:\n  - sources/architecture.docx\nsource_hash:\n  sources/architecture.docx: 3b1f0a00000000000000000000000000000000000000000000000000000000ab\nstatus: draft\nsummary: Architecture.\n---\n\n## Summary\n\nArchitecture. See [[wiki/release-dates]].\n\n## Facts\n\n- A fact. [[src:sources/architecture.docx#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
  "wiki/release-dates.md": "---\ntitle: Release dates\ncreated_by: agent:claude\ncompiled_at: 2026-09-06T10:00:00Z\nsources:\n  - sources/release-dates.csv\nsource_hash:\n  sources/release-dates.csv: 3b1f0a00000000000000000000000000000000000000000000000000000000ab\nstatus: draft\nsummary: Release dates.\n---\n\n## Summary\n\nRelease dates.\n\n## Facts\n\n- A fact. [[src:sources/release-dates.csv#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
};

/** One ready, verified, config-isolated runtime — the only kind in-app chat may open. */
const RUNTIME = {
  id: "claude-code",
  label: "Claude Agent",
  description: "",
  website: null,
  license: null,
  verified: true,
  icon: null,
  brandInk: null,
  launchKind: "npx",
  state: "ready",
  cliPath: "/opt/homebrew/bin/claude",
  adapterPath: null,
  adapterPackage: "@agentclientprotocol/claude-agent-acp",
  isolated: true,
};

/**
 * A small in-memory stand-in for the Rust side.
 *
 * With the runtime signal injected, Docs takes the **app's** folder path: the native
 * picker, then `TauriDirectoryHandle`, which reads every entry over `invoke`. Stubbing
 * `showDirectoryPicker` would therefore prove nothing — that door is not the one the app
 * walks through. So the commands the walk actually calls are answered from a map, which
 * exercises the real handle, the real walk, and the real library model.
 *
 * Everything downstream of the dock stays with installed-app measurement: the adapter
 * launch, the turn, and the writes. `acp_start` is deliberately left unanswered, so a
 * failure there cannot be mistaken for the dock appearing.
 */
async function installDesktopBridge(page: Page) {
  await page.addInitScript(
    ({ files, runtime, rootPath }) => {
      const MTIME = 1_757_000_000_000;
      const encoder = new TextEncoder();

      const listDirectory = (relative: string) => {
        const prefix = relative ? `${relative}/` : "";
        const seen = new Map<string, "file" | "directory">();
        for (const path of Object.keys(files)) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          if (!rest) continue;
          const slash = rest.indexOf("/");
          if (slash < 0) seen.set(rest, "file");
          else seen.set(rest.slice(0, slash), "directory");
        }
        return [...seen].map(([name, kind]) => ({ name, kind }));
      };

      const answer = (command: string, args: Record<string, unknown> = {}): unknown => {
        const relative = String(args.relativePath ?? "");
        switch (command) {
          case "pick_vault_directory":
            return rootPath;
          case "list_vault_directory":
            return listDirectory(relative);
          case "vault_path_exists":
            if (args.kind === "directory") {
              // The root itself is a directory. Without this the restore decides the
              // folder vanished and drops straight back to the first-run card.
              return relative === "" || Object.keys(files).some((path) => path.startsWith(`${relative}/`));
            }
            return relative in files;
          case "read_vault_text_file":
            if (!(relative in files)) throw new Error(`missing ${relative}`);
            return { text: files[relative], lastModified: MTIME };
          case "read_vault_binary_file":
            if (!(relative in files)) throw new Error(`missing ${relative}`);
            return { bytes: [...encoder.encode(files[relative])], lastModified: MTIME };
          case "write_vault_text_file":
            files[relative] = String(args.content ?? "");
            return null;
          case "ensure_vault_directory":
            return null;
          case "vault_fingerprint":
            // Same rule the two walks share: Markdown, images, and everything under
            // `sources/`, by path, mtime and size — never content.
            return {
              entries: Object.entries(files)
                .filter(([path]) => path.endsWith(".md") || path.startsWith("sources/"))
                .map(([path, body]) => ({
                  relativePath: path,
                  lastModified: MTIME,
                  size: encoder.encode(body).length,
                })),
              truncated: false,
              prunedDirs: [],
            };
          case "hash_vault_files":
            return (args.relativePaths as string[]).map((relativePath) => ({
              relativePath,
              sha256: null,
            }));
          case "acp_detect_runtimes":
            return [runtime];
          case "mcp_bundled_server":
            return { path: "/Applications/Ontology Atlas.app/mcp", available: true, reason: null };
          case "discover_source_candidates":
            return { candidates: [], truncated: false, unreadableRoots: [] };
          case "discover_mcp_connectors":
            return { servers: [], problems: [] };
          case "start_vault_watch":
            return null;
          default:
            return undefined;
        }
      };

      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
        transformCallback: (cb: unknown) => cb,
        invoke: (command: string, args?: Record<string, unknown>) => {
          try {
            const value = answer(command, args ?? {});
            return value === undefined
              ? Promise.reject(new Error(`no stub for ${command}`))
              : Promise.resolve(value);
          } catch (error) {
            return Promise.reject(error);
          }
        },
      };
      (window as unknown as { isTauri?: boolean }).isTauri = true;
    },
    { files: { ...VAULT }, runtime: RUNTIME, rootPath: VAULT_ROOT },
  );
}

/**
 * With the runtime signal injected, Docs opens on the installed app's own first screen —
 * "Open a folder to start working" — rather than the read-only sample. Its middle door
 * calls the native picker, which the stub answers with an absolute path.
 *
 * ⚠️ **The folder is still opened from Docs, and that is deliberate.** The Library moved
 * to its own destination on 2026-09-06, but the app's first-run card lives on the docs
 * intent, and this spec's subject is the dock rather than the picker. Walking in the way a
 * person does — open the folder, then cross the rail — also proves the rail tile reaches
 * the new destination with the session's folder still attached.
 */
async function openFolder(page: Page) {
  await page.goto("/en/docs/");
  await page.waitForLoadState("networkidle");
  const door = page.getByRole("button", { name: /^Open my folder/ });
  await door.first().waitFor({ timeout: 25_000 });
  await door.first().click();
  // Opening a folder from the first-run card lands on the map, which is where a person
  // who just chose one wants to be. The Library is one press away, so the spec crosses
  // rather than pretending the card stays put.
  await page.getByRole("heading", { name: "Map", level: 1 }).waitFor({ timeout: 30_000 });
  // Walk back the way a person would, rather than reloading: the rail link keeps the
  // open folder in the session instead of asking the restore to find it again.
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "Library" }).click();
  await page.getByTestId("library-sources").waitFor({ timeout: 30_000 });
  // The index is a switch since 2026-09-07: the wiki rows exist only on the Wiki half.
  await page.getByTestId("library-workspace-wiki").click();
  await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });
}

test.describe("Select a passage, ask the agent", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page);
  });

  test("a selection inside the page raises the bar; a question sends an ask request to the dock", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-wiki-wiki/architecture").click();
    await page.getByTestId("library-reading-pane").waitFor({ timeout: 25_000 });
    await expect(page.getByTestId("library-selection-ask")).toHaveCount(0);

    // Select a sentence of the page body the way a drag would leave it, then release.
    const pane = page.getByTestId("library-reading-pane");
    const paragraph = pane.locator("p").filter({ hasText: /./ }).last();
    await paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await paragraph.dispatchEvent("mouseup");
    // The bar stands on screen, just above the first selected line, with its questions.
    const bar = page.getByRole("complementary", { name: "Ask the agent about the selected passage" });
    await expect(bar).toBeVisible({ timeout: 5_000 });
    await expect(bar).toBeInViewport();
    const [textBox, barBox] = await Promise.all([paragraph.boundingBox(), bar.boundingBox()]);
    // A bar measured from the wrong box sat a pane height below the text in the installed
    // app and was never seen; a bar under the text covered three lines of it.
    expect(textBox!.y - (barBox!.y + barBox!.height)).toBeGreaterThanOrEqual(0);
    expect(textBox!.y - (barBox!.y + barBox!.height)).toBeLessThan(24);
    await page.getByTestId("library-ask-evidence").click();
    const dock = page.getByTestId("library-agent-dock");
    await expect(dock).toBeVisible({ timeout: 25_000 });
    await expect(dock).toHaveAttribute("data-agent-request-kind", "ask");
    await expect(page.getByTestId("library-selection-ask")).toHaveCount(0);
  });
  test("the bar has its own ground and the rest of the page steps back while a passage is selected", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-wiki-wiki/architecture").click();
    const pane = page.getByTestId("library-reading-pane");
    await pane.waitFor({ timeout: 25_000 });
    const paragraph = pane.locator("p").filter({ hasText: /Architecture\. See/ }).last();
    const fact = pane.locator("li").filter({ hasText: /A fact/ }).first();
    const inkBefore = await fact.evaluate((el) => getComputedStyle(el).color);
    // A real drag over the sentence, the way a person selects it.
    const box = (await paragraph.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const bar = page.getByRole("complementary", { name: "Ask the agent about the selected passage" });
    await expect(bar).toBeVisible();
    // The bar has its own ground, so the line under it cannot show through its labels.
    const barBg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(barBg).not.toMatch(/rgba\(\d+, \d+, \d+, 0\)/);
    // Lines outside the selection are dimmed; the bar's own labels are not.
    const inkDuring = await fact.evaluate((el) => getComputedStyle(el).color);
    expect(inkDuring).not.toBe(inkBefore);
    const questionInk = await page.getByTestId("library-ask-evidence").evaluate((el) => getComputedStyle(el).color);
    expect(questionInk).not.toBe(inkDuring);
    // The whole row stays inside the reading pane, whatever the selection's x.
    const [paneBox, barBox] = await Promise.all([pane.boundingBox(), bar.boundingBox()]);
    expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(paneBox!.x + paneBox!.width);
    // The person's own question opens an input in the same row and sends on Enter.
    await page.getByTestId("library-ask-own").click();
    await expect(page.getByTestId("library-ask-custom")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(bar).toHaveCount(0);
    // Escape spent on the bar leaves the document open: the page's own Escape (back to the
    // shelf) yields to a key that was already default-prevented.
    await expect(page.getByTestId("library-reading-pane")).toBeVisible();
    await expect.poll(() => fact.evaluate((el) => getComputedStyle(el).color)).toBe(inkBefore);
    await paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await paragraph.dispatchEvent("mouseup");
    await expect(bar).toBeVisible();
    // A click on the shelf, outside the page, collapses the selection and restores the page.
    await page.getByTestId("library-wiki").click({ position: { x: 4, y: 4 } });
    await expect(bar).toHaveCount(0);
    await expect.poll(() => fact.evaluate((el) => getComputedStyle(el).color)).toBe(inkBefore);
  });
});

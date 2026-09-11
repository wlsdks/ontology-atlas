import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Check the wiki opens the same dock, carrying a lint request.**
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
  /*
   * Check the wiki and Compile are the Wiki half's own doors since 2026-09-07: the index
   * draws one list at a time and the switch decides which. The column opens on Sources —
   * the first half of the work — so a spec about the wiki's doors presses the switch, the
   * same press a person makes.
   */
  await page.getByTestId("library-index-segment-wiki").click();
  await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });
}

test.describe("Check the wiki opens the agent dock", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page);
  });

  test("the chip stands beside Compile and is enabled once two pages exist", async ({ page }) => {
    await openFolder(page);
    const lint = page.getByTestId("library-lint");
    await expect(lint).toBeVisible({ timeout: 25_000 });
    await expect(lint).toBeEnabled();
    await expect(page.getByTestId("library-compile")).toBeVisible();
    // The shipped template is in the folder and is not a page: two rows, and the reader
    // opens a real page rather than "<the page name>" (installed app, 2026-09-06).
    await expect(page.getByTestId("library-wiki")).not.toContainText("<the page name>");
    await expect(page.getByTestId("library-wiki")).not.toContainText("Wiki log");
    await expect(page.getByTestId("library-index-segment")).toContainText("Wiki 2");
    // With nothing selected the pane is the graph (2026-09-06, third pass), so no page
    // heading is on screen here; the list above already proves the template is not a row.
    /*
     * Reading before writing — but the two doors no longer share a row (2026-09-12).
     * They wear the plain-language names the owner asked for, and at 11px
     * `Ask the agent to compile` needs about 119px of the 125px half a 255px column
     * leaves, so it truncated mid-word. Each takes the full row instead, and both fill
     * the column exactly (`docs/DESIGN-SYSTEM.md`, "Control groups fill their column").
     * The order that carried the meaning is now vertical, and the width is the assertion
     * that the group fills its column.
     */
    const [lintBox, compileBox, fieldBox] = await Promise.all([
      lint.boundingBox(),
      page.getByTestId("library-compile").boundingBox(),
      page.getByTestId("library-search").boundingBox(),
    ]);
    expect(lintBox!.y, "reading stands above writing").toBeLessThan(compileBox!.y);
    expect(Math.abs(lintBox!.x - compileBox!.x), "the two doors share a left edge").toBeLessThan(1);
    for (const box of [lintBox!, compileBox!]) {
      expect(Math.abs(box.x - fieldBox!.x), "a door starts where the search field does").toBeLessThan(1);
      expect(
        Math.abs(box.x + box.width - (fieldBox!.x + fieldBox!.width)),
        "a door ends where the search field does",
      ).toBeLessThan(1);
    }
    // The app's own record of the last check is read back on the Check results page in the
    // pane, opened from the chip beside the status strip (owner, 2026-09-07: the column is an
    // index); nothing about it stands in the column.
    await expect(page.getByTestId("library-wiki-log")).toHaveCount(0);
    await page.getByTestId("library-open-report").click();
    await expect(page.getByTestId("library-check-report-when")).toContainText("superseded 1");
    await expect(page.getByTestId("library-check-report")).toBeVisible();
    await expect(page.getByTestId("library-reading-pane")).toHaveCount(0);
    // Back to the index the way a person goes: the switch is untouched by a page that is neither half.
    await page.getByTestId("library-index-segment-wiki").click();
    // At a phone's width the report (still open: the switch does not close a page) is one
    // column that never scrolls sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    const report = page.getByTestId("library-check-report");
    await expect(report).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = (await report.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    // At 320 (1280 at 400% zoom) the report and the Graph action are still hit-testable: an
    // `overflow-hidden` ancestor clips instead of scrolling, so `scrollWidth` alone stays
    // green over lost content (design-responsive, council 2026-09-07).
    await page.setViewportSize({ width: 320, height: 844 });
    for (const id of ["library-check-report", "library-graph-open"]) {
      const target = page.getByTestId(id);
      // The Graph action stays in the reader header at every width.
      await expect(target).toBeVisible();
      const rect = (await target.boundingBox())!;
      const hit = await page.evaluate(
        ([x, y, testId]) => document.elementFromPoint(x, y)?.closest(`[data-testid="${testId}"]`) !== null,
        [rect.x + rect.width / 2, rect.y + Math.min(rect.height / 2, 20), id] as const,
      );
      expect(hit, `${id} is under the pointer at 320`).toBe(true);
    }
  });

  test("pressing it opens the dock carrying a lint request", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-lint").click();
    const dock = page.getByTestId("library-agent-dock");
    await expect(dock).toBeVisible({ timeout: 25_000 });
    await expect(dock).toHaveAttribute("data-agent-request-kind", "lint");
    await expect(dock).toContainText(RUNTIME.label);
  });

  test("the keyboard opens it too", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-lint").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-agent-dock")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("library-agent-dock")).toHaveAttribute("data-agent-request-kind", "lint");
  });
});

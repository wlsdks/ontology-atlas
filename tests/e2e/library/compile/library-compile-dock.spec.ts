import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";

/**
 * The dock must have a real rect inside the same row as `<main>`: `toBeVisible()` alone passes on a
 * collapsed frame. The desktop bridge is stubbed because the app runs this same static export.
 */

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

const VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: launch", "title: Launch", "---", "", "# Launch", ""].join("\n"),
  "sources/architecture.docx": "PK architecture\n",
  "sources/design-system.pdf": "%PDF-1.7 design system\n",
  "sources/features.html": "<html>features</html>\n",
  "sources/release-dates.csv": "date,name\n2026-09-05,launch\n",
  "wiki/notes.md": "---\ntitle: Reader notes\ncreated_by: human\nsources: []\nstatus: draft\n---\n\n## Summary\n\nNotes to read while the four sources await write-ups.\n\n## Facts\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
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
      const stampedBytes = (text: string) => {
        const body = encoder.encode(text);
        const stamped = new Uint8Array(8 + body.length);
        new DataView(stamped.buffer).setBigUint64(0, BigInt(MTIME), true);
        stamped.set(body, 8);
        return stamped.buffer;
      };

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
            return stampedBytes(files[relative]);
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
 * The folder is opened from Docs because the first-run card lives on the docs intent;
 * crossing the rail proves the session's folder stays attached.
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
  /* Compile is the Wiki half's door; the column opens on Sources, so press the switch first. */
  await page.getByTestId("library-workspace-wiki").click();
  await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });
}

test.describe("Compile opens the agent dock", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page);
  });

  test("the chip is offered only when a runtime, a folder path and the folder's server are all there", async ({
    page,
  }) => {
    await openFolder(page);
    await expect(page.getByTestId("library-compile")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("library-compile")).toBeEnabled();
    await page.getByTestId("library-workspace-sources").click();
    /* The needs-compile count is read under the strip's Compile press. */
    await page.getByTestId("library-strip-compile").click();
    await expect(page.getByTestId("library-needs-compile")).toContainText("4");
    await page.keyboard.press("Escape");
    /*
     * On the agent route the Compile press owes only the blocked reason; the provider-traffic sentence
     * has one home, measured in the next case.
     */
    await expect(page.getByTestId("library-stage")).toHaveCount(0);
    await page.getByTestId("library-strip-compile").click();
    const popover = page.getByTestId("library-compile-popover");
    await expect(popover).toBeVisible();
    await expect(popover.getByTestId("library-compile-popover-run")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("the provider disclosure has one home, and it is the index head's glyph", async ({
    page,
  }) => {
    await openFolder(page);
    /* The provider-traffic sentence is printed once per screen, on demand: zero inline, one in the panel. */
    // The home: the picture and its strip print nothing about transfers, and neither does
    // the popup behind either door.
    const inlineDisclosure = page.getByText(/Atlas does not record that traffic/);
    await expect(page.getByTestId("library-stage")).toHaveCount(0);
    await expect(page.getByTestId("library-stage-transfer")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);
    await page.getByTestId("library-workspace-sources").click();

    /* Neither popup the home's strip opens carries the transfer sentence. */
    await page.getByTestId("library-strip-compile").click();
    const compilePopover = page.getByTestId("library-compile-popover");
    await expect(compilePopover).toBeVisible();
    await expect(compilePopover.getByTestId("library-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByTestId("library-guide-open").click();
    const guide = page.getByTestId("library-guide-popover");
    await expect(guide).toBeVisible();
    await expect(guide.getByTestId("library-stage-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByTestId("library-workspace-wiki").click();
    await page.getByTestId("library-wiki-wiki/notes").click();
    await expect(page.getByTestId("library-stage-transfer")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);

    /*
     * What the index does owe a dead door is the reason it cannot run, one line, directly
     * under the group — and with a verified agent there is no reason, so there is no line.
     */
    await expect(page.getByTestId("library-actions-blocked")).toHaveCount(0);

    await page.getByTestId("library-workspace-sources").click();
    await expect(page.getByTestId("library-sources")).toBeVisible();
    await page.getByTestId("library-source-sources/architecture.docx").click();
    await expect(page.getByTestId("library-stage")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);

    /* Focus opens the one home for the sentence, and Escape closes it. */
    const info = page.getByTestId("library-lede-info");
    await info.focus();
    const panel = page.getByRole("tooltip");
    await expect(panel).toContainText("Atlas does not record that traffic");
    await expect(panel).toContainText("kept byte for byte");
    /*
     * ⚠️ **And the panel cannot take the press beside it.** The fold now stands on the
     * same row as this glyph, and the panel opens across that row's width; measured
     * before `pointer-events-none`, `elementFromPoint` over the fold answered the panel
     * for as long as it stood, including its exit animation.
     */
    const foldHit = await page.evaluate(() => {
      const fold = document.querySelector('[data-testid="library-index-collapse"]');
      if (fold === null) return null;
      const box = fold.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
    });
    expect(foldHit, "the fold is what a press at the fold reaches").toBe(
      "library-index-collapse",
    );

    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("pressing it opens a dock with a real rect, inside the row that holds the reader", async ({
    page,
  }) => {
    await openFolder(page);
    await page.getByTestId("library-compile").click();

    const dock = page.getByTestId("library-agent-dock");
    await expect(dock).toBeVisible({ timeout: 25_000 });

    // The regression, measured rather than asserted by visibility: the frame must have
    // height, and it must come from the row that holds `<main>` rather than from the
    // page column below it. The row is the Library's now; the geometry it has to satisfy
    // is unchanged, because the defect was never about which screen it was on.
    const geometry = await page.evaluate(() => {
      const surface = document.querySelector('[data-testid="library-agent-dock"]');
      const frame = document.querySelector('[data-testid="library-agent-dock-frame"]');
      // The reader, not `<main>`. On this destination `<main>` **is** the row — below
      // `lg` the reader stands aside and a landmark that can vanish is a landmark with
      // nothing in it — so the sibling the dock has to share a parent with is the reader.
      const main = document.querySelector('[data-testid="library-reader"]');
      if (!surface || !frame || !main) return null;
      const rect = (el: Element) => {
        const box = el.getBoundingClientRect();
        return { top: Math.round(box.top), height: Math.round(box.height), width: Math.round(box.width) };
      };
      return {
        surface: rect(surface),
        frame: rect(frame),
        main: rect(main),
        sharesParent: frame.parentElement === main.parentElement,
      };
    });
    expect(geometry, "dock, frame and main must all be in the DOM").not.toBeNull();
    expect(geometry!.frame.height, "the frame collapsed to zero height — the 2026-09-05 defect")
      .toBeGreaterThan(200);
    expect(geometry!.surface.height, "the surface has no height to paint into").toBeGreaterThan(200);
    expect(geometry!.surface.width).toBeGreaterThan(200);
    // Same row as the reader: the frame's top sits within the reader's band, not below it.
    expect(
      geometry!.sharesParent,
      "the dock must be a sibling of the reader inside the row, not of the page column",
    ).toBe(true);
    expect(Math.abs(geometry!.frame.top - geometry!.main.top)).toBeLessThan(24);
  });

  test("the dock carries the compile request and names the runtime it will use", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-compile").click();

    const dock = page.getByTestId("library-agent-dock");
    await expect(dock).toBeVisible({ timeout: 25_000 });
    // The request reached the surface. `compile-brief.test.ts` owns what is inside it.
    await expect(dock).toHaveAttribute("data-agent-request-kind", "compile");
    await expect(dock).toContainText(RUNTIME.label);
  });

  /**
   * The toast anchors to the pane's bottom-right corner; with the conversation open the reserve is
   * `--app-right-dock-width` (`right-dock-reserve.ts`), read through an `xl`-gated variable.
   */
  test("with the conversation open, the toast stops at the dock's edge", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 901 });
    await openFolder(page);
    await page.getByTestId("library-compile").click();
    await expect(page.getByTestId("library-agent-dock")).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("library-new-page").click();
    await page.getByTestId("library-new-page-title").fill("Dock wall probe");
    await page.getByTestId("library-new-page-make").click();
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 20_000 });

    /*
     * ⚠️ **Poll.** The dock opens on a width transition and the box rises into place, so a
     * single read lands mid-animation — measured 26px of gap while the frame was still
     * narrower than its resting width. What is being measured is where both come to rest.
     */
    const gap = async () => {
      const box = (await toast.boundingBox())!;
      const frame = (await page.getByTestId("library-agent-dock-frame").boundingBox())!;
      return Math.round(frame.x - (box.x + box.width));
    };
    await expect
      .poll(gap, { timeout: 10_000 })
      .toBe(16);

    const box = (await toast.boundingBox())!;
    const frame = (await page.getByTestId("library-agent-dock-frame").boundingBox())!;
    const reader = (await page.getByTestId("library-reader").boundingBox())!;
    expect(frame.width, "the dock is a column of its own at this width").toBeGreaterThan(200);
    expect(box.x, "the toast starts inside the reader pane").toBeGreaterThanOrEqual(reader.x);
  });
});

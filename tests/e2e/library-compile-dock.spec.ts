import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Compile opens a dock a person can see.**
 *
 * Measured in the installed app on 2026-09-05: the Compile chip rendered enabled with
 * four sources waiting, and pressing it — pointer twice, then keyboard with the focus
 * ring visible — changed nothing on screen. The handler ran; the dock was in the DOM.
 * It had been placed after the layout row, inside the page's flex **column**, and its
 * surface is `absolute inset-y-3 right-3`, so the frame collapsed to zero height and its
 * own `overflow-hidden` finished the job. A press that does nothing is the worst possible
 * report, because nothing about it says whether the product is broken or the person is.
 *
 * The regression is **geometry**, so this spec measures geometry: the dock must be
 * visible, hold a real rect, and sit inside the same row as `<main>` rather than below
 * it. A `toBeVisible()` alone would have passed on the broken build — `visible` in
 * Playwright means a non-empty bounding box, which the zero-height frame technically had
 * once its inner surface painted, and it is the frame that has to have the height.
 *
 * **Why the desktop bridge is stubbed in a browser.** The app is a WKWebView running this
 * same static export, so injecting the runtime signal exercises exactly this render
 * boundary — the same reasoning `desktop-shell-rail.spec.ts` records. What stays with
 * installed-app measurement is everything downstream of the dock: the real adapter
 * launch, the turn, and the writes.
 *
 * The brief's own content is not asserted here. `compile-brief.test.ts` pins all six
 * rules and the verbatim template against the schema module; this spec proves the press
 * reaches the dock carrying a `compile` request, which is the link that was missing.
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
   * Compile is the Wiki half's own door since 2026-09-07: the index draws one list at a
   * time and the switch decides which. The column opens on Sources — the first half of the
   * work — so this presses the switch, the same press a person makes.
   */
  await page.getByTestId("library-index-segment-wiki").click();
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
    /*
     * Four sources, none written up, so the chip has work to do and says so.
     *
     * ⚠️ **Where that count is read moved on 2026-09-12.** It used to be a caption at the
     * foot of the Sources list, and the owner read it there: *"this 'one source version
     * needs review' line — written like this, who is ever going to look at it?"* The home
     * is the folder's graph now, and the strip above it names the **file** Compile would
     * start on; the count is under that clause's own press, which is where the person who
     * is about to compile is looking.
     */
    await page.getByTestId("library-strip-compile").click();
    await expect(page.getByTestId("library-needs-compile")).toContainText("4");
    await page.keyboard.press("Escape");
    /*
     * The home is the folder's graph, and `Compile next: <source>` on its strip opens the
     * popover that carries the press and its brain picker. On the **agent** route what
     * that press owes a person is the blocked reason and nothing else since 2026-09-12:
     * the sentence about provider traffic says Atlas is not in the path at all, and the
     * next case is where that sentence's one home is measured.
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
    /*
     * **A fact is said once per screen, and this one is said on demand** (owner,
     * 2026-09-12: *"text like 'the coding agent sends requests directly to its provider
     * and Atlas does not record that traffic…' — shouldn't that be handled as a
     * tooltip?"*).
     *
     * The history is three moves. It began in the index column; on 2026-09-06 it followed
     * Compile onto step two, because a disclosure has to answer the control above it; on
     * 2026-09-07 it also followed the source pane's own Compile, because with the switch
     * the column can be drawing Sources while a page is open. Each move was right about
     * placement and wrong about count: measured on the owner's folder, one journey printed
     * the same paragraph in up to three places, and four wrapped lines of 11px between a
     * button group and a list is how a reader learns to skip a disclosure.
     *
     * So it left every inline slot. `.claude/rules/local-first.md` asks for one place to
     * say what leaves this computer, at the press — and on this route nothing leaves
     * through Atlas: the sentence exists to say exactly that, which is a standing fact
     * about the place rather than about a press. The local runner's own sentence, which
     * *is* a transfer Atlas performs, still sits under the button that performs it.
     *
     * This test therefore measures the count in both directions: zero inline, and one in
     * the panel, reachable by keyboard.
     */
    // The home: the picture and its strip print nothing about transfers, and neither does
    // the popup behind either door.
    const inlineDisclosure = page.getByText(/Atlas does not record that traffic/);
    await expect(page.getByTestId("library-stage")).toHaveCount(0);
    await expect(page.getByTestId("library-stage-transfer")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);

    /*
     * The two popups the home's strip opens (`docs/DECISIONS.md`, 2026-09-12 — "The
     * Library's home is the folder's graph"). Each carried a copy: the Compile popover in
     * its own slot under the press, and the guide's step two in the row that holds
     * Compile. Both were right about placement under the earlier reading and both are
     * empty of this sentence now.
     */
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

    await page.getByTestId("library-wiki-wiki/notes").click();
    await expect(page.getByTestId("library-stage-transfer")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);

    /*
     * What the index does owe a dead door is the reason it cannot run, one line, directly
     * under the group — and with a verified agent there is no reason, so there is no line.
     */
    await expect(page.getByTestId("library-actions-blocked")).toHaveCount(0);

    await page.getByTestId("library-index-segment-sources").click();
    await expect(page.getByTestId("library-sources")).toBeVisible();
    await page.getByTestId("library-source-sources/architecture.docx").click();
    await expect(page.getByTestId("library-stage")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);
    await expect(inlineDisclosure).toHaveCount(0);

    /*
     * And the one home. Focus opens it, which is what makes a keyboard equal to a
     * pointer here; Escape closes it, which is what a transient surface owes
     * (`docs/DECISIONS.md`, 2026-08-11).
     */
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
   * **The pane's right-hand wall is the conversation's left edge, not the window's.**
   *
   * The toast anchors to this pane's bottom-right corner (`docs/DECISIONS.md`,
   * 2026-09-12), and with the conversation open that corner belongs to the dock. The
   * reserve is `--app-right-dock-width`, which this view already publishes for exactly
   * this class of surface (`right-dock-reserve.ts`), read through a `xl`-gated variable —
   * below `xl` the dock is a full-width overlay with no reader beside it, and a transient
   * drawn above a dock is the judgement the map's own placement already accepted.
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

  test("the keyboard opens it too, which is how the defect was first pressed", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-compile").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-agent-dock")).toBeVisible({ timeout: 25_000 });
  });
});

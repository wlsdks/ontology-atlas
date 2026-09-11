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
    // Four sources, none written up, so the chip has work to do and says so. The count is
    // the Sources half's own line, one press away since the index became a switch.
    await page.getByTestId("library-index-segment-sources").click();
    await expect(page.getByTestId("library-needs-compile")).toContainText("4");
    await page.getByTestId("library-index-segment-wiki").click();
    /*
     * And what leaves this computer is stated beside the button that starts it — on the
     * shelf, which is where Compile's own brain picker stands.
     *
     * It used to be read from the index column. The sentence moved on 2026-09-06 when
     * step two grew a brain picker and the disclosure had to answer the control above it;
     * exactly one surface prints it, and which one depends on whether the shelf is drawn.
     * The move shipped broken for one commit — the shelf printed it only while the picker
     * was drawn, so a machine with a single brain showed it **nowhere** — which is why the
     * next case pins the other half rather than trusting that this one covers both.
     *
     * The unselected landing now draws the steps directly; selecting a page
     * hands the disclosure to the index beside its Compile control.
     */
    await expect(page.getByTestId("library-stage")).toBeVisible();
    await expect(page.getByTestId("library-stage-transfer")).toContainText("Atlas does not record that traffic");
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);

    /*
     * ⚠️ **And it is under the press, not merely in the same panel.** The guide became a
     * 360px stepper on 2026-09-06 and the three cards became three rows; a disclosure that
     * slid above the button, or into another row, would still satisfy the assertions above
     * while telling a person what leaves their computer *after* they have read past the
     * control that sends it. `.claude/rules/local-first.md` asks for the placement, so the
     * placement is what is measured.
     */
    const compileRow = page.getByTestId("library-stage-compile");
    await expect(compileRow.getByTestId("library-stage-transfer")).toBeVisible();
    const button = (await page.getByTestId("library-stage-compile-button").boundingBox())!;
    const sentence = (await page.getByTestId("library-stage-transfer").boundingBox())!;
    expect(sentence.y, "the transfer sentence sits above the Compile button").toBeGreaterThan(
      button.y,
    );
    expect(sentence.y - (button.y + button.height)).toBeLessThan(120);
  });

  test("the disclosure follows the reader: the index takes it over once the shelf is gone", async ({
    page,
  }) => {
    await openFolder(page);
    /*
     * Opening a document hands the sentence to the column. The landing and
     * selected-page states cover both owners of the disclosure — and losing the sentence in either is the regression this exists for: the
     * person is one press away from Compile in the index column the whole time.
     *
     * ⚠️ **The rule the owner's 2026-09-06 reading pinned**: the disclosure lives where
     * Compile can be pressed, and the index still has a Compile chip, so the index's copy
     * is the caption **directly under that chip** — not, as it shipped, a line at the very
     * bottom of the column under a list that was still going. It is one slot: the reason
     * Compile cannot run, or what leaves the computer when it does.
     */
    await expect(page.getByTestId("library-stage-transfer")).toBeVisible();
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);
    await page.getByTestId("library-wiki-wiki/notes").click();
    await expect(page.getByTestId("library-stage-transfer")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toContainText("Atlas does not record that traffic");

    /*
     * Under the chip that starts it — never the column's last line, which is where it
     * shipped: on the owner's folder it sat below a list that was still going, three
     * hundred pixels from the button it describes.
     */
    const chip = (await page.getByTestId("library-compile").boundingBox())!;
    const note = (await page.getByTestId("library-transfer").boundingBox())!;
    expect(note.y).toBeGreaterThan(chip.y);
    /*
     * ⚠️ **One thing now stands between the chip and this note, and it belongs there.**
     * This folder holds a single wiki page, so Check is blocked for wanting a second one,
     * and since 2026-09-12 that reason is visible prose under the chips rather than a
     * tooltip — the council's rule that one blocked ability gets one reason, in the open
     * (`.claude/rules/surfaces.md` degradation grammar, and the same "beside the press"
     * rule in `.claude/rules/local-first.md` that put this note here).
     *
     * So the rule is unchanged and the chain is measured link by link, rather than the gap
     * being loosened to swallow whatever appears in between: measured 2026-09-12 at 1512,
     * chip bottom 225 → reason 233 (**8px**) → note 277 (**0px**, flush). A sentence that
     * slid back to the foot of the column would break the link it sits on, which one
     * widened number would have hidden.
     */
    const reasonCount = await page.getByTestId("library-lint-blocked").count();
    const above = reasonCount > 0
      ? (await page.getByTestId("library-lint-blocked").boundingBox())!
      : chip;
    if (reasonCount > 0) {
      expect(above.y - (chip.y + chip.height)).toBeLessThan(24);
      expect(above.y).toBeGreaterThan(chip.y);
    }
    expect(note.y - (above.y + above.height)).toBeLessThan(24);
    /*
     * And it is a child of the Wiki section, ahead of the list — a rect comparison alone
     * would pass for a sentence that had slid to the foot of the column again, because the
     * numbers there are only tens of pixels apart on a short folder.
     */
    await expect(page.getByTestId("library-wiki").getByTestId("library-transfer")).toBeVisible();
    /*
     * And it is not on the other half. The switch is what makes that checkable now: the
     * Sources list has no Compile on it, so it has nothing to disclose — which is the rule
     * `.claude/rules/local-first.md` asks for, the disclosure beside the press.
     */
    await page.getByTestId("library-index-segment-sources").click();
    await expect(page.getByTestId("library-sources")).toBeVisible();
    await expect(page.getByTestId("library-transfer")).toHaveCount(0);

    /*
     * ⚠️ **And opening a source moves it to that source's own press.** `SourceSummary`
     * draws a Compile of its own for a file nobody has written up, and until 2026-09-07
     * the sentence for it lived three hundred pixels away in a column that happened to be
     * drawing the Wiki half. With the switch, that column is drawing Sources — so the
     * disclosure follows the button, which is the placement the rule asks for. Still
     * exactly one: the column has no Compile on this half, so it prints nothing.
     */
    await page.getByTestId("library-source-sources/architecture.docx").click();
    await expect(page.getByTestId("library-stage")).toHaveCount(0);
    await expect(page.getByTestId("library-transfer")).toHaveCount(1);
    await expect(page.getByTestId("library-transfer")).toContainText("Atlas does not record that traffic");
    await expect(
      page.getByTestId("library-source-summary").getByTestId("library-transfer"),
    ).toBeVisible();
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

  test("the keyboard opens it too, which is how the defect was first pressed", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-compile").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-agent-dock")).toBeVisible({ timeout: 25_000 });
  });
});

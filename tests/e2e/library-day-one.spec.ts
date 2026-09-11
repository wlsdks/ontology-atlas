import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { DAY_ONE_BINARY_BASE64, DAY_ONE_TEXT, dayOneRuntimes } from "./library-day-one-fixture";

/**
 * **The Library's first day, with no coding agent — slice U2's three proofs.**
 *
 * Measured on the installed app 2026-09-11, this is the folder a third-tier person
 * (`docs/PRODUCT-DIRECTION.md` target tiers) actually has: six real documents in
 * `sources/`, a `wiki/` holding only its template, nothing compiled, no agent. What the
 * Library gave them was a file list with sizes, an empty wiki, a search matching **paths
 * only**, and a sentence explaining why the next step was refused with no way to take it.
 *
 * Each case here is one of the three things that changed, written as the failure it
 * prevents rather than the feature it demonstrates:
 *
 * 1. typing a phrase that is inside a document finds nothing (it is on line 11 of
 *    `settlement-policy.md`, and no path contains it);
 * 2. a spreadsheet's pane cannot say what is in the spreadsheet;
 * 3. the blocked step's reason is a dead end.
 *
 * ## Why the desktop bridge is stubbed rather than the picker
 *
 * The same reason `library-ask.spec.ts` and `library-compile-dock.spec.ts` record: the
 * installed app is a WKWebView running this exact static export, so stubbing the Rust
 * side exercises the real handle, the real folder walk, the real library model and the
 * real render. It also matters for **this** slice specifically: the app's source read is
 * `read_vault_binary_file`, which hands the WebView a JSON array of bytes, and that is
 * the path both the search and the outline actually take on the surface a person uses.
 * An OPFS picker stub would prove the browser's File System Access path and say nothing
 * about the one that costs.
 *
 * It is also the only way to reach proof 3 at all. The door is **deliberately absent on
 * the web**, where the missing thing is the installed app and `/download/`'s own card is
 * the honest destination — so a browser-only run cannot show it, by design rather than by
 * accident.
 *
 * DOCX and XLSX ride in as base64 and are decoded to real bytes, because the outline's
 * numbers come out of the workbook itself: two sheets, four rows and five rows. A stubbed
 * string would have proved the section renders and nothing about whether it is true.
 */

const VAULT_ROOT = "/Users/probe/Ontology Atlas/day-one";

/**
 * **No verified runtime, and the registry saying so for every agent it knows.**
 *
 * ⚠️ This was `[]`, which is a different machine from the one the slice is about: the real
 * `detect_runtimes` reports a state per registry agent, so "nothing installed" arrives as
 * forty rows of `cli-missing`. With the empty array the door landed on a page reading
 * "Nothing found yet — the install guides are in the list below" **with nothing below**,
 * and a capture of that is a capture of a screen the app never shows (design-lead, council
 * 2026-09-11).
 */
const NO_RUNTIMES = dayOneRuntimes();

async function installDesktopBridge(page: Page) {
  await page.addInitScript(
    ({ text, binary, rootPath, runtimes }) => {
      const MTIME = 1_757_000_000_000;
      const encoder = new TextEncoder();

      /** base64 → bytes, for the two zip documents. */
      const decodeBase64 = (value: string) => {
        const raw = atob(value);
        const out = new Uint8Array(raw.length);
        for (let index = 0; index < raw.length; index += 1) out[index] = raw.charCodeAt(index);
        return out;
      };

      const bytesFor = (relative: string): Uint8Array | null => {
        if (relative in binary) return decodeBase64(binary[relative]!);
        if (relative in text) return encoder.encode(text[relative]!);
        return null;
      };

      const paths = [...Object.keys(text), ...Object.keys(binary)];

      const listDirectory = (relative: string) => {
        const prefix = relative ? `${relative}/` : "";
        const seen = new Map<string, "file" | "directory">();
        for (const path of paths) {
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
              return relative === "" || paths.some((path) => path.startsWith(`${relative}/`));
            }
            return paths.includes(relative);
          case "read_vault_text_file": {
            if (!(relative in text)) throw new Error(`missing ${relative}`);
            return { text: text[relative], lastModified: MTIME };
          }
          case "read_vault_binary_file": {
            const bytes = bytesFor(relative);
            if (!bytes) throw new Error(`missing ${relative}`);
            // The real bridge's shape: one JSON number per byte.
            return { bytes: [...bytes], lastModified: MTIME };
          }
          case "write_vault_text_file":
            text[relative] = String(args.content ?? "");
            return null;
          case "ensure_vault_directory":
            return null;
          case "vault_fingerprint":
            return {
              entries: paths
                .filter((path) => path.endsWith(".md") || path.startsWith("sources/"))
                .map((path) => ({
                  relativePath: path,
                  lastModified: MTIME,
                  size: bytesFor(path)?.length ?? 0,
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
            // Nothing **installed** on this computer, said one registry row at a time.
            // `route` still resolves to `unavailable`: no row is `ready`.
            return runtimes;
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
    { text: { ...DAY_ONE_TEXT }, binary: { ...DAY_ONE_BINARY_BASE64 }, rootPath: VAULT_ROOT, runtimes: NO_RUNTIMES },
  );
}

/**
 * Open the folder the way a person does, then cross the rail to the Library.
 *
 * ⚠️ **Where opening lands is not fixed, and asserting the map made this flake.** A
 * folder's shape decides its rail (`destinationsForVaultShape`) and where `/` sends
 * somebody — a wiki without a map opens the Library directly — so a first draft that
 * waited on the map heading failed one run in three on this very fixture. What the walk
 * actually needs is the rail, whatever it drew, and then the Library tile: that keeps the
 * open folder in the session instead of asking the restore to find it again, which is the
 * part a reload would skip.
 */
async function openLibrary(page: Page) {
  await page.goto("/en/docs/");
  await page.waitForLoadState("networkidle");
  const door = page.getByRole("button", { name: /^Open my folder/ });
  await door.first().waitFor({ timeout: 25_000 });
  await door.first().click();
  /*
   * ⚠️ **Below `lg` there is no rail.** The destinations live in the bottom tab bar
   * (`[data-tabbar="primary"]`, `lg:hidden`), and waiting on the rail at 390 waits on a
   * hidden element forever — measured while building the narrow half of this proof. So the
   * walk asks for whichever navigation this width actually draws.
   */
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  const navigation = wide ? page.getByTestId("app-nav-rail") : page.locator('[data-tabbar="primary"]');
  await navigation.waitFor({ timeout: 30_000 });
  const libraryTile = navigation.getByRole("link", { name: "Library" });
  await libraryTile.waitFor({ timeout: 30_000 });
  await libraryTile.click();
  await page.getByTestId("library-sources").waitFor({ timeout: 30_000 });
}

/**
 * **Capture only after the pixels have caught up with the DOM.**
 *
 * Measured while building these proofs: with the assertions green — `library-search`
 * holding "T+2", the matches line reading "2 sources (4 passages)", and the list down to
 * two rows — `page.screenshot()` wrote a frame showing the empty field and all six rows.
 * The DOM was right and the paint was stale, so the capture disagreed with the test that
 * had just passed. A capture that lags the assertion is worse than no capture: it is
 * evidence *against* a change that actually works.
 *
 * Two frames plus a short settle is what closed it. It is not a `waitFor` on content —
 * the content is already asserted above every call site — it is a wait on compositing.
 */
async function captureSettled(page: Page, path: string) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))),
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path });
}

test.describe("the Library on its first day, with no agent", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page);
  });

  test("finds a phrase that lives inside a document, and says where", async ({ page }) => {
    await openLibrary(page);

    const field = page.getByTestId("library-search");

    /*
     * ⚠️ **The list must not move under the pointer on the first keystroke.** The matches
     * line used to appear with the first character, and appearing is a layout event: the
     * index dropped 18–19px, so the row somebody was reaching for moved as they typed
     * (design-interaction, council 2026-09-11). The line's height is reserved at rest.
     */
    const list = page.getByTestId("library-source-list");
    const before = await list.boundingBox();

    /*
     * ⚠️ **A finished answer and an unfinished read may not share a frame.** Two halves of
     * one defect: the column emptied while reading (`0 rows` at `1/6`), and the "they are
     * all on the other list" note printed its count while that count was still provisional.
     * 34 ms is far too fast to sample by polling, so every mutation is inspected instead.
     */
    await page.evaluate(() => {
      const seen = { emptyWhileReading: 0, noteWhileReading: 0 };
      (window as unknown as { __u2?: typeof seen }).__u2 = seen;
      const check = () => {
        const rows = document.querySelector('[data-testid="library-source-list"]');
        if (rows?.getAttribute("data-phase") !== "reading") return;
        if (rows.querySelectorAll("li").length === 0) seen.emptyWhileReading += 1;
        if (document.querySelector('[data-testid="library-search-other-half-note"]')) {
          seen.noteWhileReading += 1;
        }
      };
      new MutationObserver(check).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });

    await field.fill("T+2");

    const matches = page.getByTestId("library-search-matches");
    await expect(matches).toHaveAttribute("data-phase", "ready", { timeout: 20_000 });

    /*
     * Two files hold it and four units do. `fee-schedule.csv` says it in three records
     * and sorts first; the brief expected only the policy, so the count is the fact here
     * rather than the row.
     */
    await expect(matches).toHaveText(/2 sources \(4 passages\) · 0 pages matched/);

    const hit = page.getByTestId("library-source-hit-sources/settlement-policy.md");
    // Line 11, which is where the file really says it — the fixture's own wiki page
    // cites `#l14`, three lines off, and this number comes from the reader instead.
    await expect(hit).toContainText("line 11");
    await expect(hit).toContainText("Card payments settle on T+2 business days.");
    // The address it opens is on the control itself, not only in its handler.
    await expect(hit).toHaveAttribute("data-anchor", "l11");

    const after = await list.boundingBox();
    expect(after?.y).toBe(before?.y);

    const seen = await page.evaluate(
      () => (window as unknown as { __u2: { emptyWhileReading: number; noteWhileReading: number } }).__u2,
    );
    expect(seen).toEqual({ emptyWhileReading: 0, noteWhileReading: 0 });

    await captureSettled(page, ".claude/shots-2026-09-11/library-day-one/1-search-inside-sources.png");

    /*
     * **Enter, not only a click.** The caption is a button and a keyboard press has to
     * land where a pointer press lands — the passage section, which takes focus on
     * arrival. Untested until the council read it (design-interaction, 2026-09-11).
     */
    await hit.press("Enter");
    const passage = page.getByTestId("library-source-passage");
    await expect(passage).toHaveAttribute("data-state", "resolved", { timeout: 20_000 });
    await expect(page.getByTestId("library-source-passage-cited")).toContainText(
      "Card payments settle on T+2 business days.",
    );
    await expect(passage).toBeFocused();

    // And the caption that opened it says so, so a returning reader knows which one it was.
    await expect(hit).toHaveAttribute("aria-current", "location");
    await captureSettled(page, ".claude/shots-2026-09-11/library-day-one/1b-caption-lands-on-the-unit.png");
  });

  test("says what a spreadsheet is made of, without compiling it", async ({ page }) => {
    await openLibrary(page);

    await page.getByTestId("library-source-sources/dispute-metrics.xlsx").click();

    const outline = page.getByTestId("library-source-outline");
    await expect(outline).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
    const list = page.getByTestId("library-source-outline-list");
    // Out of the workbook's own bytes: two sheets, four rows and five.
    await expect(list).toContainText("Sheet Quarterly · 4 rows");
    await expect(list).toContainText("Sheet Reason codes · 5 rows");

    // And the pane has stopped claiming it never opened the file it just described.
    await expect(page.getByTestId("library-source-opened-state")).not.toContainText(
      "has never opened this file",
    );

    await captureSettled(page, ".claude/shots-2026-09-11/library-day-one/2-outline-every-file.png");
  });

  test("opens a door from the blocked step instead of ending in a sentence", async ({ page }) => {
    await openLibrary(page);

    /*
     * ⚠️ **One availability sentence per surface, and the home is not one of them**
     * (2026-09-12). The home is the folder's graph and makes no claim about an agent; the
     * sentence stands under the press it stops. The nearest press on a day-one folder is
     * Compile, which the strip's own clause opens — and `library-spine.spec.ts` counts
     * that each surface carries exactly one.
     */
    await expect(page.locator("[data-landing-blocked-reason]")).toHaveCount(0);
    await page.getByTestId("library-strip-compile").click();
    const popover = page.getByTestId("library-compile-popover");
    const reason = popover.getByTestId("library-compile-popover-blocked");
    await expect(reason).toHaveCount(1);
    await expect(reason).toContainText(/No verified coding agent/);

    const door = popover.getByTestId("library-compile-popover-blocked-door");
    await expect(door).toHaveCount(1);
    await captureSettled(page, ".claude/shots-2026-09-11/library-day-one/3-door-beside-the-reason.png");

    await door.click();

    // It lands on the destination the rail names, with the rail's own word for it.
    await expect(page).toHaveURL(/\/en\/agents/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Agents");
    /*
     * ⚠️ **And the landing has the answer on it.** With the old `[]` stub the page said
     * "the install guides are in the list below" with nothing below — a screen the app
     * never shows, because the real detection reports every registry agent as
     * `cli-missing`. The chip that opens those guides is what makes the door's destination
     * worth arriving at (design-lead, council 2026-09-11).
     */
    await expect(page.getByTestId("app-settings-runtimes-others-toggle")).toBeVisible({
      timeout: 30_000,
    });
    await captureSettled(page, ".claude/shots-2026-09-11/library-day-one/3b-lands-on-agents.png");
  });

  /**
   * **The one press this slice exists to give somebody, at the window the app ships as its
   * minimum.**
   *
   * Measured 2026-09-11 at 1040×720 on `dispute-handling-standard.docx` (design-responsive,
   * council): the five-row 「Structure」 list pushed the availability sentence to the pane's
   * last line and the 「Agents」 door to y=724, bottom 756 against a 720 viewport —
   * `doorInViewport: false`. The XLSX pane, two rows shorter, kept its door at 684. The
   * door's place may not depend on how long the open document happens to be, so the
   * availability block now stands above the two blocks the document's length decides.
   */
  for (const viewport of [
    { width: 1040, height: 720, name: "app-minimum" },
    { width: 390, height: 844, name: "phone" },
  ]) {
    test(`keeps the door on screen at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openLibrary(page);

      const narrow = viewport.width < 1024;
      for (const file of ["sources/dispute-handling-standard.docx", "sources/dispute-metrics.xlsx"]) {
        /* Below `lg` the reader takes the column the index was in, so the walk goes back
           the way a person does — through the reader's own back control. */
        if (narrow && (await page.getByTestId("library-reader-back").isVisible())) {
          await page.getByTestId("library-reader-back").click();
        }
        await page.getByTestId(`library-source-${file}`).click();
        const outline = page.getByTestId("library-source-outline");
        await expect(outline).toHaveAttribute("data-state", "ready", { timeout: 20_000 });

        const door = page.getByTestId("library-source-compile-blocked-door");
        await expect(door).toBeVisible();
        const box = await door.boundingBox();
        expect(box).not.toBeNull();
        // In the viewport, not merely in the document: a door below the fold is no door.
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }

      await captureSettled(
        page,
        `.claude/shots-2026-09-11/library-day-one/4-door-in-view-${viewport.name}.png`,
      );
    });
  }
});

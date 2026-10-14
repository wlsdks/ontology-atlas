import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { DAY_ONE_BINARY_BASE64, DAY_ONE_TEXT, dayOneRuntimes } from "./library-day-one-fixture";
import { waitForAnimationsDone, waitForDomQuiet, waitFrames } from "../settle";

/**
 * The desktop bridge is stubbed, not the picker: the app's source read is `read_vault_binary_file`,
 * and the agents door is absent on the web. DOCX and XLSX arrive as base64 and decode to real bytes.
 */

const VAULT_ROOT = "/Users/probe/Ontology Atlas/day-one";

/** No verified runtime: the registry reports every agent as `cli-missing`, as the real detection does. */
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
            // The real bridge's shape: u64 mtime, then the bytes.
            const stamped = new Uint8Array(8 + bytes.length);
            new DataView(stamped.buffer).setBigUint64(0, BigInt(MTIME), true);
            stamped.set(bytes, 8);
            return stamped.buffer;
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
  const navigation = page.getByTestId("app-nav-rail");
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
 * It is not a `waitFor` on content — the content is already asserted above every call
 * site — it is a wait on the screen catching up: the markup has stopped changing, every
 * finite transition has run out, and two more frames have been painted from that state.
 */
async function captureSettled(page: Page, name: string) {
  // Evidence for a person, written only when asked for, and never into the repository.
  const directory = process.env.ATLAS_DAY_ONE_SHOTS;
  if (!directory) return;
  await waitForDomQuiet(page);
  await waitForAnimationsDone(page.locator("html"));
  await waitFrames(page, 2);
  await page.screenshot({ path: `${directory}/${name}` });
}

test.describe("the Library on its first day, with no agent", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page);
  });

  test("finds a phrase that lives inside a document, and says where", async ({ page }) => {
    await openLibrary(page);

    const field = page.getByTestId("library-search");

    /* The matches line's height is reserved at rest, so the list must not move on the first keystroke. */
    const list = page.getByTestId("library-source-list");
    /*
     * The tab panel arrives with a short 4px rise (`library-workspace.module.css`). That entry
     * is not the keystroke shift this test guards, so the rest position is read after every
     * animation on the list's ancestors has finished; measured mid-rise, `before` read 230.95
     * against a settled 230 on CI.
     */
    await list.evaluate(async (el) => {
      const running: Animation[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        // A looping animation never finishes; only the finite entries can move the rest position.
        running.push(...node.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity));
      }
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    });
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

    await captureSettled(page, "1-search-inside-sources.png");

    /* A keyboard Enter on the caption must land where a pointer press lands: the passage section. */
    await hit.press("Enter");
    const passage = page.getByTestId("library-source-passage");
    await expect(passage).toHaveAttribute("data-state", "resolved", { timeout: 20_000 });
    await expect(page.getByTestId("library-source-passage-cited")).toContainText(
      "Card payments settle on T+2 business days.",
    );
    await expect(passage).toBeFocused();

    // And the caption that opened it says so, so a returning reader knows which one it was.
    await expect(hit).toHaveAttribute("aria-current", "location");
    await captureSettled(page, "1b-caption-lands-on-the-unit.png");
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

    /* The sentence ends where the table ends: the column is the measure, one right edge. */
    const [sentenceRight, tableRight] = await page.evaluate(() => {
      const sentence = document.querySelector('[data-testid="library-source-opened-state"]');
      const table = sentence?.parentElement?.querySelector("dl");
      if (!sentence || !table) throw new Error("the opened-state sentence and its table must both render");
      return [sentence.getBoundingClientRect().right, table.getBoundingClientRect().right];
    });
    expect(Math.abs(sentenceRight - tableRight), `sentence ends at ${sentenceRight}, table at ${tableRight}`).toBeLessThan(1);

    await captureSettled(page, "2-outline-every-file.png");
  });

  test("opens a door from the blocked step instead of ending in a sentence", async ({ page }) => {
    await openLibrary(page);

    /*
     * The home makes no agent claim; the availability sentence stands under the press it stops.
     * `library-spine.spec.ts` counts one per surface.
     */
    await expect(page.locator("[data-landing-blocked-reason]")).toHaveCount(0);
    await page.getByTestId("library-strip-compile").click();
    const popover = page.getByTestId("library-compile-popover");
    const reason = popover.getByTestId("library-compile-popover-blocked");
    await expect(reason).toHaveCount(1);
    await expect(reason).toContainText(/No verified coding agent/);

    const door = popover.getByTestId("library-compile-popover-blocked-door");
    await expect(door).toHaveCount(1);
    await captureSettled(page, "3-door-beside-the-reason.png");

    await door.click();

    // It lands on the destination the rail names, with the rail's own word for it.
    await expect(page).toHaveURL(/\/en\/agents/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Agents");
    /* The landing shows the chip that opens the install guides, which the real detection makes appear. */
    await expect(page.getByTestId("app-settings-runtimes-others-toggle")).toBeVisible({
      timeout: 30_000,
    });
    await captureSettled(page, "3b-lands-on-agents.png");
  });

  /**
   * The agents door must stay on screen at the app minimum window, whatever the open document's length;
   * the availability block stands above the blocks the document's length decides.
   */
  for (const viewport of [
    { width: 1040, height: 720, name: "app-minimum" },
  ]) {
    test(`keeps the door on screen at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openLibrary(page);

      for (const file of ["sources/dispute-handling-standard.docx", "sources/dispute-metrics.xlsx"]) {
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
        `4-door-in-view-${viewport.name}.png`,
      );
    });
  }
});

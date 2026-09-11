import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The recovery proof, in the runtime: no agent, no press, and it survives a restart.**
 *
 * `docs/DECISIONS.md` 2026-09-11 ("The Library keeps its spine, and computes the
 * structural check itself") decides that *"the structural check is aggregated from the
 * local per-page verdict, always available and persistent; the agent adds only semantic
 * findings"*. Before this, every row on the Check-results page came from an agent turn
 * held in memory: after quitting the app the page said so and listed nothing, and a person
 * with **no** agent never reached the page at all, because its door was drawn only once a
 * check had run.
 *
 * So this spec plants the folder from
 * `/Users/jinan/scratch/atlas-library-fixture-20260911/vault` — the four codes it fires —
 * and holds the whole product to the proof the PO pass wrote before implementation:
 *
 *   Given this folder opened with **no coding agent connected and no button pressed**, a
 *   person reaching the Library landing can open one report that lists every structural
 *   finding, grouped by code, each naming and linking the page it concerns; and the same
 *   list is there after quitting and reopening the app.
 *
 * Two deliberate absences make it a proof rather than a demonstration:
 *
 * 1. **No runtime.** `acp_detect_runtimes` answers `[]`, so `agent.route` is never
 *    `"agent"` and nothing on this screen can start a turn. Both PO seats (2026-09-12)
 *    named this as the frame the old capture never showed.
 * 2. **No `wiki/_log.md`.** The real fixture already carries two `lint` lines, which alone
 *    satisfied the old door condition — so a proof run against it would have passed
 *    whether or not the door was fixed. The folder here has no log, which is the state a
 *    person who has never run a check is actually in.
 *
 * **Why a browser rather than the installed app.** The app is a WKWebView running this
 * same static export and the render boundary is what is measured, which is the reason
 * `library-compile-dock.spec.ts` records. Beyond that, on 2026-09-12 the one installed
 * instance on this machine belonged to somebody else's inspection session, and driving a
 * window this session did not launch is how a blind coordinate loop presses another
 * person's app.
 *
 * The reload stands for quitting and reopening: the page is torn down, the vault handle is
 * restored from IndexedDB, and every verdict is computed again from the folder's bytes.
 * Nothing about the structural half is written anywhere, so a list that comes back
 * identical is the whole claim.
 */

const VAULT_ROOT = "/Users/probe/Ontology Atlas/payments";

const PAGE = (
  title: string,
  sources: readonly string[],
  facts: string,
  links = "",
) =>
  [
    "---",
    `title: ${title}`,
    "created_by: agent:claude",
    "compiled_at: 2026-09-11T04:00:00Z",
    "sources:",
    ...sources.map((path) => `  - ${path}`),
    "source_hash:",
    ...sources.map((path) => `  ${path}: ${"a".repeat(64)}`),
    "status: draft",
    `summary: One sentence about ${title}.`,
    "---",
    "",
    "## Summary",
    "",
    `What a reader needs before the facts.${links}`,
    "",
    "## Facts",
    "",
    facts,
    "",
    "## Decisions",
    "",
    `- A decision the source records. [[src:${sources[0]}#p4]]`,
    "",
    "## Open questions",
    "",
    "- Something the source raises but does not settle.",
    "",
    "## Not in sources",
    "",
    "- Nothing.",
    "",
  ].join("\n");

/**
 * The planted folder. **No `wiki/_log.md`** — see the header. The link topology is
 * deliberate: merchant ← refund, refund ← merchant and settlement, settlement ← refund,
 * and settlement-ko ← nobody, so exactly one page is an orphan rather than all four.
 */
const VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: payments", "title: Payments", "---", "", "# Payments", ""].join("\n"),
  "sources/merchant-onboarding.html": "<p>onboarding</p>\n",
  "sources/settlement-policy.md": "# Settlement policy\n\nT+2.\n",
  "wiki/_template.md":
    "---\ntitle: <the page name>\ncreated_by: agent:claude\ncompiled_at: 2026-01-01T00:00:00Z\nsources:\n  - sources/<file>\nsource_hash:\n  sources/<file>: <sha256>\nstatus: draft\nsummary: <one sentence>\n---\n\n## Summary\n\n<x>\n\n## Facts\n\n- <c> [[src:sources/<file>#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
  // Two bullets under `## Facts` with no citation: this page's own bytes are wrong.
  "wiki/merchant-onboarding.md": PAGE(
    "Merchant Onboarding",
    ["sources/merchant-onboarding.html"],
    "- Onboarding closes in three days.\n- Two reviewers sign off.",
    " See [[wiki/refund-timing]].",
  ),
  // A citation naming a file that is not in the folder.
  "wiki/refund-timing.md": PAGE(
    "Refund Timing",
    ["sources/refund-policy-2025.md"],
    "- Refunds settle in five days. [[src:sources/refund-policy-2025.md#p2]]",
    " See [[wiki/merchant-onboarding]] and [[wiki/settlement]].",
  ),
  // Two write-ups of one document that do not link each other, disagreeing about T+2/T+3.
  "wiki/settlement.md": PAGE(
    "Settlement",
    ["sources/settlement-policy.md"],
    "- Settlement runs on T+2. [[src:sources/settlement-policy.md#p3]]",
    " See [[wiki/refund-timing]].",
  ),
  "wiki/settlement-ko.md": PAGE(
    "Settlement schedule and fees",
    ["sources/settlement-policy.md"],
    "- Settlement runs on T+3. [[src:sources/settlement-policy.md#p3]]",
  ),
};

/**
 * Every `(code, page)` pair the folder must produce — the same set
 * `tests/fixtures/wiki-report-folder.mjs` hands the contract test, so the screen and the
 * three code paths are held to one list.
 */
const EXPECTED: ReadonlyArray<{ code: string; page: string; advisory: boolean }> = [
  { code: "citation-target-missing", page: "refund-timing", advisory: false },
  // Two uncited bullets, two rows: a person fixes bullets, not pages, so a kind that fires
  // twice on one page draws twice — each with its own line number.
  { code: "uncited-fact", page: "merchant-onboarding", advisory: false },
  { code: "uncited-fact", page: "merchant-onboarding", advisory: false },
  { code: "orphan-page", page: "settlement-ko", advisory: true },
  { code: "shared-source-unlinked", page: "settlement-ko", advisory: true },
  { code: "shared-source-unlinked", page: "settlement", advisory: true },
];

async function installDesktopBridge(page: Page) {
  await page.addInitScript(
    ({ files, rootPath }) => {
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
          // **The absence that makes this a proof.** No runtime is installed, so no door on
          // this screen can start a turn and nothing here came from an agent.
          case "acp_detect_runtimes":
            return [];
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
    { files: { ...VAULT }, rootPath: VAULT_ROOT },
  );
}

async function openFolder(page: Page) {
  await page.goto("/en/docs/");
  await page.waitForLoadState("networkidle");
  const door = page.getByRole("button", { name: /^Open my folder/ });
  await door.first().waitFor({ timeout: 25_000 });
  await door.first().click();
  await page.getByRole("heading", { name: "Map", level: 1 }).waitFor({ timeout: 30_000 });
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "Library" }).click();
  await page.getByTestId("library-sources").waitFor({ timeout: 30_000 });
}

/** Read the screen's own enumeration: one `(code, page)` pair per drawn row. */
async function readReport(page: Page) {
  return page.evaluate(() => {
    const out: Array<{ code: string; page: string }> = [];
    for (const group of document.querySelectorAll('[data-testid="library-structural-group"]')) {
      const code = group.getAttribute("data-code") ?? "";
      for (const row of group.querySelectorAll('[data-testid="library-structural-finding"]')) {
        for (const door of row.querySelectorAll('[data-testid="library-finding-page"]')) {
          out.push({ code, page: (door.textContent ?? "").trim() });
        }
      }
    }
    // Field by field, never a concatenated key: `source-is-text.contract.test.ts` records
    // why a separator character is the wrong tool for an ordering key.
    return out.sort((a, b) => a.code.localeCompare(b.code) || a.page.localeCompare(b.page));
  });
}

const expectedRows = [...EXPECTED]
  .map(({ code, page }) => ({ code, page }))
  .sort((a, b) => a.code.localeCompare(b.code) || a.page.localeCompare(b.page));

test.describe("the structural check is the app's own", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page);
  });

  test("with no agent and no press, the landing opens a report listing every planted finding", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });

    // Nothing on this screen can start a turn: the check is drawn with its reason, disabled.
    const lint = page.getByTestId("library-lint");
    await expect(lint).toBeVisible({ timeout: 25_000 });
    await expect(lint).toBeDisabled();

    // The door exists although no check has ever run and there is no log to remember one.
    const door = page.getByTestId("library-open-report");
    await expect(door).toBeVisible();
    await door.click();
    await expect(page.getByTestId("library-check-structural")).toBeVisible({ timeout: 25_000 });

    // Every planted finding, grouped by the code `wiki-validate` prints, with a page door.
    await expect
      .poll(() => readReport(page), { timeout: 20_000 })
      .toEqual(expectedRows);

    // The head states both totals and says what each counts.
    const head = page.getByTestId("library-check-structural-head");
    await expect(head).toContainText("4 pages");
    await expect(head).toContainText("2 off-template");
    await expect(head).toContainText("6 findings");

    // The computed half never wears the agent's empty words, and the agent's half says
    // plainly that it has not read anything — directly below a live list of six rows.
    await expect(page.getByTestId("library-check-structural")).not.toContainText("has not read these pages yet");
    await expect(page.getByTestId("library-check-semantic")).toContainText("has not read these pages yet");

    // A structural row's door is the page name, and it opens that page. No Fix, no Propose:
    // those write, so they stay on the agent's half (owner decision 4).
    await expect(page.getByTestId("library-finding-fix")).toHaveCount(0);
    await page
      .locator('[data-testid="library-structural-group"][data-code="citation-target-missing"]')
      .getByTestId("library-finding-page")
      .first()
      .click();
    await expect(page.getByTestId("library-reading-pane")).toBeVisible({ timeout: 20_000 });
  });

  test("the same list is there after quitting and reopening the app", async ({ page }) => {
    await openFolder(page);
    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-open-report").click();
    await expect
      .poll(() => readReport(page), { timeout: 20_000 })
      .toEqual(expectedRows);

    // Quit and reopen: the page is torn down and the folder is restored from IndexedDB.
    // The index switch is remembered, so the column comes back on the Wiki half rather
    // than on Sources — waiting for the wrong list here would time out on a healthy app.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });
    await page.getByTestId("library-open-report").click();
    await expect
      .poll(() => readReport(page), { timeout: 20_000 })
      .toEqual(expectedRows);
  });
});

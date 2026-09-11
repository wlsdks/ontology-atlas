import { expect, type Page } from "@playwright/test";

/**
 * **One planted folder for every proof about the Check-results page.**
 *
 * It lives outside both specs because two of them need the same bytes and a spec may not
 * import another spec — Playwright would register that file's tests twice. The recovery
 * proof (`library-check-computed.spec.ts`) asserts what the page lists; the touch-target
 * contract asserts what a finger can hit on it; a temporary capture harness shoots it.
 * A frame, a hit box and a row count that came from three different folders would be three
 * facts about nothing.
 *
 * Two deliberate absences make it a proof rather than a demonstration, and both belong to
 * the folder rather than to any one spec:
 *
 * 1. **No runtime.** `acp_detect_runtimes` answers `[]`, so `agent.route` is never
 *    `"agent"` and nothing on this screen can start a turn.
 * 2. **No `wiki/_log.md`.** The counts in a log alone used to satisfy the report door's
 *    condition, so a proof run against a folder that had one would pass whether or not the
 *    door was fixed. This folder has never been checked, which is the state a person who
 *    has never run a check is actually in.
 *
 * The link topology is deliberate: merchant ← refund, refund ← merchant and settlement,
 * settlement ← refund, and settlement-ko ← nobody, so exactly one page is an orphan rather
 * than all four.
 */

export const LIBRARY_CHECK_VAULT_ROOT = "/Users/probe/Ontology Atlas/payments";

const PAGE = (title: string, sources: readonly string[], facts: string, links = "") =>
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
  ].join("\n");

export const LIBRARY_CHECK_VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: payments", "title: Payments", "---", "", "# Payments", ""].join("\n"),
  "sources/merchant-onboarding.html": "<p>onboarding</p>\n",
  "sources/settlement-policy.md": "# Settlement policy\n\nT+2.\n",
  "wiki/_template.md":
    "---\ntitle: <the page name>\ncreated_by: agent:claude\ncompiled_at: 2026-01-01T00:00:00Z\nsources:\n  - sources/<file>\nsource_hash:\n  sources/<file>: <sha256>\nstatus: draft\nsummary: <one sentence>\n---\n\n## Summary\n\n<x>\n\n## Facts\n\n- <c> [[src:sources/<file>#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
  // Two bullets under `## Facts` with no citation — lines 19 and 20 of this page's bytes.
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
 * The app's own bridge, answered from a map.
 *
 * Stubbing `showDirectoryPicker` would prove nothing: with the desktop signal present the
 * folder is taken through `TauriDirectoryHandle`, so the commands the walk actually calls
 * are what this answers — which exercises the real handle, the real walk and the real
 * library model.
 */
export async function installLibraryCheckBridge(page: Page) {
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
    { files: { ...LIBRARY_CHECK_VAULT }, rootPath: LIBRARY_CHECK_VAULT_ROOT },
  );
}

/**
 * The folder, then the Library. The rail is clicked where it exists and the address is used
 * where it does not: below `lg` there is no `app-nav-rail`, which is the first thing a
 * narrow run teaches.
 */
export async function openLibraryCheckFolder(page: Page) {
  await page.goto("/en/docs/");
  await page.waitForLoadState("networkidle");
  const door = page.getByRole("button", { name: /^Open my folder/ });
  await door.first().waitFor({ timeout: 25_000 });
  await door.first().click();
  await page.getByRole("heading", { name: "Map", level: 1 }).waitFor({ timeout: 30_000 });
  const rail = page.getByTestId("app-nav-rail").getByRole("link", { name: "Library" });
  if (await rail.isVisible().catch(() => false)) await rail.click();
  else await page.goto("/en/library/?guides=off");
  await page.getByTestId("library-sources").waitFor({ timeout: 30_000 });
}

/** The folder, the Wiki half of the index, and the Check-results page open in the pane. */
export async function openLibraryCheckReport(page: Page) {
  await openLibraryCheckFolder(page);
  await page.getByTestId("library-index-segment-wiki").click();
  await page.getByTestId("library-wiki").waitFor({ timeout: 30_000 });
  await page.getByTestId("library-open-report").click();
  await expect(page.getByTestId("library-check-structural")).toBeVisible({ timeout: 25_000 });
}

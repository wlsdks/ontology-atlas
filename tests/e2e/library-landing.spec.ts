import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **A folder of pages and no nodes lands on the Library, not on an empty map.**
 *
 * The vault shape is one folder: `sources/` and `wiki/` always, the map's folders when
 * there is a map (ledger, 2026-09-06). A person who opened Atlas on documents has a
 * wiki on its own; landing them on the topology canvas showed nothing and said nothing.
 * When the manifest holds at least one wiki page and no `kind:` node, opening the folder
 * goes to `/library`. A folder with a node keeps landing on the map — the two dock specs
 * pin that with a `project.md` in their stub.
 *
 * Same stubbed desktop bridge as `library-compile-dock.spec.ts`, for the reason it records.
 */

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

const VAULT: Record<string, string> = {
  "sources/plan.pdf": "%PDF-1.7 plan\n",
  "wiki/_template.md": "---\ntitle: <the page name>\ncreated_by: agent:claude\ncompiled_at: 2026-01-01T00:00:00Z\nsources:\n  - sources/<file>\nsource_hash:\n  sources/<file>: <sha256>\nstatus: draft\nsummary: <one sentence>\n---\n\n## Summary\n\n<x>\n\n## Facts\n\n- <c> [[src:sources/<file>#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
  "wiki/plan.md": "---\ntitle: Plan\ncreated_by: agent:claude\ncompiled_at: 2026-09-06T10:00:00Z\nsources:\n  - sources/plan.pdf\nsource_hash:\n  sources/plan.pdf: 3b1f0a00000000000000000000000000000000000000000000000000000000ab\nstatus: draft\nsummary: Plan.\n---\n\n## Summary\n\nPlan.\n\n## Facts\n\n- A fact. [[src:sources/plan.pdf#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n",
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

test.describe("A folder of pages and no nodes opens on the Library", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page);
  });

  test("opening the folder lands on the Library with the page listed", async ({ page }) => {
    await page.goto("/en/docs/");
    await page.waitForLoadState("networkidle");
    const door = page.getByRole("button", { name: /^Open my folder/ });
    await door.first().waitFor({ timeout: 25_000 });
    await door.first().click();
    await expect(page.getByTestId("library-wiki")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/en\/library\/?/);
    await expect(page.getByTestId("library-wiki")).toContainText("Wiki · 1");
    await expect(page.getByTestId("library-wiki")).not.toContainText("<the page name>");
  });
});

import { expect, test, type Page } from "@playwright/test";

import { FIRST_RUN_SEEN_ENTRIES, seedFirstRunSeen } from "../../first-run-seed";

/**
 * A wiki with pages and no `kind:` node lands on `/library`, not on an empty map. The desktop bridge
 * is stubbed as in `library-compile-dock.spec.ts`.
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
    /*
     * The index draws one list and the workspace tabs name every count, so the count that
     * proves the page arrived is on the Wiki tab; the list itself is one press away.
     */
    const segment = page.getByTestId("library-workspace-tabs");
    await expect(segment).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/en\/library\/?/);
    await expect(page.getByTestId("library-workspace-wiki")).toHaveAccessibleName("Wiki, 1");
    await expect(page.getByTestId("library-reader-landing")).toBeVisible();
    /*
     * The home draws the picture with nothing chosen; the guide is behind its door. Seeding the first-run
     * keys includes the guide's self-raise, so it is not up.
     */
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await expect(page.getByTestId("library-guide-open")).toHaveCount(1);
    await expect(page.getByTestId("library-stage")).toHaveCount(0);
    await page.getByTestId("library-workspace-wiki").click();
    await expect(page.getByTestId("library-wiki")).toBeVisible();
    // The rail reads the same files: a wiki without a map has no map doors, and keeps the
    // wiki, the agent, MCP and history.
    await expect(page.getByTestId("app-nav-rail-item-library")).toBeVisible();
    await expect(page.getByTestId("app-nav-rail-item-agents")).toBeVisible();
    await expect(page.getByTestId("app-nav-rail-item-map")).toHaveCount(0);
    await expect(page.getByTestId("app-nav-rail-item-architecture")).toHaveCount(0);
    await expect(page.getByTestId("app-nav-rail-item-insights")).toHaveCount(0);
    await expect(page.getByTestId("library-wiki")).not.toContainText("<the page name>");
  });
});

/**
 * The guide raises itself once per machine (`atlas.library.guide-seen`). Every other case seeds that
 * key, so this one seeds nothing: raise, settle on one press, then the second open is the picture.
 */
test.describe("the Library guide raises itself once per machine", () => {
  test("the first open raises it, a press settles it, and the second open is the picture", async ({
    page,
  }) => {
    /*
     * Seeded by hand minus one key: `seedFirstRunSeen` and `?guides=off` both write `guide-seen`.
     * The other keys stay seeded: the docs destination raises its own first-visit overlay.
     */
    await page.addInitScript((entries: readonly (readonly [string, string])[]) => {
      for (const [key, value] of entries) {
        if (key === "atlas.library.guide-seen") continue;
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* private mode */
        }
      }
    }, FIRST_RUN_SEEN_ENTRIES);
    await installDesktopBridge(page);
    await page.goto("/en/docs/");
    await page.waitForLoadState("networkidle");
    const door = page.getByRole("button", { name: /^Open my folder/ });
    await door.first().waitFor({ timeout: 25_000 });
    await door.first().click();
    await page.getByTestId("library-graph-canvas").waitFor({ timeout: 30_000 });

    // 1 — up on its own, and hanging from the door rather than floating over the canvas.
    const guide = page.getByTestId("library-guide-popover");
    await expect(guide).toBeVisible();
    const opener = (await page.getByTestId("library-guide-open").boundingBox())!;
    const panel = (await guide.boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(opener.y + opener.height);
    expect(panel.width).toBeLessThanOrEqual(560);
    await expect(guide.getByTestId("library-stage")).toBeVisible();

    // 2 — Escape is a press, and the machine remembers it.
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    expect(
      await page.evaluate(() => window.localStorage.getItem("atlas.library.guide-seen")),
    ).toBe("on");

    // 3 — and it never raises itself again.
    await page.reload();
    await page.getByTestId("library-graph-canvas").waitFor({ timeout: 30_000 });
    await expect(page.getByTestId("library-guide-popover")).toHaveCount(0);
    await expect(page.getByTestId("library-guide-open")).toBeVisible();
  });
});

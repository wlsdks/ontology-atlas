import type { Page } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The installed app's rail, reproduced in a browser, with the native answers slow on purpose.**
 *
 * Why this file exists: the flicker the owner reported on 2026-09-12 — *"when this right-hand
 * area switches it loads with a strange flicker"* — is invisible to every web gate. On the web
 * `useAtlasGitContext` resolves `vaultPath` to `null` (an FSA handle has no path), so History
 * renders its honest `web` degradation card and never enters the state that flashes. The screen
 * the owner photographed is the **desktop** one: arriving at History paints the loading skeleton
 * and the connect stepper, then replaces both with the workbench.
 *
 * The app is a WKWebView shipping the same static export, so injecting the Tauri runtime signal
 * exercises the same render boundary (`desktop-shell-rail.spec.ts` established that reasoning).
 * What this harness adds is **latency**: every native answer is delayed by
 * `NATIVE_LATENCY_MS`, because a stub that resolves in the same microtask hides exactly the
 * window a flash lives in. A real `git_status` + `git_history` + `git_diff` on a vault-sized
 * repository costs tens to hundreds of milliseconds; 120 ms is inside that range and is long
 * enough for a fallback to reach the screen on any machine.
 *
 * The vault content is `fixture-vault.ts` — the same deterministic fixture the accessibility and
 * contrast gates measure with — served through the native file commands rather than OPFS.
 */

/**
 * How long every native answer takes.
 *
 * Not zero: a stub that answers immediately makes a per-visit cold start unobservable, and the
 * gate would then pass on the defect. Not seconds either — the point is to reproduce a normal
 * answer, not a pathological one.
 */
export const NATIVE_LATENCY_MS = 120;

export const DESKTOP_VAULT_ROOT = "/Users/probe/atlas-vault";

const COMMITS = [
  {
    shortHash: "a1b2c3d",
    hash: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    subject: "feat: record the settlement boundary",
    relativeTime: "2 hours ago",
    isoTime: "2026-09-12T06:00:00.000Z",
    author: "stark",
    files: [{ path: "capabilities/settlement-report.md", status: "modified", kind: "capability", slug: "capabilities/settlement-report", renamedFrom: null }],
  },
  {
    shortHash: "b2c3d4e",
    hash: "b2c3d4e5f60718293a4b5c6d7e8f90123456789a",
    subject: "docs: explain the order domain",
    relativeTime: "yesterday",
    isoTime: "2026-09-11T06:00:00.000Z",
    author: "stark",
    files: [{ path: "domains/order.md", status: "modified", kind: "domain", slug: "domains/order", renamedFrom: null }],
  },
];

const PENDING = [
  { path: "domains/order.md", status: "modified", kind: "domain", slug: "domains/order", renamedFrom: null },
];

const DIFF = `diff --git a/domains/order.md b/domains/order.md
index 1111111..2222222 100644
--- a/domains/order.md
+++ b/domains/order.md
@@ -1,3 +1,4 @@
 # Order
+One more sentence of meaning.
`;

/**
 * Installs the runtime before any application script runs.
 *
 * Everything is defined inside the init script's own scope: `addInitScript` serializes the
 * function, so a reference to a module-level constant here would be `undefined` in the page.
 */
export async function installDesktopRailRuntime(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await page.addInitScript(
    (input: {
      root: string;
      latency: number;
      files: Record<string, string>;
      commits: unknown[];
      pending: unknown[];
      diff: string;
    }) => {
      const { root, latency, files, commits, pending, diff } = input;
      const mtime = Date.now();
      const callbacks = new Map<number, (event: { event: string; payload: unknown }) => void>();
      let nextCallback = 1;

      /** Counts what the arriving screen asked the native side for, per command. */
      const calls: { command: string; at: number }[] = [];
      (window as unknown as { __nativeCalls: typeof calls }).__nativeCalls = calls;

      const relative = (value: unknown): string =>
        String(value ?? "").replace(/^\/+/, "").replace(/\/+$/, "");

      const slow = <T>(value: T): Promise<T> =>
        new Promise((resolve) => setTimeout(() => resolve(value), latency));

      const status = {
        ok: true,
        initialized: true,
        repoRoot: root,
        branch: "main",
        upstream: "origin/main",
        changedCount: pending.length,
        changes: pending,
        ahead: 0,
        behind: 0,
        stagedOutsideVault: [],
      };

      const answer = (command: string, args: Record<string, unknown>): Promise<unknown> | null => {
        switch (command) {
          case "git_probe":
            return slow({ installed: true, version: "git version 2.49.0", path: "/usr/bin/git" });
          case "git_status":
            return slow(status);
          case "git_history":
            return slow(commits);
          case "git_diff":
            return slow({ count: pending.length, files: pending, diff, truncated: false });
          case "git_commit_diff":
            return slow({ count: 1, files: commits[0] ? (commits[0] as { files: unknown[] }).files : [], diff, truncated: false });
          case "pick_vault_directory":
            return slow(root);
          case "vault_path_exists": {
            const path = relative(args.relativePath);
            if (args.kind === "directory") {
              return slow(path === "" || Object.keys(files).some((file) => file.startsWith(`${path}/`)));
            }
            return slow(path in files);
          }
          case "list_vault_directory": {
            const directory = relative(args.relativePath);
            const prefix = directory ? `${directory}/` : "";
            const entries = new Map<string, "file" | "directory">();
            for (const file of Object.keys(files)) {
              if (!file.startsWith(prefix)) continue;
              const rest = file.slice(prefix.length);
              if (!rest) continue;
              const [name, child] = rest.split("/");
              entries.set(name, child ? "directory" : "file");
            }
            return slow([...entries].map(([name, kind]) => ({ name, kind })));
          }
          case "read_vault_text_file": {
            const path = relative(args.relativePath);
            if (!(path in files)) return Promise.reject(new Error(`missing ${path}`));
            return slow({ text: files[path], lastModified: mtime });
          }
          case "read_vault_binary_file": {
            const path = relative(args.relativePath);
            if (!(path in files)) return Promise.reject(new Error(`missing ${path}`));
            return slow({ bytes: [...new TextEncoder().encode(files[path])], lastModified: mtime });
          }
          case "vault_fingerprint":
            return slow(`fixture-${Object.keys(files).length}`);
          case "hash_vault_files":
            return slow((args.relativePaths as string[]).map((relativePath) => ({ relativePath, hash: "0".repeat(64) })));
          case "plugin:event|listen": {
            const id = Number(args.handler);
            return Promise.resolve(id);
          }
          case "plugin:event|unlisten":
            return Promise.resolve(null);
          case "acp_detect_runtimes":
            return slow([]);
          case "discover_mcp_connectors":
            return slow({ servers: [], problems: [] });
          case "discover_source_candidates":
            return slow({ candidates: [], truncated: false, unreadableRoots: [] });
          case "mcp_bundled_server":
            return slow({ path: `${root}/mcp`, available: true, reason: null });
          case "secret_status":
            return slow({ provider: args.provider, stored: false, last4: null });
          case "start_vault_watch":
          case "ensure_vault_directory":
            return Promise.resolve(null);
          default:
            return null;
        }
      };

      (window as unknown as { isTauri?: boolean }).isTauri = true;
      (
        window as unknown as {
          __TAURI_INTERNALS__: {
            transformCallback(callback: (event: { event: string; payload: unknown }) => void): number;
            invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__ = {
        transformCallback(callback) {
          const id = nextCallback++;
          callbacks.set(id, callback);
          return id;
        },
        invoke(command, args = {}) {
          calls.push({ command, at: Math.round(performance.now()) });
          const handled = answer(command, args);
          // An unknown command must reject rather than hang: a pending promise would be
          // indistinguishable from a slow machine and would make every measurement below a lie.
          return handled ?? Promise.reject(new Error(`unstubbed native command: ${command}`));
        },
      };
      (
        window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener(): void } }
      ).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    {
      root: DESKTOP_VAULT_ROOT,
      latency: NATIVE_LATENCY_MS,
      files: { ...FIXTURE_VAULT },
      commits: COMMITS,
      pending: PENDING,
      diff: DIFF,
    },
  );
}

/**
 * Opens the installed-app entry point and mounts the fixture vault through the native picker,
 * leaving the rail on screen with a settled workbench.
 */
export async function mountDesktopVault(page: Page): Promise<void> {
  await page.goto("/en/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-open").click();
  await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });
}

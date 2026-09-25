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
/** When one path last changed, as the native `git_paths_last_change` walk answers it. */
export interface StubPathChange {
  exists: boolean;
  isDir: boolean;
  lastChangedAt: string | null;
}

export interface DesktopRuntimeOptions {
  /** Serve only `extraFiles`, without the shared fixture vault underneath them. */
  replaceFixture?: boolean;
  /**
   * Answers for `git_paths_last_change`, keyed by the path exactly as the app passes it. Without
   * this the command stays unstubbed and rejects, as it always has.
   */
  gitPathChanges?: Record<string, StubPathChange>;
  /** A longer history than the two default steps, for layouts that only break with a real list. */
  commits?: readonly unknown[];
  /** The patch every diff command answers with, for a reader that shows a whole document. */
  diff?: string;
  /**
   * Per-document patches for `git_document_diff`, keyed by vault-relative path. A path not
   * listed falls back to `diff`. Without it every document read back one document's body.
   */
  documentDiffs?: Record<string, string>;
  /**
   * Answer a path-scoped `git_history` with only the steps that touched that path, as git
   * does. Off by default so existing specs keep their one shared history.
   */
  scopeHistoryByPath?: boolean;
  /**
   * Fields laid over the `git_status` answer, e.g. a saved origin that was never sent
   * (`{ upstream: null, ahead: null, behind: null, hasOrigin: true }`). Without it every spec
   * keeps the tracked `origin/main` it always had.
   */
  gitStatus?: Record<string, unknown>;
  /**
   * The models tab's native answers (2026-09-25): Keychain state, local runners by address, the
   * experimental Jev bridge, and the sent log. Without it only `secret_status` answers (no key),
   * as before. Every stubbed transfer appends a line to `.ontology-atlas/llm-audit.jsonl` in the
   * served vault, the way `llm_audit::reserve` + `finalize` do, so the tab's count is read back
   * through the same file path the app reads.
   */
  models?: ModelsStubOptions;
}

export interface ModelsStubOptions {
  /** Saved keys by provider → their last four characters. */
  keys?: Partial<Record<"anthropic" | "openai" | "gemini", string>>;
  /** The saved Jev key's last four, or nothing saved. */
  jevKey?: string | null;
  /**
   * How each runner address answers `secret_verify` for the local provider. An address not
   * listed answers like nothing is listening (curl exit, no HTTP status).
   */
  runners?: Record<string, { answer: "ok"; models: string[] } | { answer: "unreachable" | "not-compatible" }>;
  /** Existing sent-log lines (JSON objects) the vault starts with. */
  audit?: Record<string, unknown>[];
}

export async function installDesktopRailRuntime(
  page: Page,
  extraFiles: Record<string, string> = {},
  runtimeResponses?: { fast: unknown[]; probed: unknown[] },
  options: DesktopRuntimeOptions = {},
): Promise<void> {
  await seedFirstRunSeen(page);
  await page.addInitScript(
    (input: {
      root: string;
      latency: number;
      files: Record<string, string>;
      commits: unknown[];
      pending: unknown[];
      diff: string;
      documentDiffs?: Record<string, string>;
      scopeHistoryByPath?: boolean;
      gitStatus?: Record<string, unknown>;
      runtimeResponses?: { fast: unknown[]; probed: unknown[] };
      gitPathChanges?: Record<string, { exists: boolean; isDir: boolean; lastChangedAt: string | null }>;
      models?: {
        keys?: Record<string, string>;
        jevKey?: string | null;
        runners?: Record<string, { answer: string; models?: string[] }>;
        audit?: Record<string, unknown>[];
      };
    }) => {
      const { root, latency, files, commits, pending, diff } = input;
      const AUDIT = ".ontology-atlas/llm-audit.jsonl";
      const keys: Record<string, string> = { ...(input.models?.keys ?? {}) };
      let jevKey: string | null = input.models?.jevKey ?? null;
      if (input.models?.audit?.length) {
        files[AUDIT] = input.models.audit.map((line) => JSON.stringify(line)).join("\n") + "\n";
      }
      /** What left, as the page would see it recorded: one finished line per transfer. */
      const recordTransfer = (line: Record<string, unknown>) => {
        files[AUDIT] = (files[AUDIT] ?? "") + JSON.stringify({ v: 1, at: new Date().toISOString(), ...line }) + "\n";
      };
      const sentJevPayloads: string[] = [];
      (window as unknown as { __jevPayloads: string[] }).__jevPayloads = sentJevPayloads;
      const keyStatus = (provider: string) => ({ provider, stored: provider in keys, last4: keys[provider] ?? null });
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
        ...(input.gitStatus ?? {}),
      };

      const answer = (command: string, args: Record<string, unknown>): Promise<unknown> | null => {
        switch (command) {
          case "git_probe":
            return slow({ installed: true, version: "git version 2.49.0", path: "/usr/bin/git" });
          case "git_status":
            return slow(status);
          case "git_history": {
            const path = typeof args.path === "string" ? args.path : null;
            if (!path || !input.scopeHistoryByPath) return slow(commits);
            return slow(
              commits.filter((commit) =>
                ((commit as { files?: { path: string }[] }).files ?? []).some((file) => file.path === path),
              ),
            );
          }
          case "git_diff":
            return slow({ count: pending.length, files: pending, diff, truncated: false });
          case "git_document_diff":
            return slow({
              path: args.relativePath,
              diff: input.documentDiffs?.[String(args.relativePath)] ?? diff,
              untracked: false,
              tooLarge: false,
            });
          case "git_commit_diff":
            return slow({ count: 1, files: commits[0] ? (commits[0] as { files: unknown[] }).files : [], diff, truncated: false });
          case "git_paths_last_change": {
            if (!input.gitPathChanges) return null;
            const changes = input.gitPathChanges;
            const asked = [...((args.repoPaths as string[]) ?? []), ...((args.vaultPaths as string[]) ?? [])];
            return slow(asked.map((path) => ({ path, ...(changes[path] ?? { exists: false, isDir: false, lastChangedAt: null }) })));
          }
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
          // The native answer for a vault that never saved a constellation is `null`
          // (`read_library_collections` returns `Ok(None)` for an absent sidecar or file).
          // Left unstubbed it rejected, and every capture through this harness showed the
          // map's constellation popover in its read-failure state.
          case "read_library_collections":
            return slow(files[".ontology-atlas/library-collections.json"] ?? null);
          case "write_library_collections": {
            const key = ".ontology-atlas/library-collections.json";
            const current = files[key] ?? null;
            if (current !== (args.expectedContent ?? null)) return slow({ written: false, currentContent: current });
            files[key] = String(args.content);
            return slow({ written: true, currentContent: files[key] });
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
            return slow(input.runtimeResponses ? (args.probeLogin ? input.runtimeResponses.probed : input.runtimeResponses.fast) : []);
          case "acp_start":
            // Destination-opening tests inspect the dock before any agent session
            // or prompt. An unresolved fixture start cannot reach a provider.
            if (input.runtimeResponses) return new Promise(() => {});
            return null;
          case "discover_mcp_connectors":
            return slow({ servers: [], problems: [] });
          case "discover_source_candidates":
            return slow({ candidates: [], truncated: false, unreadableRoots: [] });
          case "mcp_bundled_server":
            return slow({ path: `${root}/mcp`, available: true, reason: null });
          case "secret_status":
            if (!input.models) return slow({ provider: args.provider, stored: false, last4: null });
            return slow(keyStatus(String(args.provider)));
          case "secret_set": {
            if (!input.models) return null;
            keys[String(args.provider)] = String(args.secret).trim().slice(-4);
            return slow(keyStatus(String(args.provider)));
          }
          case "secret_clear": {
            if (!input.models) return null;
            delete keys[String(args.provider)];
            return slow(keyStatus(String(args.provider)));
          }
          case "secret_verify": {
            if (!input.models) return null;
            const provider = String(args.provider);
            if (provider === "local") {
              const baseUrl = String(args.baseUrl ?? "").replace(/\/+$/, "");
              const host = baseUrl.split("://")[1]?.split("/")[0] ?? baseUrl;
              const runner = input.models.runners?.[baseUrl];
              const base = { provider, denied: false, durationMs: 9, loggedAt: new Date().toISOString() };
              let result: Record<string, unknown>;
              if (!runner || runner.answer === "unreachable") {
                result = { ...base, ok: false, httpStatus: null, message: "curl exit 7: connection refused", body: null };
              } else if (runner.answer === "not-compatible") {
                result = { ...base, ok: false, httpStatus: 404, message: null, body: null };
              } else {
                result = {
                  ...base,
                  ok: true,
                  httpStatus: 200,
                  message: null,
                  body: JSON.stringify({ data: (runner.models ?? []).map((id) => ({ id })) }),
                };
              }
              recordTransfer({
                provider,
                host,
                model: null,
                purpose: "verify",
                question: null,
                scope: { nodes: [], promptChars: 0, vaultChars: 0 },
                payloadSha256: "0".repeat(64),
                outcome: result.ok ? "ok" : "error",
                httpStatus: result.httpStatus,
                responseChars: 0,
                durationMs: 9,
              });
              return slow(result);
            }
            const ok = provider in keys;
            recordTransfer({
              provider,
              host: `api.${provider}.com`,
              model: null,
              purpose: "verify",
              question: null,
              scope: { nodes: [], promptChars: 0, vaultChars: 0 },
              payloadSha256: "0".repeat(64),
              outcome: ok ? "ok" : "denied",
              httpStatus: ok ? 200 : 401,
              responseChars: 0,
              durationMs: 9,
            });
            return slow({ provider, ok, denied: !ok, httpStatus: ok ? 200 : 401, message: null, durationMs: 9, loggedAt: new Date().toISOString(), body: null });
          }
          case "jev_secret_status":
            if (!input.models) return null;
            return slow({ stored: jevKey !== null, last4: jevKey });
          case "jev_secret_set":
            if (!input.models) return null;
            jevKey = String(args.secret).trim().slice(-4);
            return slow({ stored: true, last4: jevKey });
          case "jev_secret_clear":
            if (!input.models) return null;
            jevKey = null;
            return slow({ stored: false, last4: null });
          case "jev_judge": {
            if (!input.models) return null;
            const payload = String(args.payload);
            sentJevPayloads.push(payload);
            const parsed = JSON.parse(payload) as { state: { claim: string; evidence: string } };
            recordTransfer({
              provider: "jev",
              host: "api.typesafe.ai",
              model: "jev-latest",
              purpose: "judgment",
              question: null,
              scope: { nodes: [], promptChars: [...parsed.state.claim].length + [...parsed.state.evidence].length, vaultChars: 0 },
              payloadSha256: "0".repeat(64),
              outcome: "ok",
              httpStatus: 200,
              responseChars: 180,
              durationMs: 420,
            });
            return slow({
              choice: "contradicted",
              confidence: 0.91,
              probabilities: { supported: 0.04, contradicted: 0.91, insufficient: 0.05 },
              responseModel: "jev-1.13.0",
              loggedAt: new Date().toISOString(),
            });
          }
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
      files: options.replaceFixture ? { ...extraFiles } : { ...FIXTURE_VAULT, ...extraFiles },
      commits: [...(options.commits ?? COMMITS)],
      pending: PENDING,
      diff: options.diff ?? DIFF,
      documentDiffs: options.documentDiffs,
      scopeHistoryByPath: options.scopeHistoryByPath,
      gitStatus: options.gitStatus,
      runtimeResponses,
      gitPathChanges: options.gitPathChanges,
      models: options.models,
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

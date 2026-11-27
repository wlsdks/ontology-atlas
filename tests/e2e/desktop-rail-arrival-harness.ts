import type { Page } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { dogfoodVaultFiles } from "./map/dogfood-vault-files";

/**
 * The faked app runtime: the installed app's native bridge (`window.__TAURI_INTERNALS__`) answered
 * from folders held in the page, so a spec runs the screens the app runs. Every native answer is
 * delayed by `NATIVE_LATENCY_MS`: a stub that resolves in the same microtask hides the window a
 * flash lives in. The Tauri runtime signal is injected because the app ships the same export.
 *
 * ## Moving a spec onto it
 *
 * Call `installDesktopRailRuntime(page, extraFiles, undefined, options)` before the first
 * `page.goto`, then open the folder the way a person does: `mountDesktopVault(page)`, or press
 * `first-run-open` / `first-run-starter-open` and then `vault-guide-pick-existing` on the screen
 * under test. `tests/contract/e2e/app-route-runtime.contract.test.ts` lists the specs not yet
 * moved; a spec leaves its list when it installs this runtime and names none of the browser doors.
 *
 * | The spec used | It now does |
 * |---|---|
 * | `stubDirectoryPicker(page, files)` | `installDesktopRailRuntime(page, files, undefined, { replaceFixture: true })`; the picker is `pick_vault_directory`. |
 * | `writeFolderBeforePick` | put the files in `extraFiles`, or `writeDesktopFile` before the press. |
 * | `useDogfoodSample` or `demo:sample-source` (the bundled Atlas sample) | `{ replaceFixture: true }` with `atlasSampleFiles()` as `extraFiles`. |
 * | the Storefront sample (`/project/storefront`, the bundled Online Store) | the default: with no `replaceFixture` the folder holds `storefrontFiles()`. |
 * | `?shell=desktop` | drop it: the runtime is the desktop shell. |
 * | a browser handle written through OPFS | `writeDesktopFile` / `removeDesktopFile` / `renameDesktopFile`, read back with `readDesktopFile`. |
 * | `showOpenFilePicker` stubbed | `externalFiles` + `chooseSourceFiles` (`pick_source_files`, then `import_source_files`). |
 * | a records seed in IndexedDB (`demo-kv`) | `seedKnownDesktopFolders`, which writes the app's records with `desktopRootPath`. |
 * | `queryPermission` patched to `denied` | the app has no permission prompt: a folder it holds no grant for is `ungrantedFolders`, one that vanished is a root `folders` does not serve. |
 *
 * Seeding: `storefrontFiles()` is the shared fixture folder (Storefront), `atlasSampleFiles()` is
 * the product's own vault (`docs/ontology`), and any `Record<path, text>` is a folder. Texts are
 * served as written: a `{{NOW-<ms>}}` token is not resolved here, so build the text in the spec.
 *
 * Several folders: `options.folders` serves each by its absolute path and makes every command
 * check the `rootPath` it names. `chooseDesktopFolder(page, rootA, rootB)` sets what the next
 * picker presses answer, in order, the last one repeating; `null` is a cancelled dialog.
 *
 * Writing and reload: `options.writable` (implied by `folders`) lets the app write, create,
 * remove and ensure directories, and keeps every change across `page.reload()` and `page.goto()`
 * in the same tab: changes are laid over the seed from this tab's sessionStorage, so the seed
 * never overwrites them. Tests write and read the same store: `writeDesktopFile`,
 * `readDesktopFile`, `readDesktopBytes`, `removeDesktopFile`, `renameDesktopFile`,
 * `listDesktopFiles`; a write after the page opened changes `vault_fingerprint`, which is how the
 * app notices an outside edit. `refuseDesktopWrites` makes matching writes fail.
 *
 * Source pickers: `chooseSourceFolder` answers `pick_source_directory`, `chooseSourceFiles`
 * answers `pick_source_files`; `import_source_files` then copies from `externalFiles` into
 * `sources/` or `planning/`, refusing a repeat of bytes already there and renaming a taken name.
 *
 * What it does not do: it has no Git beyond the canned `commits`, no agent beyond
 * `runtimeResponses`; `library-work-harness.ts` is the fake for the agent protocol, the Library's
 * wiki writes and search by meaning, with its own small file store.
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
   * The models tab's native answers: Keychain state, local runners, the Jev bridge and the sent log.
   * Each stubbed transfer appends a line to `.ontology-atlas/llm-audit.jsonl` in the served vault.
   */
  models?: ModelsStubOptions;
  /**
   * Let writes land in the served files instead of rejecting as unstubbed: `write_vault_text_file`,
   * `create_vault_text_file`, `remove_vault_entry` and `ensure_vault_directory`. The default
   * folder's files are exposed as `window.__stubFiles`, so a flow that writes (the first-run
   * starter) can be read back from the "disk" rather than from the screen. Writes also survive a
   * reload of the page (see "Reload" in the file's guide). Implied by `folders`.
   */
  writable?: boolean;
  /**
   * More folders than the default one, each served by its absolute path: every native command
   * names the folder it works in (`rootPath`), and the fake answers from that folder's files.
   * With this option a command naming a folder that is not served fails as a vanished folder does
   * (`No such file or directory (os error 2)`); without it every command is answered from the
   * default folder whatever `rootPath` says. `DESKTOP_VAULT_ROOT` stays served (the shared
   * fixture plus `extraFiles`) unless `replaceFixture` is set and it is not listed here.
   */
  folders?: Record<string, Record<string, string>>;
  /**
   * Folders that exist but that the app holds no grant for: every command naming one rejects
   * with `vault-root-not-granted`, as `src-tauri/src/vault/scope.rs` does. The recent list draws
   * such a row as one it cannot vouch for (`unknown`) and the launch counts it as present, not
   * as a vanished folder.
   */
  ungrantedFolders?: readonly string[];
  /**
   * The folder `pick_vault_directory` answers, or `null` for a cancelled dialog. Default
   * `DESKTOP_VAULT_ROOT`. A test changes it later with `chooseDesktopFolder`.
   */
  vaultPick?: string | null;
  /**
   * Files that exist outside every served folder, by absolute path, for `pick_source_files` and
   * `import_source_files` to offer and copy. A value is text, or `{ bytes }` for a binary file.
   */
  externalFiles?: Record<string, string | { bytes: number[] }>;
  /** Answers of `pick_source_directory` (a path, or `null` cancelled) and `pick_source_files`. */
  sourcePick?: { folder?: string | null; files?: string[] };
  /** The answer to `ensure_default_vault_parent_dir` ("Just start"). Unstubbed without it. */
  defaultVaultParent?: string;
  holdReadsUntilReleased?: readonly string[];
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
      writable?: boolean;
      folders?: Record<string, Record<string, string>>;
      ungrantedFolders?: string[];
      vaultPick: string | null;
      externalFiles?: Record<string, string | { bytes: number[] }>;
      sourcePick?: { folder?: string | null; files?: string[] };
      defaultVaultParent?: string;
      holdReadsUntilReleased?: string[];
    }) => {
      const { root, latency, files, commits, pending, diff } = input;
      let held = new Set(input.holdReadsUntilReleased ?? []);
      let heldReads = Promise.withResolvers<void>();
      (window as unknown as { __releaseHeldReads: () => void }).__releaseHeldReads = () => heldReads.resolve();
      (window as unknown as { __holdReads: (paths: string[]) => void }).__holdReads = (paths) => {
        held = new Set(paths);
        heldReads = Promise.withResolvers<void>();
      };
      const afterHeldReads = <T>(paths: string[], read: () => Promise<T>): Promise<T> =>
        paths.some((path) => held.has(path)) ? heldReads.promise.then(read) : read();
      if (input.writable) (window as unknown as { __stubFiles: typeof files }).__stubFiles = files;

      /**
       * The served folders. A folder is its text files, its binary files (bytes, by path) and the
       * directories that hold no file. `files` above is the default folder's text map, shared with
       * `window.__stubFiles` and the sent-log helpers.
       */
      interface Folder {
        files: Record<string, string>;
        binaries: Record<string, number[]>;
        dirs: Set<string>;
      }
      const folders = new Map<string, Folder>([[root, { files, binaries: {}, dirs: new Set() }]]);
      for (const [folderRoot, seed] of Object.entries(input.folders ?? {})) {
        if (folderRoot === root) Object.assign(files, seed);
        else folders.set(folderRoot, { files: { ...seed }, binaries: {}, dirs: new Set() });
      }
      const strictRoots = input.folders !== undefined;
      const persist = Boolean(input.writable) || strictRoots;
      const external = new Map<string, string | { bytes: number[] }>(Object.entries(input.externalFiles ?? {}));
      const enoent = (path: string) => new Error(`No such file or directory (os error 2): ${path}`);

      /**
       * Everything a test changed after the page loaded, kept in this tab's sessionStorage and laid
       * over the seed on every load, so a reload shows the writes without seeding over them.
       */
      const STATE_KEY = "__desktopFake:v1";
      interface Overlay {
        folders: Record<string, { files: Record<string, string | null>; binaries: Record<string, number[] | null>; dirs: Record<string, boolean> }>;
        vaultPicks?: (string | null)[];
        sourceFolder?: string | null;
        sourceFiles?: string[];
        external?: Record<string, string | { bytes: number[] } | null>;
      }
      let overlay: Overlay = { folders: {} };
      try {
        overlay = JSON.parse(window.sessionStorage.getItem(STATE_KEY) ?? "null") ?? overlay;
      } catch {
        /* private mode: writes live for this document only */
      }
      const overlayOf = (folderRoot: string) =>
        (overlay.folders[folderRoot] ??= { files: {}, binaries: {}, dirs: {} });
      const save = () => {
        if (!persist) return;
        try {
          window.sessionStorage.setItem(STATE_KEY, JSON.stringify(overlay));
        } catch {
          /* private mode */
        }
      };
      for (const [folderRoot, changes] of Object.entries(overlay.folders)) {
        let folder = folders.get(folderRoot);
        if (!folder) folders.set(folderRoot, (folder = { files: {}, binaries: {}, dirs: new Set() }));
        for (const [path, text] of Object.entries(changes.files)) {
          if (text === null) delete folder.files[path];
          else folder.files[path] = text;
        }
        for (const [path, bytes] of Object.entries(changes.binaries)) {
          if (bytes === null) delete folder.binaries[path];
          else folder.binaries[path] = bytes;
        }
        for (const [path, present] of Object.entries(changes.dirs)) {
          if (present) folder.dirs.add(path);
          else folder.dirs.delete(path);
        }
      }
      for (const [path, value] of Object.entries(overlay.external ?? {})) {
        if (value === null) external.delete(path);
        else external.set(path, value);
      }
      const vaultPicks: (string | null)[] = overlay.vaultPicks ?? [input.vaultPick];
      let sourceFolder: string | null | undefined =
        overlay.sourceFolder !== undefined ? overlay.sourceFolder : input.sourcePick?.folder;
      let sourceFiles: string[] | undefined = overlay.sourceFiles ?? input.sourcePick?.files;
      /** Bumped by every change after load, so the folder's fingerprint moves when a file does. */
      let revision = 0;

      const hasEntry = (folder: Folder, path: string) => path in folder.files || path in folder.binaries;
      const isDirectory = (folder: Folder, path: string) =>
        path === "" ||
        folder.dirs.has(path) ||
        [...Object.keys(folder.files), ...Object.keys(folder.binaries), ...folder.dirs].some((entry) =>
          entry.startsWith(`${path}/`),
        );
      const exists = (folder: Folder, path: string) => hasEntry(folder, path) || isDirectory(folder, path);
      const putText = (folderRoot: string, folder: Folder, path: string, text: string) => {
        delete folder.binaries[path];
        folder.files[path] = text;
        const changes = overlayOf(folderRoot);
        changes.files[path] = text;
        changes.binaries[path] = null;
        revision += 1;
        save();
      };
      const putBytes = (folderRoot: string, folder: Folder, path: string, bytes: number[]) => {
        delete folder.files[path];
        folder.binaries[path] = bytes;
        const changes = overlayOf(folderRoot);
        changes.binaries[path] = bytes;
        changes.files[path] = null;
        revision += 1;
        save();
      };
      const dropEntry = (folderRoot: string, folder: Folder, path: string) => {
        delete folder.files[path];
        delete folder.binaries[path];
        const changes = overlayOf(folderRoot);
        changes.files[path] = null;
        changes.binaries[path] = null;
        revision += 1;
        save();
      };
      const dropDirectory = (folderRoot: string, folder: Folder, path: string) => {
        for (const entry of [...Object.keys(folder.files), ...Object.keys(folder.binaries)]) {
          if (entry.startsWith(`${path}/`)) dropEntry(folderRoot, folder, entry);
        }
        for (const dir of [...folder.dirs]) {
          if (dir === path || dir.startsWith(`${path}/`)) {
            folder.dirs.delete(dir);
            overlayOf(folderRoot).dirs[dir] = false;
          }
        }
        revision += 1;
        save();
      };
      const addDirectory = (folderRoot: string, folder: Folder, path: string) => {
        if (!path || isDirectory(folder, path)) return;
        folder.dirs.add(path);
        overlayOf(folderRoot).dirs[path] = true;
        revision += 1;
        save();
      };
      const decodeText = (bytes: number[]): string | null => {
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
        } catch {
          return null;
        }
      };
      const bytesOf = (folder: Folder, path: string): number[] | null =>
        path in folder.binaries
          ? folder.binaries[path]
          : path in folder.files
            ? [...new TextEncoder().encode(folder.files[path])]
            : null;
      let failWrites: RegExp[] = [];
      const refusedWrite = (path: string): Promise<never> | null =>
        failWrites.some((pattern) => pattern.test(path)) ? Promise.reject(new Error(`QA write denied: ${path}`)) : null;
      const folderRootOf = (args: Record<string, unknown>) => (typeof args.rootPath === "string" ? args.rootPath : root);

      /** What a test drives from the Playwright side; see the exported helpers below the install. */
      (window as unknown as { __desktopFake: unknown }).__desktopFake = {
        roots: () => [...folders.keys()],
        read: (folderRoot: string, path: string) => {
          const folder = folders.get(folderRoot);
          if (!folder || !hasEntry(folder, path)) return null;
          return path in folder.files ? folder.files[path] : decodeText(folder.binaries[path]);
        },
        readBytes: (folderRoot: string, path: string) => {
          const folder = folders.get(folderRoot);
          return folder ? bytesOf(folder, path) : null;
        },
        write: (folderRoot: string, path: string, value: string | { bytes: number[] }) => {
          let folder = folders.get(folderRoot);
          if (!folder) folders.set(folderRoot, (folder = { files: {}, binaries: {}, dirs: new Set() }));
          if (typeof value === "string") putText(folderRoot, folder, path, value);
          else putBytes(folderRoot, folder, path, value.bytes);
          reportChange(folderRoot, [{ path, kind: "file", lastModified: Date.now(), size: bytesOf(folder, path)?.length ?? 0 }]);
        },
        remove: (folderRoot: string, path: string) => {
          const folder = folders.get(folderRoot);
          if (!folder) return;
          if (hasEntry(folder, path)) {
            dropEntry(folderRoot, folder, path);
            reportChange(folderRoot, [{ path, kind: "missing" }]);
          } else {
            dropDirectory(folderRoot, folder, path);
            reportChange(folderRoot, [], true);
          }
        },
        rename: (folderRoot: string, from: string, to: string) => {
          const folder = folders.get(folderRoot);
          if (!folder || !hasEntry(folder, from)) throw enoent(from);
          if (exists(folder, to)) throw new Error(`File exists (os error 17): ${to}`);
          if (from in folder.files) putText(folderRoot, folder, to, folder.files[from]);
          else putBytes(folderRoot, folder, to, folder.binaries[from]);
          dropEntry(folderRoot, folder, from);
          reportChange(folderRoot, [
            { path: to, kind: "file", lastModified: Date.now(), size: bytesOf(folder, to)?.length ?? 0 },
            { path: from, kind: "missing" },
          ]);
        },
        list: (folderRoot: string) => {
          const folder = folders.get(folderRoot);
          return folder ? [...Object.keys(folder.files), ...Object.keys(folder.binaries)].sort() : null;
        },
        pickVault: (picks: (string | null)[]) => {
          vaultPicks.splice(0, vaultPicks.length, ...picks);
          overlay.vaultPicks = [...picks];
          save();
        },
        pickSourceFolder: (path: string | null) => {
          sourceFolder = path;
          overlay.sourceFolder = path;
          save();
        },
        pickSourceFiles: (paths: string[]) => {
          sourceFiles = paths;
          overlay.sourceFiles = paths;
          save();
        },
        addExternal: (path: string, value: string | { bytes: number[] }) => {
          external.set(path, value);
          (overlay.external ??= {})[path] = value;
          save();
        },
        failWrites: (patterns: string[]) => {
          failWrites = patterns.map((pattern) => new RegExp(pattern));
        },
      };
      const AUDIT = ".ontology-atlas/llm-audit.jsonl";
      const auditReads = new Map<string, { raw: string; bytes: Uint8Array; cursor: number } | null>();
      let auditReadId = 0;
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
      /** The handlers the app registered through `listen`, by event name. */
      const listeners = new Map<string, Set<number>>();
      const emitEvent = (event: string, payload: unknown) => {
        for (const id of listeners.get(event) ?? []) {
          (callbacks.get(id) as ((event: unknown) => void) | undefined)?.({ event, id, payload });
        }
      };
      /** What the native watcher reports when a file changes outside the app. */
      const reportChange = (folderRoot: string, changes: { path: string; kind: string; lastModified?: number; size?: number }[], rescan = false) =>
        emitEvent("vault-changed", { root: folderRoot, changes: rescan ? [] : changes, rescan });

      /** Counts what the arriving screen asked the native side for, per command. */
      const calls: { command: string; at: number }[] = [];
      (window as unknown as { __nativeCalls: typeof calls }).__nativeCalls = calls;

      const relative = (value: unknown): string =>
        String(value ?? "").replace(/^\/+/, "").replace(/\/+$/, "");

      const slow = <T>(value: T): Promise<T> =>
        new Promise((resolve) => setTimeout(() => resolve(value), latency));

      /** `read_vault_text_files` answers framed bytes; see `src/shared/lib/vault-folder/vault-text-frames.ts`. */
      const textFrames = (reads: { relativePath: string; text: string | null; error: string | null }[]): ArrayBuffer => {
        const utf8 = new TextEncoder();
        const parts: Uint8Array[] = [];
        const length = (value: number) => {
          const bytes = new Uint8Array(4);
          new DataView(bytes.buffer).setUint32(0, value, true);
          parts.push(bytes);
        };
        const text = (value: string) => {
          const bytes = utf8.encode(value);
          length(bytes.length);
          parts.push(bytes);
        };
        length(reads.length);
        for (const read of reads) {
          parts.push(Uint8Array.of(read.text === null ? 1 : 0));
          text(read.relativePath);
          if (read.text === null) {
            text(read.error ?? "");
            continue;
          }
          const stamp = new Uint8Array(8);
          new DataView(stamp.buffer).setFloat64(0, mtime, true);
          parts.push(stamp);
          text(read.text);
        }
        const frames = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        for (const part of parts) {
          frames.set(part, offset);
          offset += part.length;
        }
        return frames.buffer;
      };

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
        /** The folder a command works in; `null` when it names one that is not served (strict mode). */
        const target: Folder | null =
          folders.get(folderRootOf(args)) ?? (strictRoots && typeof args.rootPath === "string" ? null : (folders.get(root) as Folder));
        const gone = (): Promise<never> => Promise.reject(enoent(String(args.rootPath)));
        if (typeof args.rootPath === "string" && (input.ungrantedFolders ?? []).includes(args.rootPath)) {
          return Promise.reject(new Error("vault-root-not-granted"));
        }
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
            return slow({ count: status.changedCount, files: status.changes, diff, truncated: false });
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
          case "pick_vault_directory": {
            // The last answer stays until a test sets another, so a second press opens the same folder.
            const picked = vaultPicks.length > 1 ? (vaultPicks.shift() as string | null) : (vaultPicks[0] ?? null);
            overlay.vaultPicks = [...vaultPicks];
            save();
            return slow(picked);
          }
          case "pick_source_directory":
            return sourceFolder === undefined ? null : slow(sourceFolder);
          case "pick_source_files":
            return sourceFiles === undefined ? null : slow(sourceFiles);
          case "import_source_files": {
            if (!target) return gone();
            const destination = String(args.destination ?? "sources");
            const taken = (name: string) => exists(target, `${destination}/${name}`);
            const sameBytes = (left: number[], right: number[] | null) =>
              right !== null && left.length === right.length && left.every((byte, at) => byte === right[at]);
            const results = ((args.sourcePaths as string[]) ?? []).map((sourcePath) => {
              const pickedName = sourcePath.slice(sourcePath.lastIndexOf("/") + 1);
              const source = external.get(sourcePath);
              if (source === undefined) {
                return { pickedName, status: "failed", relativePath: null, sha256: null, size: null, reason: "source-not-found" };
              }
              if (destination === "planning" && !/\.(md|png|jpe?g|webp|avif)$/i.test(pickedName)) {
                return { pickedName, status: "failed", relativePath: null, sha256: null, size: null, reason: "unsupported-type" };
              }
              const bytes = typeof source === "string" ? [...new TextEncoder().encode(source)] : source.bytes;
              const folderPrefix = `${destination}/`;
              const duplicate = [...Object.keys(target.files), ...Object.keys(target.binaries)].some(
                (path) => path.startsWith(folderPrefix) && sameBytes(bytes, bytesOf(target, path)),
              );
              if (duplicate) return { pickedName, status: "duplicate", relativePath: null, sha256: null, size: bytes.length, reason: null };
              const dot = pickedName.lastIndexOf(".");
              const stem = dot > 0 ? pickedName.slice(0, dot) : pickedName;
              const extension = dot > 0 ? pickedName.slice(dot) : "";
              let name = pickedName;
              for (let suffix = 2; taken(name); suffix += 1) name = `${stem} (${suffix})${extension}`;
              const relativePath = `${destination}/${name}`;
              if (typeof source === "string") putText(folderRootOf(args), target, relativePath, source);
              else putBytes(folderRootOf(args), target, relativePath, source.bytes);
              return {
                pickedName,
                status: name === pickedName ? "added" : "renamed",
                relativePath,
                sha256: "0".repeat(64),
                size: bytes.length,
                reason: null,
              };
            });
            return slow(results);
          }
          case "vault_path_exists": {
            if (!target) return gone();
            const path = relative(args.relativePath);
            if (args.kind === "directory") return slow(isDirectory(target, path));
            return slow(hasEntry(target, path));
          }
          case "list_vault_directory": {
            if (!target) return gone();
            const directory = relative(args.relativePath);
            const prefix = directory ? `${directory}/` : "";
            const entries = new Map<string, "file" | "directory">();
            for (const file of [...Object.keys(target.files), ...Object.keys(target.binaries), ...target.dirs]) {
              if (!file.startsWith(prefix)) continue;
              const rest = file.slice(prefix.length);
              if (!rest) continue;
              const [name, child] = rest.split("/");
              const isDirectoryEntry = child !== undefined || target.dirs.has(file);
              entries.set(name, isDirectoryEntry ? "directory" : "file");
            }
            return slow([...entries].map(([name, kind]) => ({ name, kind })));
          }
          case "read_vault_text_file": {
            if (!target) return gone();
            const path = relative(args.relativePath);
            if (path in target.binaries) {
              const decoded = decodeText(target.binaries[path]);
              if (decoded === null) return Promise.reject(new Error("stream did not contain valid UTF-8"));
              return afterHeldReads([path], () => slow({ text: decoded, lastModified: mtime }));
            }
            if (!(path in target.files)) return Promise.reject(enoent(path));
            return afterHeldReads([path], () => slow({ text: target.files[path], lastModified: mtime }));
          }
          case "read_vault_text_files": {
            if (!target) return gone();
            const asked = (args.relativePaths as string[]) ?? [];
            return afterHeldReads(asked.map(relative), () =>
              slow(
                textFrames(
                  asked.map((relativePath) => {
                    const path = relative(relativePath);
                    const text = path in target.files ? target.files[path] : path in target.binaries ? decodeText(target.binaries[path]) : null;
                    return text !== null
                      ? { relativePath, text, error: null }
                      : { relativePath, text: null, error: `missing ${path}` };
                  }),
                ),
              ),
            );
          }
          case "audit_read_prepare": {
            if (auditReads.size) return Promise.reject(new Error("audit-read-failed"));
            const id = String(++auditReadId);
            auditReads.set(id, null);
            return slow(id);
          }
          case "audit_read_begin": {
            const id = String(args.readerId);
            if (!auditReads.has(id)) return Promise.reject(new Error("audit-read-expired"));
            if (!(AUDIT in files)) { auditReads.delete(id); return slow({ missing: true, size: 0 }); }
            const raw = files[AUDIT];
            const bytes = new TextEncoder().encode(raw);
            auditReads.set(id, { raw, bytes, cursor: 0 });
            return slow({ missing: false, size: bytes.length });
          }
          case "audit_read_pull": {
            const read = auditReads.get(String(args.readerId));
            if (!read) return Promise.reject(new Error("audit-read-expired"));
            if (files[AUDIT] !== read.raw) return Promise.reject(new Error("audit-read-changed"));
            if (args.cursor !== read.cursor) return Promise.reject(new Error("audit-read-failed"));
            const bytes = read.bytes.slice(read.cursor, read.cursor + 1048576);
            read.cursor += bytes.length;
            return slow(bytes.buffer);
          }
          case "audit_read_finish": {
            const id = String(args.readerId);
            const read = auditReads.get(id);
            auditReads.delete(id);
            if (!read) return Promise.reject(new Error("audit-read-expired"));
            if (files[AUDIT] !== read.raw) return Promise.reject(new Error("audit-read-changed"));
            if (read.cursor !== read.bytes.length) return Promise.reject(new Error("audit-read-failed"));
            return slow(null);
          }
          case "audit_read_cancel":
            auditReads.delete(String(args.readerId));
            return slow(null);
          case "read_vault_binary_file": {
            if (!target) return gone();
            const path = relative(args.relativePath);
            const body = bytesOf(target, path);
            if (body === null) return Promise.reject(enoent(path));
            const stamped = new Uint8Array(8 + body.length);
            new DataView(stamped.buffer).setBigUint64(0, BigInt(mtime), true);
            stamped.set(body, 8);
            return slow(stamped.buffer);
          }
          case "read_vault_text_tail": {
            if (!target) return gone();
            const path = relative(args.relativePath);
            if (!(path in target.files)) return Promise.reject(enoent(path));
            const lines = target.files[path].split(/\r?\n/);
            if (lines.at(-1) === "") lines.pop();
            return slow(lines.slice(Math.max(0, lines.length - Number(args.maxLines))).join("\n"));
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
          case "vault_fingerprint": {
            if (!target) return gone();
            const count = Object.keys(target.files).length + Object.keys(target.binaries).length;
            return slow(revision === 0 ? `fixture-${count}` : `fixture-${count}-r${revision}`);
          }
          case "hash_vault_files":
            return slow((args.relativePaths as string[]).map((relativePath) => ({ relativePath, hash: "0".repeat(64) })));
          case "plugin:event|listen": {
            const id = Number(args.handler);
            const name = String(args.event);
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name)?.add(id);
            return Promise.resolve(id);
          }
          case "plugin:event|unlisten":
            for (const handlers of listeners.values()) handlers.delete(Number(args.eventId));
            return Promise.resolve(null);
          case "acp_prepare_adapter":
            return Promise.resolve("ready");
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
            return Promise.resolve(typeof args.rootPath === "string" ? args.rootPath : null);
          case "ensure_vault_directory": {
            if (persist && target) addDirectory(folderRootOf(args), target, relative(args.relativePath));
            return persist && !target ? gone() : Promise.resolve(null);
          }
          case "ensure_default_vault_parent_dir":
            return input.defaultVaultParent ? slow(input.defaultVaultParent) : null;
          case "write_vault_text_file": {
            if (!persist) return null;
            if (!target) return gone();
            const path = relative(args.relativePath);
            const refused = refusedWrite(path);
            if (refused) return refused;
            putText(folderRootOf(args), target, path, String(args.content ?? ""));
            return slow(null);
          }
          case "create_vault_text_file": {
            if (!persist) return null;
            if (!target) return gone();
            const path = relative(args.relativePath);
            const refused = refusedWrite(path);
            if (refused) return refused;
            if (hasEntry(target, path)) return slow(false);
            putText(folderRootOf(args), target, path, String(args.content ?? ""));
            return slow(true);
          }
          case "remove_vault_entry": {
            if (!persist) return null;
            if (!target) return gone();
            const path = relative(args.relativePath);
            if (path === "") return Promise.reject(new Error("refusing to remove the selected vault root"));
            if (hasEntry(target, path)) dropEntry(folderRootOf(args), target, path);
            else if (isDirectory(target, path)) {
              const holdsFiles = [...Object.keys(target.files), ...Object.keys(target.binaries)].some((entry) => entry.startsWith(`${path}/`));
              if (holdsFiles && !args.recursive) return Promise.reject(new Error("Directory not empty (os error 66)"));
              dropDirectory(folderRootOf(args), target, path);
            } else return Promise.reject(enoent(path));
            return slow(null);
          }
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
      writable: options.writable,
      folders: options.folders,
      ungrantedFolders: options.ungrantedFolders ? [...options.ungrantedFolders] : undefined,
      vaultPick: options.vaultPick === undefined ? DESKTOP_VAULT_ROOT : options.vaultPick,
      externalFiles: options.externalFiles,
      sourcePick: options.sourcePick,
      defaultVaultParent: options.defaultVaultParent,
      holdReadsUntilReleased: options.holdReadsUntilReleased ? [...options.holdReadsUntilReleased] : undefined,
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

/**
 * Holds every read of these vault-relative paths until `releaseDesktopReads`, so a folder arrives
 * in parts. It replaces an earlier hold, so a spec that opens several folders arms each in turn.
 */
export async function holdDesktopReads(page: Page, paths: readonly string[]): Promise<void> {
  await page.evaluate((held) => (window as unknown as { __holdReads: (paths: string[]) => void }).__holdReads(held), [...paths]);
}

/** Lets every held read answer, and every read after it. */
export async function releaseDesktopReads(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __releaseHeldReads: () => void }).__releaseHeldReads());
}

/** The Storefront folder: the shared fixture vault every install serves unless `replaceFixture` is set. */
export function storefrontFiles(): Record<string, string> {
  return { ...FIXTURE_VAULT };
}

/** The product's own vault (`docs/ontology`) as a folder, for specs that measured the Atlas sample. */
export function atlasSampleFiles(): Record<string, string> {
  return dogfoodVaultFiles();
}

interface DesktopFakeWindow {
  __desktopFake: {
    roots(): string[];
    read(root: string, path: string): string | null;
    readBytes(root: string, path: string): number[] | null;
    write(root: string, path: string, value: string | { bytes: number[] }): void;
    remove(root: string, path: string): void;
    rename(root: string, from: string, to: string): void;
    list(root: string): string[] | null;
    pickVault(picks: (string | null)[]): void;
    pickSourceFolder(path: string | null): void;
    pickSourceFiles(paths: string[]): void;
    addExternal(path: string, value: string | { bytes: number[] }): void;
    failWrites(patterns: string[]): void;
  };
}

type FileBody = string | { bytes: number[] };

const bodyOf = (content: string | Uint8Array): FileBody => (typeof content === "string" ? content : { bytes: [...content] });

/** What the next presses of the folder picker answer, in order; the last one repeats. `null` cancels. */
export async function chooseDesktopFolder(page: Page, ...picks: (string | null)[]): Promise<void> {
  await page.evaluate((answers) => (window as unknown as DesktopFakeWindow).__desktopFake.pickVault(answers), picks);
}

/** What `pick_source_directory` (the connected code folder dialog) answers; `null` cancels. */
export async function chooseSourceFolder(page: Page, path: string | null): Promise<void> {
  await page.evaluate((answer) => (window as unknown as DesktopFakeWindow).__desktopFake.pickSourceFolder(answer), path);
}

/** What `pick_source_files` (the add-documents dialog) answers: absolute paths, as `externalFiles` names them. */
export async function chooseSourceFiles(page: Page, paths: string[]): Promise<void> {
  await page.evaluate((answer) => (window as unknown as DesktopFakeWindow).__desktopFake.pickSourceFiles(answer), paths);
}

/** A file that lives outside every served folder, for `chooseSourceFiles` to offer. */
export async function addExternalFile(page: Page, path: string, content: string | Uint8Array): Promise<void> {
  await page.evaluate(
    ({ at, body }) => (window as unknown as DesktopFakeWindow).__desktopFake.addExternal(at, body),
    { at: path, body: bodyOf(content) },
  );
}

/** Creates or replaces one file as an outside editor would; text, or raw bytes for a binary file. */
export async function writeDesktopFile(
  page: Page,
  path: string,
  content: string | Uint8Array,
  root: string = DESKTOP_VAULT_ROOT,
): Promise<void> {
  await page.evaluate(
    ({ folder, at, body }) => (window as unknown as DesktopFakeWindow).__desktopFake.write(folder, at, body),
    { folder: root, at: path, body: bodyOf(content) },
  );
}

/** The text of one file in a served folder, or `null` when it is absent or is not UTF-8. */
export async function readDesktopFile(page: Page, path: string, root: string = DESKTOP_VAULT_ROOT): Promise<string | null> {
  return page.evaluate(
    ({ folder, at }) => (window as unknown as DesktopFakeWindow).__desktopFake.read(folder, at),
    { folder: root, at: path },
  );
}

/** The bytes of one file in a served folder, or `null` when it is absent. */
export async function readDesktopBytes(page: Page, path: string, root: string = DESKTOP_VAULT_ROOT): Promise<number[] | null> {
  return page.evaluate(
    ({ folder, at }) => (window as unknown as DesktopFakeWindow).__desktopFake.readBytes(folder, at),
    { folder: root, at: path },
  );
}

/** Removes a file, or a folder with everything under it. */
export async function removeDesktopFile(page: Page, path: string, root: string = DESKTOP_VAULT_ROOT): Promise<void> {
  await page.evaluate(
    ({ folder, at }) => (window as unknown as DesktopFakeWindow).__desktopFake.remove(folder, at),
    { folder: root, at: path },
  );
}

/** Moves one file to a new path; fails when the source is absent or the target exists. */
export async function renameDesktopFile(page: Page, from: string, to: string, root: string = DESKTOP_VAULT_ROOT): Promise<void> {
  await page.evaluate(
    ({ folder, source, target }) => (window as unknown as DesktopFakeWindow).__desktopFake.rename(folder, source, target),
    { folder: root, source: from, target: to },
  );
}

/** Every file path of a served folder, sorted; `null` when the folder is not served. */
export async function listDesktopFiles(page: Page, root: string = DESKTOP_VAULT_ROOT): Promise<string[] | null> {
  return page.evaluate((folder) => (window as unknown as DesktopFakeWindow).__desktopFake.list(folder), root);
}

/** Makes every write and create whose vault-relative path matches one of `patterns` fail; none lifts it. */
export async function refuseDesktopWrites(page: Page, patterns: readonly RegExp[]): Promise<void> {
  await page.evaluate(
    (sources) => (window as unknown as DesktopFakeWindow).__desktopFake.failWrites(sources),
    patterns.map((pattern) => pattern.source),
  );
}

/** One folder the app has opened before, as its recent list records it. */
export interface KnownDesktopFolder {
  /** The absolute path; the app probes it with `vault_path_exists`, so serve it or it reads as gone. */
  path: string;
  /** Hours since the folder was last opened; default 0. */
  hoursAgo?: number;
  /** Document and concept counts the row shows; omit for a folder never counted. */
  counts?: { documents: number; concepts: number };
}

/**
 * Seeds the app's recent-folder records (`desktopRootPath` records; the first listed is the
 * current one) before any script runs, once per tab: a page that already holds records keeps them.
 * Serve every path that should read as present.
 */
export async function seedKnownDesktopFolders(page: Page, known: readonly KnownDesktopFolder[]): Promise<void> {
  await page.addInitScript((folders: readonly KnownDesktopFolder[]) => {
    const now = Date.now();
    const records = folders.map((folder) => {
      const name = folder.path.split("/").pop();
      return {
        id: "current",
        handle: { name },
        desktopRootPath: folder.path,
        name,
        createdAt: now - 90 * 24 * 3600_000,
        lastAccessedAt: now - (folder.hoursAgo ?? 0) * 3600_000,
        ...(folder.counts ? { docCount: folder.counts.documents, conceptCount: folder.counts.concepts, countedAt: now } : {}),
      };
    });
    const request = indexedDB.open("demo-kv", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      const existing = store.get("docs-vault:fs-handle:recent");
      existing.onsuccess = () => {
        if (existing.result) return;
        store.put(records, "docs-vault:fs-handle:recent");
        if (records[0]) store.put(records[0], "docs-vault:fs-handle:current");
      };
      tx.oncomplete = () => db.close();
    };
  }, known);
}

/** The absolute paths of the folders the app remembers, in the app's order. */
export async function knownDesktopFolderPaths(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open("demo-kv", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction("kv", "readonly").objectStore("kv").get("docs-vault:fs-handle:recent");
          get.onsuccess = () => {
            db.close();
            resolve(((get.result ?? []) as { desktopRootPath: string }[]).map((entry) => entry.desktopRootPath));
          };
        };
      }),
  );
}

import type { Page } from "@playwright/test";
import { DESKTOP_VAULT_ROOT } from "../desktop-rail-arrival-harness";
import {
  DISCOVERY_MIN_FILE_BYTES,
  discoveryAcceptsDirectory,
  discoveryAcceptsFile,
  discoveryExtension,
  discoverySkipReason,
  type DiscoverySkipReason,
} from "../../../src/entities/docs-vault/lib/library/source-discovery";

/**
 * How documents reach `sources/` in the installed app, which the faked runtime does not answer: the native
 * side proposes the folder's own documents, offers what a person drops on the window, and copies each offered
 * file under the folders it was found in. These helpers answer the same for a served folder.
 */

const DROP_ROOT = "/Users/probe/Desktop";

interface ServedCandidate {
  relativePath: string;
  name: string;
  extension: string;
  size: number;
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** The documents the native walk would propose from a served folder: its own name, depth and size rules. */
function candidatesOf(files: Record<string, string>): ServedCandidate[] {
  return Object.entries(files).flatMap(([path, text]) => {
    const parts = path.split("/");
    const name = parts[parts.length - 1]!;
    const size = byteLength(text);
    const walked = parts.slice(0, -1).every((_, at) => discoveryAcceptsDirectory(parts.slice(0, at + 1).join("/")));
    if (!walked || !discoveryAcceptsFile(name) || size < DISCOVERY_MIN_FILE_BYTES) return [];
    return [{ relativePath: path, name, extension: discoveryExtension(name), size }];
  });
}

/**
 * The proposed documents as files outside the folder, by absolute path, for the runtime's `externalFiles`:
 * copying a proposed document reads it from where the native side found it.
 */
export function proposedDocumentFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    candidatesOf(files).map((candidate) => [`${DESKTOP_VAULT_ROOT}/${candidate.relativePath}`, files[candidate.relativePath]!]),
  );
}

/**
 * Makes the native source commands answer as the app does for the served folder's own files:
 * `discover_source_candidates` proposes its documents (the open folder only, as with no project folder
 * connected), `import_source_files` and `import_offered_sources` copy each proposed or dropped file under the
 * folders it came from, and `arm_source_drop` is accepted. A file whose name starts with `refuseWritesNamed`
 * is reported as not writable, as a refused write is. Also lets `dropOnApp` emit native events.
 *
 * Call after `installDesktopRailRuntime` and before the first `page.goto`; `files` is the map the runtime serves.
 */
export async function serveSourceIntake(
  page: Page,
  files: Record<string, string>,
  options: { refuseWritesNamed?: string } = {},
): Promise<void> {
  await page.addInitScript(
    ({ served, refuse }) => {
      type Callback = (event: { event: string; payload: unknown }) => void;
      type Bridge = {
        transformCallback(callback: Callback): number;
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
      type CopyResult = { pickedName: string; status: string; reason: string | null };
      const bridge = (window as unknown as { __TAURI_INTERNALS__: Bridge }).__TAURI_INTERNALS__;
      const nativeInvoke = bridge.invoke.bind(bridge);
      const nativeTransform = bridge.transformCallback.bind(bridge);
      const callbacks = new Map<number, Callback>();
      const handlers = new Map<string, Set<number>>();
      bridge.transformCallback = (callback) => {
        const id = nativeTransform(callback);
        callbacks.set(id, callback);
        return id;
      };
      (window as unknown as { __emitNativeEvent: (event: string, payload: unknown) => void }).__emitNativeEvent = (event, payload) => {
        for (const id of handlers.get(event) ?? []) callbacks.get(id)?.({ event, payload });
      };

      const offeredFolder = new Map<string, string>();
      const remember = (path: string, relativePath: string) => {
        const at = relativePath.lastIndexOf("/");
        if (at > 0) offeredFolder.set(path, relativePath.slice(0, at));
      };
      (window as unknown as { __rememberOffered: (offer: { files: { path: string; relativePath: string }[] }) => void }).__rememberOffered = (offer) => {
        for (const file of offer.files) remember(file.path, file.relativePath);
      };

      const copyUnderTheirFolders = async (command: string, args: Record<string, unknown>) => {
        const paths = (args.sourcePaths as string[]) ?? [];
        const name = (path: string) => path.slice(path.lastIndexOf("/") + 1);
        const refused = (path: string) => refuse !== "" && name(path).startsWith(refuse);
        const resultOf = new Map<string, unknown>();
        for (const path of paths.filter(refused)) {
          resultOf.set(path, { pickedName: name(path), status: "failed", relativePath: null, sha256: null, size: null, reason: "import-destination-unwritable" });
        }
        const groups = new Map<string, string[]>();
        for (const path of paths.filter((path) => !refused(path))) {
          const folder = offeredFolder.get(path) ?? "";
          groups.set(folder, [...(groups.get(folder) ?? []), path]);
        }
        for (const [folder, group] of groups) {
          const destination = folder ? `sources/${folder}` : "sources";
          const results = (await nativeInvoke("import_source_files", { rootPath: args.rootPath, sourcePaths: group, destination })) as CopyResult[];
          group.forEach((path, at) => resultOf.set(path, results[at]));
        }
        const ordered = paths.map((path) => resultOf.get(path));
        if (command === "import_offered_sources") {
          const progress = args.progress as { onmessage?: (message: { done: number; total: number }) => void } | undefined;
          progress?.onmessage?.({ done: paths.length, total: paths.length });
        }
        return ordered;
      };

      bridge.invoke = async (command, args = {}) => {
        if (command === "plugin:event|listen") {
          const name = String(args.event);
          handlers.set(name, (handlers.get(name) ?? new Set()).add(Number(args.handler)));
        }
        if (command === "plugin:event|unlisten") for (const ids of handlers.values()) ids.delete(Number(args.eventId));
        if (command === "arm_source_drop") return null;
        if (command === "import_offered_sources" || (command === "import_source_files" && (args.destination ?? "sources") === "sources")) {
          return copyUnderTheirFolders(command, args);
        }
        if (command !== "discover_source_candidates") return nativeInvoke(command, args);
        await nativeInvoke(command, args);
        const roots = (args.roots as { rootPath: string; label: string; skipRelative: string[] }[]) ?? [];
        const candidates = roots.slice(0, 1).flatMap((root) =>
          served
            .filter((file) => !root.skipRelative.some((skip) => file.relativePath.startsWith(`${skip}/`)))
            .map((file) => ({ ...file, rootPath: root.rootPath, rootLabel: root.label, mtime: 1_700_000_000_000 })),
        );
        for (const candidate of candidates) remember(`${candidate.rootPath}/${candidate.relativePath}`, candidate.relativePath);
        return { candidates, truncated: false, unreadableRoots: [] };
      };
    },
    { served: candidatesOf(files), refuse: options.refuseWritesNamed ?? "" },
  );
}

/**
 * Drops files, and optionally one folder, on the window as the native side reports it: the pointer over the
 * window, the walk, then the offer (what would be copied, and what the walk skipped by reason). The dropped
 * files are placed outside the folder so the copy reads them from there. A file dropped by itself is always
 * offered; a folder is walked with the name rules of discovery.
 *
 * Needs `serveSourceIntake` on the page.
 */
export async function dropOnApp(
  page: Page,
  { files = [], folder }: { files?: { name: string; body: string }[]; folder?: { name: string; files: Record<string, string> } },
): Promise<void> {
  const offered: { path: string; relativePath: string; size: number; body: string }[] = files.map((file) => ({
    path: `${DROP_ROOT}/${file.name}`,
    relativePath: file.name,
    size: byteLength(file.body),
    body: file.body,
  }));
  const skipped: { relativePath: string; reason: DiscoverySkipReason }[] = [];
  for (const [path, body] of Object.entries(folder?.files ?? {})) {
    const relativePath = `${folder!.name}/${path}`;
    const reason = discoverySkipReason(path.slice(path.lastIndexOf("/") + 1));
    if (reason) skipped.push({ relativePath, reason });
    else offered.push({ path: `${DROP_ROOT}/${relativePath}`, relativePath, size: byteLength(body), body });
  }
  const skippedCounts = { secretName: 0, licence: 0, notDocument: 0 };
  for (const entry of skipped) skippedCounts[entry.reason] += 1;
  const offer = {
    files: offered.map(({ path, relativePath, size }) => ({ path, relativePath, size })),
    skipped,
    skippedCounts,
    totalBytes: offered.reduce((sum, file) => sum + file.size, 0),
    truncated: false,
    holdsOpenFolder: [],
  };
  await page.evaluate(
    ({ offer, bodies }) => {
      const served = (window as unknown as { __desktopFake: { addExternal(path: string, value: string): void } }).__desktopFake;
      for (const [path, body] of bodies) served.addExternal(path, body);
      const target = window as unknown as {
        __rememberOffered(offer: unknown): void;
        __emitNativeEvent(event: string, payload: unknown): void;
      };
      target.__rememberOffered(offer);
      target.__emitNativeEvent("source-drop", { phase: "over" });
      target.__emitNativeEvent("source-drop", { phase: "reading" });
      target.__emitNativeEvent("source-drop", { phase: "offered", offer });
    },
    { offer, bodies: offered.map((file) => [file.path, file.body] as const) },
  );
}

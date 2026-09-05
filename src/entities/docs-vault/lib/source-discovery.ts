/**
 * Which files Atlas is allowed to propose when a person asks it to find documents.
 *
 * **The rule, not the walk.** Two walks apply it: the browser's, over the open folder's
 * File System Access handle, and Rust's `discover_source_candidates`, which alone can
 * reach a bound project root. They must agree, or a person would be offered a file on
 * one surface and not the other. `src-tauri/src/library.rs` holds the same four
 * constants and `tests/contract/source-discovery-rules.contract.test.ts` compares them.
 *
 * **What this is protecting.** `.claude/rules/local-first.md`: *never scan password,
 * credential, or key files from the user's disk.* Discovery walks only roots the person
 * granted — the folder they opened, and project roots they bound themselves — and inside
 * them the extension allow-list is the primary lock: `.env`, `id_rsa` and `server.pem`
 * are not document formats and never reach the list. The name deny-list is the second
 * lock, for the case the first cannot see: `credentials.csv` is a spreadsheet by
 * extension and a secret by content.
 *
 * **Metadata only.** Nothing here opens a file. A candidate is a name, an extension, a
 * size and an mtime — the four facts a directory listing already holds. Content enters
 * Atlas only after a person ticks a box and the file is copied into `sources/`.
 */

/**
 * Document formats offered as candidates. **Must equal** Rust
 * `DISCOVERY_DOCUMENT_EXTENSIONS`.
 *
 * An allow-list, not a deny-list: a deny-list decides what to hide and is wrong the
 * first time it meets a name nobody thought of, while an allow-list decides what to show
 * and is merely incomplete — and incomplete costs one drag into the folder, which the
 * Sources section already explains how to do.
 *
 * `md` is absent deliberately. Markdown is already a vault file kind; copying a
 * project's Markdown into `sources/` would put the same text in two places with no way
 * to say which one is the source.
 */
export const DISCOVERY_DOCUMENT_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'csv',
  'pptx',
  'ppt',
  'txt',
  'rtf',
  'odt',
  'ods',
  'odp',
  'epub',
] as const;

/**
 * Directory names the walk never descends into. **Must equal** Rust
 * `DISCOVERY_PRUNE_DIR_NAMES`. Dot-prefixed directories are refused by a separate rule,
 * so `.git` and `.next` need no entry.
 */
export const DISCOVERY_PRUNE_DIR_NAMES = [
  'node_modules',
  'target',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'Pods',
  'DerivedData',
  '__pycache__',
  'venv',
] as const;

/**
 * Lowercased fragments that disqualify a name whatever its extension. **Must equal**
 * Rust `DISCOVERY_DENIED_NAME_FRAGMENTS`.
 */
export const DISCOVERY_DENIED_NAME_FRAGMENTS = [
  'credential',
  'secret',
  'password',
  'passwd',
  'token',
  'apikey',
  'api-key',
  'api_key',
  'id_rsa',
  'id_ed25519',
  'id_dsa',
  'id_ecdsa',
  '.env',
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.keystore',
  '.jks',
  '.htpasswd',
] as const;

/** How deep one granted root is walked. **Must equal** Rust `DISCOVERY_MAX_DEPTH`. */
export const DISCOVERY_MAX_DEPTH = 8;
/** How many candidates one run returns. **Must equal** Rust `DISCOVERY_MAX_CANDIDATES`. */
export const DISCOVERY_MAX_CANDIDATES = 500;

/** `'Plan.PDF'` → `'pdf'`; a name with no extension yields `''`. */
export function discoveryExtension(name: string): string {
  const at = name.lastIndexOf('.');
  return at > 0 ? name.slice(at + 1).toLowerCase() : '';
}

/** The one judgement both walks make about a file name. */
export function discoveryAcceptsFile(name: string): boolean {
  if (name.startsWith('.')) return false;
  const lowered = name.toLowerCase();
  if (DISCOVERY_DENIED_NAME_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
    return false;
  }
  return (DISCOVERY_DOCUMENT_EXTENSIONS as readonly string[]).includes(
    discoveryExtension(lowered),
  );
}

/** Whether the walk descends into a directory of this name. */
export function discoveryAcceptsDirectory(name: string): boolean {
  if (name.startsWith('.')) return false;
  return !(DISCOVERY_PRUNE_DIR_NAMES as readonly string[]).includes(name);
}

export interface SourceCandidate {
  /** Absolute root path in the app; the folder handle's name on the web. */
  rootPath: string;
  /** How the screen names the root that proposed this file. */
  rootLabel: string;
  /** Path relative to that root. */
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
}

export interface SourceDiscoveryReport {
  candidates: SourceCandidate[];
  /** Whether the walk stopped at the cap. Silent truncation reads as "this is all". */
  truncated: boolean;
  /** Labels of roots that could not be read at all. */
  unreadableRoots: string[];
}

/**
 * Walk one File System Access directory handle for candidates.
 *
 * The web's half of discovery, and the only half a browser can perform: it has a handle
 * to the folder the person opened and no way to reach a path outside it. That limit is
 * stated on screen rather than worked around.
 */
export async function discoverCandidatesInHandle(
  root: FileSystemDirectoryHandle,
  options: { rootLabel: string; skipRelative?: readonly string[] } = { rootLabel: '' },
): Promise<SourceDiscoveryReport> {
  const report: SourceDiscoveryReport = {
    candidates: [],
    truncated: false,
    unreadableRoots: [],
  };
  const skip = options.skipRelative ?? [];

  const walk = async (
    directory: FileSystemDirectoryHandle,
    prefix: string,
    depth: number,
  ): Promise<void> => {
    if (depth > DISCOVERY_MAX_DEPTH || report.truncated) return;
    for await (const [name, handle] of directory.entries()) {
      if (report.candidates.length >= DISCOVERY_MAX_CANDIDATES) {
        report.truncated = true;
        return;
      }
      const relative = prefix ? `${prefix}/${name}` : name;
      if (skip.some((path) => relative === path || relative.startsWith(`${path}/`))) continue;
      if (handle.kind === 'directory') {
        if (!discoveryAcceptsDirectory(name)) continue;
        await walk(handle as FileSystemDirectoryHandle, relative, depth + 1);
        continue;
      }
      if (!discoveryAcceptsFile(name)) continue;
      // `getFile()` on a File System Access handle returns metadata; the bytes are read
      // only when something asks for them, and nothing here does.
      const file = await (handle as FileSystemFileHandle).getFile();
      report.candidates.push({
        rootPath: root.name,
        rootLabel: options.rootLabel || root.name,
        relativePath: relative,
        name,
        extension: discoveryExtension(name),
        size: file.size,
        mtime: file.lastModified,
      });
    }
  };

  try {
    await walk(root, '', 0);
  } catch {
    report.unreadableRoots.push(options.rootLabel || root.name);
  }
  report.candidates.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
  return report;
}

/**
 * A candidate's stable identity across runs, used by the declined memory.
 *
 * Root plus relative path, not a content hash: discovery never reads a file, so a hash
 * is not available at proposal time, and "you already said no to this file in this
 * folder" is the fact a person expects to be remembered.
 */
export function candidateKey(candidate: SourceCandidate): string {
  // A NUL separator, written as an escape: no filesystem path can contain one, so two
  // different (root, path) pairs can never collide into one key.
  return `${candidate.rootPath}\u0000${candidate.relativePath}`;
}

/**
 * Rules for proposing documents; `src-tauri/src/library.rs` holds the same constants
 * (`source-discovery-rules.contract.test.ts`). Metadata only; secrets never reach the list
 * (`.claude/rules/local-first.md`): an extension allow-list, not a deny-list, so an unforeseen
 * name stays hidden, plus a name deny-list for secrets in document formats.
 */

/**
 * Allow-list; must equal Rust `DISCOVERY_DOCUMENT_EXTENSIONS`. `md` is absent because Markdown is
 * already a vault file kind.
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

/** Must equal Rust `DISCOVERY_PRUNE_DIR_NAMES`; dot directories are refused separately. */
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

/** Name fragments that disqualify any extension (e.g. `credentials.csv`); must equal Rust. */
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

/** `'Plan.PDF'` → `'pdf'`; `''` without an extension. */
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
  /** Absolute root in the app; the folder handle's name on the web. */
  rootPath: string;
  /** The root's on-screen name. */
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
  /** Whether the walk stopped at the cap. */
  truncated: boolean;
  /** Roots that could not be read. */
  unreadableRoots: string[];
}

/** The web walk, limited to the opened folder's handle. */
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
      // `getFile()` on an FSA handle returns metadata; bytes are read only on demand.
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

/** Root plus relative path, since discovery never reads content to hash. */
export function candidateKey(candidate: SourceCandidate): string {
  // NUL cannot appear in a path, so keys never collide.
  return `${candidate.rootPath}\u0000${candidate.relativePath}`;
}

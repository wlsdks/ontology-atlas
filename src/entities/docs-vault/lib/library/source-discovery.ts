/**
 * Rules for proposing documents; `src-tauri/src/library/discovery_rules.rs` holds the same constants
 * (`source-discovery-rules.contract.test.ts`). Metadata only; secrets never reach the list
 * (`.claude/rules/local-first.md`): an extension allow-list, not a deny-list, so an unforeseen
 * name stays hidden, plus a name deny-list for secrets in document formats.
 */

/** Allow-list; must equal Rust `DISCOVERY_DOCUMENT_EXTENSIONS`. `log` is absent: logs are output. */
export const DISCOVERY_DOCUMENT_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'csv',
  'tsv',
  'pptx',
  'ppt',
  'txt',
  'rtf',
  'odt',
  'ods',
  'odp',
  'epub',
  'md',
  'markdown',
  'html',
  'htm',
] as const;

/**
 * Must equal Rust `DISCOVERY_MARKDOWN_EXTENSIONS`. Markdown is offered only from the open folder,
 * and never a file the vault index knows as a node (`withoutVaultOwnedMarkdown`).
 */
export const DISCOVERY_MARKDOWN_EXTENSIONS = ['md', 'markdown'] as const;

/** Must equal Rust `DISCOVERY_GUIDE_STEMS`: repository guides, refused as Markdown. */
export const DISCOVERY_GUIDE_STEMS = [
  'readme',
  'agents',
  'claude',
  'gemini',
  'contributing',
  'code_of_conduct',
  'security',
] as const;

/** Must equal Rust `DISCOVERY_VAULT_OWNED_DIRS`: what Atlas keeps in the open folder. */
export const DISCOVERY_VAULT_OWNED_DIRS = ['sources', 'wiki'] as const;

/**
 * Must equal Rust `DISCOVERY_PRUNE_DIR_NAMES`, compared lowercased; dot directories are refused
 * separately. Generated, published and test-data folders hold files no one wrote as a document.
 */
export const DISCOVERY_PRUNE_DIR_NAMES = [
  'node_modules',
  'target',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'pods',
  'deriveddata',
  '__pycache__',
  'venv',
  'public',
  'static',
  'output',
  'outputs',
  'generated',
  'gen',
  'tmp',
  'temp',
  'cache',
  'logs',
  'third_party',
  'third-party',
  'licenses',
  'licences',
  'fixtures',
  '__fixtures__',
  'testdata',
  'test-results',
  'playwright-report',
] as const;

/** Must equal Rust `DISCOVERY_PRUNE_DIR_PATHS`; matched as whole trailing segments. */
export const DISCOVERY_PRUNE_DIR_PATHS = ['src/test/resources', 'tests/data'] as const;

/** Must equal Rust `DISCOVERY_NOTICE_STEMS`: legal and project notices in any format. */
export const DISCOVERY_NOTICE_STEMS = [
  'license',
  'licence',
  'copying',
  'notice',
  'third-party',
  'thirdparty',
  'third_party',
  'authors',
  'contributors',
  'changelog',
  'patents',
] as const;

/**
 * Must equal Rust `DISCOVERY_NOTICE_SUFFIXES`: a bundled library's licence, `x-1.0.LICENSE.txt`.
 * A hyphen is absent so `driver-license.pdf` stays a document.
 */
export const DISCOVERY_NOTICE_SUFFIXES = ['.license', '_license', '.licence', '_licence'] as const;

/** Must equal Rust `DISCOVERY_BUILD_FILE_NAMES`; `requirements-*.txt` is matched by prefix. */
export const DISCOVERY_BUILD_FILE_NAMES = ['cmakelists.txt', 'requirements.txt', 'robots.txt'] as const;
const REQUIREMENTS_VARIANT_PREFIX = 'requirements-';

/** Must equal Rust `DISCOVERY_MIN_FILE_BYTES`; smaller files are empty or placeholders. */
export const DISCOVERY_MIN_FILE_BYTES = 64;

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

function namesANotice(stem: string): boolean {
  const startsWithANotice = DISCOVERY_NOTICE_STEMS.some((notice) => {
    if (!stem.startsWith(notice)) return false;
    const next = stem.charAt(notice.length);
    return next === '' || next === '-' || next === '_' || next === '.';
  });
  return startsWithANotice || DISCOVERY_NOTICE_SUFFIXES.some((suffix) => stem.endsWith(suffix));
}

function namesABuildFile(lowered: string): boolean {
  return (
    (DISCOVERY_BUILD_FILE_NAMES as readonly string[]).includes(lowered) ||
    (lowered.startsWith(REQUIREMENTS_VARIANT_PREFIX) && lowered.endsWith('.txt'))
  );
}

const HEX_STEM = /^[0-9a-f]+$/;
const UUID_STEM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A digits-only stem shorter than 32 is a date or scanner counter, so it stays a document. */
function looksLikeAHash(stem: string): boolean {
  if (HEX_STEM.test(stem)) {
    const hasLetter = /[a-f]/.test(stem);
    return (stem.length >= 16 && hasLetter) || [32, 40, 64].includes(stem.length);
  }
  return UUID_STEM.test(stem);
}

/** Why a folder walk passes a file over; mirrors Rust `SkipReason`. */
export type DiscoverySkipReason = 'secretName' | 'licence' | 'notDocument';

function stemOf(lowered: string, extension: string): string {
  return extension ? lowered.slice(0, lowered.length - extension.length - 1) : lowered;
}

/** The name rules every folder walk applies; repository guides are discovery's alone. */
export function discoverySkipReason(name: string): DiscoverySkipReason | null {
  const lowered = name.toLowerCase();
  if (DISCOVERY_DENIED_NAME_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
    return 'secretName';
  }
  const extension = discoveryExtension(lowered);
  const stem = stemOf(lowered, extension);
  if (namesANotice(stem)) return 'licence';
  if (
    !(DISCOVERY_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension) ||
    namesABuildFile(lowered) ||
    looksLikeAHash(stem)
  ) {
    return 'notDocument';
  }
  return null;
}

export function isMarkdownName(name: string): boolean {
  return (DISCOVERY_MARKDOWN_EXTENSIONS as readonly string[]).includes(discoveryExtension(name));
}

function namesARepositoryGuide(lowered: string): boolean {
  if (!isMarkdownName(lowered)) return false;
  const stem = stemOf(lowered, discoveryExtension(lowered));
  return DISCOVERY_GUIDE_STEMS.some(
    (guide) => stem === guide || stem.startsWith(`${guide}.`),
  );
}

/** The one judgement both walks make about a file name. */
export function discoveryAcceptsFile(name: string): boolean {
  if (name.startsWith('.')) return false;
  return discoverySkipReason(name) === null && !namesARepositoryGuide(name.toLowerCase());
}

/** Takes the path relative to the walked root, with either separator, so Windows matches too. */
export function discoveryAcceptsDirectory(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (name.startsWith('.')) return false;
  if ((DISCOVERY_PRUNE_DIR_NAMES as readonly string[]).includes(name)) return false;
  return !DISCOVERY_PRUNE_DIR_PATHS.some(
    (path) => normalized === path || normalized.endsWith(`/${path}`),
  );
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

/** The web walk, limited to the opened folder's handle, so Atlas's own folders are always skipped. */
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
      if (!prefix && (DISCOVERY_VAULT_OWNED_DIRS as readonly string[]).includes(name.toLowerCase())) continue;
      if (handle.kind === 'directory') {
        if (!discoveryAcceptsDirectory(relative)) continue;
        await walk(handle as FileSystemDirectoryHandle, relative, depth + 1);
        continue;
      }
      if (!discoveryAcceptsFile(name)) continue;
      // `getFile()` on an FSA handle returns metadata; bytes are read only on demand.
      const file = await (handle as FileSystemFileHandle).getFile();
      if (file.size < DISCOVERY_MIN_FILE_BYTES) continue;
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

/**
 * Markdown the vault already owns is never offered: a `.md` file is kept only when the vault index
 * holds it without `kind:`, so nothing new is read and an unread file is not guessed at. Markdown
 * from any root but the open folder is dropped too: a bound code root's Markdown is developer
 * documentation.
 */
export function withoutVaultOwnedMarkdown(
  candidates: readonly SourceCandidate[],
  {
    openRootPath,
    docs,
  }: {
    openRootPath: string;
    docs: readonly { path: string; frontmatter: Record<string, unknown> }[];
  },
): SourceCandidate[] {
  const unowned = new Set<string>();
  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    if (typeof kind !== 'string' || kind.trim() === '') unowned.add(doc.path);
  }
  return candidates.filter((candidate) => {
    if (!isMarkdownName(candidate.name)) return true;
    if (candidate.rootPath !== openRootPath) return false;
    return candidate.extension !== 'md' || unowned.has(candidate.relativePath);
  });
}

/** One entry of a folder dropped on the page, from either browser drop API. */
export type DroppedEntry =
  | { kind: 'file'; name: string; getFile: () => Promise<File> }
  | {
      kind: 'directory';
      name: string;
      children: () => AsyncIterable<DroppedEntry>;
      /** Whether this folder is, or holds, `root`; only a File System Access handle can tell. */
      holds?: (root: FileSystemDirectoryHandle) => Promise<boolean>;
    };

type DroppedDirectory = Extract<DroppedEntry, { kind: 'directory' }>;

export interface DroppedFolderWalk {
  files: { file: File; relativePath: string }[];
  /** The first `DROP_SKIPPED_NAMES` skipped files; `skippedCounts` counts every one. */
  skipped: { relativePath: string; reason: DiscoverySkipReason }[];
  skippedCounts: Record<DiscoverySkipReason, number>;
  totalBytes: number;
  truncated: boolean;
}

/** Must equal Rust `DROP_MAX_FILES`: a folder drop lists at most this many files. */
export const DROP_MAX_FILES = 20_000;
/** Must equal Rust `DROP_MAX_VISITED`: a walk visits at most this many entries, so it ends. */
export const DROP_MAX_VISITED = 200_000;
/** Must equal Rust `DROP_SKIPPED_NAMES`: the skipped list names at most this many files. */
export const DROP_SKIPPED_NAMES = 1_000;

/**
 * The browser's half of a folder drop, under the rules Rust applies to one: the folder keeps its
 * structure below its own name, and each `File` stays unread until it is copied.
 */
export async function walkDroppedFolder(folder: DroppedDirectory): Promise<DroppedFolderWalk> {
  const walk: DroppedFolderWalk = {
    files: [],
    skipped: [],
    skippedCounts: { secretName: 0, licence: 0, notDocument: 0 },
    totalBytes: 0,
    truncated: false,
  };
  let visited = 0;
  const skip = (relativePath: string, reason: DiscoverySkipReason) => {
    walk.skippedCounts[reason] += 1;
    if (walk.skipped.length < DROP_SKIPPED_NAMES) walk.skipped.push({ relativePath, reason });
  };
  const visit = async (directory: DroppedDirectory, within: string, depth: number) => {
    if (depth > DISCOVERY_MAX_DEPTH || walk.truncated) return;
    for await (const entry of directory.children()) {
      visited += 1;
      if (visited > DROP_MAX_VISITED) {
        walk.truncated = true;
        return;
      }
      const below = within ? `${within}/${entry.name}` : entry.name;
      const landing = `${folder.name}/${below}`;
      if (entry.kind === 'directory') {
        if (discoveryAcceptsDirectory(below)) await visit(entry, below, depth + 1);
        if (walk.truncated) return;
        continue;
      }
      const reason = discoverySkipReason(entry.name);
      // A dot file is system furniture (`.DS_Store`) unless its name reads as a secret.
      if (entry.name.startsWith('.')) {
        if (reason === 'secretName') skip(landing, reason);
        continue;
      }
      if (reason) {
        skip(landing, reason);
        continue;
      }
      const file = await entry.getFile();
      if (file.size < DISCOVERY_MIN_FILE_BYTES) {
        skip(landing, 'notDocument');
        continue;
      }
      if (walk.files.length >= DROP_MAX_FILES) {
        walk.truncated = true;
        return;
      }
      walk.files.push({ file, relativePath: landing });
      walk.totalBytes += file.size;
    }
  };
  await visit(folder, '', 0);
  return walk;
}

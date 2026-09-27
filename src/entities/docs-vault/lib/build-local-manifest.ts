import {
  buildExcerpt,
  extractHeadings,
  extractOutLinksWithContext,
  firstHeading,
  parseFrontmatter,
  type LinkContext,
} from '@/shared/lib/parse-frontmatter';
import { meaningFindings } from '@/shared/lib/meaning-findings';
import { extractProjectMeaningEvidencePaths } from '@/shared/lib/project-meaning-evidence';
import { nativeVaultFingerprint, type NativeVaultStamp } from '@/shared/lib/tauri-vault-fs';
import type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from '../model/types';

/**
 * Frontmatter keys whose refs count as backlinks: the same set as `mcp/src/vault.mjs`
 * NEIGHBOR_KEYS + INLINE_NEIGHBOR_KEYS and `scripts/build-docs-vault.mjs`.
 */
const RELATION_REF_ARRAY_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
] as const;
const RELATION_REF_STRING_KEYS = ['domain'] as const;

function frontmatterRefStrings(frontmatter: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of RELATION_REF_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string' && item.trim()) out.push(item.trim());
    }
    // Arrays only: the graph derivation and the MCP reader ignore a scalar, so counting it
    // would report a referrer the map never draws; the parser diagnoses it instead.
  }
  for (const key of RELATION_REF_STRING_KEYS) {
    const value = frontmatter[key];
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return out;
}

/** Resolves a ref by exact slug or unique tail; null for no match or an ambiguous tail. */
function resolveRefToDocSlug(
  ref: string,
  slugSet: ReadonlySet<string>,
  tailToSlug: ReadonlyMap<string, string | null>,
): string | null {
  // NFC on both sides, or identical characters fail to match (the CLI validator's rule).
  const normalized = ref.normalize('NFC').replace(/\.md$/i, '');
  if (slugSet.has(normalized)) return normalized;
  const tail = normalized.split('/').pop() ?? normalized;
  const byTail = tailToSlug.get(tail);
  // `byTail === null` marks an ambiguous tail (2+ docs share it) — don't guess.
  return byTail ?? null;
}

interface WalkEntry {
  handle: FileSystemFileHandle;
  /** Path relative to the top-level handle — e.g. 'specs/hello.md'. */
  relativePath: string;
  kind: 'md' | 'image' | 'source';
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/**
 * The top-level raw-source folder: listed by name, format, size and mtime, never read
 * (`docs/DECISIONS.md` 2026-09-05, "A vault holds three kinds of file and only one is the graph").
 * Mirrored in `src-tauri/src/lib.rs` (`vault-walk-rules.contract.test.ts`); if the walks diverge the
 * fingerprint counts a different file set, so the app rebuilds constantly or misses a new document.
 */
export const VAULT_SOURCES_DIR = 'sources';

export function isVaultSourcePath(relativePath: string): boolean {
  return relativePath.startsWith(`${VAULT_SOURCES_DIR}/`);
}

/** `'sources/plan.PDF'` → `'pdf'`; a name with no extension yields `''`. */
function vaultSourceFormat(name: string): string {
  const at = name.lastIndexOf('.');
  return at > 0 ? name.slice(at + 1).toLowerCase() : '';
}

/**
 * Source-code extensions, counted but never read, so first run can tell a repository from a documents folder
 * (`docs/audits/USER-WALKTHROUGH-FIRST-RUN-2026-08-31.md`, finding 3).
 */
const SOURCE_EXT =
  /\.(m?[jt]sx?|vue|svelte|dart|py|go|rs|java|kt|swift|rb|php|cs|c|cc|cpp|h|hpp|scala|ex|exs|sh)$/i;

/** Walk bounds keep a repository root picked as a vault from flooding IPC with build trees. */

/** Only names that never hold documents; `build`, `dist` and `out` can, so do not extend. */
const PRUNE_BY_NAME = new Set(['node_modules']);

/** A directory that declares itself a cache (bford.info/cachedir) is pruned whole. */
const CACHE_DIR_TAG = 'CACHEDIR.TAG';

/** Far above any document folder; past it the walk truncates and the manifest says so. */
export const VAULT_WALK_MAX_ENTRIES = 50000;
/** A realistic ceiling for a document folder. Deeper usually means someone else's tree. */
export const VAULT_WALK_MAX_DEPTH = 12;

export interface WalkResult {
  entries: WalkEntry[];
  /** A limit was hit, so the walk saw only part of the tree. */
  truncated: boolean;
  /** Relative paths of directories skipped whole as cache or dependencies. */
  prunedDirs: string[];
  /** Source files passed over: counted, never read or stored. */
  sourceFileCount: number;
}

async function walkInto(
  root: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  acc: WalkResult,
): Promise<void> {
  if (acc.truncated) return;
  if (depth > VAULT_WALK_MAX_DEPTH) {
    acc.truncated = true;
    return;
  }

  // The listing already holds the cache tag; `getFileHandle` would cost an IPC round trip per directory.
  const children: Array<[string, FileSystemHandle]> = [];
  for await (const entry of root.entries()) children.push(entry);

  if (children.some(([name]) => name === CACHE_DIR_TAG)) {
    acc.prunedDirs.push(prefix || '.');
    return;
  }

  for (const [name, handle] of children) {
    if (acc.entries.length >= VAULT_WALK_MAX_ENTRIES) {
      acc.truncated = true;
      return;
    }
    if (name.startsWith('.')) continue;
    /* macOS returns NFD names while refs are NFC; the MCP and CLI walkers normalize too. */
    const nfcName = name.normalize('NFC');
    const relative = prefix ? `${prefix}/${nfcName}` : nfcName;
    if (handle.kind === 'directory') {
      if (PRUNE_BY_NAME.has(name)) {
        acc.prunedDirs.push(relative);
        continue;
      }
      await walkInto(handle as FileSystemDirectoryHandle, relative, depth + 1, acc);
    } else if (isVaultSourcePath(relative)) {
      // Before every other branch: anything under `sources/`, Markdown included, is a raw source.
      acc.entries.push({ handle: handle as FileSystemFileHandle, relativePath: relative, kind: 'source' });
    } else if (name.endsWith('.md')) {
      acc.entries.push({ handle: handle as FileSystemFileHandle, relativePath: relative, kind: 'md' });
    } else if (IMAGE_EXT.test(name)) {
      acc.entries.push({ handle: handle as FileSystemFileHandle, relativePath: relative, kind: 'image' });
    } else if (SOURCE_EXT.test(name)) {
      acc.sourceFileCount += 1;
    }
  }
}

export async function walkVault(root: FileSystemDirectoryHandle): Promise<WalkResult> {
  const acc: WalkResult = { entries: [], truncated: false, prunedDirs: [], sourceFileCount: 0 };
  await walkInto(root, '', 0, acc);
  return acc;
}

async function walk(
  root: FileSystemDirectoryHandle,
  prefix = '',
): Promise<WalkEntry[]> {
  const acc: WalkResult = { entries: [], truncated: false, prunedDirs: [], sourceFileCount: 0 };
  await walkInto(root, prefix, 0, acc);
  return acc.entries;
}

function insertIntoTree(root: VaultTreeNode, slug: string, title: string) {
  const parts = slug.split('/');
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i];
    const isLeaf = i === parts.length - 1;
    if (!node.children) node.children = [];
    let child = node.children.find((c) => c.name === name);
    if (!child) {
      child = {
        name,
        path: parts.slice(0, i + 1).join('/'),
        type: isLeaf ? 'doc' : 'dir',
      };
      if (isLeaf) {
        child.slug = slug;
        child.title = title;
      }
      node.children.push(child);
    } else if (isLeaf && !child.slug) {
      child.type = 'doc';
      child.slug = slug;
      child.title = title;
    }
    node = child;
  }
}

function sortTree(node: VaultTreeNode) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  for (const c of node.children) sortTree(c);
}

export interface LocalVaultBuild {
  manifest: VaultManifest;
  fileHandles: Map<string, FileSystemFileHandle>;
  /** Asset files such as images, keyed by path relative to the vault root ('img/foo.png'). */
  imageHandles: Map<string, FileSystemFileHandle>;
  /** Raw sources under `sources/`; opened only on a person's explicit request, never by the build. */
  sourceHandles: Map<string, FileSystemFileHandle>;
  /** Sorted `${path}@${mtime}` entries; an equal `computeLocalVaultFingerprint` skips a rebuild. */
  fingerprint: string;
}

function fingerprintFromEntries(
  entries: ReadonlyArray<{ relativePath: string; lastModified: number }>,
): string {
  // NFC here too, or native NFD names would report a change on every focus.
  return entries
    .map((e) => `${e.relativePath.normalize('NFC')}@${e.lastModified}`)
    .sort()
    .join('\n');
}

/** Size travels with mtime so a raw source is listed without opening it over IPC. */
export type VaultStampIndex = Map<string, NativeVaultStamp>;

function stampIndex(entries: readonly NativeVaultStamp[]): VaultStampIndex {
  return new Map(
    entries.map((e) => [e.relativePath.normalize('NFC'), { ...e, relativePath: e.relativePath.normalize('NFC') }] as const),
  );
}

/** The desktop shim's absolute root path, or `null` for a web handle. */
function nativeRootPath(root: FileSystemDirectoryHandle): string | null {
  const rootPath = (root as { rootPath?: unknown }).rootPath;
  return typeof rootPath === 'string' && rootPath ? rootPath : null;
}

/** The native stamp index for this handle, or `null` on the web where there is none. */
async function nativeStampIndex(
  root: FileSystemDirectoryHandle,
): Promise<VaultStampIndex | null> {
  const nativeRoot = nativeRootPath(root);
  if (!nativeRoot) return null;
  try {
    const native = await nativeVaultFingerprint(nativeRoot);
    return native ? stampIndex(native.entries) : null;
  } catch {
    return null;
  }
}

export async function computeLocalVaultFingerprintWithStamps(
  root: FileSystemDirectoryHandle,
): Promise<{ fingerprint: string; nativeStamps: VaultStampIndex | null }> {
  const nativeRoot = nativeRootPath(root);
  if (nativeRoot) {
    const native = await nativeVaultFingerprint(nativeRoot);
    if (native) {
      return {
        fingerprint: fingerprintFromEntries(native.entries),
        nativeStamps: stampIndex(native.entries),
      };
    }
  }
  return { fingerprint: await computeLocalVaultFingerprint(root), nativeStamps: null };
}

export async function computeLocalVaultFingerprint(
  root: FileSystemDirectoryHandle,
): Promise<string> {
  /* In the app one native call returns paths and mtimes; per-file `getFile()` under Tauri
   * transfers every body. The web has no batch API and falls through (`.claude/rules/surfaces.md`). */
  const nativeRoot = nativeRootPath(root);
  if (nativeRoot) {
    const native = await nativeVaultFingerprint(nativeRoot);
    if (native) return fingerprintFromEntries(native.entries);
  }

  const files = await walk(root);
  const stamps = await Promise.all(
    files.map(async (entry) => {
      const file = await entry.handle.getFile();
      return {
        relativePath: entry.relativePath,
        lastModified: file.lastModified,
      };
    }),
  );
  return fingerprintFromEntries(stamps);
}

/** One built file; `handle` and `lastModified` let an incremental rebuild reuse it unchanged. */
export interface BuiltVaultEntry {
  relativePath: string;
  lastModified: number;
  handle: FileSystemFileHandle;
  kind: 'md' | 'image' | 'source';
  /** Raw sources only — byte length, so the list can state a size without a read. */
  bytes?: number;
  /** Markdown only — the aggregated VaultDoc. */
  doc?: VaultDoc;
  /** Markdown only — out-link context, for rebuilding backlinksDetail. */
  linkContexts?: LinkContext[];
}

/** Pure: one `.md` body to a BuiltVaultEntry. */
function buildMdEntry(
  entry: WalkEntry,
  raw: string,
  lastModified: number,
): BuiltVaultEntry {
  const slug = entry.relativePath.replace(/\.md$/, '');
  const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
  const headings = extractHeadings(body);
  const title =
    (typeof frontmatter.title === 'string' && frontmatter.title) ||
    firstHeading(body) ||
    slug.split('/').pop() ||
    slug;
  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : undefined;
  const tags = Array.isArray(frontmatter.tags)
    ? (frontmatter.tags as unknown[]).filter(
        (t): t is string => typeof t === 'string',
      )
    : typeof frontmatter.tags === 'string'
      ? frontmatter.tags.split(/\s+/).filter(Boolean)
      : [];
  const { slugs: linksOut, contexts: linkContexts } =
    extractOutLinksWithContext(body, slug);
  const kind =
    typeof frontmatter.kind === 'string' ? frontmatter.kind.trim() : '';

  const doc: VaultDoc = {
    slug,
    path: entry.relativePath,
    title,
    description,
    tags,
    frontmatter,
    ...(diagnostics && diagnostics.length > 0 ? { diagnostics } : {}),
    headings,
    excerpt: buildExcerpt(body),
    ...(frontmatter.kind === 'project'
      ? { meaningEvidencePaths: extractProjectMeaningEvidencePaths(body) }
      : {}),
    ...(kind
      ? {
          meaningFindings: meaningFindings({ kind, slug, title, body }).map(
            (finding) => finding.code,
          ),
        }
      : {}),
    wordCount: body.split(/\s+/).filter(Boolean).length,
    updatedAt: new Date(lastModified).toISOString(),
    linksOut,
    mtime: lastModified,
  };
  return {
    relativePath: entry.relativePath,
    lastModified,
    handle: entry.handle,
    kind: 'md',
    doc,
    linkContexts,
  };
}

/** Full and incremental builds share this aggregation so they cannot disagree. */
function aggregateBuild(
  entries: BuiltVaultEntry[],
  rootName: string,
  walkInfo?: { truncated: boolean; prunedDirs: string[]; sourceFileCount?: number },
): LocalVaultBuild {
  const docs: VaultDoc[] = [];
  const sources: VaultSourceFile[] = [];
  const fileHandles = new Map<string, FileSystemFileHandle>();
  const imageHandles = new Map<string, FileSystemFileHandle>();
  const sourceHandles = new Map<string, FileSystemFileHandle>();
  const backlinksDetailMap = new Map<string, VaultBacklinkEntry[]>();
  const tagsMap = new Map<string, Set<string>>();
  const fingerprintStamps: Array<{ relativePath: string; lastModified: number }> = [];

  for (const entry of entries) {
    fingerprintStamps.push({
      relativePath: entry.relativePath,
      lastModified: entry.lastModified,
    });
    if (entry.kind === 'image') {
      imageHandles.set(entry.relativePath, entry.handle);
      continue;
    }
    if (entry.kind === 'source') {
      // A raw source never joins `docs`; its handle only lets a person open the file.
      sourceHandles.set(entry.relativePath, entry.handle);
      sources.push({
        path: entry.relativePath,
        name: entry.relativePath.slice(entry.relativePath.lastIndexOf('/') + 1),
        format: vaultSourceFormat(entry.relativePath),
        bytes: entry.bytes ?? 0,
        mtime: entry.lastModified,
      });
      continue;
    }
    const doc = entry.doc;
    if (!doc) continue;
    fileHandles.set(doc.slug, entry.handle);

    for (const ctx of entry.linkContexts ?? []) {
      if (!backlinksDetailMap.has(ctx.target)) {
        backlinksDetailMap.set(ctx.target, []);
      }
      backlinksDetailMap.get(ctx.target)!.push({
        fromSlug: doc.slug,
        context: ctx.context,
        linkText: ctx.linkText,
      });
    }
    for (const tag of doc.tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag)!.add(doc.slug);
    }
    docs.push(doc);
  }

  // Frontmatter relation refs add backlinks too, deduped by fromSlug so a body link's richer
  // context wins.
  const slugSet = new Set(docs.map((doc) => doc.slug));
  const tailToSlug = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop() ?? doc.slug;
    // A tail shared by two docs becomes null (ambiguous).
    tailToSlug.set(tail, tailToSlug.has(tail) ? null : doc.slug);
  }
  for (const doc of docs) {
    const seenTargets = new Set<string>();
    for (const ref of frontmatterRefStrings(doc.frontmatter as Record<string, unknown>)) {
      const target = resolveRefToDocSlug(ref, slugSet, tailToSlug);
      // No self-backlinks; dedup repeated refs to the same target within a doc.
      if (!target || target === doc.slug || seenTargets.has(target)) continue;
      seenTargets.add(target);
      if (!backlinksDetailMap.has(target)) backlinksDetailMap.set(target, []);
      backlinksDetailMap.get(target)!.push({
        fromSlug: doc.slug,
        context: `frontmatter · **[${ref}]**`,
        linkText: ref,
      });
    }
  }

  docs.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));
  sources.sort((a, b) => a.path.localeCompare(b.path, 'ko'));

  const tree: VaultTreeNode = { name: rootName, path: '', type: 'dir' };
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title);
  sortTree(tree);

  const backlinksDetail: Record<string, VaultBacklinkEntry[]> = {};
  for (const [slug, list] of backlinksDetailMap) {
    const byFrom = new Map<string, VaultBacklinkEntry>();
    for (const entry of list) {
      if (!byFrom.has(entry.fromSlug)) byFrom.set(entry.fromSlug, entry);
    }
    backlinksDetail[slug] = [...byFrom.values()].sort((a, b) =>
      a.fromSlug.localeCompare(b.fromSlug, 'ko'),
    );
  }
  const tags: Record<string, string[]> = {};
  for (const [tag, set] of tagsMap) {
    tags[tag] = [...set].sort();
  }

  const manifest: VaultManifest = {
    version: '2026-04-23',
    generatedAt: new Date().toISOString(),
    // Walk fields are emitted only when set, so manifests compare equal across builds.
    ...(walkInfo?.truncated ? { walkTruncated: true } : {}),
    ...(walkInfo?.prunedDirs.length ? { prunedDirs: walkInfo.prunedDirs } : {}),
    ...(walkInfo?.sourceFileCount ? { sourceFileCount: walkInfo.sourceFileCount } : {}),
    docs,
    ...(sources.length ? { sources } : {}),
    backlinksDetail,
    tags,
    tree,
  };
  return {
    manifest,
    fileHandles,
    imageHandles,
    sourceHandles,
    fingerprint: fingerprintFromEntries(fingerprintStamps),
  };
}

async function collectEntries(
  root: FileSystemDirectoryHandle,
  walkInfo?: { truncated: boolean; prunedDirs: string[]; sourceFileCount?: number },
): Promise<BuiltVaultEntry[]> {
  const walked = await walkVault(root);
  if (walkInfo) {
    walkInfo.truncated = walked.truncated;
    walkInfo.prunedDirs = walked.prunedDirs;
    walkInfo.sourceFileCount = walked.sourceFileCount;
  }
  const files = walked.entries;
  const entries: BuiltVaultEntry[] = [];
  /* Sources are listed by size and mtime from native stamps, never opened (`getFile()` under
   * Tauri transfers the whole file). On the web a directory `File` is metadata only. */
  const stamps = files.some((entry) => entry.kind === 'source')
    ? await nativeStampIndex(root)
    : null;
  for (const entry of files) {
    if (entry.kind === 'source') {
      const stamp = stamps?.get(entry.relativePath);
      const { lastModified, bytes } = stamp
        ? { lastModified: stamp.lastModified, bytes: stamp.size }
        : await sourceStampFromHandle(entry.handle);
      entries.push({
        relativePath: entry.relativePath,
        lastModified,
        bytes,
        handle: entry.handle,
        kind: 'source',
      });
      continue;
    }
    const file = await entry.handle.getFile();
    if (entry.kind === 'image') {
      entries.push({
        relativePath: entry.relativePath,
        lastModified: file.lastModified,
        handle: entry.handle,
        kind: 'image',
      });
      continue;
    }
    const raw = await file.text();
    entries.push(buildMdEntry(entry, raw, file.lastModified));
  }
  return entries;
}

async function sourceStampFromHandle(
  handle: FileSystemFileHandle,
): Promise<{ lastModified: number; bytes: number }> {
  const file = await handle.getFile();
  return { lastModified: file.lastModified, bytes: file.size };
}

/** Full build plus the entries the next incremental rebuild reuses. */
export async function buildLocalManifestWithEntries(
  root: FileSystemDirectoryHandle,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  const walkInfo = { truncated: false, prunedDirs: [] as string[], sourceFileCount: 0 };
  const entries = await collectEntries(root, walkInfo);
  return { build: aggregateBuild(entries, root.name, walkInfo), entries };
}

/** Builds a local manifest in the same VaultManifest shape as `scripts/build-docs-vault.mjs`. */
export async function buildLocalManifest(
  root: FileSystemDirectoryHandle,
): Promise<LocalVaultBuild> {
  const walkInfo = { truncated: false, prunedDirs: [] as string[], sourceFileCount: 0 };
  const entries = await collectEntries(root, walkInfo);
  return aggregateBuild(entries, root.name, walkInfo);
}

/**
 * Reuses previous entries whose (relativePath, mtime, kind) match and rereads the rest;
 * equivalent to a full build except `generatedAt`. Assumes equal mtime means equal content.
 */
export async function rebuildLocalManifestIncremental(
  root: FileSystemDirectoryHandle,
  previous: BuiltVaultEntry[],
  /** Native stamps already fetched by the caller's change check, so the vault is walked once. */
  providedStamps?: VaultStampIndex | null,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  /* The walk info must survive an incremental rebuild: the first-run card reads
   * `sourceFileCount`, and its absence reorders the card while it is on screen. */
  const walked = await walkVault(root);
  const files = walked.entries;
  const walkInfo = {
    truncated: walked.truncated,
    prunedDirs: walked.prunedDirs,
    sourceFileCount: walked.sourceFileCount,
  };
  const prevByPath = new Map(previous.map((e) => [e.relativePath, e] as const));
  /* Decide from native mtimes before calling `getFile()`, which under Tauri transfers the whole
   * body. The web has no batch API and gets null (`.claude/rules/surfaces.md`). */
  const nativeStamps: VaultStampIndex | null = providedStamps ?? (await nativeStampIndex(root));
  const entries: BuiltVaultEntry[] = [];
  for (const entry of files) {
    // An unchanged native mtime means the file is never opened; an unknown path is read to be safe.
    const nativeStamp = nativeStamps?.get(entry.relativePath);
    if (nativeStamp !== undefined) {
      const prevNative = prevByPath.get(entry.relativePath);
      if (
        prevNative &&
        prevNative.kind === entry.kind &&
        prevNative.lastModified === nativeStamp.lastModified
      ) {
        entries.push({ ...prevNative, handle: entry.handle });
        continue;
      }
    }
    if (entry.kind === 'source') {
      // Metadata only: a raw source's bytes never enter this process.
      const { lastModified, bytes } = nativeStamp
        ? { lastModified: nativeStamp.lastModified, bytes: nativeStamp.size }
        : await sourceStampFromHandle(entry.handle);
      entries.push({
        relativePath: entry.relativePath,
        lastModified,
        bytes,
        handle: entry.handle,
        kind: 'source',
      });
      continue;
    }
    const file = await entry.handle.getFile();
    const prev = prevByPath.get(entry.relativePath);
    if (
      prev &&
      prev.kind === entry.kind &&
      prev.lastModified === file.lastModified
    ) {
      // Unchanged — reuse the previous result without re-reading; take the fresh handle.
      entries.push({ ...prev, handle: entry.handle });
      continue;
    }
    if (entry.kind === 'image') {
      entries.push({
        relativePath: entry.relativePath,
        lastModified: file.lastModified,
        handle: entry.handle,
        kind: 'image',
      });
      continue;
    }
    const raw = await file.text();
    entries.push(buildMdEntry(entry, raw, file.lastModified));
  }
  return { build: aggregateBuild(entries, root.name, walkInfo), entries };
}

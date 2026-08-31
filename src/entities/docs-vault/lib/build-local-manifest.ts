import {
  buildExcerpt,
  extractHeadings,
  extractOutLinksWithContext,
  firstHeading,
  parseFrontmatter,
  type LinkContext,
} from '@/shared/lib/parse-frontmatter';
import { extractProjectMeaningEvidencePaths } from '@/shared/lib/project-meaning-evidence';
import { nativeVaultFingerprint } from '@/shared/lib/tauri-vault-fs';
import type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultTreeNode,
} from '../model/types';

/**
 * D-1 — frontmatter keys that hold graph relation refs to OTHER docs. A doc
 * that names another doc here (e.g. `dependencies: [capabilities/mcp-server]`)
 * is a backlink to that doc, exactly as the MCP `find_backlinks` tool counts it
 * (same key set: `mcp/src/vault.mjs` NEIGHBOR_KEYS + INLINE_NEIGHBOR_KEYS).
 * The old backlink index only scanned BODY markdown links, so a doc referenced
 * purely through frontmatter (the common vault case) showed a false "no
 * backlinks" — the exact defect the UX round caught on `capabilities/mcp-server`
 * (13 real referrers, footer said "none"). Kept in sync with the build-time
 * script (`scripts/build-docs-vault.mjs`).
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

/** Frontmatter value → the doc slugs it references (folder-prefixed or bare). */
function frontmatterRefStrings(frontmatter: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of RELATION_REF_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string' && item.trim()) out.push(item.trim());
    } else if (typeof value === 'string' && value.trim()) {
      // tolerate a scalar where an array is expected
      out.push(value.trim());
    }
  }
  for (const key of RELATION_REF_STRING_KEYS) {
    const value = frontmatter[key];
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return out;
}

/**
 * Resolve a frontmatter ref to a known doc slug, or null. Folder-prefixed refs
 * (`capabilities/mcp-server`) match a slug directly; bare refs (`mcp-server`,
 * `ai-agent-partner`) resolve by unique tail segment. Refs that match no doc
 * (e.g. `elements: [mcp/src/index.js]` — a source-file ref with no `.md`) are
 * skipped, so no phantom backlinks are minted.
 */
function resolveRefToDocSlug(
  ref: string,
  slugSet: ReadonlySet<string>,
  tailToSlug: ReadonlyMap<string, string | null>,
): string | null {
  const normalized = ref.replace(/\.md$/i, '');
  if (slugSet.has(normalized)) return normalized;
  const tail = normalized.split('/').pop() ?? normalized;
  const byTail = tailToSlug.get(tail);
  // `byTail === null` marks an ambiguous tail (2+ docs share it) — don't guess.
  return byTail ?? null;
}

// Walks a FileSystemDirectoryHandle recursively, collecting `.md` files. The
// file-handle map comes back with it so the viewer can read slug → content.

interface WalkEntry {
  handle: FileSystemFileHandle;
  /** Path relative to the top-level handle — e.g. 'specs/hello.md'. */
  relativePath: string;
  kind: 'md' | 'image';
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/**
 * Source files, counted but never read.
 *
 * The walk already visits every entry and drops whatever is not Markdown or an
 * image, so this is a comparison on a name the loop is holding anyway — no extra
 * directory read, no file opened, nothing transmitted.
 *
 * It exists because the app could not tell a code repository from a documents
 * folder and said so out loud: pointed at a repository with five TypeScript
 * files, the first-run card announced it had "found 1 documents" and offered to
 * map them (`docs/audits/USER-WALKTHROUGH-FIRST-RUN-2026-08-31.md`, finding 3).
 * The count is the smallest fact that lets the card stop leading with the wrong
 * one.
 *
 * The list is deliberately short and popular rather than exhaustive. A missing
 * extension makes a folder look less like code than it is, which costs one Skip;
 * a wrong extension would cost the same in the other direction. Neither is a
 * dead end, because the steps are a sequence with a skip on every one.
 */
const SOURCE_EXT =
  /\.(m?[jt]sx?|vue|svelte|dart|py|go|rs|java|kt|swift|rb|php|cs|c|cc|cpp|h|hpp|scala|ex|exs|sh)$/i;

/**
 * The walk's boundary — **a vault is a document folder, not an arbitrary directory.**
 *
 * Measured 2026-07-29: picking the **repository root** as the vault killed the
 * WebView in the installed app ("This page couldn't load"). With no bound the
 * walk descended into `src-tauri/target` and carried 984 directories / 965
 * markdown files (9.4 MB) across IPC — 16× a normal vault (23 / 97).
 *
 * This hurts precisely because some features (the skill-copy check, for one) are
 * only meaningful when the vault *is* the repo root — so that combination is
 * exactly what a first-time user tries.
 */

/**
 * Names that are certain. The odds of a user's ontology living inside
 * `node_modules` are zero and the name never collides. **Do not extend this
 * list** — `build`, `dist`, `out` are legitimate names inside a document folder,
 * so pruning by name would silently drop someone's documents.
 */
const PRUNE_BY_NAME = new Set(['node_modules']);

/**
 * The public convention for cache directories: the directory declares itself
 * (bford.info/cachedir, followed by Cargo, Bazel, and others). Unlike a name
 * list there is nothing to maintain and no false positive is possible — a user
 * has no reason to put this file in their document folder.
 */
const CACHE_DIR_TAG = 'CACHEDIR.TAG';

/** Roughly 20× a normal vault. Past this the walk truncates and **says so**. */
export const VAULT_WALK_MAX_ENTRIES = 4000;
/** A realistic ceiling for a document folder. Deeper usually means someone else's tree. */
export const VAULT_WALK_MAX_DEPTH = 12;

export interface WalkResult {
  entries: WalkEntry[];
  /**
   * Whether a limit was hit and the walk saw **only part** of the tree. Silent
   * truncation reads as "we saw everything", so it is reported to the caller.
   */
  truncated: boolean;
  /** Relative paths of directories skipped whole as cache or dependencies. */
  prunedDirs: string[];
  /**
   * How many source files the walk passed over. Not read, not stored — only
   * counted, so the first-run card can tell a codebase from a documents folder.
   */
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

  // Collect the listing **first**. The cache tag is already in it, so asking for
  // it with `getFileHandle` would add one IPC round trip per directory — the same
  // class of cost this walk exists to avoid.
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
    const relative = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      if (PRUNE_BY_NAME.has(name)) {
        acc.prunedDirs.push(relative);
        continue;
      }
      await walkInto(handle as FileSystemDirectoryHandle, relative, depth + 1, acc);
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
  /**
   * Directory fingerprint at build time — `${path}@${mtime}` entries sorted and
   * joined. Compare against a later `computeLocalVaultFingerprint(root)` to skip
   * a rebuild when nothing changed.
   */
  fingerprint: string;
}

function fingerprintFromEntries(
  entries: Array<{ relativePath: string; lastModified: number }>,
): string {
  return entries
    .map((e) => `${e.relativePath}@${e.lastModified}`)
    .sort()
    .join('\n');
}

/**
 * Walks the directory collecting only file mtimes — *never reading content* —
 * and folds them into a fingerprint. An unchanged fingerprint means no `.md` or
 * image changed since the last build.
 *
 * This variant returns the fingerprint **and the stamps that produced it**.
 * While only `computeLocalVaultFingerprint` existed, a caller learned "something
 * changed" and then threw away the evidence, so an incremental rebuild walked
 * the same vault a **second** time. Returning both means one walk per change.
 */
export async function computeLocalVaultFingerprintWithStamps(
  root: FileSystemDirectoryHandle,
): Promise<{ fingerprint: string; nativeStamps: Map<string, number> | null }> {
  const nativeRoot = (root as { rootPath?: unknown }).rootPath;
  if (typeof nativeRoot === 'string' && nativeRoot) {
    const native = await nativeVaultFingerprint(nativeRoot);
    if (native) {
      return {
        fingerprint: fingerprintFromEntries(native.entries),
        nativeStamps: new Map(
          native.entries.map((e) => [e.relativePath, e.lastModified] as const),
        ),
      };
    }
  }
  return { fingerprint: await computeLocalVaultFingerprint(root), nativeStamps: null };
}

export async function computeLocalVaultFingerprint(
  root: FileSystemDirectoryHandle,
): Promise<string> {
  /*
   * **In the app this is one native call** (2026-07-31).
   *
   * The web path below calls `getFile()` per file; under Tauri that is a
   * `read_vault_text_file` IPC round trip, and that command returns **the full
   * body plus the mtime**. One number is used and the whole vault crosses the
   * bridge — opening this repository as a vault makes `docs/` 261 files / 17.7 MB,
   * and this function runs every time the window regains focus.
   *
   * `vault_fingerprint` has Rust walk it once and return **paths and mtimes only**.
   * The web has no such batch API, so it returns `null` and falls through below —
   * the bridge convention from `.claude/rules/surfaces.md` (absent → `null`, degrade honestly).
   */
  const nativeRoot = (root as { rootPath?: unknown }).rootPath;
  if (typeof nativeRoot === 'string' && nativeRoot) {
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

/**
 * One unit of a build: a markdown document (plus the link context backlink
 * reconstruction needs) or an image. It carries `handle` + `lastModified` so an
 * incremental rebuild can skip re-reading a file whose mtime is unchanged and
 * reuse the previous result.
 */
export interface BuiltVaultEntry {
  relativePath: string;
  lastModified: number;
  handle: FileSystemFileHandle;
  kind: 'md' | 'image';
  /** Markdown only — the aggregated VaultDoc. */
  doc?: VaultDoc;
  /** Markdown only — out-link context, for rebuilding backlinksDetail. */
  linkContexts?: LinkContext[];
}

/** One `.md` file's raw body → BuiltVaultEntry. Pure; no I/O. */
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

/**
 * BuiltVaultEntry[] → a finished LocalVaultBuild. Sorting, tree, backlinks, tags,
 * and fingerprint are all in memory. Full and incremental builds share **this one
 * function**, so the two paths cannot structurally disagree.
 */
function aggregateBuild(
  entries: BuiltVaultEntry[],
  rootName: string,
  walkInfo?: { truncated: boolean; prunedDirs: string[]; sourceFileCount?: number },
): LocalVaultBuild {
  const docs: VaultDoc[] = [];
  const fileHandles = new Map<string, FileSystemFileHandle>();
  const imageHandles = new Map<string, FileSystemFileHandle>();
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
    const doc = entry.doc;
    if (!doc) continue;
    fileHandles.set(doc.slug, entry.handle);

    // Plain `backlinks` (deprecated) is no longer put in the manifest; only
    // `backlinksDetail`, which carries context.
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

  // D-1 — second pass: register FRONTMATTER relation-ref backlinks (the body
  // pass above only saw markdown links). A ref that resolves to a known doc
  // slug adds a backlink from the declaring doc to that target — deduped by
  // fromSlug in the final assembly below, so a doc that references a target
  // through BOTH a body link and frontmatter keeps the richer body context.
  const slugSet = new Set(docs.map((doc) => doc.slug));
  const tailToSlug = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop() ?? doc.slug;
    // First occurrence wins; a second doc with the same tail marks it ambiguous
    // (null) so `resolveRefToDocSlug` won't guess.
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
    // Omit the field entirely when no limit was hit — always emitting `false`/`[]`
    // would create meaningless differences for code that compares manifests
    // (incremental build, snapshots).
    ...(walkInfo?.truncated ? { walkTruncated: true } : {}),
    ...(walkInfo?.prunedDirs.length ? { prunedDirs: walkInfo.prunedDirs } : {}),
    // Same rule as the two fields above: emitted only when there is something to
    // say, so a documents folder's manifest is unchanged by this addition.
    ...(walkInfo?.sourceFileCount ? { sourceFileCount: walkInfo.sourceFileCount } : {}),
    docs,
    backlinksDetail,
    tags,
    tree,
  };
  return {
    manifest,
    fileHandles,
    imageHandles,
    fingerprint: fingerprintFromEntries(fingerprintStamps),
  };
}

/** Walks the directory reading every `.md` body into BuiltVaultEntry[]. Full I/O. */
async function collectEntries(
  root: FileSystemDirectoryHandle,
  /** Carries the walk's boundary facts through to the manifest, so it stays visible. */
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
  for (const entry of files) {
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

/**
 * Full build plus the reusable entries. The caller (use-local-vault `load`) keeps
 * the entries in a ref and hands them to the next incremental rebuild.
 */
export async function buildLocalManifestWithEntries(
  root: FileSystemDirectoryHandle,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  const walkInfo = { truncated: false, prunedDirs: [] as string[], sourceFileCount: 0 };
  const entries = await collectEntries(root, walkInfo);
  return { build: aggregateBuild(entries, root.name, walkInfo), entries };
}

/**
 * Builds a markdown manifest from a chosen local directory, in the same
 * VaultManifest shape as `scripts/build-docs-vault.mjs`, so the viewer, tree,
 * and graph work unchanged.
 */
export async function buildLocalManifest(
  root: FileSystemDirectoryHandle,
): Promise<LocalVaultBuild> {
  const walkInfo = { truncated: false, prunedDirs: [] as string[], sourceFileCount: 0 };
  const entries = await collectEntries(root, walkInfo);
  return aggregateBuild(entries, root.name, walkInfo);
}

/**
 * Incremental rebuild — reuses the `previous` entries. After walking, only each
 * file's mtime is checked (no body read); when (relativePath, mtime, kind) match
 * the previous run, that entry's doc and link context are reused verbatim. Only
 * changed or added files are re-read; deleted ones simply fall out. The result is
 * equivalent to a full `buildLocalManifest` except for `generatedAt` —
 * `incremental.test.ts` proves that across add/change/remove/no-op/rename.
 *
 * Assumption: the same (relativePath, mtime) implies the same content — the same
 * assumption the `computeLocalVaultFingerprint` skip already relies on.
 */
export async function rebuildLocalManifestIncremental(
  root: FileSystemDirectoryHandle,
  previous: BuiltVaultEntry[],
  /**
   * Native stamps (path → mtime) already fetched. `refresh()` just walked for
   * exactly this to decide whether anything changed, so passing them in
   * **avoids walking twice**. Omitted, this fetches them itself.
   */
  providedStamps?: Map<string, number> | null,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  /*
   * **The counters have to survive this path too, or the screen changes under
   * the person standing on it.**
   *
   * This used to call the entries-only `walk()` and hand `aggregateBuild` no
   * walk info, so an incremental rebuild produced a manifest with no
   * `sourceFileCount`. The first-run card reads that number to decide whether
   * to open with the code step, and its absence reads as zero — so the card
   * silently reordered from "draft the map from your code" to "start from the
   * documents in this folder" while it was still on screen.
   *
   * The trigger is this feature's own happy path: the person copies the
   * instruction, their agent writes an approved document into the folder, the
   * mtime fingerprint changes, and the refresh runs incrementally.
   * `walkTruncated` and `prunedDirs` were being dropped here for the same
   * reason and are restored with it.
   */
  const walked = await walkVault(root);
  const files = walked.entries;
  const walkInfo = {
    truncated: walked.truncated,
    prunedDirs: walked.prunedDirs,
    sourceFileCount: walked.sourceFileCount,
  };
  const prevByPath = new Map(previous.map((e) => [e.relativePath, e] as const));
  /*
   * **Do not drag file bodies across the bridge just to learn an mtime** (measured 2026-08-09).
   *
   * This function exists to re-read only changed files, yet it called `getFile()`
   * per file to find out *what* changed. Under Tauri that is a
   * `read_vault_text_file` round trip returning the whole body — the same waste
   * the `computeLocalVaultFingerprint` comment above already names. So body
   * re-parsing was saved while transfer and round trips were not.
   *
   * Measured in the installed app, editing one file until the map caught up:
   * **2.0 s for a 71-file vault, 0.7 s for a 5-file vault** — linear in file count
   * (≈20 ms each, matching an IPC round trip). Reading those same 71 files from
   * disk costs **1.8 ms**.
   *
   * The fix is not a new native command: `vault_fingerprint` already returns paths
   * and mtimes in one call and is used 300 lines above. Decide with it first, then
   * call `getFile()` only where the mtime differs.
   *
   * The web has no batch API, so it gets `null` and falls through to the previous
   * path — the bridge convention from `.claude/rules/surfaces.md`.
   */
  let nativeStamps: Map<string, number> | null = providedStamps ?? null;
  if (!nativeStamps) {
    const nativeRoot = (root as { rootPath?: unknown }).rootPath;
    if (typeof nativeRoot === 'string' && nativeRoot) {
      try {
        const native = await nativeVaultFingerprint(nativeRoot);
        if (native) {
          nativeStamps = new Map(
            native.entries.map((e) => [e.relativePath, e.lastModified] as const),
          );
        }
      } catch {
        /* Native failed → fall back to the per-file path below (behaviour unchanged). */
      }
    }
  }
  const entries: BuiltVaultEntry[] = [];
  for (const entry of files) {
    // If native knows this path's mtime and it is unchanged, **the file is never
    // opened**. An unknown path (just created, or listings disagreeing) falls
    // through and is handled as before — "read it when unsure" is the safe side.
    const nativeMtime = nativeStamps?.get(entry.relativePath);
    if (nativeMtime !== undefined) {
      const prevNative = prevByPath.get(entry.relativePath);
      if (
        prevNative &&
        prevNative.kind === entry.kind &&
        prevNative.lastModified === nativeMtime
      ) {
        entries.push({ ...prevNative, handle: entry.handle });
        continue;
      }
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

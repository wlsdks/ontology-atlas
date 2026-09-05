// The docs-vault manifest schema — exactly the shape `scripts/build-docs-vault.mjs`
// emits at build time.

export interface VaultHeading {
  depth: number;
  text: string;
  slug: string;
}

export interface VaultDoc {
  slug: string;
  path: string;
  title: string;
  description?: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  /** Parser diagnostics are retained so health cannot hide malformed metadata. */
  diagnostics?: Array<{
    code: string;
    line: number;
    message: string;
  }>;
  headings: VaultHeading[];
  excerpt: string;
  /**
   * Exact source paths parsed from the persisted project competency block.
   * Derived at load time; never written back to vault Markdown.
   */
  meaningEvidencePaths?: string[];
  wordCount: number;
  updatedAt: string;
  linksOut: string[];
  /**
   * `file.lastModified` (ms), used for conflict detection in local mode. Undefined
   * in static mode, where the manifest is a build artifact. The caller (`saveDoc`)
   * passes it back as `expectedMtime` to detect an outside edit.
   */
  mtime?: number;
}

/**
 * One raw source file — a project document kept verbatim under `sources/`.
 *
 * A vault holds three kinds of file and only one is the graph (`docs/DECISIONS.md`,
 * 2026-09-05). This is the first kind: whatever format it arrived in, unconverted. The
 * walk records what a directory listing already knows — name, format, byte length,
 * mtime — and **never opens the file**, which is why a PDF can live in the folder
 * without a node appearing in the map.
 */
export interface VaultSourceFile {
  /** Vault-relative path, always beginning `sources/`. */
  path: string;
  /** File name as it sits on disk. */
  name: string;
  /** Lowercase extension without the dot (`pdf`), or `''` when the name has none. */
  format: string;
  /** Byte length from the directory entry. */
  bytes: number;
  /** `file.lastModified` in ms, the same representation `VaultDoc.mtime` uses. */
  mtime: number;
}

export interface VaultTreeNode {
  name: string;
  path: string;
  type: 'dir' | 'doc';
  slug?: string;
  title?: string;
  children?: VaultTreeNode[];
}

export interface VaultBacklinkEntry {
  fromSlug: string;
  /** 120 characters of context around the link; the link text is shown **[in bold]**. */
  context: string;
  linkText: string;
}

export interface VaultManifest {
  version: string;
  generatedAt: string;
  /**
   * Whether the walk hit a limit and saw **only part** of the tree. Silent truncation
   * reads as "we saw everything", so the manifest carries the fact — a screen saying
   * "N documents" must be able to say in the same place whether N is all of them.
   * Optional because the build-time manifest has no such concept.
   */
  walkTruncated?: boolean;
  /** Directories skipped whole as cache or dependencies — the evidence for why they are missing. */
  prunedDirs?: string[];
  /**
   * Source files the walk passed over without reading. Present only when there
   * were any, so a documents folder's manifest is unchanged.
   *
   * This is the whole of what the app knows about code in the chosen folder, and
   * it exists for one screen: the first-run card could not tell a codebase from a
   * documents folder, so in a repository of five TypeScript files it opened by
   * announcing it had "found 1 documents".
   */
  sourceFileCount?: number;
  docs: VaultDoc[];
  /**
   * Raw sources under `sources/`, present only when the folder holds any.
   *
   * They are a **sibling of `docs`, never a member of it**: a document here has no
   * frontmatter to parse and no slug to address, so nothing downstream — derivation,
   * search, the tree — can mistake one for a concept. That separation is the
   * construction that keeps arbitrary formats out of the graph, rather than a filter
   * some later reader has to remember to apply.
   */
  sources?: VaultSourceFile[];
  backlinksDetail: Record<string, VaultBacklinkEntry[]>;
  tags: Record<string, string[]>;
  tree: VaultTreeNode;
}

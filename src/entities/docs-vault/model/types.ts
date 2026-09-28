// The manifest shape `scripts/build-docs-vault.mjs` emits.

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
  definitionPreview?: string;
  /** Source paths from the project competency block; derived at load, never written back. */
  meaningEvidencePaths?: string[];
  /**
   * Meaning finding codes (`src/shared/lib/meaning-findings.ts`). Absent: not a node. `null`: the
   * rule was unavailable at build, so nothing was measured; never read it as clean.
   */
  meaningFindings?: string[] | null;
  wordCount: number;
  updatedAt: string;
  /** Commits touching this document, carried across moves; bundled manifest only. */
  revision?: number;
  linksOut: string[];
  /** `file.lastModified` in local mode, passed back as `expectedMtime` to detect outside edits. */
  mtime?: number;
}

/**
 * A raw file under `sources/`, known from its directory entry only and never opened
 * (`docs/DECISIONS.md` 2026-09-05, "A vault holds three kinds of file and only one is the graph").
 */
export interface VaultSourceFile {
  /** Always begins `sources/`. */
  path: string;
  name: string;
  /** Lowercase extension without the dot, or `''`. */
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
  /** 120 characters around the link, with the link text in bold. */
  context: string;
  linkText: string;
}

export interface VaultManifest {
  version: string;
  generatedAt: string;
  /** The walk hit a limit and saw only part of the tree. */
  walkTruncated?: boolean;
  /** Directories skipped whole as cache or dependencies. */
  prunedDirs?: string[];
  /** Source files passed over unread; present only when nonzero. */
  sourceFileCount?: number;
  docs: VaultDoc[];
  /** `{ oldSlug: newSlug }` from `docs/.moved.json`, so old links still open; bundled manifest only. */
  aliases?: Record<string, string>;
  /** Raw sources, kept beside `docs` and never in it so nothing downstream treats one as a concept. */
  sources?: VaultSourceFile[];
  backlinksDetail: Record<string, VaultBacklinkEntry[]>;
  tags: Record<string, string[]>;
  tree: VaultTreeNode;
}

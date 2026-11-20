// The manifest shape `scripts/docs-vault/build-docs-vault.mjs` emits.

export interface VaultHeading {
  depth: number;
  text: string;
  slug: string;
}

/** What lists, the graph and the map need of every document; detail is read from the file on demand. */
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
  /** The first paragraph when short (`buildDefinitionPreview`); a concept's summary on every surface. */
  definitionPreview?: string;
  /** Source paths from the project competency block; derived at load, never written back. */
  meaningEvidencePaths?: string[];
  /**
   * Meaning finding codes (`src/shared/lib/vault-document/meaning-findings.ts`). Absent: not a node. `null`: the
   * rule was unavailable at build, so nothing was measured; never read it as clean.
   */
  meaningFindings?: string[] | null;
  /**
   * Whether a capability's body cites read lines (`path:L12`); kept instead of the body. Absent:
   * not a capability, or a manifest built without it (the bundled one), so nothing was measured.
   */
  citesReadLines?: boolean;
  updatedAt: string;
  /** Commits touching this document, carried across moves; bundled manifest only. */
  revision?: number;
  linksOut: string[];
  /** `file.lastModified` in local mode, passed back as `expectedMtime` to detect outside edits. */
  mtime?: number;
}

/** A raw file under `sources/`, known from its directory entry only and never opened. */
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
  /** Per target slug, the documents that link to it or name it in a relation, by `compareCollated`. */
  backlinkSources: Record<string, string[]>;
  tags: Record<string, string[]>;
  tree: VaultTreeNode;
}

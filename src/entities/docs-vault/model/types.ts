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
  docs: VaultDoc[];
  backlinksDetail: Record<string, VaultBacklinkEntry[]>;
  tags: Record<string, string[]>;
  tree: VaultTreeNode;
}

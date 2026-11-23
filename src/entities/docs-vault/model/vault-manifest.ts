// The manifest shape `scripts/docs-vault/build-docs-vault.mjs` emits.

import type { NotMappedAreas } from '@/shared/lib/vault-document/not-mapped-areas';

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
  /**
   * A project's `Not mapped yet: N of M areas, R of T abilities.` line under `## Uncertainty` (`not-mapped-areas.ts`).
   * Absent: not a project, no such line, or a manifest built without it (the bundled one).
   */
  notMappedAreas?: NotMappedAreas;
  updatedAt: string;
  revision?: number;
  linksOut: string[];
  /** `file.lastModified` in local mode, passed back as `expectedMtime` to detect outside edits. */
  mtime?: number;
}

/** A raw file under `sources/`, known from its directory entry only and never opened. */
export interface VaultSourceFile {
  path: string;
  name: string;
  format: string;
  bytes: number;
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
  walkTruncated?: boolean;
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

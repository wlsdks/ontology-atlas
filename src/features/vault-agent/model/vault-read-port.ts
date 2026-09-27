import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

/**
 * The executor's only window onto the vault. It has no write method, so a model's write cannot
 * reach disk; adding one breaks the type assertion in `tool-executor.test.ts`.
 */
export interface VaultReadDoc {
  slug: string;
  path: string;
  title: string;
  kind: string;
  domain?: string;
  frontmatter: Record<string, unknown>;
  /** An excerpt of the first body paragraph (within 200 characters). */
  excerpt: string;
  /** File mtime (ms). Undefined when absent — meaning no concurrent-edit guard can be applied. */
  mtime?: number;
}

export interface VaultReadPort {
  /** Concepts that have documents, plus concepts merely named by another document. */
  readonly nodes: readonly KnowledgeGraphNode[];
  readonly edges: readonly KnowledgeGraphEdge[];
  /** Real `.md` documents only. A merely-named concept is not here. */
  readonly docs: readonly VaultReadDoc[];
  /** The document's full text. Null when absent. */
  readDocText(slug: string): Promise<string | null>;
}

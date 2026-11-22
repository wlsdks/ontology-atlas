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
  /** File mtime (ms). Undefined when absent — meaning no concurrent-edit guard can be applied. */
  mtime?: number;
}

export interface VaultReadPort {
  readonly nodes: readonly KnowledgeGraphNode[];
  readonly edges: readonly KnowledgeGraphEdge[];
  /** Real `.md` documents only. A merely-named concept is not here. */
  readonly docs: readonly VaultReadDoc[];
  readDocText(slug: string): Promise<string | null>;
}

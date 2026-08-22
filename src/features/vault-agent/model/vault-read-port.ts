import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

/**
 * The executor's **only window onto the vault.**
 *
 * **The absence of a write method on this type** is the structural proof of "a
 * model's write call never reaches the disk". The executor is injected with this
 * port alone, so even trying to call a write by mistake finds no such function.
 * Applying belongs to a separate module (`proposal-applier`), called only from the
 * consent card's handler.
 *
 * When adding a method, do not put a write here — the moment you do, that proof is
 * gone and the type-level assertion in `tool-executor.test.ts` breaks.
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

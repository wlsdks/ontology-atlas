import { reconcileImportEdges } from '../../drift/reconcile-imports.mjs';
import { COMPILED_ONTOLOGY_CACHE } from '../../server/runtime.mjs';
import { summarizeReconciliation } from './import-review-rules.mjs';

function aliasToSlugOf(artifact) {
  return Object.fromEntries((artifact?.aliases ?? []).map(({ alias, slug }) => [alias, slug]));
}

/**
 * Reconciles code-derived module edges against the vault's compiled depends_on
 * edges so the agent reviews exactly the difference. Read-only; a missing or
 * unreadable vault never fails the import scan.
 */
export function reconcileWithVault(result) {
  try {
    const artifact = COMPILED_ONTOLOGY_CACHE.get();
    const nodeSlugs = new Set((artifact.nodes ?? []).map((n) => n.slug).filter(Boolean));
    // Where each node says its implementation lives, to defer judgement on languages
    // the scanner cannot read rather than calling a correct relation absent from code.
    const pathBySlug = Object.create(null);
    for (const node of artifact.nodes ?? []) {
      if (node?.slug && typeof node.path === 'string') pathBySlug[node.slug] = node.path;
    }
    const r = reconcileImportEdges({
      moduleEdges: result.moduleEdges,
      compiledEdges: artifact.edges,
      aliasToSlug: aliasToSlugOf(artifact),
      nodeSlugs,
      pathBySlug,
      scannedExtensions: result.coverage?.supportedExtensions,
    });
    result.reconciliation = r;
    result.reconciliationSummary = summarizeReconciliation(r, result.unresolved.length);
  } catch {
    // No loadable vault (e.g. scanning a foreign repo) — skip reconciliation silently.
    result.reconciliation = null;
  }
}

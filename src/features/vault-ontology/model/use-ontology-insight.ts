'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useDataSourceMode } from '@/entities/vault-session';
import { useSampleSource } from '@/entities/vault-session';
import {
  type KnowledgeGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeProjectInsight,
  stripVaultSlugPrefix,
} from '@/entities/knowledge-graph';
import {
  deriveOntologyFromVault,
  resolveStaticVaultSource,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';
import { isContainmentRelation } from '@/entities/knowledge-graph/lib/ontology-tree';
import { useVaultOntology } from './use-vault-ontology';

// Vault and dogfood nodes have frontmatter as their source of truth and carry no
// time information, so `KnowledgeGraphNode.lastApprovedAt` is filled with a sentinel
// (epoch 0).
const VAULT_SENTINEL_DATE = new Date(0);
const VAULT_SENTINEL_AUTHOR = 'vault-frontmatter';

// The bundled sample vault — the source of truth when mode === 'static', a separate
// path from local mode. The manifest is only ever taken through the resolver:
// importing the JSON directly reopens the accident where the manifest and the content
// come from different vaults (single-entry-point contract,
// tests/contract/static-vault-source.contract.test.ts).
// Both are build-time JSON, so derivation runs once at module load and is reused.
const STATIC_DERIVATION: VaultOntologyDerivation = deriveOntologyFromVault(
  resolveStaticVaultSource('dogfood').manifest,
);
const STOREFRONT_DERIVATION: VaultOntologyDerivation = deriveOntologyFromVault(
  resolveStaticVaultSource('storefront').manifest,
);

export function derivationToInsight(
  d: VaultOntologyDerivation,
  /**
   * Resolves the per-locale display name (owner instruction, 2026-07-24): whichever
   * `display_<locale>` the stub collected matches the screen locale is promoted to
   * `display`. With none, the existing `display` is kept. `title` remains the source
   * of truth for matching, and the display name is *added* to what search covers —
   * which is why the original map travels along too.
   */
  locale?: string,
  /**
   * The segment to strip from the front of a doc slug when building the name handed
   * to an agent (`StaticVaultSource.agentSlugPrefix`). A local vault's folder is its
   * own root, so nothing is passed.
   */
  options?: { agentSlugPrefix?: string },
): KnowledgeProjectInsight {
  const agentSlugPrefix = options?.agentSlugPrefix;
  const nodes: KnowledgeGraphNode[] = d.nodes.map((stub) => ({
    id: stub.id,
    title: stub.title,
    display: (locale && stub.displayLocales?.[locale]) || stub.display,
    // Passed through verbatim so a node is findable by its name in any locale, whatever the screen's language.
    displayLocales: stub.displayLocales,
    kind: stub.kind,
    projectIds: [],
    // A canonical node's sourceSlug is its own doc.slug; a synthetic node (a stub that
    // is only referenced and has no document of its own) carries the doc.slug that
    // first referenced it. Either way jumping to the "evidence document" gives context,
    // so it is exposed as the first evidenceId. Empty array when absent.
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    // `evidenceIds` alone cannot tell those two apart, which is how surfaces drawing
    // "this node's document" ended up opening someone else's — the flag is passed through.
    hasOwnDocument: stub.hasOwnDocument,
    // The name to show an agent — a vault-root-relative slug for a document node, and
    // the vault's own reference string for a derived one. Every MCP/CLI call the screen
    // offers to copy uses this value (`resolveNodeAgentTarget`).
    agentSlug:
      stub.hasOwnDocument && stub.sourceSlug
        ? stripVaultSlugPrefix(stub.sourceSlug, agentSlugPrefix)
        : null,
    ref: stub.ref,
    lastApprovedAt: VAULT_SENTINEL_DATE,
    lastApprovedBy: VAULT_SENTINEL_AUTHOR,
    // Authorship carries **verbatim** whatever derivation read from the frontmatter.
    createdBy: stub.createdBy,
    summary: stub.summary,
  }));
  const edges: KnowledgeGraphEdge[] = d.edges.map((stub) => ({
    id: stub.id,
    from: stub.from,
    to: stub.to,
    type: stub.type,
    label: stub.label,
    projectIds: [],
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    lastApprovedAt: VAULT_SENTINEL_DATE,
    lastApprovedBy: VAULT_SENTINEL_AUTHOR,
  }));

  // Fill `projectIds` even when the vault frontmatter has no `project:` key: BFS the
  // transitive closure of `contains` and attach each project's slug to its descendants.
  // Without it, a single-project vault such as dogfood left the domain/capability/element
  // fact strip on ProjectSelector cards with an empty map, and the strip was hidden.
  const projectNodes = nodes.filter((n) => n.kind === 'project');
  if (projectNodes.length > 0) {
    const containsAdj = new Map<string, string[]>();
    for (const e of edges) {
      const isContains = isContainmentRelation(e.type);
      if (!isContains) continue;
      // `belongs_to` is the reverse of `contains` — normalized consistently to
      // container → contained.
      const [from, to] = e.type === 'contains' ? [e.from, e.to] : [e.to, e.from];
      const arr = containsAdj.get(from);
      if (arr) arr.push(to);
      else containsAdj.set(from, [to]);
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const p of projectNodes) {
      const projectSlug = p.id.replace(/^project:/, '');
      const visited = new Set<string>([p.id]);
      const queue: string[] = [p.id];
      // Head pointer for O(1) dequeue — `Array.shift()` is O(n), which makes this O(n²)
      // on a large vault (same pattern as depth.ts / reachability.ts).
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const children = containsAdj.get(cur);
        if (!children) continue;
        for (const c of children) {
          if (visited.has(c)) continue;
          visited.add(c);
          queue.push(c);
          const cnode = nodeById.get(c);
          if (cnode && !cnode.projectIds.includes(projectSlug)) {
            cnode.projectIds.push(projectSlug);
          }
        }
      }
    }
  }

  return {
    nodes,
    edges,
    sourceConceptCount: d.sourceConceptCount,
    sourceKindCounts: d.sourceKindCounts,
  };
}

// Cached once per locale. Derivation still runs once; only the insight mapping is per locale.
const staticInsightByLocale = new Map<string, { insight: KnowledgeProjectInsight; error: null }>();
function sampleInsight(
  source: 'dogfood' | 'storefront',
  locale: string,
): { insight: KnowledgeProjectInsight; error: null } {
  const key = `${source}:${locale}`;
  let cached = staticInsightByLocale.get(key);
  if (!cached) {
    cached = {
      insight: derivationToInsight(
        source === 'storefront' ? STOREFRONT_DERIVATION : STATIC_DERIVATION,
        locale,
        { agentSlugPrefix: resolveStaticVaultSource(source).agentSlugPrefix },
      ),
      error: null,
    };
    staticInsightByLocale.set(key, cached);
  }
  return cached;
}

/**
 * Mode-aware ontology insight adapter, with two modes:
 *
 * - **local** → converts `useVaultOntology`'s result into the
 *   `KnowledgeProjectInsight` shape. Frontmatter on the user's disk is the source of truth.
 * - **static** → derivation of the build-time bundled sample manifest. It is a JSON
 *   import, so derivation runs once at module load (memoized). `useSampleSource` picks
 *   dogfood (the default) or storefront — in local mode that choice is never read, since
 *   the user's vault always wins.
 */
/**
 * Insight for this repository's own vault (`docs/ontology`) — **the source is pinned.**
 *
 * `useOntologyInsight` returning whatever the user picked (a local vault, the storefront
 * sample) is correct. But the `/download` gateway's stage **claims** in its caption that
 * this is "this repository's docs/ontology · 96 concepts", and for that sentence to be
 * true the graph it draws must be that too. Following the session's sample choice draws
 * the storefront (7 nodes) under a caption saying 96 concepts (measured 2026-07-28).
 *
 * It uses the same cache (`sampleInsight`), so no extra derivation cost.
 */
export function useDogfoodInsight(): KnowledgeProjectInsight {
  const locale = useLocale();
  return useMemo(() => sampleInsight('dogfood', locale).insight, [locale]);
}

export function useOntologyInsight(): {
  insight: KnowledgeProjectInsight | null;
  error: Error | null;
} {
  const mode = useDataSourceMode();
  const vault = useVaultOntology();
  const [sampleSource] = useSampleSource();
  const locale = useLocale();

  return useMemo(() => {
    if (mode === 'static') {
      return sampleInsight(sampleSource === 'storefront' ? 'storefront' : 'dogfood', locale);
    }
    return {
      insight: derivationToInsight(vault, locale),
      error: null,
    };
  }, [mode, vault, sampleSource, locale]);
}

'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useDataSourceMode, useSampleSource } from '@/entities/vault-session';
import {
  type KnowledgeGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeProjectInsight,
  stripVaultSlugPrefix,
  isContainmentRelation,
} from '@/entities/knowledge-graph';
import {
  deriveOntologyFromVault,
  resolveStaticVaultSource,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';
import { useVaultOntology } from './use-vault-ontology';

// Vault nodes carry no time information, so `lastApprovedAt` is the epoch-0 sentinel.
const VAULT_SENTINEL_DATE = new Date(0);
const VAULT_SENTINEL_AUTHOR = 'vault-frontmatter';

// The bundled sample, taken only through the resolver
// (tests/contract/static-vault-source.contract.test.ts); derived once at module load.
const STATIC_DERIVATION: VaultOntologyDerivation = deriveOntologyFromVault(
  resolveStaticVaultSource('dogfood').manifest,
);
const STOREFRONT_DERIVATION: VaultOntologyDerivation = deriveOntologyFromVault(
  resolveStaticVaultSource('storefront').manifest,
);

export function derivationToInsight(
  d: VaultOntologyDerivation,
  /** Promotes the `display_<locale>` matching the screen to `display`; `title` stays the match key. */
  locale?: string,
  /** The slug prefix stripped for agent names; a local vault passes none. */
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
    // The first evidenceId is the node's own doc, or the doc that first referenced a synthetic node.
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    // `evidenceIds` cannot tell those apart, so the own-document flag is passed through.
    hasOwnDocument: stub.hasOwnDocument,
    // The name every copyable MCP/CLI call uses (`resolveNodeAgentTarget`).
    agentSlug:
      stub.hasOwnDocument && stub.sourceSlug
        ? stripVaultSlugPrefix(stub.sourceSlug, agentSlugPrefix)
        : null,
    ref: stub.ref,
    lastApprovedAt: VAULT_SENTINEL_DATE,
    lastApprovedBy: VAULT_SENTINEL_AUTHOR,
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

  // Without `project:` keys, BFS the `contains` closure to attach each project to its descendants.
  // One BFS per project over a contains adjacency map: O(P·(V+E)), plus an O(P) `includes` per visit.
  const projectNodes = nodes.filter((n) => n.kind === 'project');
  if (projectNodes.length > 0) {
    const containsAdj = new Map<string, string[]>();
    for (const e of edges) {
      const isContains = isContainmentRelation(e.type);
      if (!isContains) continue;
      // `belongs_to` is normalised to container → contained.
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
      // on a large vault (same pattern as ontology-tree/reachability.ts).
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

// Cached per source and locale; derivation runs once, only the insight mapping varies.
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

/** This repository's own vault, pinned, because the `/download` caption claims it; same cache. */
export function useDogfoodInsight(): KnowledgeProjectInsight {
  const locale = useLocale();
  return useMemo(() => sampleInsight('dogfood', locale).insight, [locale]);
}

/** Mode-aware insight: local derives from the user's vault; static from the bundled sample, memoized. */
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

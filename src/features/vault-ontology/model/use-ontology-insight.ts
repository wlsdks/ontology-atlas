'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  useArrivingManifest,
  useDataSourceMode,
  useStaticVaultSource,
  useStaticVaultStatus,
} from '@/entities/vault-session';
import {
  type KnowledgeGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeProjectInsight,
  stripVaultSlugPrefix,
  isContainmentRelation,
} from '@/entities/knowledge-graph';
import {
  deriveArrivedOntology,
  deriveOntologyFromVault,
  type StaticVaultSource,
  type VaultManifest,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';
import { useVaultOntology } from './use-vault-ontology';

// Vault nodes carry no time information, so `lastApprovedAt` is the epoch-0 sentinel.
const VAULT_SENTINEL_DATE = new Date(0);
const VAULT_SENTINEL_AUTHOR = 'vault-frontmatter';

export function derivationToInsight(
  d: VaultOntologyDerivation,
  locale?: string,
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

// The bundled sample is taken only through `useStaticVaultSource`
// (tests/contract/vault-data/static-vault-source.contract.test.ts). Derived once per loaded sample
// and locale, then cached on the manifest object, which is stable once the sample has arrived.
const sampleInsightCache = new WeakMap<
  VaultManifest,
  Map<string, { insight: KnowledgeProjectInsight; error: null }>
>();
function sampleInsight(
  sample: StaticVaultSource,
  locale: string,
): { insight: KnowledgeProjectInsight; error: null } {
  let byLocale = sampleInsightCache.get(sample.manifest);
  if (!byLocale) {
    byLocale = new Map();
    sampleInsightCache.set(sample.manifest, byLocale);
  }
  let cached = byLocale.get(locale);
  if (!cached) {
    cached = {
      insight: derivationToInsight(deriveOntologyFromVault(sample.manifest), locale, {
        agentSlugPrefix: sample.agentSlugPrefix,
      }),
      error: null,
    };
    byLocale.set(locale, cached);
  }
  return cached;
}

const localInsightCache = new WeakMap<VaultOntologyDerivation, Map<string, KnowledgeProjectInsight>>();
function localInsight(d: VaultOntologyDerivation, locale: string): KnowledgeProjectInsight {
  let byLocale = localInsightCache.get(d);
  if (!byLocale) {
    byLocale = new Map();
    localInsightCache.set(d, byLocale);
  }
  let insight = byLocale.get(locale);
  if (!insight) {
    insight = derivationToInsight(d, locale);
    byLocale.set(locale, insight);
  }
  return insight;
}

export function useOntologyInsight(options?: { demand?: boolean }): {
  insight: KnowledgeProjectInsight | null;
  error: Error | null;
} {
  const mode = useDataSourceMode();
  const vault = useVaultOntology();
  const sample = useStaticVaultSource(undefined, options);
  const sampleStatus = useStaticVaultStatus(undefined, options);
  const locale = useLocale();

  return useMemo(() => {
    if (mode === 'static') {
      // A sample still on its way is no insight yet, not an empty one.
      if (sampleStatus === 'loading') return { insight: null, error: null };
      return sampleInsight(sample, locale);
    }
    return {
      insight: localInsight(vault, locale),
      error: null,
    };
  }, [mode, vault, sample, sampleStatus, locale]);
}

export function useArrivingOntologyInsight(): KnowledgeProjectInsight | null {
  const partialManifest = useArrivingManifest();
  const locale = useLocale();
  return useMemo(
    () => (partialManifest ? localInsight(deriveArrivedOntology(partialManifest), locale) : null),
    [partialManifest, locale],
  );
}

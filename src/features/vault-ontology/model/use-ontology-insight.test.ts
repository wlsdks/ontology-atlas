import { describe, expect, it } from 'vitest';
import { derivationToInsight } from './use-ontology-insight';
import type { VaultOntologyDerivation } from '@/entities/docs-vault';

describe('derivationToInsight', () => {
  it('promotes frontmatter-derived edge source slugs into relation evidence ids', () => {
    const insight = derivationToInsight({
      nodes: [
        {
          id: 'domain:views',
          title: 'Views',
          kind: 'domain',
          source: 'frontmatter',
          sourceSlug: 'domains/views',
        },
        {
          id: 'capability:topology-map',
          title: 'Topology Map',
          kind: 'capability',
          source: 'frontmatter',
          sourceSlug: 'capabilities/topology-map',
        },
      ],
      edges: [
        {
          id: 'domain:views--contains-->capability:topology-map',
          from: 'domain:views',
          to: 'capability:topology-map',
          type: 'contains',
          source: 'frontmatter',
          sourceSlug: 'capabilities/topology-map',
        },
      ],
      sourceConceptCount: 2,
      sourceKindCounts: { domain: 1, capability: 1 },
      warnings: [],
    } satisfies VaultOntologyDerivation);

    expect(insight.edges).toHaveLength(1);
    expect(insight.edges[0]?.evidenceIds).toEqual([
      'capabilities/topology-map',
    ]);
  });
});

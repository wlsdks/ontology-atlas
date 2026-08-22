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
          display: 'Views',
          kind: 'domain',
          hasOwnDocument: true,
          source: 'frontmatter',
          sourceSlug: 'domains/views',
        },
        {
          id: 'capability:topology-map',
          title: 'Topology Map',
          display: 'Topology Map',
          kind: 'capability',
          hasOwnDocument: true,
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

  // Regression: both kinds of node share the single `evidenceIds[0]` slot, so unless the
  // distinguishing flag follows through to the graph node, the screen opens someone else's document again.
  it('자기 문서 보유 여부를 그래프 노드로 그대로 옮긴다', () => {
    const insight = derivationToInsight({
      nodes: [
        {
          id: 'capability:frontmatter-to-ontology',
          title: 'Frontmatter to Ontology',
          display: 'Frontmatter to Ontology',
          kind: 'capability',
          hasOwnDocument: true,
          source: 'frontmatter',
          sourceSlug: 'capabilities/frontmatter-to-ontology',
        },
        {
          id: 'element:derive-ontology-from-vault',
          title: 'Derive Ontology From Vault',
          display: 'Derive Ontology From Vault',
          kind: 'element',
          hasOwnDocument: false,
          source: 'frontmatter',
          sourceSlug: 'capabilities/frontmatter-to-ontology',
        },
      ],
      edges: [],
      sourceConceptCount: 1,
      sourceKindCounts: { capability: 1 },
      warnings: [],
    } satisfies VaultOntologyDerivation);

    expect(
      insight.nodes.map((n) => [n.id, n.hasOwnDocument, n.evidenceIds[0]]),
    ).toEqual([
      [
        'capability:frontmatter-to-ontology',
        true,
        'capabilities/frontmatter-to-ontology',
      ],
      [
        'element:derive-ontology-from-vault',
        false,
        'capabilities/frontmatter-to-ontology',
      ],
    ]);
  });
});

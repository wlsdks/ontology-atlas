import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault, resolveStaticVaultSource } from '@/entities/docs-vault';
import { buildSampleMapGraph } from './sample-map-graph';

describe('buildSampleMapGraph', () => {
  const graph = buildSampleMapGraph(deriveOntologyFromVault(resolveStaticVaultSource('storefront').manifest), 'en');

  it('draws exactly the concepts and relations the heading counts', () => {
    expect(graph.census.conceptCount).toBeGreaterThan(0);
    expect(graph.nodes).toHaveLength(graph.census.conceptCount);
    expect(graph.edges).toHaveLength(graph.census.relationCount);
  });

  it('gives every drawn concept its panel facts, with neighbours that are drawn too', () => {
    const drawn = new Set(graph.nodes.map((node) => node.id));
    for (const node of graph.nodes) {
      const facts = graph.conceptById.get(node.id);
      expect(facts, node.id).toBeDefined();
      const neighbours = Object.values(facts!.connections).flat();
      expect(neighbours.every((neighbour) => drawn.has(neighbour.id)), node.id).toBe(true);
    }
  });
});

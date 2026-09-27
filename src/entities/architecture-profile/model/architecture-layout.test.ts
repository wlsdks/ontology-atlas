import { describe, expect, it } from 'vitest';

import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { parseArchitectureProfile } from './architecture-profile';
import { buildArchitectureLayout } from './architecture-layout';

const hexagonal = () => buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER));
const fsd = () => buildArchitectureLayout(parseArchitectureProfile(FSD_PROFILE_FRONTMATTER));

/** The layout must agree with the rules, not declaration order. */
describe('architecture layout agrees with the rules', () => {
  it('places a role with no dependencies at the bottom with no outgoing arrows', () => {
    const layout = hexagonal();
    const domain = layout.nodes.find((node) => node.id === 'domain');
    expect(domain?.isSink, 'domain allows nothing').toBe(true);
    expect(domain?.depth, 'the sink is the last row').toBe(layout.rows.length - 1);
    expect(layout.edges.filter((edge) => edge.from === 'domain')).toEqual([]);
  });

  /* `port → domain` comes last in declaration order, so a stack drew it upward. */
  it('points every arrow downward, never sideways or up', () => {
    const layout = hexagonal();
    const rowOf = new Map(layout.nodes.map((node) => [node.id, node.depth]));
    expect(layout.edges.length).toBeGreaterThan(0);
    for (const edge of layout.edges) {
      const from = rowOf.get(edge.from)!;
      const to = rowOf.get(edge.to)!;
      expect(to, `${edge.from} → ${edge.to} must point down`).toBeGreaterThan(from);
    }
  });

  it('reads a hexagonal profile from the outside in', () => {
    const layout = hexagonal();
    const row = (id: string) => layout.nodes.find((node) => node.id === id)!.depth;
    expect(row('adapter')).toBeLessThan(row('application'));
    expect(row('application')).toBeLessThan(row('port'));
    expect(row('port')).toBeLessThan(row('domain'));
  });

  /* Longest path: with the shortest, `adapter` would sit beside what it depends on. */
  it('keeps layers intact when a dependency skips a layer', () => {
    const layout = hexagonal();
    expect(layout.rows.length, 'adapter · application · port · domain').toBe(4);
    const skipping = layout.edges.filter((edge) => edge.skips);
    expect(skipping.length, 'adapter reaches past application').toBeGreaterThan(0);
  });

  /* `lower-only` is one rule, so seven roles would draw 21 arrows; the renderer states it once. */
  it('uses declaration order as layers for lower-only and reports the policy', () => {
    const layout = fsd();
    expect(layout.policy).toBe('lower-only');
    expect(layout.rows.map((row) => row[0])).toEqual([
      'routing',
      'app',
      'views',
      'widgets',
      'features',
      'entities',
      'shared',
    ]);
    expect(layout.nodes.find((node) => node.id === 'shared')?.isSink).toBe(true);
  });

  /* A cycle must return every role rather than hang. */
  it('returns every role without hanging when dependencies cycle', () => {
    const cyclic = parseArchitectureProfile({
      ...HEXAGONAL_PROFILE_FRONTMATTER,
      allow_domain: ['adapter'],
    });
    const layout = buildArchitectureLayout(cyclic);
    expect(layout.nodes.map((node) => node.id).sort()).toEqual(
      ['adapter', 'application', 'domain', 'port'].sort(),
    );
  });
});

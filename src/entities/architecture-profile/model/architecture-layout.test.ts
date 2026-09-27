import { describe, expect, it } from 'vitest';

import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { parseArchitectureProfile } from './architecture-profile';
import { buildArchitectureLayout } from './architecture-layout';

const hexagonal = () => buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER));
const fsd = () => buildArchitectureLayout(parseArchitectureProfile(FSD_PROFILE_FRONTMATTER));

/**
 * ⚠️ These exist because the old drawing **contradicted its own data** (owner, on the installed
 * build). It stacked roles in declaration order with a down-arrow between every consecutive pair,
 * so on the hexagonal profile `domain` — which allows nothing — had an arrow leaving it, and
 * `port → domain` was drawn with domain above port, pointing the wrong way.
 */
describe('architecture layout agrees with the rules', () => {
  it('places a role with no dependencies at the bottom with no outgoing arrows', () => {
    const layout = hexagonal();
    const domain = layout.nodes.find((node) => node.id === 'domain');
    expect(domain?.isSink, 'domain allows nothing').toBe(true);
    expect(domain?.depth, 'the sink is the last row').toBe(layout.rows.length - 1);
    expect(layout.edges.filter((edge) => edge.from === 'domain')).toEqual([]);
  });

  /*
   * ⚠️ The precise defect. `port → domain` exists in the rules; in declaration order port comes
   * last, so a stack drew the arrow upward. Every arrow must now go strictly downward.
   */
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

  /*
   * ⚠️ Depth is the LONGEST path to a sink. With the shortest one, `adapter` — which reaches
   * `domain` directly as well as through `application` — would land one row above domain, beside
   * the roles it depends on, and its arrows would run sideways.
   */
  it('keeps layers intact when a dependency skips a layer', () => {
    const layout = hexagonal();
    expect(layout.rows.length, 'adapter · application · port · domain').toBe(4);
    const skipping = layout.edges.filter((edge) => edge.skips);
    expect(skipping.length, 'adapter reaches past application').toBeGreaterThan(0);
  });

  /*
   * ⚠️ `lower-only` is one sentence, not a graph: every role may reach every role beneath it.
   * Seven roles would draw 21 arrows, which is noise rather than information — the renderer says
   * the rule once instead. The layout still reports the policy so it can make that choice.
   */
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

  /*
   * ⚠️ `explicit` lets somebody write a cycle. A screen that hangs on bad input is worse than one
   * that draws it, so this only asks that the function returns and keeps every role.
   */
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

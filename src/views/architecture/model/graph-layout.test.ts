import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureGraph } from './graph-layout';

const fsd = () =>
  buildArchitectureLayout(parseArchitectureProfile(FSD_PROFILE_FRONTMATTER as never));
const hex = () =>
  buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER as never));

describe('buildArchitectureGraph', () => {
  it('puts one column per rank, left to right', () => {
    const graph = buildArchitectureGraph(fsd(), []);
    expect(graph.columns).toBe(7);
    const columnOf = new Map(graph.boxes.map((box) => [box.id, box.column]));
    expect(columnOf.get('routing')).toBe(0);
    expect(columnOf.get('shared')).toBe(6);
  });

  it('draws no permitted edges under lower-only, because the columns already say it', () => {
    /*
     * ⚠️ This is the measurement the whole shape rests on. This profile has 21 permitted edges
     * among 7 roles, and every one of them means "everything to my right". Drawing them restates
     * the column order twenty-one times and adds nothing a reader did not already have.
     */
    const graph = buildArchitectureGraph(fsd(), []);
    expect(graph.edges).toEqual([]);
    expect(graph.edgeSource).toBe('none');
  });

  it('draws every permitted edge under explicit, because the order cannot say it', () => {
    const graph = buildArchitectureGraph(hex(), []);
    expect(graph.edges).toHaveLength(6);
    expect(graph.edges.every((edge) => edge.kind === 'permitted')).toBe(true);
    expect(graph.edgeSource).toBe('permitted');
    /* The fan is the point: adapter may reach three roles directly, not one and then onward. */
    const targets = graph.edges
      .filter((edge) => edge.from === 'adapter')
      .map((edge) => edge.to)
      .sort();
    expect(targets).toEqual(['application', 'domain', 'port']);
  });

  it('draws measured traffic under lower-only, where nothing else could carry it', () => {
    const graph = buildArchitectureGraph(fsd(), [
      { fromRole: 'widgets', toRole: 'shared', count: 314 },
      { fromRole: 'routing', toRole: 'widgets', count: 1 },
    ]);
    expect(graph.edgeSource).toBe('traffic');
    expect(graph.edges.every((edge) => edge.kind === 'traffic')).toBe(true);
    expect(graph.edges.find((e) => e.from === 'widgets' && e.to === 'shared')?.weight).toBe(1);
    expect(
      graph.edges.find((e) => e.from === 'routing' && e.to === 'widgets')?.weight,
    ).toBeLessThan(0.01);
  });

  it('carries both kinds when an explicit profile also has a measurement', () => {
    const graph = buildArchitectureGraph(hex(), [
      { fromRole: 'adapter', toRole: 'domain', count: 12 },
    ]);
    expect(graph.edgeSource).toBe('both');
    expect(graph.edges.filter((edge) => edge.kind === 'permitted')).toHaveLength(6);
    expect(graph.edges.filter((edge) => edge.kind === 'traffic')).toHaveLength(1);
  });

  it('keeps same-role traffic out of the edges, because it has no two ends', () => {
    const graph = buildArchitectureGraph(fsd(), [
      { fromRole: 'views', toRole: 'views', count: 223 },
    ]);
    expect(graph.edges).toEqual([]);
    expect(graph.edgeSource).toBe('none');
  });

  it('drops traffic naming a role the profile no longer has', () => {
    /* A record is a receipt from a past moment; the profile may have moved on since. */
    const graph = buildArchitectureGraph(fsd(), [{ fromRole: 'views', toRole: 'gone', count: 9 }]);
    expect(graph.edges).toEqual([]);
  });

  it('counts columns crossed, so a long reach is drawn as a long reach', () => {
    const graph = buildArchitectureGraph(hex(), []);
    const byPair = new Map(graph.edges.map((edge) => [`${edge.from}>${edge.to}`, edge]));
    expect(byPair.get('adapter>application')?.columnSpan).toBe(1);
    expect(byPair.get('adapter>domain')?.columnSpan).toBe(3);
  });

  it('gives every box a slot, and never two boxes the same slot in one column', () => {
    const graph = buildArchitectureGraph(fsd(), []);
    const perColumn = new Map<number, number[]>();
    for (const box of graph.boxes) {
      perColumn.set(box.column, [...(perColumn.get(box.column) ?? []), box.slot]);
    }
    for (const [, slots] of perColumn) {
      expect(new Set(slots).size).toBe(slots.length);
      expect(Math.min(...slots)).toBe(0);
    }
  });

  it('is deterministic', () => {
    expect(buildArchitectureGraph(hex(), [])).toEqual(buildArchitectureGraph(hex(), []));
    const traffic = [{ fromRole: 'views', toRole: 'shared', count: 260 }];
    expect(buildArchitectureGraph(fsd(), traffic)).toEqual(
      buildArchitectureGraph(fsd(), [...traffic]),
    );
  });
});

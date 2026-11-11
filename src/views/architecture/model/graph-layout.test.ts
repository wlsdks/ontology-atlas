import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import {
  FAN_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureGraph } from './graph-layout';

const fsd = () =>
  buildArchitectureLayout(parseArchitectureProfile(FSD_PROFILE_FRONTMATTER as never));
const hex = () =>
  buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER as never));

describe('buildArchitectureGraph', () => {
  it('stands roles the rules cannot order in declaration order, each in its own column', () => {
    const graph = buildArchitectureGraph({
      policy: 'explicit', nodes: [], rows: [['left', 'right'], ['single', 'weighted']],
      edges: [
        { from: 'left', to: 'single', skips: false },
        { from: 'right', to: 'single', skips: false },
        { from: 'left', to: 'weighted', skips: false },
        { from: 'right', to: 'weighted', skips: false },
      ],
    }, [{ fromRole: 'left', toRole: 'weighted', count: 1 }]);

    expect(graph.boxes.map((box) => [box.id, box.column, box.rank])).toEqual([
      ['left', 0, 0],
      ['right', 1, 0],
      ['single', 2, 1],
      ['weighted', 3, 1],
    ]);
  });

  it('puts a chain one column per rank, left to right', () => {
    const graph = buildArchitectureGraph(fsd(), []);
    expect(graph.columns).toBe(7);
    const columnOf = new Map(graph.boxes.map((box) => [box.id, box.column]));
    expect(columnOf.get('routing')).toBe(0);
    expect(columnOf.get('shared')).toBe(6);
  });

  it('draws the spine and nothing else under lower-only, so seven boxes are one chain', () => {
    /* Drawing all 21 permitted edges restates the column order; the six adjacent ones make it a chain. */
    const graph = buildArchitectureGraph(fsd(), []);
    expect(graph.edgeSource).toBe('permitted');
    expect(graph.edges.every((edge) => edge.kind === 'permitted')).toBe(true);
    expect(graph.edges.every((edge) => edge.columnSpan === 1)).toBe(true);
    expect(graph.edges.map((edge) => `${edge.from}>${edge.to}`).sort()).toEqual([
      'app>views',
      'entities>shared',
      'features>entities',
      'routing>app',
      'views>widgets',
      'widgets>features',
    ]);
    const touched = new Set(graph.edges.flatMap((edge) => [edge.from, edge.to]));
    expect(graph.boxes.filter((box) => !touched.has(box.id))).toEqual([]);
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
    expect(graph.edgeSource).toBe('both');
    const traffic = graph.edges.filter((edge) => edge.kind === 'traffic');
    expect(traffic).toHaveLength(2);
    expect(traffic.find((e) => e.from === 'widgets' && e.to === 'shared')?.weight).toBe(1);
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
    expect(graph.edges.filter((edge) => edge.kind === 'traffic')).toEqual([]);
    expect(graph.edgeSource).toBe('permitted');
  });

  it('drops traffic naming a role the profile no longer has', () => {
    /* A record is a receipt from a past moment; the profile may have moved on since. */
    const graph = buildArchitectureGraph(fsd(), [{ fromRole: 'views', toRole: 'gone', count: 9 }]);
    expect(graph.edges.filter((edge) => edge.kind === 'traffic')).toEqual([]);
  });

  it('counts columns crossed, so a long reach is drawn as a long reach', () => {
    const graph = buildArchitectureGraph(hex(), []);
    const byPair = new Map(graph.edges.map((edge) => [`${edge.from}>${edge.to}`, edge]));
    expect(byPair.get('adapter>application')?.columnSpan).toBe(1);
    expect(byPair.get('adapter>domain')?.columnSpan).toBe(3);
  });

  it('marks a stroke that runs against the chain as climbing, whichever kind it is', () => {
    const graph = buildArchitectureGraph(fsd(), [
      { fromRole: 'shared', toRole: 'views', count: 3 },
      { fromRole: 'views', toRole: 'shared', count: 9 },
    ]);
    const byPair = new Map(graph.edges.map((edge) => [`${edge.kind}:${edge.from}>${edge.to}`, edge]));
    expect(byPair.get('traffic:shared>views')).toMatchObject({ climbs: true, columnSpan: 4 });
    expect(byPair.get('traffic:views>shared')).toMatchObject({ climbs: false, columnSpan: 4 });
    expect(graph.edges.filter((edge) => edge.kind === 'permitted').every((edge) => !edge.climbs)).toBe(true);
  });

  it("gives the chain's two ends the standard's terminator shape, and the rest a process", () => {
    const shapeOf = new Map(buildArchitectureGraph(fsd(), []).boxes.map((b) => [b.id, b.shape]));
    expect(shapeOf.get('routing')).toBe('terminator');
    expect(shapeOf.get('shared')).toBe('terminator');
    expect(shapeOf.get('views')).toBe('process');
    expect(shapeOf.get('widgets')).toBe('process');
  });

  it('reads the shape from the declared graph, not from the strokes it happens to draw', () => {
    /*
     * A measured violation back up the chain gives `shared` an outgoing stroke; shape from the
     * drawn strokes would stop the sink looking like a sink.
     */
    const drawn = buildArchitectureGraph(fsd(), [{ fromRole: 'shared', toRole: 'routing', count: 3 }]);
    expect(drawn.edges.filter((edge) => edge.kind === 'permitted')).toHaveLength(6);
    expect(drawn.boxes.find((box) => box.id === 'shared')?.shape).toBe('terminator');
    expect(drawn.boxes.filter((box) => box.shape === 'process')).toHaveLength(5);
  });

  it('is deterministic', () => {
    expect(buildArchitectureGraph(hex(), [])).toEqual(buildArchitectureGraph(hex(), []));
    const traffic = [{ fromRole: 'views', toRole: 'shared', count: 260 }];
    expect(buildArchitectureGraph(fsd(), traffic)).toEqual(
      buildArchitectureGraph(fsd(), [...traffic]),
    );
  });
});

describe('a fan is laid as one chain', () => {
  const fan = () =>
    buildArchitectureGraph(
      buildArchitectureLayout(parseArchitectureProfile(FAN_PROFILE_FRONTMATTER as never)),
      [{ fromRole: 'catalog', toRole: 'billing', count: 2 }],
    );

  it('gives every role its own column while the siblings keep one rank', () => {
    const graph = fan();
    expect(graph.columns).toBe(graph.boxes.length);
    expect(new Set(graph.boxes.map((box) => box.column)).size).toBe(graph.boxes.length);
    expect(graph.boxes.map((box) => [box.id, box.rank])).toEqual([
      ['shell', 0],
      ['billing', 1],
      ['catalog', 1],
      ['shipping', 1],
      ['core', 2],
    ]);
  });

  it('measures a stroke by the faces it passes, so a sibling crossing is adjacent and can climb', () => {
    const byPair = new Map(fan().edges.map((edge) => [`${edge.kind}:${edge.from}>${edge.to}`, edge]));
    expect(byPair.get('permitted:shell>shipping')).toMatchObject({ columnSpan: 3, climbs: false });
    expect(byPair.get('permitted:billing>core')).toMatchObject({ columnSpan: 3, climbs: false });
    expect(byPair.get('traffic:catalog>billing')).toMatchObject({ columnSpan: 1, climbs: true });
  });
});

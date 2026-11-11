import { describe, expect, it } from 'vitest';

import { skipLanes } from './geometry';

const edge = (kind: 'permitted' | 'traffic', from: string, to: string, columnSpan: number) => ({
  kind,
  from,
  to,
  columnSpan,
});

describe('skipLanes', () => {
  const edges = [
    edge('traffic', 'a', 'c', 2),
    edge('permitted', 'a', 'c', 2),
    edge('traffic', 'b', 'd', 2),
    edge('traffic', 'a', 'd', 3),
    edge('traffic', 'a', 'b', 1),
  ];

  it('nests same-span skips of one track and starts each track and span from the face', () => {
    const lanes = skipLanes(edges, true, () => true);
    expect(Object.fromEntries(lanes)).toEqual({
      'traffic:a>c': 0,
      'permitted:a>c': 0,
      'traffic:b>d': 1,
      'traffic:a>d': 0,
    });
  });

  it('counts both tracks together where they share one side', () => {
    const lanes = skipLanes(edges, false, () => true);
    expect([lanes.get('traffic:a>c'), lanes.get('permitted:a>c'), lanes.get('traffic:b>d')]).toEqual([0, 1, 2]);
  });

  it('seats a skip drawn at rest inside one that arrives with a selection', () => {
    const lanes = skipLanes(edges, true, (candidate) => candidate.from === 'b');
    expect([lanes.get('traffic:b>d'), lanes.get('traffic:a>c')]).toEqual([0, 1]);
  });
});

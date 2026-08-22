import { describe, expect, it } from 'vitest';

import { isPathLensEdge, isPathLensNode } from './path-lens';

describe('topology path lens membership', () => {
  const nodes = new Set(['a', 'b', 'c']);
  const edges = new Set(['edge-a-b', 'edge-b-c']);

  it('keeps only the exact shortest-path nodes and authored edges', () => {
    expect(isPathLensNode('path', 'b', nodes)).toBe(true);
    expect(isPathLensNode('path', 'other', nodes)).toBe(false);
    expect(isPathLensEdge('path', 'edge-a-b', edges)).toBe(true);
    // a chord whose endpoints are both on the route is still not part of the route.
    expect(isPathLensEdge('path', 'edge-a-c', edges)).toBe(false);
  });

  it('does not reinterpret the existing recent-change spotlight as a path', () => {
    expect(isPathLensNode('recent', 'b', nodes)).toBe(false);
    expect(isPathLensEdge('recent', 'edge-a-b', edges)).toBe(false);
  });

  it('fails closed when a path set is absent', () => {
    expect(isPathLensNode('path', 'b', null)).toBe(false);
    expect(isPathLensEdge('path', 'edge-a-b', null)).toBe(false);
  });
});

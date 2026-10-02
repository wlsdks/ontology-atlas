import { describe, expect, it } from 'vitest';
import { type ConeInputNode, layoutCone } from './cone-layout';

const NODES: ConeInputNode[] = [
  { id: 'atlas', kind: 'project', x: 0, y: 0, parentId: null },
  { id: 'graph', kind: 'domain', x: 0, y: 0, parentId: 'atlas' },
  { id: 'vault', kind: 'domain', x: 0, y: 0, parentId: 'atlas' },
  { id: 'map-view', kind: 'capability', x: 0, y: 0, parentId: 'graph' },
  { id: 'path-find', kind: 'capability', x: 0, y: 0, parentId: 'graph' },
  { id: 'folder-open', kind: 'capability', x: 0, y: 0, parentId: 'vault' },
  { id: 'renderer', kind: 'element', x: 0, y: 0, parentId: 'map-view' },
  { id: 'picker', kind: 'element', x: 0, y: 0, parentId: 'folder-open' },
];

const GOLDEN: [string, number, number, number][] = [
  ['atlas', 0, 118.4, 0],
  ['graph', 144.2893310029099, 44.800000000000004, 32.93309822553453],
  ['vault', -144.2893310029099, 44.800000000000004, -32.933098225534515],
  ['map-view', 154.03861012472814, -38.400000000000006, 35.15830756509767],
  ['path-find', 134.54005188109167, -38.400000000000006, 30.707888885971386],
  ['folder-open', -144.2893310029099, -38.400000000000006, -32.933098225534515],
  ['picker', -144.2893310029099, -120, -32.933098225534515],
  ['renderer', 154.03861012472814, -120, 35.15830756509767],
];

describe('layoutCone', () => {
  it('places an eight-node tree where the ownership cone placed it', () => {
    const { coords } = layoutCone(NODES);
    expect(coords.size).toBe(GOLDEN.length);
    for (const [id, px, py, pz] of GOLDEN) {
      const c = coords.get(id);
      expect(c, id).toBeDefined();
      expect(Math.abs(c!.px - px)).toBeLessThan(1e-9);
      expect(Math.abs(c!.py - py)).toBeLessThan(1e-9);
      expect(Math.abs(c!.pz - pz)).toBeLessThan(1e-9);
    }
  });
});

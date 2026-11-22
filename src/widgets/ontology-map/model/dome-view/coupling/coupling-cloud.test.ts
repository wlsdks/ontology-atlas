import { describe, expect, it } from 'vitest';

import { clusterRadius, clusterVolumeAnchors } from './cluster-volume';
import { buildDomeModel } from '../model-build';
import { DOME_PITCH_DEFAULT, DOME_YAW_DEFAULT } from '../camera/orbit';
import type { DomeInputNode } from '../dome-shapes';

const EPS = 1e-6;

/** A project, `domains` domains (the last holds only itself), capabilities, elements and a few loose capabilities. */
function vault(size: number, domains: number) {
  const nodes: DomeInputNode[] = [{ id: 'p', kind: 'project', x: 0, y: 0, parentId: null }];
  for (let d = 0; d < domains; d += 1) nodes.push({ id: `d${d}`, kind: 'domain', x: d, y: 0, parentId: 'p' });
  const capabilities = Math.max(domains, Math.round(size * 0.2));
  const homes = domains - 1;
  for (let c = 0; c < capabilities; c += 1) {
    nodes.push({ id: `c${c}`, kind: 'capability', x: c, y: 1, parentId: c < 3 ? 'p' : `d${c % homes}` });
  }
  for (let e = 0; nodes.length < size; e += 1) {
    nodes.push({ id: `e${e}`, kind: 'element', x: e, y: 2, parentId: `c${3 + ((e * 7919) % (capabilities - 3))}` });
  }
  const edges = nodes.flatMap((node, i) => [
    ...(node.parentId === null ? [] : [{ sourceId: node.parentId, targetId: node.id }]),
    ...(node.kind === 'element' && i % 4 === 0 ? [{ sourceId: node.id, targetId: `c${(i * 31) % capabilities}` }] : []),
  ]);
  return { nodes, edges };
}

function domainOf(nodes: readonly DomeInputNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (id: string): string | undefined => {
    let cursor = byId.get(id);
    while (cursor && cursor.kind !== 'domain') cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    return cursor?.id;
  };
}

describe('the Neural coupling cloud', () => {
  it.each([2, 4, 11, 20])('keeps %i clusters in their reach, apart, and clear of the loose group', (domains) => {
    const { nodes, edges } = vault(domains * 18, domains);
    const model = buildDomeModel(nodes, { arrangement: 'coupling', edges });
    const clusterOf = domainOf(nodes);
    const domainIds = nodes.filter((node) => node.kind === 'domain').map((node) => node.id).sort();
    const members = new Map(domainIds.map((id) => [id, 0]));
    let loose = 0;
    for (const node of nodes) {
      const d = clusterOf(node.id);
      if (d === undefined) loose += 1; else members.set(d, members.get(d)! + 1);
    }
    expect(members.get(`d${domains - 1}`)).toBe(1);
    const radii = domainIds.map((id) => clusterRadius(members.get(id)!));
    const { anchors } = clusterVolumeAnchors(radii, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT, clusterRadius(loose));
    const heart = (id: string) => model.coords.get(id)!;
    const first = heart(domainIds[0]);
    const norm = Math.hypot(first.px, first.py, first.pz) / Math.hypot(anchors[0].x, anchors[0].y, anchors[0].z);
    const reach = (k: number) => radii[k] * norm;

    for (const node of nodes) {
      const d = clusterOf(node.id);
      if (d === undefined) continue;
      const c = model.coords.get(node.id)!;
      const h = heart(d);
      expect(Math.hypot(c.px - h.px, c.py - h.py, c.pz - h.pz), `${node.id} in ${d}`).toBeLessThanOrEqual(reach(domainIds.indexOf(d)) + EPS);
    }
    for (let a = 0; a < domainIds.length; a += 1) {
      for (let b = a + 1; b < domainIds.length; b += 1) {
        const ha = heart(domainIds[a]);
        const hb = heart(domainIds[b]);
        expect(Math.hypot(ha.px - hb.px, ha.py - hb.py, ha.pz - hb.pz), `${domainIds[a]} and ${domainIds[b]}`).toBeGreaterThan(reach(a) + reach(b));
      }
    }
    for (const node of nodes) {
      if (clusterOf(node.id) !== undefined) continue;
      const c = model.coords.get(node.id)!;
      domainIds.forEach((id, k) => {
        const h = heart(id);
        expect(Math.hypot(c.px - h.px, c.py - h.py, c.pz - h.pz), `${node.id} clear of ${id}`).toBeGreaterThan(reach(k));
      });
    }
  });
});

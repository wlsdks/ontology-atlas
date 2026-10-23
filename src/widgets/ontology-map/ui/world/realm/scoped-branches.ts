import { SELECTION_NUDGE_MARGIN_PX } from "../../../model/camera/flat-selection-camera";
import { readContainmentTree, rollDomainDependencies, rollDirectedDomainFlows, rollRelatesCapabilityPairs, rollRelatesDomainPairs } from '../../../model/containment-tree';
import { buildDialModel } from '../../../dial/dial-model';
import { layoutDial } from '../../../dial/layout';
import { circularDomainOrder } from '../../../dial/order';
import { branchPreviewRows } from '../../../dial/branches/layout';
import { dialOverviewPad } from '../../../dial/fit';
import type { DialWorld, DialWorldInput, Point } from '../../../dial/types';
import type { TopologyWorld } from '../topology-world';

export function scopedBranches(world: TopologyWorld, memberIds: ReadonlySet<string>, input: DialWorldInput): DialWorld | null {
  const nodes = world.nodes.filter((n) => memberIds.has(n.id));
  if (!nodes.some((n) => n.kind === 'domain')) return null;
  const edges = world.edges.filter((e) => memberIds.has(e.sourceId) && memberIds.has(e.targetId))
    .map((e) => ({ source: e.sourceId, target: e.targetId, kind: e.kind, relationType: e.relationType }));
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  const model = buildDialModel({ tree, dependencies,
    flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)),
    elementIds: nodes.filter((n) => n.kind === 'element').map((n) => n.id),
    relates: rollRelatesCapabilityPairs(tree, edges),
  });
  const scene = layoutDial(model, circularDomainOrder(model, null).order, input.tokens, null);
  if (model.projectId === null) {
    const shown = scene.clusters.flatMap(c => [c.chip, ...c.items.slice(0, scene.branchPreviewRows ?? branchPreviewRows(scene.clusters.length))]);
    scene.extent = { ...scene.extent, minY: Math.min(...shown.map(p => p.y)) - input.tokens.pitch };
  }
  const pad = dialOverviewPad(scene, model, input.labels, input.measureText, input.tokens);
  return { model, scene, overviewPadPx: { ...pad, left: pad.left + SELECTION_NUDGE_MARGIN_PX, right: pad.right + SELECTION_NUDGE_MARGIN_PX } };
}

export function scopedTreePositions(rootId: string, memberIds: ReadonlySet<string>, depthById: ReadonlyMap<string, number>, pitch: number): Map<string, Point> {
  const columns = new Map<number, string[]>();
  for (const id of memberIds) {
    if (id === rootId) continue;
    const depth = depthById.get(id) ?? 1;
    const column = columns.get(depth) ?? [];
    column.push(id); columns.set(depth, column);
  }
  const positions = new Map<string, Point>([[rootId, { x: 0, y: 0 }]]);
  for (const [depth, ids] of columns) {
    ids.sort();
    ids.forEach((id, row) => positions.set(id, { x: depth * pitch * 10, y: (row - (ids.length - 1) / 2) * pitch * 2 }));
  }
  return positions;
}

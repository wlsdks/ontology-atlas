import type { DialModel, DialScene, Point } from "../types";

const MAX_DOMAINS = 6;
const MAX_ROWS = 24;
const MAX_TOTAL_ROWS = 48;
const COLUMN_PITCH = 20;
const MEMBER_REACH = 5.5;
const GROUP_GAP = 4;
export const BRANCH_PREVIEW_ROWS = 6;

// O(concepts + domains log domains); dense vaults retain the packed disclosure.
export function branchLayout(model: DialModel, packed: DialScene, pitch: number): DialScene {
  const rowsReserved = model.domains.map((d) => d.capabilityIds.length + 1);
  if (packed.clusters.length === 0 || packed.clusters.length > MAX_DOMAINS || rowsReserved.some((n) => n > MAX_ROWS) || rowsReserved.reduce((sum, n) => sum + n, 0) > MAX_TOTAL_ROWS) return packed;
  const order = new Map(packed.order.map((id, i) => [id, i]));
  const ranked = [...packed.clusters].sort((a, b) => (model.dependents.get(b.domainId) ?? 0) - (model.dependents.get(a.domainId) ?? 0) || order.get(a.domainId)! - order.get(b.domainId)!);
  const split = Math.ceil(ranked.length / 2);
  const columns = [ranked.slice(0, split), ranked.slice(split)];
  const rowsOf = (id: string) => Math.max(3, Math.min(BRANCH_PREVIEW_ROWS, model.domainById.get(id)!.capabilityIds.length) + 1);
  const heights = columns.map((column) => Math.max(0, column.reduce((h, c) => h + (rowsOf(c.domainId) + GROUP_GAP) * pitch, 0) - GROUP_GAP * pitch));
  const height = Math.max(...heights, pitch * 8);
  const positions = new Map<string, Point>();
  const clusters = columns.flatMap((column, columnIndex) => {
    const side: -1 | 1 = ranked.length === 1 ? 1 : columnIndex === 0 ? -1 : 1;
    let top = -height / 2 + (columnIndex === 0 ? 0 : GROUP_GAP * pitch / 2);
    return column.map((c, index) => {
      const rows = rowsOf(c.domainId);
      const inset = columnIndex === 1 && index % 2 === 1 ? COLUMN_PITCH * pitch / 3 : 0;
      const chip = { x: ranked.length === 1 ? -MEMBER_REACH * pitch / 2 : side * COLUMN_PITCH * pitch / 2 - inset, y: top + rows * pitch / 2 };
      top += (rows + GROUP_GAP) * pitch;
      positions.set(c.domainId, chip);
      const items = c.items.map((it, i) => {
        const column = Math.floor(i / BRANCH_PREVIEW_ROWS);
        const row = i % BRANCH_PREVIEW_ROWS;
        const p = { x: chip.x + side * MEMBER_REACH * pitch * (1 + column), y: chip.y + (row - (rows - 1) / 2) * pitch };
        if (!it.direct) positions.set(it.id, p);
        for (const id of it.elementIds) {
          const old = packed.positions.get(id)!;
          positions.set(id, { x: p.x + old.x - it.x, y: p.y + old.y - it.y });
        }
        return { ...it, ...p };
      });
      return { ...c, chip, branchSide: side, footprint: Math.hypot(MEMBER_REACH * pitch * Math.ceil((model.domainById.get(c.domainId)!.capabilityIds.length + 1) / BRANCH_PREVIEW_ROWS), rows * pitch / 2), items };
    });
  });
  const previewXs = clusters.flatMap((c) => [c.chip.x, ...c.items.slice(0, BRANCH_PREVIEW_ROWS).map((it) => it.x)]);
  const minX = Math.min(...previewXs);
  const maxX = Math.max(...previewXs);
  const minY = -height / 2 - GROUP_GAP * pitch / 2;
  const maxY = Math.max(height / 2, ...[...positions.values()].map((p) => p.y)) + pitch;
  if (model.projectId) positions.set(model.projectId, { x: minX, y: minY });
  const orphanCentre = { x: 0, y: maxY + packed.orphans.radius };
  for (const id of packed.orphans.ids) {
    const p = packed.positions.get(id)!;
    positions.set(id, { x: orphanCentre.x + p.x - packed.orphans.centre.x, y: orphanCentre.y + p.y - packed.orphans.centre.y });
  }
  return {
    ...packed, branches: true, rings: [], clusters, positions,
    clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])),
    itemById: new Map(clusters.flatMap((c) => c.items.map((it) => [it.id, it] as const))),
    orphans: { ...packed.orphans, centre: orphanCentre },
    extent: { minX, maxX, minY: minY - pitch, maxY: packed.orphans.ids.length ? orphanCentre.y + packed.orphans.radius : maxY },
  };
}

import type { DialModel, DialScene, Point } from "../types";

const MAX_DOMAINS = 6;
const MAX_ROWS = 24;
const MAX_TOTAL_ROWS = 48;
const COLUMN_PITCH = 20;
const MEMBER_REACH = 8;
const GROUP_GAP = 3;
export const BRANCH_ROW_PITCH = 2;
export const branchPreviewRows = (domains: number): number => domains > 4 ? 4 : 6;

// O(concepts + domains log domains); dense vaults retain the packed disclosure.
export function branchLayout(model: DialModel, packed: DialScene, pitch: number): DialScene {
  const rowsReserved = model.domains.map((d) => d.capabilityIds.length + 1);
  if (packed.clusters.length === 0 || packed.clusters.length > MAX_DOMAINS || rowsReserved.some((n) => n > MAX_ROWS) || rowsReserved.reduce((sum, n) => sum + n, 0) > MAX_TOTAL_ROWS) return packed;
  const order = new Map(packed.order.map((id, i) => [id, i]));
  const ranked = [...packed.clusters].sort((a, b) => (model.dependents.get(b.domainId) ?? 0) - (model.dependents.get(a.domainId) ?? 0) || order.get(a.domainId)! - order.get(b.domainId)!);
  const split = Math.ceil(ranked.length / 2);
  const columns = [ranked.slice(0, split), ranked.slice(split)];
  const previewRows = branchPreviewRows(ranked.length);
  const rowPitch = pitch * BRANCH_ROW_PITCH;
  const rowsOf = (id: string) => Math.max(3, Math.min(previewRows, model.domainById.get(id)!.capabilityIds.length) + 1);
  const heights = columns.map((column) => Math.max(0, column.reduce((h, c) => h + rowsOf(c.domainId) * rowPitch + GROUP_GAP * pitch, 0) - GROUP_GAP * pitch));
  const height = Math.max(...heights, pitch * 8);
  const positions = new Map<string, Point>();
  const placedElements = new Set<string>();
  const elementRows: { ids: string[]; start: Point; side: -1 | 1 }[] = [];
  const clusters = columns.flatMap((column, columnIndex) => {
    const side: -1 | 1 = ranked.length === 1 ? 1 : columnIndex === 0 ? -1 : 1;
    let top = -height / 2 + (columnIndex === 0 ? 0 : GROUP_GAP * pitch / 2);
    return column.map((c, index) => {
      const rows = rowsOf(c.domainId);
      const inset = columnIndex === 1 && index % 2 === 1 ? COLUMN_PITCH * pitch / 3 : 0;
      const chip = { x: ranked.length === 1 ? -MEMBER_REACH * pitch / 2 : side * COLUMN_PITCH * pitch / 2 - inset, y: top + rows * rowPitch / 2 };
      top += rows * rowPitch + GROUP_GAP * pitch;
      positions.set(c.domainId, chip);
      const elementStep = pitch;
      const elementStart = MEMBER_REACH * pitch;
      const columnStep = MEMBER_REACH * pitch;
      const items = c.items.map((it, i) => {
        const column = Math.floor(i / previewRows);
        const row = i % previewRows;
        const p = { x: chip.x + side * (MEMBER_REACH * pitch + column * columnStep), y: chip.y + (row - (rows - 1) / 2) * rowPitch };
        if (!it.direct) positions.set(it.id, p);
        elementRows.push({ ids: it.elementIds, start: { x: p.x + side * elementStart, y: p.y }, side });
        return { ...it, ...p, elementPitch: elementStep };
      });
      return { ...c, chip, branchSide: side, footprint: Math.hypot(MEMBER_REACH * pitch * Math.ceil((model.domainById.get(c.domainId)!.capabilityIds.length + 1) / previewRows), rows * rowPitch / 2), items };
    });
  });
  const cells = new Map<string, Point[]>();
  const cell = (p: Point) => [Math.floor(p.x / pitch), Math.floor(p.y / pitch)];
  const reserve = (p: Point) => { const key = cell(p).join(":"); const bucket = cells.get(key) ?? []; bucket.push(p); cells.set(key, bucket); };
  for (const p of positions.values()) reserve(p);
  const blocked = (p: Point) => {
    const [x, y] = cell(p) as [number, number];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (cells.get(`${x + dx}:${y + dy}`)?.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < pitch * 0.85)) return true;
    }
    return false;
  };
  for (const row of elementRows) {
    let x = row.start.x;
    for (const id of row.ids) {
      if (placedElements.has(id)) continue;
      const p = { x, y: row.start.y };
      while (blocked(p)) p.x += row.side * pitch;
      placedElements.add(id);
      positions.set(id, p);
      reserve(p);
      x = p.x + row.side * pitch;
    }
  }
  const previewXs = clusters.flatMap((c) => [c.chip.x, ...c.items.slice(0, previewRows).map((it) => it.x)]);
  const minX = Math.min(...previewXs);
  const maxX = Math.max(...previewXs);
  const previewYs = clusters.flatMap((c) => [c.chip.y, ...c.items.slice(0, previewRows).map((it) => it.y)]);
  const minY = Math.min(...previewYs) - rowPitch;
  const maxY = Math.max(...clusters.map((c) => {
    const shown = c.items.slice(0, previewRows);
    return (shown.at(-1)?.y ?? c.chip.y) + (model.domainById.get(c.domainId)!.capabilityIds.length > previewRows ? rowPitch : 0);
  })) + pitch / 2;
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
    extent: { minX, maxX, minY: minY - pitch / 2, maxY: packed.orphans.ids.length ? orphanCentre.y + packed.orphans.radius : maxY },
  };
}

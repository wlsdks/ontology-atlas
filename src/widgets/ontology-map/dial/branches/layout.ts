import type { DialModel, DialScene, Point } from "../types";

const COLUMN_PITCH = 20;
const MEMBER_REACH = 8;
const GROUP_GAP = 3;
const PAIR_COLUMN_PITCH = 72;
const PAIR_ROW_GAP = 14;
const GRID_ASPECT = 0.8;
export const BRANCH_ROW_PITCH = 2;
export const branchPreviewRows = (domains: number): number => domains > 12 ? 1 : domains > 6 ? 2 : domains > 4 ? 4 : 6;

export function branchLayout(model: DialModel, packed: DialScene, pitch: number, remembered?: readonly string[]): DialScene {
  if (packed.clusters.length === 0) return packed;
  const order = new Map(packed.order.map((id, i) => [id, i]));
  const prior = new Map(remembered?.map((id, i) => [id, i]));
  const ranked = [...packed.clusters].sort((a, b) => (prior.get(a.domainId) ?? Infinity) - (prior.get(b.domainId) ?? Infinity) || (model.dependents.get(b.domainId) ?? 0) - (model.dependents.get(a.domainId) ?? 0) || order.get(a.domainId)! - order.get(b.domainId)!);
  const pairs = Array.from({ length: Math.ceil(ranked.length / 12) }, (_, i) => {
    const members = ranked.slice(i * 12, (i + 1) * 12);
    const split = Math.ceil(members.length / 2);
    return [members.slice(0, split), members.slice(split)];
  });
  const previewRows = branchPreviewRows(ranked.length);
  const rowPitch = pitch * BRANCH_ROW_PITCH;
  const rowsOf = (id: string) => Math.max(ranked.length > 12 ? 2 : 3, Math.min(previewRows, model.domainById.get(id)!.capabilityIds.length) + 1);
  const heights = pairs.flatMap((columns) => columns.map((column) => Math.max(0, column.reduce((h, c) => h + rowsOf(c.domainId) * rowPitch + GROUP_GAP * pitch, 0) - GROUP_GAP * pitch)));
  const height = Math.max(...heights, pitch * 8);
  let pairColumns = 1;
  let balance = Infinity;
  for (let columns = 1; columns <= pairs.length; columns++) {
    const rows = Math.ceil(pairs.length / columns);
    const width = ((columns - 1) * PAIR_COLUMN_PITCH + COLUMN_PITCH + MEMBER_REACH * 2) * pitch;
    const gridHeight = rows * height + (rows - 1) * PAIR_ROW_GAP * pitch + pitch * 5;
    const ratio = Math.abs(Math.log(width / gridHeight / GRID_ASPECT));
    if (ratio < balance) { balance = ratio; pairColumns = columns; }
  }
  const pairRows = Math.ceil(pairs.length / pairColumns);
  const positions = new Map<string, Point>();
  const placedElements = new Set<string>();
  const elementRows: { ids: string[]; start: Point; side: -1 | 1; direct: boolean }[] = [];
  const clusters = pairs.flatMap((columns, pairIndex) => {
    const centre = {
      x: ((pairIndex % pairColumns) - (pairColumns - 1) / 2) * PAIR_COLUMN_PITCH * pitch,
      y: (Math.floor(pairIndex / pairColumns) - (pairRows - 1) / 2) * (height + pitch * PAIR_ROW_GAP),
    };
    return columns.flatMap((column, columnIndex) => {
      const side: -1 | 1 = ranked.length === 1 ? 1 : columnIndex === 0 ? -1 : 1;
      let top = centre.y - height / 2 + (columnIndex === 0 ? 0 : GROUP_GAP * pitch / 2);
      return column.map((c, index) => {
        const rows = rowsOf(c.domainId);
        const inset = ranked.length <= 4 && columnIndex === 1 && index % 2 === 1 ? COLUMN_PITCH * pitch / 3 : 0;
        const chip = { x: centre.x + (ranked.length === 1 ? -MEMBER_REACH * pitch / 2 : side * COLUMN_PITCH * pitch / 2 - inset), y: top + rows * rowPitch / 2 };
        top += rows * rowPitch + GROUP_GAP * pitch;
        positions.set(c.domainId, chip);
        const elementStep = pitch;
        const columnStep = MEMBER_REACH * pitch;
        const items = c.items.map((it, i) => {
          const column = Math.floor(i / previewRows);
          const row = i % previewRows;
          const p = { x: chip.x + side * (MEMBER_REACH * pitch + column * columnStep), y: chip.y + (row - (rows - 1) / 2) * rowPitch };
          if (!it.direct) positions.set(it.id, p);
          return { ...it, ...p, elementPitch: elementStep };
        });
        return { ...c, chip, branchSide: side, branchPair: pairIndex, branchCorridorX: centre.x, footprint: Math.hypot(MEMBER_REACH * pitch * Math.ceil((model.domainById.get(c.domainId)!.capabilityIds.length + 1) / previewRows), rows * rowPitch / 2), items };
      });
    });
  });
  const cells = new Map<string, Point[]>();
  const cell = (p: Point) => [Math.floor(p.x / pitch), Math.floor(p.y / pitch)];
  const reserve = (p: Point) => { const key = cell(p).join(":"); const bucket = cells.get(key) ?? []; bucket.push(p); cells.set(key, bucket); };
  const blocked = (p: Point) => {
    const [x, y] = cell(p) as [number, number];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (cells.get(`${x + dx}:${y + dy}`)?.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < pitch * 0.85)) return true;
    }
    return false;
  };
  if (pairs.length > 1) {
    for (const c of clusters) {
      reserve(c.chip);
      for (const it of c.items.slice(0, previewRows)) if (!it.direct) reserve(it);
    }
    for (const c of clusters) for (const it of c.items.slice(previewRows)) {
      if (it.direct) continue;
      while (blocked(it)) it.x += c.branchSide * pitch;
      positions.set(it.id, { x: it.x, y: it.y });
      reserve(it);
    }
  } else for (const p of positions.values()) reserve(p);
  for (const c of clusters) for (const it of c.items) elementRows.push({ ids: it.elementIds, start: { x: it.x + c.branchSide * (it.direct ? 0 : 2.5) * pitch, y: it.y }, side: c.branchSide, direct: it.direct });
  for (const row of elementRows) {
    for (const [index, id] of row.ids.entries()) {
      if (placedElements.has(id)) continue;
      const p = { x: row.start.x + row.side * Math.floor(index / 2) * 3 * pitch, y: row.start.y + (row.direct && row.ids.length === 1 ? 0 : index % 2 === 0 ? -0.5 : 0.5) * pitch };
      while (blocked(p)) p.x += row.side * pitch;
      placedElements.add(id);
      positions.set(id, p);
      reserve(p);
    }
  }
  const previewXs = clusters.flatMap((c) => [c.chip.x, ...c.items.slice(0, previewRows).map((it) => it.x)]);
  const minX = Math.min(...previewXs);
  const maxX = Math.max(...previewXs);
  const previewYs = clusters.flatMap((c) => [c.chip.y, ...c.items.slice(0, previewRows).map((it) => it.y)]);
  const minY = Math.min(...previewYs) - rowPitch * 2;
  const maxY = Math.max(...clusters.map((c) => {
    const shown = c.items.slice(0, previewRows);
    return (shown.at(-1)?.y ?? c.chip.y) + (model.domainById.get(c.domainId)!.capabilityIds.length > previewRows ? rowPitch : 0);
  })) + pitch / 2;
  if (model.projectId) positions.set(model.projectId, { x: (minX + maxX) / 2, y: minY });
  const orphanCentre = { x: 0, y: maxY + packed.orphans.radius };
  for (const id of packed.orphans.ids) {
    const p = packed.positions.get(id)!;
    positions.set(id, { x: orphanCentre.x + p.x - packed.orphans.centre.x, y: orphanCentre.y + p.y - packed.orphans.centre.y });
  }
  return {
    ...packed, branches: true, branchPreviewRows: previewRows, rings: [], clusters, positions,
    memory: { ...packed.memory, branchOrder: clusters.map((c) => c.domainId) },
    clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])),
    itemById: new Map(clusters.flatMap((c) => c.items.map((it) => [it.id, it] as const))),
    orphans: { ...packed.orphans, centre: orphanCentre },
    extent: { minX, maxX, minY: minY - pitch / 2, maxY: packed.orphans.ids.length ? orphanCentre.y + packed.orphans.radius : maxY },
  };
}

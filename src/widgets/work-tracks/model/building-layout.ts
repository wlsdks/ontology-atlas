/**
 * Where every room of the building sits for one board size: the front stage on top, the session
 * floors under it and the shelf at the bottom. Pure arithmetic over the board's size, so a data
 * update moves rooms without reading the DOM, and a room's old and new boxes are both known when it
 * glides.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomSize = 'large' | 'mini';

/** The pixel unit a large room draws its art at: Moru is 128 × unit pixels, never resampled. */
export type RoomUnit = 1 | 2 | 3;

export interface RoomBox extends Box {
  size: RoomSize;
  unit: RoomUnit;
}

export interface LayoutInput {
  width: number;
  /** The height the window leaves for the board; the board grows past it only when rooms need to. */
  height: number;
  stage: readonly string[];
  floors: readonly { key: string; rooms: readonly string[] }[];
  hasShelf: boolean;
  workingBelow: number;
}

export interface BuildingLayout {
  rooms: Map<string, RoomBox>;
  /** Floor name plates, one per session band; none when every mini room fits one row. */
  floors: Map<string, Box>;
  banded: boolean;
  /** The line that counts working rooms below the stage. */
  moreTop: number | null;
  shelf: (Box & { inline: boolean }) | null;
  height: number;
}

const STAGE_GAP = 12;
const MINI_GAP = 8;
const EDGE_TOP = 24;
const EDGE_BOTTOM = 20;
const BAND_GAP = 16;
const MORE_LINE_H = 28;
const SHELF_H = 40;
const SHELF_INLINE_W = 560;
const MINI_H_BANDED = 76;
const MINI_H_ROW = 92;
const MINI_W_INLINE = 280;
const MINI_MIN_W = 240;
const MINI_ROW_LIMIT = 6;
const INLINE_SHELF_ROOMS = 4;
const FLOOR_LABEL_W = 196;
const LARGE_MIN_W = 260;
const LARGE_MIN_H = 300;
const ONE_ROW_CAP_H = 500;
const TWO_ROW_CAP_H = 416;
const TWO_ROW_MIN_H = 300;
/** The belt under a large room's scene, with its top edge. */
export const BELT_H = 68;

/**
 * A wide room hangs its monitor beside Moru; a narrow one hangs it above him, so Moru takes twice
 * his size there only when the scene is tall enough to keep his head and name tag under it.
 */
function unitOf(width: number, sceneHeight: number): RoomUnit {
  if (width >= 520) return width >= 760 && sceneHeight >= 300 ? 3 : 2;
  return width >= 270 && sceneHeight >= 390 ? 2 : 1;
}

export function layoutBuilding(input: LayoutInput): BuildingLayout {
  const { width, height, stage } = input;
  const rooms = new Map<string, RoomBox>();
  const floorPlates = new Map<string, Box>();
  const minis = input.floors.flatMap(floor => floor.rooms);
  const banded = minis.length > MINI_ROW_LIMIT;
  const miniH = banded ? MINI_H_BANDED : MINI_H_ROW;
  const labelW = banded ? FLOOR_LABEL_W : 0;
  const inline = !banded && minis.length > 0 && minis.length <= INLINE_SHELF_ROOMS && input.hasShelf && width >= MINI_W_INLINE * minis.length + SHELF_INLINE_W;
  const fit = Math.max(1, Math.floor((width - labelW + MINI_GAP) / (MINI_MIN_W + MINI_GAP)));
  const longest = Math.max(0, ...input.floors.map(floor => floor.rooms.length));
  const perRow = banded ? Math.min(fit, Math.max(Math.min(4, fit), Math.min(MINI_ROW_LIMIT, longest))) : Math.min(fit, MINI_ROW_LIMIT);
  const miniW = inline ? MINI_W_INLINE : Math.floor((width - labelW - (perRow - 1) * MINI_GAP) / perRow);
  const groups = banded ? input.floors.filter(floor => floor.rooms.length > 0) : minis.length > 0 ? [{ key: '', rooms: minis }] : [];
  const groupHeight = (count: number) => {
    const rows = Math.ceil(count / perRow);
    return rows * miniH + (rows - 1) * MINI_GAP;
  };
  const backH = groups.reduce((sum, group) => sum + groupHeight(group.rooms.length), 0) + Math.max(0, groups.length - 1) * MINI_GAP;
  const shelfH = input.hasShelf && !inline ? SHELF_H : 0;
  const shelfTop = height - EDGE_BOTTOM - shelfH;
  const backTop = inline ? height - EDGE_TOP - miniH : shelfTop - (shelfH ? BAND_GAP : 0) - backH;
  const moreH = input.workingBelow > 0 ? MORE_LINE_H : 0;
  const available = backTop - (backH > 0 ? BAND_GAP : 0) - moreH - EDGE_TOP;

  let overflow = 0;
  const count = stage.length;
  if (count > 0) {
    const maxCols = Math.max(1, Math.floor((width + STAGE_GAP) / (LARGE_MIN_W + STAGE_GAP)));
    let rows = count >= 4 && (available - STAGE_GAP) / 2 >= TWO_ROW_MIN_H ? 2 : 1;
    while (Math.ceil(count / rows) > maxCols) rows += 1;
    const cols = rows === 1 ? Math.max(count, Math.min(2, maxCols)) : Math.ceil(count / rows);
    const fitted = rows === 1 ? Math.min(available, ONE_ROW_CAP_H) : Math.min((available - (rows - 1) * STAGE_GAP) / rows, TWO_ROW_CAP_H);
    const roomH = Math.max(Math.floor(fitted), LARGE_MIN_H);
    const roomW = Math.floor((width - (cols - 1) * STAGE_GAP) / cols / 2) * 2;
    const stageH = rows * roomH + (rows - 1) * STAGE_GAP;
    overflow = Math.max(0, stageH - available);
    const top = EDGE_TOP + Math.max(0, Math.round((available - stageH) / 2));
    const left = count < cols ? Math.round((width - roomW) / 2) : 0;
    const unit = unitOf(roomW, roomH - BELT_H);
    stage.forEach((key, index) => {
      rooms.set(key, {
        x: left + (index % cols) * (roomW + STAGE_GAP),
        y: top + Math.floor(index / cols) * (roomH + STAGE_GAP),
        w: roomW,
        h: roomH,
        size: 'large',
        unit,
      });
    });
  } else if (backTop > EDGE_TOP) {
    // Nothing on the stage: the floors move up under the header instead of hanging at the bottom.
    overflow = EDGE_TOP - backTop;
  }

  let floorTop = backTop + overflow;
  for (const group of groups) {
    const groupH = groupHeight(group.rooms.length);
    if (banded) floorPlates.set(group.key, { x: 0, y: floorTop, w: labelW - MINI_GAP, h: groupH });
    group.rooms.forEach((key, index) => {
      rooms.set(key, {
        x: labelW + (index % perRow) * (miniW + MINI_GAP),
        y: floorTop + Math.floor(index / perRow) * (miniH + MINI_GAP),
        w: miniW,
        h: miniH,
        size: 'mini',
        unit: 1,
      });
    });
    floorTop += groupH + MINI_GAP;
  }

  const shelf = !input.hasShelf
    ? null
    : inline
      ? { x: width - SHELF_INLINE_W, y: backTop + overflow + (miniH - SHELF_H) / 2, w: SHELF_INLINE_W, h: SHELF_H, inline: true }
      : { x: 0, y: Math.max(shelfTop + overflow, floorTop - MINI_GAP + BAND_GAP), w: width, h: SHELF_H, inline: false };
  const bottom = Math.max(height, (shelf ? shelf.y + shelf.h : floorTop) + EDGE_BOTTOM);
  return {
    rooms,
    floors: floorPlates,
    banded,
    moreTop: moreH > 0 ? backTop + overflow - BAND_GAP - moreH : null,
    shelf,
    height: bottom,
  };
}

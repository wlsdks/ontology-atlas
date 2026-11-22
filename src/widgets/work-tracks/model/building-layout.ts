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
const MINI_W_INLINE = 300;
const MINI_MIN_W = 300;
const MINI_ROW_LIMIT = 6;
/** Mini rooms stand five to a row at most, never narrower than `MINI_MIN_W`. */
const MINI_COLUMNS = 5;
const INLINE_SHELF_ROOMS = 4;
const FLOOR_LABEL_W = 196;
const LARGE_MIN_W = 260;
/** From this width a room hangs its monitor beside Moru. */
const WIDE_ROOM_W = 520;
const LARGE_MIN_H = 300;
const ONE_ROW_CAP_H = 500;
const TWO_ROW_CAP_H = 416;
const TWO_ROW_MIN_H = 300;
/** The belt under a large room's scene, with its top edge. */
export const BELT_H = 68;

/**
 * A wide room hangs its monitor beside Moru; a narrow one hangs it above him and shortens it to stay
 * clear of his name tag, so Moru takes twice his size there once the scene is 300px tall.
 */
function unitOf(width: number, sceneHeight: number): RoomUnit {
  if (width >= WIDE_ROOM_W) return width >= 760 && sceneHeight >= 300 ? 3 : 2;
  return width >= 270 && sceneHeight >= 300 ? 2 : 1;
}

/** What a board keeps under two rows of rooms: the edges, one row of mini rooms and the shelf. */
const UNDER_STAGE_H = EDGE_TOP + BAND_GAP + MINI_H_ROW + BAND_GAP + SHELF_H + EDGE_BOTTOM;

/**
 * How many large rooms the stage takes on a board this size: four when exactly two wide rooms fit
 * side by side, so each keeps its monitor beside Moru, otherwise six; and only one row's worth
 * when two rows would push the floors and the shelf out of the window.
 */
export function stageCapacity(width: number, height: number): number {
  const wideColumns = Math.floor((width + STAGE_GAP) / (WIDE_ROOM_W + STAGE_GAP));
  const capacity = wideColumns === 2 ? 4 : 6;
  if (height >= 2 * LARGE_MIN_H + STAGE_GAP + UNDER_STAGE_H) return capacity;
  return Math.max(1, Math.min(capacity, Math.floor((width + STAGE_GAP) / (LARGE_MIN_W + STAGE_GAP))));
}

/** Two Moru overlapping by about 40%, the lamp past the first, in drawn pixels; and the room's margins. */
const PAIR_SPAN = 221;
const PAIR_MARGIN_PX = 24;

export interface PairFit {
  unit: RoomUnit;
  /** In a wide room, the name tags clear the monitor's bottom, so the pair may stand beneath it. */
  underMonitor: boolean;
}

/**
 * The largest unit, up to the room's own, at which two Moru and the lamp fit across a room without
 * running into its monitor. A narrow room hangs the monitor above them; a wide one hangs it at the
 * right, which the pair passes beneath only when its name tags stay below the monitor's bottom.
 */
export function pairFit(width: number, sceneHeight: number, unit: RoomUnit): PairFit {
  const wide = width >= WIDE_ROOM_W;
  for (let fitting = unit; ; fitting = (fitting - 1) as RoomUnit) {
    const underMonitor = !wide || sceneHeight >= 134 * fitting + 40;
    const reach = underMonitor ? 0 : Math.min(0.46 * width, 124 * fitting) + 16;
    if (fitting === 1 || PAIR_SPAN * fitting + PAIR_MARGIN_PX + reach <= width) return { unit: fitting, underMonitor };
  }
}

/**
 * Where the index-th of a floor's rooms sits when the floor wraps: its rooms spread evenly over as
 * few rows as fit, the first rows taking one more (seven at three a row is three, two, two), so no
 * room hangs alone on a row of its own. The columns stay the building's.
 */
export function spreadOver(count: number, perRow: number, index: number): { row: number; column: number } {
  const rows = Math.ceil(count / perRow);
  const base = Math.floor(count / rows);
  const longer = count % rows;
  const inLonger = longer * (base + 1);
  if (index < inLonger) return { row: Math.floor(index / (base + 1)), column: index % (base + 1) };
  return { row: longer + Math.floor((index - inLonger) / base), column: (index - inLonger) % base };
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
  const perRow = Math.min(fit, MINI_COLUMNS);
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
      const { row, column } = spreadOver(group.rooms.length, perRow, index);
      rooms.set(key, {
        x: labelW + column * (miniW + MINI_GAP),
        y: floorTop + row * (miniH + MINI_GAP),
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

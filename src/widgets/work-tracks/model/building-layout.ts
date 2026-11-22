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
}

export interface BuildingLayout {
  rooms: Map<string, RoomBox>;
  /** Floor name plates, one per session band; none when every mini room fits one row. */
  floors: Map<string, Box>;
  banded: boolean;
  /**
   * The lower floor's heading, which counts its working rooms: a plate at the left of a single row
   * whose rooms each keep 300px beside it, otherwise a line above the rooms.
   */
  heading: (Box & { kind: 'plate' | 'line' }) | null;
  shelf: Box | null;
  height: number;
}

const STAGE_GAP = 12;
const MINI_GAP = 8;
const EDGE_TOP = 24;
const EDGE_BOTTOM = 20;
const BAND_GAP = 16;
const SHELF_H = 40;
/** Every mini room, banded or not: Moru's corner, the branch, the status and the newest subject. */
export const MINI_H = 96;
const MINI_MIN_W = 300;
/** The lower floor's heading as a line above its rooms, under its rule. */
const HEADING_LINE_H = 30;
const MINI_ROW_LIMIT = 6;
/** Mini rooms stand five to a row at most, never narrower than `MINI_MIN_W`. */
const MINI_COLUMNS = 5;
const FLOOR_LABEL_W = 196;
const LARGE_MIN_W = 260;
/** From this width a room hangs its monitor beside Moru. */
/** From this width a stage room hangs its monitor at the right; narrower, above Moru. */
export const WIDE_ROOM_W = 520;
const LARGE_MIN_H = 300;
/**
 * One row of stage rooms grows with the room's width up to this height and no taller than this share
 * of its width: a room is one scene on one floor line, so a taller one is only empty wall.
 */
const ONE_ROW_CAP_H = 640;
const ONE_ROW_MAX_ASPECT = 0.72;
/** A narrow room hangs its screen above Moru, so it stands taller: room for a head piece under the screen. */
const NARROW_MAX_ASPECT = 0.95;
const TWO_ROW_CAP_H = 416;
const TWO_ROW_MIN_H = 300;
/** A large room's belt is a track in its floor: the scene is the whole room. */
export const BELT_H = 0;

/**
 * A wide room stands its screen on a console beside Moru; a narrow one mounts it above him, so Moru
 * takes twice his size there once the room is 300px tall.
 */
function unitOf(width: number, sceneHeight: number): RoomUnit {
  if (width >= WIDE_ROOM_W) return width >= 760 && sceneHeight >= 300 ? 3 : 2;
  return width >= 270 && sceneHeight >= 300 ? 2 : 1;
}

/** What a board keeps under two rows of rooms: the edges, one row of mini rooms and the shelf. */
const UNDER_STAGE_H = EDGE_TOP + BAND_GAP + MINI_H + BAND_GAP + SHELF_H + EDGE_BOTTOM;

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
  const fit = (labelW: number) => Math.max(1, Math.floor((width - labelW + MINI_GAP) / (MINI_MIN_W + MINI_GAP)));
  // A single row whose rooms each keep 300px beside a plate takes the plate; otherwise a line above.
  const plated = !banded && minis.length > 0 && minis.length <= Math.min(fit(FLOOR_LABEL_W), MINI_COLUMNS);
  const labelW = banded || plated ? FLOOR_LABEL_W : 0;
  const perRow = Math.min(fit(labelW), MINI_COLUMNS);
  const shared = (across: number, count: number) => Math.floor((across - (count - 1) * MINI_GAP) / count);
  const miniW = shared(width - labelW, Math.max(1, Math.min(perRow, banded ? perRow : minis.length)));
  const headingH = minis.length > 0 && !plated ? HEADING_LINE_H : 0;
  // Banded, every floor keeps its row, even one whose rooms are all on the stage: its plate says so.
  // A session whose rooms are all on the stage has no band below: its bezels already name it.
  const groups = banded ? input.floors.filter(floor => floor.rooms.length > 0) : minis.length > 0 ? [{ key: '', rooms: minis }] : [];
  const groupHeight = (count: number) => {
    const rows = Math.max(1, Math.ceil(count / perRow));
    return rows * MINI_H + (rows - 1) * MINI_GAP;
  };
  const backH = headingH + groups.reduce((sum, group) => sum + groupHeight(group.rooms.length), 0) + Math.max(0, groups.length - 1) * MINI_GAP;
  const shelfH = input.hasShelf ? SHELF_H : 0;
  const shelfTop = height - EDGE_BOTTOM - shelfH;
  const backTop = shelfTop - (shelfH ? BAND_GAP : 0) - backH;
  const available = backTop - (backH > 0 ? BAND_GAP : 0) - EDGE_TOP;

  let overflow = 0;
  const count = stage.length;
  if (count > 0) {
    const maxCols = Math.max(1, Math.floor((width + STAGE_GAP) / (LARGE_MIN_W + STAGE_GAP)));
    let rows = count >= 4 && (available - STAGE_GAP) / 2 >= TWO_ROW_MIN_H ? 2 : 1;
    while (Math.ceil(count / rows) > maxCols) rows += 1;
    const cols = rows === 1 ? Math.max(count, Math.min(2, maxCols)) : Math.ceil(count / rows);
    const roomW = Math.floor((width - (cols - 1) * STAGE_GAP) / cols / 2) * 2;
    const oneRowCap = Math.min(ONE_ROW_CAP_H, Math.max(LARGE_MIN_H, Math.floor(roomW * (roomW < WIDE_ROOM_W ? NARROW_MAX_ASPECT : ONE_ROW_MAX_ASPECT))));
    const fitted = rows === 1 ? Math.min(available, oneRowCap) : Math.min((available - (rows - 1) * STAGE_GAP) / rows, TWO_ROW_CAP_H);
    const roomH = Math.max(Math.floor(fitted), LARGE_MIN_H);
    const stageH = rows * roomH + (rows - 1) * STAGE_GAP;
    // The floors follow right under the stage; what the window has left stays under the shelf.
    overflow = stageH - available;
    const top = EDGE_TOP;
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

  const heading = minis.length === 0
    ? null
    : plated
      ? { x: 0, y: backTop + overflow, w: FLOOR_LABEL_W - MINI_GAP, h: MINI_H, kind: 'plate' as const }
      : { x: 0, y: backTop + overflow, w: width, h: HEADING_LINE_H, kind: 'line' as const };
  let floorTop = backTop + overflow + headingH;
  for (const group of groups) {
    const groupH = groupHeight(group.rooms.length);
    if (banded) floorPlates.set(group.key, { x: 0, y: floorTop, w: labelW - MINI_GAP, h: groupH });
    group.rooms.forEach((key, index) => {
      const { row, column } = spreadOver(group.rooms.length, perRow, index);
      rooms.set(key, {
        x: labelW + column * (miniW + MINI_GAP),
        y: floorTop + row * (MINI_H + MINI_GAP),
        w: miniW,
        h: MINI_H,
        size: 'mini',
        unit: 1,
      });
    });
    floorTop += groupH + MINI_GAP;
  }

  const shelf = input.hasShelf ? { x: 0, y: groups.length > 0 ? floorTop - MINI_GAP + BAND_GAP : shelfTop + overflow, w: width, h: SHELF_H } : null;
  const bottom = Math.max(height, (shelf ? shelf.y + shelf.h : floorTop - MINI_GAP) + EDGE_BOTTOM);
  return {
    rooms,
    floors: floorPlates,
    banded,
    heading,
    shelf,
    height: bottom,
  };
}

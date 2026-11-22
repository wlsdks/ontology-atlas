/**
 * Where every room of the building sits for one board size: the front stage on top, the session
 * floors under it and the shelf at the bottom. Pure arithmetic over the board's size, so a data
 * update moves rooms without reading the DOM, and a room's old and new boxes are both known when it
 * glides.
 */

import { LOBBY_H } from '@/shared/ui/marks/moru/life/lobby-canvas';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomSize = 'large' | 'mini';

/** The pixel unit a large room draws its art at: Moru is 128 × unit pixels, never resampled. */
/** Moru's scale in a room, in half steps so each of his drawn pixels stays whole on screen. */
export type RoomUnit = number;

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
  /** The ground floor where Moru live (`MoruLobby`), under the floors. */
  hasLobby?: boolean;
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
  /** The ground floor: the lobby strip under the floors, above the shelf. */
  lobby: (Box & { unit: RoomUnit }) | null;
  height: number;
}

const STAGE_GAP = 12;
const MINI_GAP = 8;
const EDGE_TOP = 24;
const EDGE_BOTTOM = 20;
const BAND_GAP = 16;
const SHELF_H = 40;
/** The lobby's name plate over its lanes. */
export const LOBBY_PLAQUE_H = 24;
/**
 * The lobby draws Moru at most this large. A room's scale (1.5 at 1,512px) leaves a floor of about 950 of Moru's
 * pixels, where the crew's spacing and comings and goings, tuned on 1,400, do not hold yet; until they are, 1.
 */
const LOBBY_MOST_UNIT = 1;

/** The lobby's scale: a single stage room's Moru at this width, at most `LOBBY_MOST_UNIT`. */
export function lobbyUnit(width: number): RoomUnit {
  const cols = Math.min(2, Math.max(1, Math.floor((width + STAGE_GAP) / (LARGE_MIN_W + STAGE_GAP))));
  return Math.min(LOBBY_MOST_UNIT, unitOf(Math.floor((width - (cols - 1) * STAGE_GAP) / cols / 2) * 2));
}
/** The lobby's height at a scale: its name plate over three lanes of Moru. */
export const lobbyHeight = (unit: RoomUnit) => Math.ceil(LOBBY_H * unit) + LOBBY_PLAQUE_H;
/** Every mini room, banded or not: Moru's corner, the branch, the status and the newest subject. */
export const MINI_H = 96;
const MINI_MIN_W = 300;
/** Beside the floors' plate a mini room keeps this much, so its branch is not cut; narrower, the heading goes above. */
const PLATED_MINI_MIN_W = 340;
/** The lower floor's heading as a line above its rooms, under its rule. */
const HEADING_LINE_H = 30;
const MINI_ROW_LIMIT = 6;
/** Mini rooms stand five to a row at most, never narrower than `MINI_MIN_W`. */
const MINI_COLUMNS = 5;
const FLOOR_LABEL_W = 196;
const LARGE_MIN_W = 260;
const LARGE_MIN_H = 300;
const TWO_ROW_MIN_H = 300;
/**
 * A stage room's screen, in pixels whatever Moru's scale: the branch, three commit rows, the foot
 * and the bezel (`--screen-h` in `rooms.module.css`). Its text never shrinks; the scenery does.
 */
export const SCREEN_H = 160;
/** The least width a screen on a console keeps: a 55-character subject and its age on one line. */
const SCREEN_MIN_W = 400;
/** Where Moru's cell starts from a wide room's left edge. */
const MORU_LEFT = 20;
/** What a console room spends beside its screen per unit: Moru's cell to the screen, 134, and the side wall, 18. */
const CONSOLE_PER_UNIT = 152;
/** From this width a stage room stands its screen on a console beside Moru; narrower, it hangs it above him. */
export const WIDE_ROOM_W = MORU_LEFT + CONSOLE_PER_UNIT + SCREEN_MIN_W;

/** Moru as large as the screen beside him leaves room for, in half steps: the screen keeps its width, Moru gives way. */
function unitOf(width: number): RoomUnit {
  if (width < WIDE_ROOM_W) return width >= 400 ? 2 : 1;
  return Math.min(3, Math.max(1, Math.floor((2 * (width - MORU_LEFT - SCREEN_MIN_W)) / CONSOLE_PER_UNIT) / 2));
}

/** One commit row on a screen; a room with height to spare shows up to `MAX_SCREEN_ROWS`. */
export const SCREEN_ROW_H = 24;
const BASE_SCREEN_ROWS = 3;
export const MAX_SCREEN_ROWS = 5;

/** How many commit rows a stage room's screen shows: three, and one more for each row of height it has to spare. */
export function screenRows(box: Pick<RoomBox, 'w' | 'h' | 'unit'>): number {
  if (box.w < WIDE_ROOM_W) return BASE_SCREEN_ROWS;
  const spare = box.h - roomHeight(box.w, box.unit);
  return Math.min(MAX_SCREEN_ROWS, BASE_SCREEN_ROWS + Math.max(0, Math.floor(spare / SCREEN_ROW_H)));
}

/** What a pair of Moru spends beside a console screen per unit: two cells side by side, 254, and the side wall, 18. */
const PAIR_PER_UNIT = 272;

/** Two Moru side by side, from the tail of the one behind to the face of the one in front, per unit. */
const PAIR_BODIES = 218;
/** A tool a Moru works with reaches this far past the face of the one in front, per unit. */
const PAIR_TOOL_REACH = 64;
/** What a narrow room keeps beside the pair: its side wall, per unit, and a margin at each end. */
const SIDE_WALL = 16;
const PAIR_MARGIN = 8;

/**
 * The scale two Moru share in one room, in half steps so each drawn pixel stays whole: beside a
 * console as large as leaves the screen its width, at least 1; under a hanging screen as large as
 * both fit apart on the floor, up to the room's own.
 */
export function pairUnit(width: number, unit: RoomUnit): number {
  if (width < WIDE_ROOM_W) return Math.max(0.5, Math.min(unit, Math.floor((2 * (width - SIDE_WALL * unit - 2 * PAIR_MARGIN)) / PAIR_BODIES) / 2));
  return Math.max(1, Math.min(unit, Math.floor((2 * (width - MORU_LEFT - SCREEN_MIN_W)) / PAIR_PER_UNIT) / 2));
}

/**
 * The one in front of a pair works with his tools only where they stay in the room: beside a
 * console, or under a hanging screen when the floor leaves room past his face for them. Elsewhere
 * the pair talk and type.
 */
export function pairTools(width: number, unit: RoomUnit): boolean {
  if (width >= WIDE_ROOM_W) return true;
  const pair = pairUnit(width, unit), floor = width - SIDE_WALL * unit;
  return floor / 2 + ((PAIR_BODIES / 2) + PAIR_TOOL_REACH) * pair <= floor;
}

/**
 * A stage room as tall as what it holds. Beside a console: the screen over the console and the floor,
 * or Moru with a head piece, whichever is taller. Narrow: the screen and its shelf on the wall, then
 * Moru under them with room for a head piece.
 */
function roomHeight(width: number, unit: RoomUnit): number {
  if (width >= WIDE_ROOM_W) return Math.ceil(Math.max(24 + SCREEN_H + 45 * unit, 110 * unit + 16));
  return Math.ceil(12 + SCREEN_H + 8 + 116 * unit);
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
  const fit = (labelW: number, least = MINI_MIN_W) => Math.max(1, Math.floor((width - labelW + MINI_GAP) / (least + MINI_GAP)));
  // A single row whose rooms each keep 300px beside a plate takes the plate; otherwise a line above.
  const plated = !banded && minis.length > 0 && minis.length <= Math.min(fit(FLOOR_LABEL_W, PLATED_MINI_MIN_W), MINI_COLUMNS);
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
  const lobbyScale = lobbyUnit(width);
  const lobbyH = input.hasLobby ? lobbyHeight(lobbyScale) : 0;
  const shelfTop = height - EDGE_BOTTOM - shelfH - (lobbyH ? lobbyH + (shelfH ? BAND_GAP : 0) : 0);
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
    const unit = unitOf(roomW);
    // Height the window has to spare goes to more commit rows on a one-row stage's screens. Two
    // rows keep their fitted height, so a room moving between rows never changes height on the way.
    const fitted = roomHeight(roomW, unit);
    const spare = rows === 1 && roomW >= WIDE_ROOM_W ? Math.floor((available - (rows - 1) * STAGE_GAP) / rows) - fitted : 0;
    const roomH = fitted + Math.min(MAX_SCREEN_ROWS - BASE_SCREEN_ROWS, Math.max(0, Math.floor(spare / SCREEN_ROW_H))) * SCREEN_ROW_H;
    const stageH = rows * roomH + (rows - 1) * STAGE_GAP;
    // The floors follow right under the stage; what the window has left stays under the shelf.
    overflow = stageH - available;
    const top = EDGE_TOP;
    const left = count < cols ? Math.round((width - roomW) / 2) : 0;
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
    const places = group.rooms.map((_, index) => spreadOver(group.rooms.length, perRow, index));
    group.rooms.forEach((key, index) => {
      const { row, column } = places[index];
      // A wrapped floor's rooms fill each row's width, so no row ends in a hole.
      const inRow = places.filter(place => place.row === row).length;
      const w = places.length > perRow ? shared(width - labelW, inRow) : miniW;
      rooms.set(key, {
        x: labelW + column * (w + MINI_GAP),
        y: floorTop + row * (MINI_H + MINI_GAP),
        w,
        h: MINI_H,
        size: 'mini',
        unit: 1,
      });
    });
    floorTop += groupH + MINI_GAP;
  }

  const groundTop = groups.length > 0 ? floorTop - MINI_GAP + BAND_GAP : shelfTop + overflow;
  const lobby = lobbyH ? { x: 0, y: groundTop, w: width, h: lobbyH, unit: lobbyScale } : null;
  const shelf = input.hasShelf ? { x: 0, y: lobby ? lobby.y + lobby.h + BAND_GAP : groundTop, w: width, h: SHELF_H } : null;
  // The building ends under what it holds; it does not stretch to the window with bare floor.
  const bottom = (shelf ? shelf.y + shelf.h : lobby ? lobby.y + lobby.h : floorTop - MINI_GAP) + EDGE_BOTTOM;
  return {
    rooms,
    floors: floorPlates,
    banded,
    heading,
    shelf,
    lobby,
    height: bottom,
  };
}

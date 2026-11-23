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

/** Moru's scale in a room, in half steps so each of his drawn pixels stays whole on screen: he is 128 × unit pixels. */
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
  /** What each stage room has to list, in `stage` order. */
  stageLists?: readonly ScreenLists[];
}

/** How many commits and uncommitted files one room's screen has to list, and how many folders those files are in. */
export interface ScreenLists {
  commits: number;
  files: number;
  areas: number;
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

/**
 * Moru's scale in a stage room: his drawn size, whatever the room's. The room's width and height go to
 * its screen, which says what the worktree is doing; he only shows that it is.
 */
const STAGE_UNIT: RoomUnit = 1;

/** The least a screen column keeps: a commit subject of about forty characters, or a file's name and folder. */
const SCREEN_COLUMN_MIN_W = 270;
/** What a screen leaves of its room's width: 12 at each end. */
const HUNG_SCREEN_INSET = 24;
/** What a screen's outline and padding take from its width before its text. */
const SCREEN_TEXT_INSET = 22;
/** The rule between the commits and the files, with its margins (`.screenColumn + .screenColumn`). */
const SCREEN_RULE_W = 33;
/** The widest the commits keep beside the files: a subject of about sixty characters and its age, so the files keep their columns (`.screenColumns`). */
const COMMITS_COLUMN_MAX_W = 440;
/** The least one column of files keeps, so a name, its folder and its age read together; and the gap between two. */
const FILE_COLUMN_MIN_W = 340;
const FILE_COLUMN_GAP = 32;
const MAX_FILE_COLUMNS = 3;
/** What the areas keep beside the files: a folder three names deep, its share, its count and its age (`.screenColumns`). */
const AREAS_COLUMN_W = 340;

const screenTextWidth = (width: number) => width - HUNG_SCREEN_INSET - SCREEN_TEXT_INSET;

/** Whether a stage room this wide sets its commits and its uncommitted files side by side: its screen keeps two columns. */
function screenSpreads(width: number): boolean {
  return screenTextWidth(width) + SCREEN_TEXT_INSET >= 2 * SCREEN_COLUMN_MIN_W;
}

/** What the files keep of a screen's text: what the commits leave, and the areas when the screen lists them. */
function filesWidth(width: number, hasCommits: boolean, withAreas: boolean): number {
  const text = screenTextWidth(width);
  const commits = hasCommits ? Math.min(COMMITS_COLUMN_MAX_W, (text * 6) / 11) + SCREEN_RULE_W : 0;
  return text - commits - (withAreas ? AREAS_COLUMN_W + SCREEN_RULE_W : 0);
}

/**
 * Whether a room's screen also lists the folders its files are in: only a room alone on the stage,
 * whose files are in two folders or more, on a screen that still keeps a column of files beside them.
 */
export function listsAreas(width: number, lists: ScreenLists, alone: boolean): boolean {
  return alone && lists.areas >= 2 && screenSpreads(width) && filesWidth(width, lists.commits > 0, true) >= FILE_COLUMN_MIN_W;
}

/**
 * How many columns a stage room's uncommitted files flow into, so an age stays beside its name on
 * a wide screen: none on a screen too narrow to list files, otherwise as many as keep 340px each
 * in what the commits and the areas leave, up to three. A room with no commits gives the files
 * their share too.
 */
export function fileColumns(width: number, hasCommits: boolean, withAreas: boolean): number {
  if (!screenSpreads(width)) return 0;
  const files = filesWidth(width, hasCommits, withAreas);
  return Math.max(1, Math.min(MAX_FILE_COLUMNS, Math.floor((files + FILE_COLUMN_GAP) / (FILE_COLUMN_MIN_W + FILE_COLUMN_GAP))));
}

/** The rows a room this wide needs to list everything: its commits, or its files over their columns, whichever is longer. */
function rowsToList(width: number, lists: ScreenLists, alone: boolean): number {
  const columns = fileColumns(width, lists.commits > 0, listsAreas(width, lists, alone));
  return Math.max(lists.commits, columns > 0 ? Math.ceil(lists.files / columns) : 0);
}

/** One row on a screen; a one-row stage with height to spare shows as many as its rooms have to list. */
export const SCREEN_ROW_H = 24;
const BASE_SCREEN_ROWS = 3;
/** The most rows a room alone on the stage lists: everything the activity read returns. */
export const MAX_SCREEN_ROWS = 20;
/** The most rows rooms sharing a stage list, so one long list does not leave its neighbours' screens bare; the room's panel has the rest. */
export const SHARED_SCREEN_ROWS = 8;

/** How many rows a stage room's screen shows: three, and one more for each row its box is taller than what it holds. */
export function screenRows(box: Pick<RoomBox, 'h' | 'unit'>): number {
  const spare = box.h - roomHeight(box.unit);
  return Math.min(MAX_SCREEN_ROWS, BASE_SCREEN_ROWS + Math.max(0, Math.floor(spare / SCREEN_ROW_H)));
}

/** Two Moru side by side, from the tail of the one behind to the face of the one in front, per unit. */
const PAIR_BODIES = 218;
/** What a room keeps beside the pair: a margin at each end. */
const PAIR_MARGIN = 8;

/**
 * The scale two Moru share in one room, in half steps so each drawn pixel stays whole: as large as
 * both fit apart on the rail, up to the room's own.
 */
export function pairUnit(width: number, unit: RoomUnit): number {
  return Math.max(0.5, Math.min(unit, Math.floor((2 * (width - 2 * PAIR_MARGIN)) / PAIR_BODIES) / 2));
}

/** From this width a room keeps bare wall left of Moru, where its state is read across the stage: his cell starts 192px in. */
const WALL_FACTS_MIN_W = 600;

/** Whether a stage room this wide says its state on the wall left of Moru. */
export function showsWallFacts(width: number): boolean {
  return width >= WALL_FACTS_MIN_W;
}

/** The rail's height above a room's bottom edge, and Moru's cell above it: his feet are 30 drawn pixels over the cell's bottom. */
const RAIL_H = 14;
const MORU_OVER_RAIL = 98;

/** A stage room as tall as what it holds: the screen across the room, then Moru under it on the rail. */
function roomHeight(unit: RoomUnit): number {
  return Math.ceil(12 + SCREEN_H + 4 + RAIL_H + MORU_OVER_RAIL * unit);
}

/** What a board keeps under two rows of rooms: the edges, one row of mini rooms and the shelf. */
const UNDER_STAGE_H = EDGE_TOP + BAND_GAP + MINI_H + BAND_GAP + SHELF_H + EDGE_BOTTOM;

/**
 * How many large rooms the stage takes on a board this size: six, three across, unless three
 * across are too narrow to list their files and two across are not, then four; and only one
 * row's worth when two rows would push the floors and the shelf out of the window.
 */
export function stageCapacity(width: number, height: number): number {
  const across = (columns: number) => Math.floor((width - (columns - 1) * STAGE_GAP) / columns);
  const capacity = !screenSpreads(across(3)) && screenSpreads(across(2)) ? 4 : 6;
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
  const shelfTop = height - EDGE_BOTTOM - shelfH;
  const backTop = shelfTop - (shelfH ? BAND_GAP : 0) - backH;
  const available = backTop - (backH > 0 ? BAND_GAP : 0) - EDGE_TOP;

  let overflow = 0;
  const count = stage.length;
  if (count > 0) {
    const maxCols = Math.max(1, Math.floor((width + STAGE_GAP) / (LARGE_MIN_W + STAGE_GAP)));
    let rows = count >= 4 && (available - STAGE_GAP) / 2 >= TWO_ROW_MIN_H ? 2 : 1;
    while (Math.ceil(count / rows) > maxCols) rows += 1;
    // A room alone on the stage takes the building's width: its screen is the page.
    const solo = count === 1;
    const cols = solo ? 1 : rows === 1 ? Math.max(count, Math.min(2, maxCols)) : Math.ceil(count / rows);
    const roomW = Math.floor((width - (cols - 1) * STAGE_GAP) / cols / 2) * 2;
    const unit = STAGE_UNIT;
    // Height the window has to spare goes to more rows on a one-row stage's screens, as many as
    // its rooms have to list: a screen is never taller than its longest list. Two rows keep their
    // fitted height, so a room moving between rows never changes height on the way.
    const fitted = roomHeight(unit);
    const spare = rows === 1 ? available - fitted : 0;
    const longest = Math.max(0, ...(input.stageLists ?? []).map(lists => rowsToList(roomW, lists, solo)));
    const wanted = Math.min(solo ? MAX_SCREEN_ROWS : SHARED_SCREEN_ROWS, Math.max(BASE_SCREEN_ROWS, longest));
    const roomH = fitted + Math.min(wanted - BASE_SCREEN_ROWS, Math.max(0, Math.floor(spare / SCREEN_ROW_H))) * SCREEN_ROW_H;
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
  const shelf = input.hasShelf ? { x: 0, y: groundTop, w: width, h: SHELF_H } : null;
  // The building ends under what it holds; it does not stretch to the window with bare floor.
  const bottom = (shelf ? shelf.y + shelf.h : floorTop - MINI_GAP) + EDGE_BOTTOM;
  return { rooms, floors: floorPlates, banded, heading, shelf, height: bottom };
}

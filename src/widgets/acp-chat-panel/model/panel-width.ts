/**
 * The chat panel's width: pure arithmetic plus where it is stored. The user drags; this decides only
 * the lines a drag must not cross. The panel never covers the map, so the upper bound is what is left
 * after the rail and `MAP_MIN_WIDTH`; the lower bound is the width at which one line is readable.
 */

export const CHAT_WIDTH_MIN = 320;
/**
 * The width when nobody has dragged; 520 widens the composer box so both pickers read in full.
 * Only the ceiling of the default: `defaultChatWidth()` accounts for the window (`MAP_COMFORT_WIDTH`).
 */
export const CHAT_WIDTH_DEFAULT = 520;
/**
 * The map width a default must leave, wider than `MAP_MIN_WIDTH`, which only a drag may not cross.
 * 540 keeps a relation caption drawing in a 1040px window.
 */
export const MAP_COMFORT_WIDTH = 540;
export const MAP_MIN_WIDTH = 480;
export const RAIL_WIDTH = 64;
export const CHAT_WIDTH_STEP = 16;

export function maxChatWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return CHAT_WIDTH_DEFAULT;
  // On a very narrow screen the computed result falls below the lower bound. The
  // lower bound wins then — "a slightly narrow map" beats "an unreadable panel".
  return Math.max(CHAT_WIDTH_MIN, viewportWidth - RAIL_WIDTH - MAP_MIN_WIDTH);
}

export function clampChatWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return CHAT_WIDTH_DEFAULT;
  return Math.round(Math.min(Math.max(width, CHAT_WIDTH_MIN), maxChatWidth(viewportWidth)));
}

/**
 * The width to open at when nobody has chosen one. A stored width only meets `clampChatWidth`; a
 * default is our answer on an unseen screen, so it yields first: `CHAT_WIDTH_DEFAULT` while
 * `MAP_COMFORT_WIDTH` is left for the map, else what remains. The lower bound still wins.
 */
export function defaultChatWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return CHAT_WIDTH_DEFAULT;
  const comfortable = viewportWidth - RAIL_WIDTH - MAP_COMFORT_WIDTH;
  return clampChatWidth(Math.min(CHAT_WIDTH_DEFAULT, comfortable), viewportWidth);
}

/**
 * Where it is stored. A width is not a secret and is this computer's preference, so
 * it lives in `localStorage` — as a file inside the vault it would hand someone
 * else's screen size over every time the folder moved.
 */
export const CHAT_WIDTH_STORAGE_KEY = 'atlas.acp-chat.width';

export function readStoredChatWidth(storage: Pick<Storage, 'getItem'>): number | null {
  try {
    const raw = storage.getItem(CHAT_WIDTH_STORAGE_KEY);
    if (raw == null) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    // The panel must still open in a browser with storage blocked (private mode and the like).
    return null;
  }
}

export function writeStoredChatWidth(storage: Pick<Storage, 'setItem'>, width: number): void {
  try {
    storage.setItem(CHAT_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Even if the write fails, this session's width is alive — pass over it quietly.
  }
}

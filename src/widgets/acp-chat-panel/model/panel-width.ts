/**
 * The chat panel's **width** — one set of pure arithmetic plus where it is stored.
 *
 * ## Why a rule instead of a value
 *
 * The width used to be two literals, `w-[420px] xl:w-[480px]`. Those two numbers
 * were **nobody's answer** — too narrow for someone reading a long block of code,
 * too wide for someone glancing at the map and asking something short. Rather than
 * picking one number, **the user drags**, and we only decide the lines that drag
 * must not cross.
 *
 * ## The lines it must not cross
 *
 * This panel **never covers the map** (the 2026-07-27 "the map is primary" rule).
 * So the upper bound is not taste but arithmetic — whatever is left of the screen
 * after the rail's and the map's shares. The minimum width the map must keep
 * (`MAP_MIN_WIDTH`) is the same floor set when this panel was first introduced.
 *
 * The lower bound is **the width at which one line is readable**. Narrower than
 * this, bubbles and tool lines wrap every two or three characters, leaving the
 * panel alive but unreadable.
 */

/** The minimum width at which one line reads. Below it, the conversation becomes vertical text. */
export const CHAT_WIDTH_MIN = 320;
/** The width when nobody has dragged — carries the previous default forward. */
export const CHAT_WIDTH_DEFAULT = 420;
/** The minimum width the map must keep. This panel's upper bound derives from it. */
export const MAP_MIN_WIDTH = 480;
/** The left rail. Along with the map, it comes off the screen's width first. */
export const RAIL_WIDTH = 64;
/** How far one keyboard press moves it. */
export const CHAT_WIDTH_STEP = 16;

/** The largest width the panel can take on this screen. */
export function maxChatWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return CHAT_WIDTH_DEFAULT;
  // On a very narrow screen the computed result falls below the lower bound. The
  // lower bound wins then — "a slightly narrow map" beats "an unreadable panel".
  return Math.max(CHAT_WIDTH_MIN, viewportWidth - RAIL_WIDTH - MAP_MIN_WIDTH);
}

/** Fold a dragged width into the range this screen allows. */
export function clampChatWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return CHAT_WIDTH_DEFAULT;
  return Math.round(Math.min(Math.max(width, CHAT_WIDTH_MIN), maxChatWidth(viewportWidth)));
}

/**
 * Where it is stored. A width is not a secret and is this computer's preference, so
 * it lives in `localStorage` — as a file inside the vault it would hand someone
 * else's screen size over every time the folder moved.
 */
export const CHAT_WIDTH_STORAGE_KEY = 'atlas.acp-chat.width';

/** The stored width. `null` when absent or corrupt — the caller then uses the default. */
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

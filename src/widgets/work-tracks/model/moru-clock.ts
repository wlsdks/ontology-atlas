import { MOTION } from '@/shared/motion';

/** A Moru row holds 24 cells of 128 native pixels. */
export const MORU_CELLS = 24;
export const MORU_CELL_PX = 128;
/** A work loop's cell time: the 24 cells take sixteen base beats, as the shared work pace does. */
export const MORU_STEP_MS = (MOTION.base.duration * 1000 * 16) / MORU_CELLS;

/** The selector of a looping Moru in a room whose motion runs. */
const STEPPING = "[data-room-motion='running'] [data-moru-loop]";

/**
 * One clock steps every working Moru on screen, a cell at a time. A CSS sprite loop would make
 * the browser restyle the board on every display frame, eight to fifteen times more often than
 * the art changes; this clock wakes only when a cell changes and only while one is looping.
 */
export function createMoruClock(board: HTMLElement) {
  let cell = 0;
  let timer = 0;
  const step = () => {
    cell = (cell + 1) % MORU_CELLS;
    for (const sprite of board.querySelectorAll<HTMLElement>(STEPPING)) {
      const own = (cell + Number(sprite.dataset.moruLoop)) % MORU_CELLS;
      sprite.style.backgroundPositionX = `${-own * MORU_CELL_PX}px`;
    }
  };
  return {
    /** Runs the clock while a looping Moru is on screen in a visible window, and stops it otherwise. */
    sync(allowed: boolean) {
      const wanted = allowed && !document.hidden && board.querySelector(STEPPING) !== null;
      if (wanted && !timer) timer = window.setInterval(step, MORU_STEP_MS);
      if (!wanted && timer) {
        window.clearInterval(timer);
        timer = 0;
      }
    },
    stop() {
      window.clearInterval(timer);
      timer = 0;
    },
  };
}

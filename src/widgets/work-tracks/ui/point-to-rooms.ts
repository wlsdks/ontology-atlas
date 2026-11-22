import { MOTION } from '@/shared/motion';
import type { RoomAlert } from '../model/room-look';

/** How long the rooms a header warning counts stay outlined after it is clicked. */
const FLASH_MS = MOTION.choreography.duration * 3000;

/**
 * Shows which rooms a header warning counts: scrolls the first into view and outlines each for a
 * moment. Clicking again restarts the outline rather than stacking it.
 */
export function pointToRooms(alert: RoomAlert, reduced: boolean): void {
  const rooms = [...document.querySelectorAll<HTMLElement>(`[data-testid="work-room"][data-room-alert="${alert}"]`)];
  const first = rooms[0];
  if (!first) return;
  first.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  for (const room of rooms) {
    room.dataset.flash = 'false';
    void room.offsetWidth;
    room.dataset.flash = 'true';
    window.clearTimeout(Number(room.dataset.flashTimer));
    room.dataset.flashTimer = String(window.setTimeout(() => {
      delete room.dataset.flash;
      delete room.dataset.flashTimer;
    }, FLASH_MS));
  }
}

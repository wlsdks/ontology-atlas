import { MOTION } from '@/shared/motion';
import type { RoomAlert } from '../model/room-look';

/** How long the rooms a header warning counts stay outlined after it is clicked. */
const FLASH_MS = MOTION.choreography.duration * 3000;

/** Scrolls the first room into view and outlines each for a moment; clicking again restarts the outline rather than stacking it. */
function outline(rooms: readonly HTMLElement[], reduced: boolean): void {
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

/** Shows which rooms a header warning counts. */
export function pointToRooms(alert: RoomAlert, reduced: boolean): void {
  outline([...document.querySelectorAll<HTMLElement>(`[data-testid="work-room"][data-room-alert="${alert}"]`)], reduced);
}

/** Shows the rooms the header's memory or CPU words name, heaviest first. */
export function pointToRoomKeys(keys: readonly string[], reduced: boolean): void {
  const rooms = keys.flatMap(key => {
    const room = document.querySelector<HTMLElement>(`[data-testid="work-room"][data-room-key="${CSS.escape(key)}"]`);
    return room ? [room] : [];
  });
  outline(rooms, reduced);
}

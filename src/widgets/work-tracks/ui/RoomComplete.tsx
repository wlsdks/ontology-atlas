import styles from './rooms.module.css';

/**
 * A merged room's light, mounted once when it starts to leave: the frame and the light inside it
 * flare in success emerald as the `main` stop turns green, then rest lit until the room has gone.
 * With `ring`, a square ring of light also leaves the stop. Stepped in CSS (`.completeGlow`); reduced
 * motion holds the rested light still.
 */
export function RoomComplete({ ring = false }: { ring?: boolean }) {
  return (
    <>
      <i aria-hidden className={styles.completeGlow} />
      <i aria-hidden className={styles.completeRim} data-testid="work-room-complete" />
      {ring ? <i aria-hidden className={styles.stopRing} /> : null}
    </>
  );
}

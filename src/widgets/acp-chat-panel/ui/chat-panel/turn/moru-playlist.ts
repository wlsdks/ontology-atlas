import { CELEBRATION_MOTIONS, type CelebrationMotion, type PlayMotion, type WorkMotion } from '@/shared/ui/marks/moru/moru-rows';

import type { TurnActivityKind } from '../../turn-activity';

/** Each kind's work clips in order; answer text and commands get the laptop scene alone. */
export const WORK_PLAYLIST: Readonly<Record<TurnActivityKind, readonly WorkMotion[]>> = {
  thinking: ['think', 'pondering'],
  reading: ['read', 'follow-link'],
  searching: ['search', 'compare'],
  writing: ['write', 'folder-open'],
  running: ['code'],
  answering: ['code'],
};

const PLAY: readonly PlayMotion[] = ['flipper-groove', 'magic-fish', 'sing', 'hearts'];
const KIND_ORDER = Object.keys(WORK_PLAYLIST) as TurnActivityKind[];
const PLAY_EVERY = 3;

/** FNV-1a over the turn id, so a turn's order repeats on every render and every machine. */
function turnSeed(turnId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < turnId.length; index += 1) {
    hash ^= turnId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The clip for the `loop`th completed loop since the turn entered `kind`. Loops 3, 6, 9 and so on
 * are play, chosen by the turn; the rest walk the kind's work clips from its first. The reader is
 * watching answer text arrive, so `answering` never plays.
 */
export function stageClip(kind: TurnActivityKind, turnId: string, loop: number): WorkMotion | PlayMotion {
  const work = WORK_PLAYLIST[kind];
  const breaks = Math.floor((loop + 1) / PLAY_EVERY);
  if (kind !== 'answering' && (loop + 1) % PLAY_EVERY === 0) {
    return PLAY[(turnSeed(turnId) + KIND_ORDER.indexOf(kind) + breaks - 1) % PLAY.length]!;
  }
  return work[(loop - (kind === 'answering' ? 0 : breaks)) % work.length]!;
}

export function celebrationClip(turnId: string): CelebrationMotion {
  return CELEBRATION_MOTIONS[turnSeed(turnId) % CELEBRATION_MOTIONS.length]!;
}

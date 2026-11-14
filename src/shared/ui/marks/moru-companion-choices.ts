import type { CompanionContext } from './moru-companion-motion';

const folderGestures = ['shy', 'clap', 'dance', 'thinking', 'pondering', 'hearts', 'laugh', 'flipper-groove', 'soft-bow', 'flipper-five', 'hat-tip', 'nose-balance', 'pup-peek', 'heart-gift'] as const;
const gestures = [...folderGestures, 'magic-fish', 'star-sneeze', 'bubble-chase', 'sing'] as const;
export type CompanionGesture = typeof gestures[number];

/** Local variety without repetition, storage or an inferred emotional state. */
export function companionChoices(context: CompanionContext, random = Math.random) {
  const allowed: readonly CompanionGesture[] = context === 'waiting' ? ['soft-bow', 'thinking'] : context === 'folder' ? folderGestures : gestures;
  const discoveries: readonly CompanionGesture[] = context === 'welcome' ? ['nose-balance', 'pup-peek', 'heart-gift', 'star-sneeze'] : ['nose-balance', 'pup-peek', 'heart-gift'];
  let remaining = [...allowed], recent: CompanionGesture[] = [], draws = 0;
  return (): CompanionGesture => {
    if (!remaining.length) remaining = [...allowed];
    const candidates = remaining.filter(id => !recent.includes(id) && (draws !== 1 || context === 'waiting' || discoveries.includes(id)));
    const id = draws === 0 ? context === 'waiting' ? 'soft-bow' : 'shy' : candidates[Math.floor(random() * candidates.length)];
    draws++;
    remaining.splice(remaining.indexOf(id), 1);
    recent = [...recent, id].slice(-Math.min(2, allowed.length - 1));
    return id;
  };
}

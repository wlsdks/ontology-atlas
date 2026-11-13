import type { CompanionContext } from './moru-companion-motion';

const gestures = ['shy', 'clap', 'dance', 'thinking', 'pondering', 'hearts', 'laugh', 'flipper-groove', 'soft-bow', 'flipper-five', 'hat-tip', 'magic-fish'] as const;
export type CompanionGesture = typeof gestures[number];

/** Local variety without repetition, storage or an inferred emotional state. */
export function companionChoices(context: CompanionContext, random = Math.random) {
  const allowed: readonly CompanionGesture[] = context === 'waiting' ? ['soft-bow', 'thinking'] : context === 'folder' ? gestures.slice(0, -1) : gestures;
  let remaining = [...allowed], recent: CompanionGesture[] = [], first = true;
  return (): CompanionGesture => {
    if (!remaining.length) remaining = [...allowed];
    const candidates = remaining.filter(id => !recent.includes(id));
    const id = first ? context === 'waiting' ? 'soft-bow' : 'shy' : candidates[Math.floor(random() * candidates.length)];
    first = false;
    remaining.splice(remaining.indexOf(id), 1);
    recent = [...recent, id].slice(-Math.min(2, allowed.length - 1));
    return id;
  };
}

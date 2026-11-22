/**
 * Native 128px rows Moru acts beside a running agent turn, each a catalogue clip that
 * `pnpm brand:sprites` copies to `public/brand/mascot-<motion>-row-128.png`. Every row
 * starts and ends on the shared neutral pose except `code`, the laptop scene.
 */
export const WORK_ROW_FRAMES = {
  think: 24,
  pondering: 24,
  read: 24,
  'follow-link': 24,
  search: 24,
  compare: 24,
  write: 24,
  'folder-open': 24,
  code: 24,
} as const;
export type WorkMotion = keyof typeof WORK_ROW_FRAMES;

/** Play Moru breaks into between work loops; none of them claims work, progress or meaning. */
export const PLAY_ROW_FRAMES = {
  'flipper-groove': 32,
  'magic-fish': 32,
  sing: 24,
  hearts: 24,
} as const;
export type PlayMotion = keyof typeof PLAY_ROW_FRAMES;

/** Finishing gestures; each has the 24 cells the one-shot sprite keyframe steps through. */
export const CELEBRATION_MOTIONS = ['success', 'clap', 'hop'] as const;
export type CelebrationMotion = (typeof CELEBRATION_MOTIONS)[number];

/**
 * What Moru does while the agent waits on a person's answer: one row per kind of ask, and one per
 * answer within reach. They run at the catalogue's slower beat, as play does.
 */
export const ASK_ROW_FRAMES = {
  'await-permission': 24,
  uncertain: 24,
  'tail-wag': 24,
  stop: 24,
} as const;
export type AskMotion = keyof typeof ASK_ROW_FRAMES;

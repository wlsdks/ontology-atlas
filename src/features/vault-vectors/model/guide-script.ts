import { runSteps, type RunStage, type RunStep } from './stage/run-stage';

/**
 * The first-use guide's sample run: a made-up folder getting ready in twenty seconds, then a
 * question in other words finding its passages. Nothing here reads the person's folder.
 */
export type GuideScene = RunStep | 'done' | 'ask';

/** The sample model's real download, so the sentence states the size the person will see. */
export const GUIDE_MODEL_BYTES = 2_267_310_755;
export const GUIDE_FILES = 24;
export const GUIDE_PASSAGES = 71;
export const GUIDE_PATHS: readonly string[] = [
  'orders/checkout-flow.md',
  'billing/invoice-retry.md',
  'payments/refund-policy.md',
  'auth/session-timeout.md',
  'support/escalation.md',
  'decisions/queue-per-tenant.md',
  'ops/incident-review.md',
  'wiki/payment-failures.md',
];

/**
 * What the sample question finds: passages of the sample files, in English whatever the
 * question's language, since finding the other language's passage is what the sample shows.
 */
export const GUIDE_RESULTS: readonly { text: string; file: string; line: number }[] = [
  { text: 'When a payment fails, the order stays pending for 30 minutes and the customer can retry with another card.', file: 'checkout-flow.md', line: 42 },
  { text: 'Failed charges are retried twice before the invoice is marked unpaid.', file: 'invoice-retry.md', line: 17 },
];

const DOWNLOAD_END_MS = 3000;
const FIT_END_MS = 4600;
const READ_END_MS = 10_600;
const DONE_END_MS = 13_400;
export const GUIDE_LOOP_MS = 20_400;
const FILE_PACE_MS = 750;
const TYPING_DELAY_MS = 400;
const TYPING_MS = 1600;
const FIRST_RESULT_MS = 2400;
const RESULT_STAGGER_MS = 260;

export interface GuideFrame {
  scene: GuideScene;
  stage: RunStage;
  downloadedBytes: number;
  filesDone: number;
  /** How much of the sample question is typed, 0 to 1. */
  typed: number;
  /** Result rows shown under the typed question. */
  results: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (value: number) => (value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2);

/** The frame at `elapsedMs` into the loop; time past one loop wraps to its start. O(1). */
export function guideFrame(elapsedMs: number): GuideFrame {
  const at = ((elapsedMs % GUIDE_LOOP_MS) + GUIDE_LOOP_MS) % GUIDE_LOOP_MS;
  const unread = { filesDone: 0, typed: 0, results: 0 };
  const noFile = { readingPath: null, passagesDone: 0 };

  if (at < DOWNLOAD_END_MS) {
    const fraction = easeInOut(at / DOWNLOAD_END_MS);
    return { ...unread, scene: 'download', downloadedBytes: Math.round(fraction * GUIDE_MODEL_BYTES), stage: { ...noFile, steps: runSteps('download'), step: 'download', fraction } };
  }
  if (at < FIT_END_MS) {
    return { ...unread, scene: 'fit', downloadedBytes: GUIDE_MODEL_BYTES, stage: { ...noFile, steps: runSteps('fit'), step: 'fit', fraction: null } };
  }
  if (at < READ_END_MS) {
    const into = at - FIT_END_MS;
    const fraction = clamp01(into / (READ_END_MS - FIT_END_MS));
    const filesDone = Math.floor(fraction * GUIDE_FILES);
    const readingPath = GUIDE_PATHS[Math.floor(into / FILE_PACE_MS) % GUIDE_PATHS.length]!;
    return {
      scene: 'read', downloadedBytes: GUIDE_MODEL_BYTES, filesDone, typed: 0, results: 0,
      stage: { steps: runSteps('read'), step: 'read', fraction: filesDone / GUIDE_FILES, readingPath, passagesDone: Math.round(fraction * GUIDE_PASSAGES) },
    };
  }
  const finished = { steps: runSteps('finished'), step: 'read' as const, fraction: 1, readingPath: null, passagesDone: GUIDE_PASSAGES };
  if (at < DONE_END_MS) {
    return { scene: 'done', downloadedBytes: GUIDE_MODEL_BYTES, filesDone: GUIDE_FILES, typed: 0, results: 0, stage: finished };
  }
  const into = at - DONE_END_MS;
  const results = into < FIRST_RESULT_MS ? 0 : into < FIRST_RESULT_MS + RESULT_STAGGER_MS ? 1 : 2;
  return {
    scene: 'ask', downloadedBytes: GUIDE_MODEL_BYTES, filesDone: GUIDE_FILES,
    typed: clamp01((into - TYPING_DELAY_MS) / TYPING_MS), results, stage: finished,
  };
}

/** The still frame shown under reduced motion: the payoff, a question answered in other words. */
export const GUIDE_STILL_MS = GUIDE_LOOP_MS - 1;

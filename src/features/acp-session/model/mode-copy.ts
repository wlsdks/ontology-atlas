/**
 * Human words for the working-mode list. An id absent here keeps the adapter's name verbatim
 * with no description, since an invented line would be an unverified promise.
 * `mode-safety.ts` decides what is offered.
 */

/** Only these ids are translated into human words — confirmed from the adapter source. */
export const MEASURED_MODE_IDS = ['default', 'plan', 'auto', 'dontask', 'read-only'] as const;

export type MeasuredModeId = (typeof MEASURED_MODE_IDS)[number];

const normalize = (id: unknown): string =>
  typeof id === 'string' ? id.trim().toLowerCase() : '';

/**
 * This mode's translation key, or `null` (use the adapter's name verbatim).
 *
 * It uses two keys, `modeName.<id>` and `modeHint.<id>`. Ids are lowercased because the notation
 * differs per adapter (`dontAsk`, `read-only`).
 */
export function modeCopyKey(modeId: unknown): MeasuredModeId | null {
  const key = normalize(modeId);
  return (MEASURED_MODE_IDS as readonly string[]).includes(key)
    ? (key as MeasuredModeId)
    : null;
}

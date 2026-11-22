/** Human words for the working-mode list; an id absent here keeps the adapter's name verbatim, since an invented line would be an unverified promise. */

export const MEASURED_MODE_IDS = ['default', 'plan', 'auto', 'dontask', 'read-only'] as const;

export type MeasuredModeId = (typeof MEASURED_MODE_IDS)[number];

const normalize = (id: unknown): string =>
  typeof id === 'string' ? id.trim().toLowerCase() : '';

/** Two keys, `modeName.<id>` and `modeHint.<id>`; ids are lowercased because the notation differs per adapter (`dontAsk`, `read-only`). */
export function modeCopyKey(modeId: unknown): MeasuredModeId | null {
  const key = normalize(modeId);
  return (MEASURED_MODE_IDS as readonly string[]).includes(key)
    ? (key as MeasuredModeId)
    : null;
}

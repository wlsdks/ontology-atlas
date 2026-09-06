/**
 * Split a duration into the parts a label needs. Pure, so the agent chip and the
 * conversation's status word format the same number the same way through their own
 * messages; neither invents a clock format of its own.
 */
export function elapsedParts(ms: number): { hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

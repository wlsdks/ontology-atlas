import { formatReviewValue } from './meaning-units';

/**
 * The guards the agent attached to its own write request (confirmation flag, the file times it
 * expects), shown as evidence beside the review. A `_mtime` number is a time in milliseconds: it is
 * shown as a date, with the exact number kept for the tooltip.
 */
export function proposalGuards(
  rawInput: Record<string, unknown>,
  formatEpoch: (epochMs: number) => string,
) {
  return ['confirm', 'expected_mtime', 'expected_into_mtime']
    .filter((key) => rawInput[key] !== undefined)
    .map((key) => {
      const value = rawInput[key];
      const epoch = key.endsWith('_mtime') && typeof value === 'number' && Number.isFinite(value)
        ? value
        : null;
      return {
        key,
        value,
        shown: epoch === null ? formatReviewValue(value) : formatEpoch(epoch),
        exact: epoch === null ? undefined : String(epoch),
      };
    });
}

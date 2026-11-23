/** Abilities one request to an agent put on the map in the measured runs (31, 18 and 24); the spec's planning rate. */
const ABILITIES_PER_REQUEST = 24;

/** The most abilities one request put on the map in those runs: what one request can be trusted to finish. */
export const ABILITIES_ONE_REQUEST_REACHES = 31;

/** Minutes one request took in the measured runs (97 to 129 seconds each). */
export const MINUTES_PER_REQUEST = 2;

/** One finished request of a mapping run: what it put on the map and how long it took. */
export interface MappingRequestResult {
  gained: number;
  durationMs: number;
}

/** The requests to an agent that `uncovered` abilities off the map are expected to take; at least one, and one for a count that is not one. */
export function estimateRequests(uncovered: number): number {
  if (!Number.isSafeInteger(uncovered)) return 1;
  return Math.max(1, Math.ceil(uncovered / ABILITIES_PER_REQUEST));
}

/**
 * Whole minutes left for `uncovered` abilities: the measured constants before any request has
 * finished, then the run's own abilities and time per request. Null when no rate can be said,
 * such as when the finished requests gained nothing.
 */
export function remainingMinutes(uncovered: number, finished: readonly MappingRequestResult[]): number | null {
  if (!Number.isFinite(uncovered) || uncovered < 0) return null;
  if (uncovered === 0) return 0;
  if (finished.length === 0) return estimateRequests(uncovered) * MINUTES_PER_REQUEST;
  const gained = finished.reduce((sum, request) => sum + request.gained, 0);
  const durationMs = finished.reduce((sum, request) => sum + Math.max(0, request.durationMs), 0);
  if (gained <= 0) return null;
  const requestsLeft = Math.ceil(uncovered / (gained / finished.length));
  const minutesPerRequest = durationMs / finished.length / 60_000;
  return Math.ceil(requestsLeft * minutesPerRequest);
}

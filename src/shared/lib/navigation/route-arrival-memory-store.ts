/**
 * **The store behind `useArrivalMemory`, with no React in it.**
 *
 * Why it is a file of its own rather than three functions at the top of
 * `route-arrival-memory.ts`: `vitest.setup.ts` has to forget this memory between cases, and
 * importing it from the hook's module pulled **React into every test file's setup graph** —
 * measured at 128 ms of setup per file against 101 ms without, so roughly +27 ms × 1026 files
 * on CI. That lands on the one resource an oversubscribed two-core runner has none of, and it
 * is the wrong thing for a `Map.clear()` to cost.
 *
 * The memory lives for the life of the tab. It is deliberately not `sessionStorage`: a value
 * from a previous run of the app would be drawn before anything had verified the folder still
 * says so, and that is a different and worse defect than a skeleton.
 *
 * `route-arrival-memory.ts` re-exports all three, so callers keep one import.
 */
const memory = new Map<string, unknown>();

/** The last value remembered under `key`, or `undefined` if there is none. */
export function readArrivalMemory<T>(key: string): T | undefined {
  return memory.has(key) ? (memory.get(key) as T) : undefined;
}

/** Remembers `value` under `key` for the life of the tab. */
export function writeArrivalMemory<T>(key: string, value: T): void {
  memory.set(key, value);
}

/** Test-only: forgets everything, so one case cannot seed the next. */
export function clearArrivalMemory(): void {
  memory.clear();
}

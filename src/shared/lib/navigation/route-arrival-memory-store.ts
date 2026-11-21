/**
 * React-free, so `vitest.setup.ts` can clear it without pulling React into every test's setup.
 * Tab-lifetime, not `sessionStorage`: a previous run's value would draw before the folder was
 * verified.
 */
const memory = new Map<string, unknown>();

export function readArrivalMemory<T>(key: string): T | undefined {
  return memory.has(key) ? (memory.get(key) as T) : undefined;
}

export function writeArrivalMemory<T>(key: string, value: T): void {
  memory.set(key, value);
}

/** Test-only: forgets everything, so one case cannot seed the next. */
export function clearArrivalMemory(): void {
  memory.clear();
}

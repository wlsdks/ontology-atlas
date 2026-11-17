/** Where a service import lands inside the opened folder: a fixed set, never a path a caller sends. */
export type ImportDestination = 'sources' | 'planning';

let requested: ImportDestination | null = null;

/** Asks the Library to open its service import for `destination` the next time it mounts. */
export function requestLibraryImport(destination: ImportDestination): void {
  requested = destination;
}

/** The pending request; reading it is pure, so a first render may call it more than once. */
export function pendingLibraryImport(): ImportDestination | null {
  return requested;
}

export function clearLibraryImportRequest(): void {
  requested = null;
}

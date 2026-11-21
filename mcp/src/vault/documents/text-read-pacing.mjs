/**
 * A pass's text is garbage as soon as each file is parsed, but bun's collector, left
 * to itself, lets a 50,000-file pass's worth pile up and keeps the allocator's pages
 * under it for many calls. So, under bun only (Node exposes no collector):
 * - every {@link COLLECT_EVERY_CHARS} characters read, the reader asks for a
 *   collection that runs alongside it (`Bun.gc(false)`); a full, synchronous one
 *   there measured no lower;
 * - every {@link COLLECT_AFTER_CHARS} characters read, a full collection runs once
 *   the call's synchronous work is done.
 * Measured on the compiled server at 50,000 files: both steps lower footprint and peak.
 */
const COLLECT_EVERY_CHARS = 4 * 1024 * 1024;
const COLLECT_AFTER_CHARS = 16 * 1024 * 1024;
let collectionScheduled = false;

let charsSinceStep = 0;
let charsSinceFull = 0;

/** Counts text read from vault files, by a load pass or a body read back, and collects as above. */
export function noteTextRead(chars) {
  if (!globalThis.Bun) return;
  charsSinceStep += chars;
  charsSinceFull += chars;
  if (charsSinceStep >= COLLECT_EVERY_CHARS) {
    charsSinceStep = 0;
    globalThis.Bun.gc(false);
  }
  if (charsSinceFull >= COLLECT_AFTER_CHARS && !collectionScheduled) {
    charsSinceFull = 0;
    collectionScheduled = true;
    setTimeout(() => {
      collectionScheduled = false;
      globalThis.Bun.gc(true);
    }, 0).unref?.();
  }
}

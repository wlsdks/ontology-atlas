export function scheduleStateSync(sync: () => void) {
  queueMicrotask(sync);
}

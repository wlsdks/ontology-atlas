/**
 * Defers a React state mutation to the next microtask. Named rather than calling
 * `queueMicrotask` at the call site, so the intent (deferred state sync) is explicit.
 *
 * It lived in `views/docs-vault/lib/persistence.ts` until 2026-09-06, and moved down
 * here when the reading pane became a widget: two of its hooks call it, and a widget
 * cannot import a view. `persistence.ts` re-exports it, so the ~20 call sites inside
 * Docs keep their import and there is still exactly one definition.
 */
export function scheduleStateSync(sync: () => void) {
  queueMicrotask(sync);
}

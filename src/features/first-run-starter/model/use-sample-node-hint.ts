import { useCallback, useEffect, useState } from 'react';
import {
  readSampleNodeHintDismissed,
  writeSampleNodeHintDismissed,
} from './sample-node-hint';
import { useFirstRunSampleModeSettled } from './use-first-run-sample-mode-settled';

/**
 * Display logic for the one-time map hint on a first visit in sample mode ("press a
 * node on the map — every one is a real document").
 *
 * **Display contract**: visible only when static sample mode has settled
 * (`useFirstRunSampleModeSettled`), it has not been permanently dismissed, and no
 * node is currently selected. The first node click (i.e. `hasSelection` turning
 * true) retires it **permanently** (localStorage). Connecting a real vault turns the
 * sample-settled gate off and it disappears on its own.
 *
 * Avoiding popup soup: this hook decides only "should it show", and the render is a
 * single `pointer-events-none` label over the map (`SampleNodeHint`) — no separate
 * modal or floating stack.
 *
 * @param hasSelection Is a node currently selected on the map (state owned by HomePage).
 */
export function useSampleNodeHint(hasSelection: boolean) {
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const [dismissed, setDismissed] = useState(() => readSampleNodeHintDismissed());

  const dismiss = useCallback(() => {
    writeSampleNodeHintDismissed();
    setDismissed(true);
  }, []);

  // The first node click (a selection occurring) means the lesson landed → permanent
  // retirement. A selection can also arise from a deeplink rather than a click, but
  // however a node gains focus the hint's purpose is already served, so it retires the
  // same way. The display itself is already switched off immediately by `!hasSelection`
  // in `visible` below, so this effect handles only the permanent record — deferred to
  // a microtask to avoid a synchronous setState (the cascading-render warning), as this
  // repository does elsewhere.
  useEffect(() => {
    if (!hasSelection || dismissed) return;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (!cancelled) dismiss();
    });
    return () => {
      cancelled = true;
    };
  }, [hasSelection, dismissed, dismiss]);

  const visible = sampleModeSettled && !dismissed && !hasSelection;

  return { visible, dismiss };
}

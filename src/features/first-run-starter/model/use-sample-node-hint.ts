import { useCallback, useEffect, useState } from 'react';
import {
  readSampleNodeHintDismissed,
  writeSampleNodeHintDismissed,
} from './sample-node-hint';
import { useFirstRunSampleModeSettled } from './use-first-run-sample-mode-settled';

/**
 * Shows the one-time sample-mode hint while sample mode has settled, it is not dismissed, and no
 * node is selected. The first selection retires it permanently (localStorage).
 *
 * @param hasSelection Is a node selected on the map (state owned by HomePage).
 */
export function useSampleNodeHint(hasSelection: boolean) {
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const [dismissed, setDismissed] = useState(() => readSampleNodeHintDismissed());

  const dismiss = useCallback(() => {
    writeSampleNodeHintDismissed();
    setDismissed(true);
  }, []);

  // Any selection, click or deeplink, retires the hint permanently. Display already follows
  // `!hasSelection`; the record is deferred to a microtask to avoid a synchronous setState.
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

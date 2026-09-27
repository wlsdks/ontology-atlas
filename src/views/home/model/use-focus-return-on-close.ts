import { useEffect, useRef } from "react";
import { focusWhenReady } from "../lib/topology-focus-return";

/**
 * When `open` turns false, focus returns to the first existing `testIds` element if it was
 * stranded on `<body>`.
 * Watching the flag covers every close path; a close that placed focus itself is left alone.
 */
export function useFocusReturnOnClose(open: boolean, testIds: readonly string[]): void {
  const wasOpen = useRef(open);
  const targets = useRef(testIds);
  useEffect(() => {
    targets.current = testIds;
  });
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return undefined;
    return focusWhenReady(targets.current);
  }, [open]);
}

import { useEffect, useRef } from "react";
import { focusWhenReady } from "../../lib/keyboard/topology-focus-return";

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

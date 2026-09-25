import { useEffect, useRef } from "react";
import { focusWhenReady } from "../lib/topology-focus-return";

/**
 * **When `open` turns false, focus goes back to where the surface came from** — the first of
 * `testIds` that exists — if closing left it stranded on `<body>`.
 *
 * One rule for the map's canvas surfaces (interaction audit, 2026-09-25): the add-to-map and
 * create dialogs, full detail and the tour each closed by their own path (Escape, a cancel
 * button, a finish button, the backdrop), and most of those paths dropped focus on `<body>`,
 * so the next Tab started from the top of the page. Watching the open flag covers every path
 * at once; a close that already placed focus (a surface that returns it itself) is left alone.
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

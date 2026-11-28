import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  copyCanvasAtCssSize,
  isMapLayoutMorphArmed,
  publishMapLayoutSnapshot,
  type MapLayoutMark,
} from "@/shared/lib/map-canvas/map-layout-morph-store";

/**
 * When the tree unmounts for an armed view switch, publishes its last drawn marks and a copy of
 * its canvas, so the switch starts from the picture on screen. `read` and `ground` may change on
 * every render; the latest ones are used.
 */
export function useTreeMorphSnapshot(canvasRef: RefObject<HTMLCanvasElement | null>, read: () => MapLayoutMark[], ground: string): void {
  const latest = useRef({ read, ground });
  useLayoutEffect(() => {
    latest.current = { read, ground };
  });
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (!isMapLayoutMorphArmed()) return;
      publishMapLayoutSnapshot({ marks: latest.current.read(), bitmap: copyCanvasAtCssSize(canvas), ground: latest.current.ground });
    };
  }, [canvasRef]);
}

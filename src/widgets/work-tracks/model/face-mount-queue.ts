/** How many hidden faces may draw their content in one frame. */
export const FACES_PER_FRAME = 2;

const waiting = new Set<() => void>();
let frame = 0;

function flush() {
  frame = 0;
  for (const mount of [...waiting].slice(0, FACES_PER_FRAME)) {
    waiting.delete(mount);
    mount();
  }
  if (waiting.size > 0) frame = requestAnimationFrame(flush);
}

/**
 * Draws a face that is still hidden a few frames later, a couple per frame, so a building update
 * that gives many rooms new faces does not lay them all out in its first frame. Returns the cancel.
 */
export function mountWhenFree(mount: () => void): () => void {
  waiting.add(mount);
  if (!frame) frame = requestAnimationFrame(flush);
  return () => {
    waiting.delete(mount);
    if (waiting.size === 0 && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

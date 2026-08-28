/**
 * A stroke that looks drawn by a hand rather than emitted by a machine.
 *
 * ⚠️ **This is notation, not decoration.** The screen carries two kinds of fact and has always
 * been careful not to let them read alike: a **reviewed profile** is what a person declared, and
 * **measured traffic** is what the scanner counted. Until now the only thing separating them was
 * a legend sentence. Here the stroke itself carries it — a declared intent is drawn with a human's
 * unsteady line, an observation with a machine's exact one — so a reader can tell a rule from a
 * measurement without reading anything.
 *
 * The technique is the one Excalidraw uses (Rough.js, MIT): offset the path's points slightly and
 * draw it more than once, so the two passes disagree the way two pencil strokes do. Implemented
 * here rather than taken as a dependency because straight segments and rounded rectangles are all
 * this surface draws, that is roughly forty lines, and the repository requires a reason for every
 * new package.
 *
 * ⚠️ **Deterministic.** The wobble comes from a hash of the shape's own id, never from
 * `Math.random`, so the same architecture always draws the same picture. A diagram that changes
 * every time it is opened cannot be compared with the one in yesterday's screenshot, and this
 * product's whole claim is that its drawing is derived rather than authored.
 */

/** Cheap deterministic 32-bit hash. Same string, same wobble, forever. */
function hashOf(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A deterministic sequence in [-1, 1], advanced by the caller. */
function wobbler(seed: string): () => number {
  let state = hashOf(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

export interface SketchOptions {
  /**
   * How far a point may drift, in pixels.
   *
   * ⚠️ Measured by zooming into the installed app on 2026-08-28: at 1.4 the two passes could sit
   * 2.8px apart, and a 62px box then read as a **double-walled border** rather than as one line
   * drawn twice. A hand's second pass lands close to its first; the give-away of a sketch is that
   * the two lines touch and part, not that they run parallel.
   */
  amplitude?: number;
  /** How many passes to draw. Two reads as drawn; three reads as scribbled. */
  passes?: number;
}

/**
 * ⚠️ **The second pass echoes the first; it does not draw its own line.**
 *
 * Each pass used to take fresh noise, so on a short edge the two could bow in opposite directions
 * and the pair read as one thick, leaning line — a rectangle looking like a parallelogram, which
 * in ISO 5807 is a different symbol entirely. Measured on the installed app, then in the geometry:
 * no single path leaned more than 1.12 degrees, but the long edges bowed 0.3–1.3% of their length
 * while the short ones bowed 1.4–2.6%, so the divergence concentrated exactly where the eye reads
 * a shape's uprightness.
 *
 * A hand that goes round twice lands near its own first line, not near the true rectangle. So the
 * wobble is drawn once per shape and the second pass repeats it with a small deviation.
 */
function echo(base: number, next: () => number, spread: number): number {
  return base + next() * spread;
}

/**
 * One pass of a line between two points that were already drifted by the caller.
 *
 * ⚠️ **The endpoints arrive drifted; this function must not drift them again.** Drifting inside
 * here is what produced the defect the owner caught on 2026-08-28: every corner was computed twice
 * with different noise, so the shape never closed and each corner grew a visible tail. A hand
 * lifts and re-lands slightly off, but it lands on the corner it just left, not two pixels past
 * it. Only the control point carries new noise, which is what bows the segment.
 */
function sketchSegment(
  from: readonly [number, number],
  to: readonly [number, number],
  bows: readonly [number, number],
  amplitude: number,
): string {
  /*
   * ⚠️ **The bow scales with the segment's length.** A flat multiple of the amplitude bowed a
   * 148px edge by 1.4px, which at 1× is no bow at all: measured on the built export on
   * 2026-08-28, the two rectangles read as ruled while only the stadium caps looked drawn — and
   * half the notation is the claim that a declared rule looks hand-drawn. A hand's wobble is
   * proportional to how far it travels, not a constant. `next()` is still consumed twice
   * whatever the length, so the sequence stays aligned across passes.
   */
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const bow = amplitude * (2 + length / 60);
  const cx = (from[0] + to[0]) / 2 + bows[0] * bow;
  const cy = (from[1] + to[1]) / 2 + bows[1] * bow;
  return `M ${from[0].toFixed(2)} ${from[1].toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)}, ${to[0].toFixed(
    2,
  )} ${to[1].toFixed(2)}`;
}

/** Two passes of a rectangle, drawn edge by edge the way a hand would. */
export function sketchRect(
  seed: string,
  x: number,
  y: number,
  width: number,
  height: number,
  { amplitude = 0.9, passes = 2 }: SketchOptions = {},
): string[] {
  const next = wobbler(seed);
  /* One hand, one wobble: drawn once for the shape, then repeated with a small deviation. */
  const cornerDrift = Array.from({ length: 8 }, () => next() * amplitude);
  const edgeBows = Array.from({ length: 8 }, () => next());
  const spread = amplitude * 0.4;

  return Array.from({ length: passes }, (_unused, pass) => {
    const first = pass === 0;
    const at = (index: number, value: number) =>
      value + (first ? cornerDrift[index]! : echo(cornerDrift[index]!, next, spread));
    /* Corners are drifted once and then shared by the two edges that meet there, so the outline
       closes. See `sketchSegment` for what happens when they are not. */
    const corners: [number, number][] = [
      [at(0, x), at(1, y)],
      [at(2, x + width), at(3, y)],
      [at(4, x + width), at(5, y + height)],
      [at(6, x), at(7, y + height)],
    ];
    return corners
      .map((corner, index) => {
        const bows: [number, number] = first
          ? [edgeBows[index * 2]!, edgeBows[index * 2 + 1]!]
          : [echo(edgeBows[index * 2]!, next, 0.3), echo(edgeBows[index * 2 + 1]!, next, 0.3)];
        return sketchSegment(corner, corners[(index + 1) % corners.length]!, bows, amplitude);
      })
      .join(' ');
  });
}

/**
 * Two passes of a stadium: a rectangle whose left and right ends are half-circles.
 *
 * ISO 5807's terminator, which this drawing gives to a role at either end of the declared chain.
 * The caps are real arcs rather than a large corner radius, because the standard's shape is a
 * stadium and a rounded rectangle is a different symbol.
 */
export function sketchStadium(
  seed: string,
  x: number,
  y: number,
  width: number,
  height: number,
  { amplitude = 0.9, passes = 2 }: SketchOptions = {},
): string[] {
  const next = wobbler(seed);
  const radius = height / 2;
  /* One hand, one wobble — see `echo`. The caps and tangents are drawn once and repeated. */
  const capDrift = next() * amplitude;
  const tangentDrift = Array.from({ length: 8 }, () => next() * amplitude);
  const spread = amplitude * 0.4;

  return Array.from({ length: passes }, (_unused, pass) => {
    const first = pass === 0;
    /*
     * ⚠️ The caps wobble too. With an exact radius the straight edges were unsteady while the two
     * arcs were machine-perfect, and the eye reads that mixture as a mistake rather than as a
     * drawing (zoomed inspection, installed app, 2026-08-28). A hand does not suddenly become a
     * compass at the corner.
     */
    const capRadius = radius + (first ? capDrift : echo(capDrift, next, spread));
    /* The four tangent points where a straight edge meets a cap, each drifted once and reused by
       both the line and the arc that share it, so the outline closes. */
    const at = (index: number, value: number) =>
      value + (first ? tangentDrift[index]! : echo(tangentDrift[index]!, next, spread));
    const topLeft: [number, number] = [at(0, x + radius), at(1, y)];
    const topRight: [number, number] = [at(2, x + width - radius), at(3, y)];
    const bottomRight: [number, number] = [at(4, x + width - radius), at(5, y + height)];
    const bottomLeft: [number, number] = [at(6, x + radius), at(7, y + height)];
    return (
      `M ${topLeft[0].toFixed(2)} ${topLeft[1].toFixed(2)} ` +
      `L ${topRight[0].toFixed(2)} ${topRight[1].toFixed(2)} ` +
      `A ${capRadius.toFixed(2)} ${capRadius.toFixed(2)} 0 0 1 ${bottomRight[0].toFixed(2)} ${bottomRight[1].toFixed(2)} ` +
      `L ${bottomLeft[0].toFixed(2)} ${bottomLeft[1].toFixed(2)} ` +
      `A ${capRadius.toFixed(2)} ${capRadius.toFixed(2)} 0 0 1 ${topLeft[0].toFixed(2)} ${topLeft[1].toFixed(2)} Z`
    );
  });
}

/** One hand-drawn connector from a to b, bowing through the given control x. */
export function sketchConnector(
  seed: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bow: number,
  { amplitude = 1.1 }: SketchOptions = {},
): string {
  const next = wobbler(seed);
  const drift = () => next() * amplitude;
  /* The same rule as `sketchSegment`: a longer reach wanders further. */
  const sag = () => next() * amplitude * (1 + Math.abs(bx - ax) / 70);
  return (
    `M ${(ax + drift()).toFixed(2)} ${(ay + drift()).toFixed(2)} ` +
    `C ${(ax + bow).toFixed(2)} ${(ay + sag()).toFixed(2)}, ` +
    `${(bx - bow).toFixed(2)} ${(by + sag()).toFixed(2)}, ` +
    `${(bx + drift()).toFixed(2)} ${(by + drift()).toFixed(2)}`
  );
}

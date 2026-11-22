/**
 * Plain numbers in and out, no three.js or clock, so ordering and settling are unit-tested. Marks
 * arrive documents first, then write-ups, then citations. Reduced motion asks for `t = 1`: every
 * mark is home.
 */

/** Where a mark is, partway through its arrival. */
export interface AssemblyStep {
  /** 0 at the start of this mark's own travel, 1 once it is home. */
  progress: number;
  /** Multiply the mark's final position by this to get its position now. */
  distance: number;
  /** Extra rotation to add to the mark's resting tumble, in radians. */
  spin: number;
  /** 0–1; the scene multiplies opacity and emission by it so a mark fades in as it lands. */
  presence: number;
}

export interface AssemblySchedule {
  /** How long one mark takes to travel, ms. */
  travelMs: number;
  /** Gap between one mark setting off and the next, ms. */
  strideMs: number;
  /** Delay before the first mark of this group sets off, ms. */
  delayMs: number;
}

/**
 * Documents, then write-ups, then citations. Strides are short against `travelMs` so the groups
 * overlap; a strictly sequential assembly would read as a loading bar.
 */
export const SOURCE_ASSEMBLY: AssemblySchedule = { travelMs: 900, strideMs: 26, delayMs: 0 };
export const PAGE_ASSEMBLY: AssemblySchedule = { travelMs: 820, strideMs: 46, delayMs: 420 };
/** Citations do not travel; they draw themselves on once both their ends have landed. */
export const LINK_ASSEMBLY: AssemblySchedule = { travelMs: 620, strideMs: 14, delayMs: 1180 };

/** How far outside the object a mark starts, as a multiple of its resting radius. */
const LAUNCH_RADIUS = 3.4;

/**
 * Travel time grows with the square root of the distance: an outer-shell mark twice as far takes
 * about 1.4 times as long, so far marks do not move faster than near ones.
 */
const DISTANCE_TIME_EXPONENT = 0.5;
/** Turns a mark makes on the way in. */
const LAUNCH_SPIN = Math.PI * 1.5;

/** Fast, then asymptotically slow. No overshoot: this is an arrival, not a bounce. */
function easeOutCubic(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - (1 - clamped) ** 3;
}

/**
 * Where the `index`-th mark of a group is at `elapsedMs`: at launch distance and invisible before
 * its stride begins, exactly home after its travel ends, so the settled object equals the
 * reduced-motion still frame.
 */
export function assemblyStep(
  elapsedMs: number,
  index: number,
  schedule: AssemblySchedule,
  /** The mark's resting radius, 0–1; marks further out are given longer to arrive. Omitted, every mark takes `travelMs`. */
  restingRadius = 1,
): AssemblyStep {
  const started = elapsedMs - schedule.delayMs - index * schedule.strideMs;
  if (started <= 0) {
    return { progress: 0, distance: LAUNCH_RADIUS, spin: LAUNCH_SPIN, presence: 0 };
  }
  const reach = Math.max(0.05, Math.min(1, restingRadius));
  const travelMs = schedule.travelMs * reach ** DISTANCE_TIME_EXPONENT;
  if (started >= travelMs) {
    return { progress: 1, distance: 1, spin: 0, presence: 1 };
  }
  const eased = easeOutCubic(started / travelMs);
  return {
    progress: eased,
    distance: LAUNCH_RADIUS + (1 - LAUNCH_RADIUS) * eased,
    spin: LAUNCH_SPIN * (1 - eased),
    // Presence runs ahead of travel: a mark is fully lit before it stops moving.
    presence: Math.min(1, eased * 1.6),
  };
}

/** When every mark of an object is home, ms; the host stops stepping the assembly and may sleep after it. */
export function assemblyDurationMs(counts: {
  sources: number;
  pages: number;
  links: number;
}): number {
  // `travelMs` is the longest any mark takes (full resting radius), so it bounds "everything has landed".
  const end = (schedule: AssemblySchedule, count: number) =>
    count <= 0 ? 0 : schedule.delayMs + (count - 1) * schedule.strideMs + schedule.travelMs;
  return Math.max(
    end(SOURCE_ASSEMBLY, counts.sources),
    end(PAGE_ASSEMBLY, counts.pages),
    end(LINK_ASSEMBLY, counts.links),
  );
}

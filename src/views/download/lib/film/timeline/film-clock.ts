export interface FilmClock {
  advance(dtMs: number): number;
  progress(): number;
  fade(): number;
  act(): number;
  seek(act: number): void;
  resting(): boolean;
  elapsed(): number;
}

export function createFilmClock(
  spans: readonly (readonly [number, number])[],
  durationsMs: readonly number[],
  { holdMs = 1400, fadeMs = 400 }: { holdMs?: number; fadeMs?: number } = {},
): FilmClock {
  const starts = durationsMs.map((_, i) => durationsMs.slice(0, i).reduce((a, b) => a + b, 0));
  const total = durationsMs.reduce((a, b) => a + b, 0);
  const cycle = total + holdMs + fadeMs;
  let elapsed = 0;

  const actOf = (t: number) => {
    for (let i = durationsMs.length - 1; i >= 0; i -= 1) if (t >= starts[i]) return i;
    return 0;
  };
  const progressAt = (t: number) => {
    if (t >= total) return 1;
    const i = actOf(t);
    const local = (t - starts[i]) / durationsMs[i];
    const [from, to] = spans[i];
    return from + (to - from) * local;
  };

  return {
    advance(dtMs) {
      elapsed = (elapsed + Math.max(0, dtMs)) % cycle;
      return progressAt(elapsed);
    },
    progress: () => progressAt(elapsed),
    fade() {
      if (elapsed < fadeMs) return elapsed / fadeMs;
      if (elapsed > total + holdMs) return 1 - (elapsed - total - holdMs) / fadeMs;
      return 1;
    },
    act: () => (elapsed >= total ? durationsMs.length - 1 : actOf(elapsed)),
    resting: () => elapsed >= total && elapsed <= total + holdMs,
    elapsed: () => elapsed,
    seek(act) {
      elapsed = act === 0 ? fadeMs : starts[Math.min(act, starts.length - 1)];
    },
  };
}

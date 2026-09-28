export function maxOf(values: Iterable<number>, floor = Number.NEGATIVE_INFINITY): number {
  let most = floor;
  for (const value of values) if (value > most) most = value;
  return most;
}

export function minOf(values: Iterable<number>, ceiling = Number.POSITIVE_INFINITY): number {
  let least = ceiling;
  for (const value of values) if (value < least) least = value;
  return least;
}

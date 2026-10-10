export function zeroCounts(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

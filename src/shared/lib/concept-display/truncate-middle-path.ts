/** Truncates a long file path in the middle, keeping the leading directory and the trailing filename visible: a tail-only truncation hides which top-level folder a row lives in. Deterministic: a fixed character budget, no DOM measurement. */
export function truncateMiddlePath(path: string, maxLength = 44): string {
  const trimmed = path.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const ellipsis = "…";
  const budget = Math.max(maxLength - ellipsis.length, 2);
  const tailLength = Math.max(Math.floor(budget * 0.55), 8);
  const headLength = Math.max(budget - tailLength, 4);
  return `${trimmed.slice(0, headLength)}${ellipsis}${trimmed.slice(trimmed.length - tailLength)}`;
}

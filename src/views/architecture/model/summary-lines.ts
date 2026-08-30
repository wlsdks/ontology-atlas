/**
 * Break a role's sentence into the caption lines its box can hold.
 *
 * Budgeted by characters rather than by CSS, because an SVG text node neither wraps nor
 * ellipsizes on its own. Words wrap greedily; only the last line is ellipsized, and only when
 * something was actually left out. A single word longer than the budget is hard-cut rather than
 * allowed to cross the outline.
 *
 * ⚠️ **Two lines, not one** (Direction C, 2026-08-30). One 34-character line cut every one of the
 * dogfood profile's seven sentences before its first clause carried meaning; the record that put
 * the sentence there had written that outcome down as its own falsifier, and it fired at 7 of 7.
 * Two lines of the same budget carry every first clause (the longest is 51 characters).
 */
export function splitSummaryLines(summary: string, budget: number, maxLines: number): string[] {
  const words = summary.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let index = 0;

  while (index < words.length && lines.length < maxLines) {
    let line = '';
    while (index < words.length) {
      const next = line ? `${line} ${words[index]}` : words[index];
      if (next.length > budget) break;
      line = next;
      index += 1;
    }
    if (!line) {
      const word = words[index];
      line = word.slice(0, budget);
      const rest = word.slice(budget);
      if (rest) words[index] = rest;
      else index += 1;
    }
    lines.push(line);
  }

  if (index < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    const room = budget - 1;
    const boundary = last.lastIndexOf(' ', room);
    const cut =
      last.length <= room ? last.length : boundary > room - 10 ? boundary : room;
    lines[lines.length - 1] = `${last.slice(0, cut).trimEnd()}…`;
  }

  return lines;
}

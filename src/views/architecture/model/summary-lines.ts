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
export function splitSummaryLines(
  summary: string,
  budget: number | readonly number[],
  maxLines: number,
): string[] {
  const words = summary.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let index = 0;
  const budgetFor = (line: number) =>
    typeof budget === 'number' ? budget : (budget[line] ?? budget[budget.length - 1] ?? 0);

  while (index < words.length && lines.length < maxLines) {
    const lineBudget = budgetFor(lines.length);
    let line = '';
    while (index < words.length) {
      const next = line ? `${line} ${words[index]}` : words[index];
      if (next.length > lineBudget) break;
      line = next;
      index += 1;
    }
    if (!line) {
      const word = words[index];
      line = word.slice(0, lineBudget);
      const rest = word.slice(lineBudget);
      if (rest) words[index] = rest;
      else index += 1;
    }
    lines.push(line);
  }

  if (index < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    const room = budgetFor(lines.length - 1) - 1;
    const boundary = last.lastIndexOf(' ', room);
    const cut =
      last.length <= room ? last.length : boundary > room - 10 ? boundary : room;
    lines[lines.length - 1] = `${last.slice(0, cut).trimEnd()}…`;
  }

  return lines;
}

/** A conservative width for one caption glyph at 9.5px: the widest measured line was 4.39px per character. */
const CAPTION_CHAR_PX = 4.7;
/** The box's side padding, and the smallest budget a line may fall to before it stops being a line. */
const CAPTION_SIDE_PAD = 12;
const CAPTION_MIN_CHARS = 8;
/** How far a caption glyph reaches above and below its baseline at 9.5px. */
const GLYPH_ABOVE = 8;
const GLYPH_BELOW = 3;

/**
 * How many characters each caption line may hold, read off the box it sits in.
 *
 * ⚠️ **The box tells the sentence how much room each line has** (owner, 2026-08-30, pointing at
 * the Adapters pill on the four-role profile, where both lines crossed the outline). The first
 * budget was one constant, measured once on the 180px receipt box and never on the 148px one,
 * and it treated a stadium as a rectangle. A stadium's caps are circles of radius `boxH / 2`, so
 * the width available at a given height is the straight middle plus the chord of the cap at that
 * height: a line lower in the box has less room than one at the equator. The budget for a line
 * is the narrower of the chords at its glyph top and bottom, less the side padding.
 */
export function captionLineBudgets({
  boxW,
  boxH,
  shape,
  baselines,
}: {
  boxW: number;
  boxH: number;
  shape: 'process' | 'terminator';
  /** Each caption baseline, relative to the box top. */
  baselines: readonly number[];
}): number[] {
  const rectBudget = Math.floor((boxW - CAPTION_SIDE_PAD * 2) / CAPTION_CHAR_PX);
  if (shape === 'process') return baselines.map(() => Math.max(CAPTION_MIN_CHARS, rectBudget));
  const r = boxH / 2;
  const straight = Math.max(0, boxW - boxH);
  const chordAt = (y: number) => {
    const d = Math.abs(y - r);
    return straight + 2 * Math.sqrt(Math.max(0, r * r - d * d));
  };
  return baselines.map((baseline) => {
    const usable =
      Math.min(chordAt(baseline - GLYPH_ABOVE), chordAt(baseline + GLYPH_BELOW)) -
      CAPTION_SIDE_PAD * 2;
    return Math.max(CAPTION_MIN_CHARS, Math.min(rectBudget, Math.floor(usable / CAPTION_CHAR_PX)));
  });
}

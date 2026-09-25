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

/**
 * A conservative width for one narrow caption glyph at 9.5px. Linux Pretendard measured one seeded
 * ledger caption at 157px against 156px of room when the former 4.7 estimate allowed 33
 * characters. 4.8 lowers that case to 32 without changing the type or box geometry.
 */
const CAPTION_CHAR_PX = 4.8;
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

/**
 * The width a caption glyph takes at 9.5px, by script. A Hangul or Han glyph is close to square
 * (about 8px); Latin averages 4.8px. The character budgets above assumed Latin, so the first
 * Korean role sentences ran past both outlines of a 280px face (owner, 2026-09-03).
 */
const WIDE_CAPTION_CHAR_PX = 8;
const WIDE_SCRIPT = /[\u1100-\u11ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]/u;

export function estimateCaptionWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    width += WIDE_SCRIPT.test(character) ? WIDE_CAPTION_CHAR_PX : CAPTION_CHAR_PX;
  }
  return width;
}

/** The type size the caption estimates above were measured at. */
const CAPTION_FONT_PX = 9.5;

/**
 * The caption estimate read at another step of the type ramp. Glyph width grows linearly with
 * the size, so a line of `fontPx` type is `fontPx / 9.5` times as wide as the same line at the
 * caption step.
 */
export function estimateTextWidthAt(text: string, fontPx: number): number {
  return (estimateCaptionWidth(text) * fontPx) / CAPTION_FONT_PX;
}

/**
 * `splitSummaryLinesByWidth` for text set larger than a caption: the room is converted into
 * caption units, so the same greedy wrap and the same last-line ellipsis apply at any size.
 */
export function splitLinesByWidthAt(
  text: string,
  roomPx: number,
  maxLines: number,
  fontPx: number,
): string[] {
  return splitSummaryLinesByWidth(text, (roomPx * CAPTION_FONT_PX) / fontPx, maxLines);
}

/** A line that ends a clause: the break a reader expects, in either script. */
const CLAUSE_END = /[,.;:!?、。，]$/u;
/** How much wider than the balanced measure a clause break may make the block. */
const CLAUSE_BREAK_SLACK = 1.08;

/**
 * `text-wrap: balance` for SVG text, which has no wrapping of its own: the same number of lines
 * the greedy wrap needs, at the narrowest room that still holds them, so the last line is never a
 * lone word under a full one ("…where that / differs." measured on the architecture canvas's
 * empty column, 2026-09-26). Among breaks within a few percent of that measure, the one that ends
 * lines on a clause wins: the Korean sentence of that empty column balanced 9px narrower with its
 * verb pushed under its object than with the break after its comma, and read worse. A wrap that
 * had to ellipsize is returned as it was.
 */
export function balanceLinesByWidthAt(
  text: string,
  roomPx: number,
  maxLines: number,
  fontPx: number,
): string[] {
  const greedy = splitLinesByWidthAt(text, roomPx, maxLines, fontPx);
  const fits = (lines: readonly string[]) =>
    lines.length === greedy.length && !(lines.at(-1) ?? '').endsWith('…');
  if (greedy.length <= 1 || !fits(greedy)) return greedy;
  /* The greedy line count only falls as the room grows, so the narrowest room is a bisection. */
  let narrow = 0;
  let wide = roomPx;
  for (let step = 0; step < 16; step += 1) {
    const middle = (narrow + wide) / 2;
    if (fits(splitLinesByWidthAt(text, middle, maxLines, fontPx))) wide = middle;
    else narrow = middle;
  }
  const balanced = splitLinesByWidthAt(text, wide, maxLines, fontPx);
  const clauseBreaks = (lines: readonly string[]) =>
    lines.slice(0, -1).filter((line) => CLAUSE_END.test(line)).length;
  /* Every room at which the greedy wrap changes is the width of some run of words, so those
     widths are the only candidates worth trying. */
  const words = text.trim().split(/\s+/);
  const ceiling = Math.min(roomPx, wide * CLAUSE_BREAK_SLACK);
  let best = balanced;
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= words.length; end += 1) {
      const room = estimateTextWidthAt(words.slice(start, end).join(' '), fontPx);
      if (room < wide || room > ceiling) continue;
      const lines = splitLinesByWidthAt(text, room, maxLines, fontPx);
      if (fits(lines) && clauseBreaks(lines) > clauseBreaks(best)) best = lines;
    }
  }
  return best;
}

/** The straight room a rectangle face leaves a caption line, in SVG units. */
export function captionLineRoom(boxW: number): number {
  return Math.max(CAPTION_MIN_CHARS * CAPTION_CHAR_PX, boxW - CAPTION_SIDE_PAD * 2);
}

/**
 * `splitSummaryLines`, budgeted by estimated width instead of by character count, so a Korean
 * sentence wraps where its glyphs actually reach. Words wrap greedily; a single word wider than
 * the room is cut by width; only the last line is ellipsized, and only when something was left
 * out, with the ellipsis itself counted against the room.
 */
export function splitSummaryLinesByWidth(
  summary: string,
  roomPx: number | readonly number[],
  maxLines: number,
): string[] {
  const words = summary.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let index = 0;
  const roomFor = (line: number) =>
    typeof roomPx === 'number' ? roomPx : (roomPx[line] ?? roomPx[roomPx.length - 1] ?? 0);
  const fitByWidth = (word: string, room: number) => {
    let cut = '';
    for (const character of word) {
      if (estimateCaptionWidth(cut + character) > room) break;
      cut += character;
    }
    return cut;
  };

  while (index < words.length && lines.length < maxLines) {
    const room = roomFor(lines.length);
    let line = '';
    while (index < words.length) {
      const next = line ? `${line} ${words[index]}` : words[index];
      if (estimateCaptionWidth(next) > room) break;
      line = next;
      index += 1;
    }
    if (!line) {
      const word = words[index];
      const cut = fitByWidth(word, room) || [...word][0] || '';
      const rest = word.slice(cut.length);
      line = cut;
      if (rest) words[index] = rest;
      else index += 1;
    }
    lines.push(line);
  }

  if (index < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    const room = roomFor(lines.length - 1) - estimateCaptionWidth('…');
    let kept = last;
    while (kept && estimateCaptionWidth(kept) > room) kept = kept.slice(0, -1);
    const boundary = kept.lastIndexOf(' ');
    const cut = kept.length < last.length && boundary > 0 && estimateCaptionWidth(kept) - estimateCaptionWidth(kept.slice(0, boundary)) < 48
      ? kept.slice(0, boundary)
      : kept;
    lines[lines.length - 1] = `${cut.trimEnd()}…`;
  }

  return lines;
}

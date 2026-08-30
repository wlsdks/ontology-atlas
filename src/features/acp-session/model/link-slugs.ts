/**
 * Picks **names of nodes that really exist** out of chat text.
 *
 * ## Why "only known names" (owner instruction, 2026-08-17)
 *
 * Owner: *"hovering in the chat could highlight our node"* (hovering in the chat could highlight our node). That requires knowing which characters in the text are a node.
 *
 * The common approach — link anything shaped like `a/b` — cannot be used here. An agent's answers are
 * full of file paths (`src/features/acp-session/model/x.ts`), URLs, and dates, and turning all of
 * them into nodes creates **a link on every other word that goes nowhere when pressed.** Meeting one
 * such link once stops a person pressing any of the others.
 *
 * We have the graph, so there is no reason to guess: **only known names are picked.** False positives
 * are zero, and a new node is picked up automatically from the day it exists.
 *
 * ## Boundary rules
 *
 * Not picked when flanked by word characters (`xcapabilities/invoicey` is a different name). But
 * parentheses, quotes, full stops, and backticks do count as boundaries — that is how names are
 * actually used in a sentence. And **longer names go first**: picking the shorter one first splits
 * `a/b-c` into `a/b` + `-c`.
 */

interface PlainSegment {
  text: string;
}

interface SlugSegment {
  text: string;
  slug: string;
}

export type LinkedSegment = PlainSegment | SlugSegment;

/** Is this **a standalone word** rather than part of a name? */
const WORD_CHAR = /[A-Za-z0-9_/.-]/;

function isBoundary(char: string | undefined): boolean {
  if (char === undefined) return true;
  return !WORD_CHAR.test(char);
}

/**
 * The **trailing** boundary. One full stop makes its rule differ from the leading one: the `.` in
 * `capabilities/invoice.md` is an extension and part of the name, while the `.` in
 * `capabilities/invoice.` ends a sentence and is a boundary. What separates them is the character
 * **after** that stop.
 */
function isTrailingBoundary(text: string, at: number): boolean {
  const char = text[at];
  if (char === undefined) return true;
  if (char === '.') return !/[A-Za-z0-9]/.test(text[at + 1] ?? '');
  return !WORD_CHAR.test(char);
}

export function linkSlugs(text: string, known: ReadonlySet<string>): LinkedSegment[] {
  if (text.length === 0) return [];
  if (known.size === 0) return [{ text }];

  // Longer names first — a shorter one biting first truncates the tail.
  const candidates = [...known].filter((s) => s.length > 0).sort((a, b) => b.length - a.length);

  const out: LinkedSegment[] = [];
  let cursor = 0;
  let plainFrom = 0;

  outer: while (cursor < text.length) {
    for (const slug of candidates) {
      if (!text.startsWith(slug, cursor)) continue;
      // Flanked by word characters it is merely part of a name. A tail like `.md` is caught here too —
      // `capabilities/invoice.md` is a file, not a reference to that node.
      if (!isBoundary(text[cursor - 1])) continue;
      if (!isTrailingBoundary(text, cursor + slug.length)) continue;

      if (plainFrom < cursor) out.push({ text: text.slice(plainFrom, cursor) });
      out.push({ text: slug, slug });
      cursor += slug.length;
      plainFrom = cursor;
      continue outer;
    }
    cursor += 1;
  }

  if (plainFrom < text.length) out.push({ text: text.slice(plainFrom) });
  return out;
}

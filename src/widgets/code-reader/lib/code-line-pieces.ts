/**
 * Unicode's embedding, override and isolate controls. Invisible, they reorder how a line reads, so
 * code can show one thing and run another; the reader draws each as its code point instead.
 */
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/g;

export type CodeLinePiece = { kind: "text"; text: string } | { kind: "control"; codePoint: string };

/** `line` split into plain text and the bidi controls in it, in order. O(line length). */
export function codeLinePieces(line: string): CodeLinePiece[] {
  const pieces: CodeLinePiece[] = [];
  let start = 0;
  for (const match of line.matchAll(BIDI_CONTROL)) {
    if (match.index > start) pieces.push({ kind: "text", text: line.slice(start, match.index) });
    const codePoint = match[0].codePointAt(0)!.toString(16).toUpperCase();
    pieces.push({ kind: "control", codePoint: `U+${codePoint}` });
    start = match.index + match[0].length;
  }
  if (start < line.length) pieces.push({ kind: "text", text: line.slice(start) });
  return pieces;
}

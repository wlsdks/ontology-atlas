/** List items and quotes continue across a blank line. */
const CONTINUES = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|^>/;
/** Indentation and list or quote markers before a line's own content. */
const PREFIXES = /^(?:[ \t]*(?:[-*+]|\d{1,9}[.)]|>))*[ \t]*/;
/** Definitions and raw HTML reach across blocks, so such a text stays whole. */
const REACHES_ACROSS = /^(?:\[[^\]]+\]:|<)/;
const FENCE_AT_START = /^(`{3,}|~{3,})(.*)$/;
const FENCE_MARKER = /^(?:`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const BLANK = /^[ \t]*$/;

/**
 * Cuts at a blank line before a column-0 block start outside fences; pieces render as the whole. O(n).
 * Earlier pieces never change, except a definition or raw HTML makes the text one piece; a fence in
 * a list, quote or indentation stops cutting after the piece holding it.
 */
export function splitMarkdownBlocks(text: string): string[] {
  const starts = [0];
  let fence: { char: string; length: number } | null = null;
  let frozen = false;
  let previousBlank = false;
  let at = 0;
  for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', at)) {
    const line = text.slice(at, text[end - 1] === '\r' ? end - 1 : end);
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      previousBlank = false;
    } else if (BLANK.test(line)) {
      previousBlank = true;
    } else {
      const inner = line.replace(PREFIXES, '');
      if (REACHES_ACROSS.test(inner)) return [text];
      const opener = FENCE_AT_START.exec(line);
      const opens = opener !== null && !(opener[1][0] === '`' && opener[2].includes('`'));
      if (!opens && FENCE_MARKER.test(inner)) frozen = true;
      if (!frozen && previousBlank && line[0] !== ' ' && line[0] !== '\t' && !CONTINUES.test(line)) starts.push(at);
      if (opens) fence = { char: opener[1][0], length: opener[1].length };
      previousBlank = false;
    }
    at = end + 1;
  }
  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length));
}

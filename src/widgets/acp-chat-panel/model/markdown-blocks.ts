/** List items and quotes continue across a blank line. */
const CONTINUES = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|^>/;
/** Definitions and raw HTML reach across blocks, so such a text stays whole. */
const REACHES_ACROSS = /^ {0,3}(?:\[[^\]]+\]:|<)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Cuts `text` where a blank line meets a column-0 block start outside fences, so the pieces render
 * the same apart as together. O(n); only complete lines decide, so earlier pieces never change.
 */
export function splitMarkdownBlocks(text: string): string[] {
  const starts = [0];
  let fence: { char: string; length: number } | null = null;
  let previousBlank = false;
  let at = 0;
  for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', at)) {
    const line = text.slice(at, end);
    const marker = FENCE.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && marker[2].trim() === '') fence = null;
      previousBlank = false;
    } else if (line.trim() === '') {
      previousBlank = true;
    } else {
      if (REACHES_ACROSS.test(line)) return [text];
      const opens = marker !== null && !(marker[1][0] === '`' && marker[2].includes('`'));
      if (previousBlank && line[0] !== ' ' && line[0] !== '\t' && !CONTINUES.test(line)) starts.push(at);
      if (opens) fence = { char: marker[1][0], length: marker[1].length };
      previousBlank = false;
    }
    at = end + 1;
  }
  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length));
}

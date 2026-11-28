/**
 * `indexOf` for a text searched forward many times: each needle's last answer
 * is reused while the new start falls before it, so any number of searches for
 * one needle read the text about once.
 */
function forwardFinder(text) {
  const source = String(text);
  const last = new Map();
  return (needle, from) => {
    const held = last.get(needle);
    if (held && from >= held.from && (held.at < 0 || from <= held.at)) return held.at;
    const at = source.indexOf(needle, from);
    last.set(needle, { from, at });
    return at;
  };
}

/**
 * `text` with each span from an `opener` match to the nearest `closer` after it
 * removed, in one forward pass: a comment, a docstring, a fenced block, an
 * import list. `closer` may depend on the match (`"""` closes `"""`); `after`, a
 * sticky pattern, must also match right after the closer for the span to count.
 * An opener without a closer stays as written.
 */
export function withoutSpans(text, opener, closer, { after = null } = {}) {
  const source = String(text);
  const find = forwardFinder(source);
  const pattern = new RegExp(opener.source, opener.flags.includes('g') ? opener.flags : `${opener.flags}g`);
  const refused = new Set();
  let output = '';
  let kept = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match[0] === '') { pattern.lastIndex += 1; continue; }
    const close = typeof closer === 'function' ? closer(match) : closer;
    const at = find(close, match.index + match[0].length);
    if (at < 0) continue;
    let end = at + close.length;
    if (after) {
      if (refused.has(end)) continue;
      after.lastIndex = end;
      const tail = after.exec(source);
      if (!tail) { refused.add(end); continue; }
      end += tail[0].length;
    }
    output += source.slice(kept, match.index);
    kept = end;
    pattern.lastIndex = end;
  }
  return output + source.slice(kept);
}

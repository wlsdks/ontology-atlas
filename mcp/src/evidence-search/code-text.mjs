/**
 * Source text with its comments and string literals blanked, so the family
 * count matches declarations and class headers in code only: a subclass shown
 * in a docstring, a template string or a comment is not a class. One forward
 * pass; every blanked UTF-16 code unit becomes one space and every line break
 * stays, so offsets (JavaScript string indices) and line numbers are those of
 * the original text.
 *
 * The pass says `uncertain` instead of guessing: a string or comment still open
 * at the end of the text, a quoted string that meets a line break, templates
 * nested past a small cap, and a `/` after a name, `)`, `]` or `}` that could
 * still start a regular expression, where the two readings differ (a quote or
 * backtick between it and the next `/`). A `${…}` part is read as code. A caller that
 * needs certainty reads nothing from an uncertain file.
 *
 * Covered: JavaScript and TypeScript (line and block comments, quoted strings,
 * template literals with their `${…}` parts, regular expression literals),
 * Python (comments, quoted and triple-quoted strings), Go (comments, quoted,
 * rune and raw strings) and Rust (comments, nested block comments, quoted,
 * raw and character literals). Another language is returned as it is.
 */

import { languageOf } from './import-bindings.mjs';

// Templates nested inside `${…}` parts past this depth make the pass uncertain.
const TEMPLATE_DEPTH = 8;

const isWord = (code) => (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff;

// After one of these, a `/` can only start a regular expression.
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
// After one of these words, too: `return /x/.test(s)`.
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/**
 * @param {string} text
 * @param {string} path repository-relative path; its extension picks the language
 * @returns {{ code: string, literalStarts: Set<number>, uncertain: boolean }} the blanked text, the offsets where a string literal opens, and whether any part could not be read with certainty
 */
export function blankLiterals(text, path) {
  const language = languageOf(path);
  const literalStarts = new Set();
  if (!['js', 'py', 'go', 'rs'].includes(language)) return { code: text, literalStarts, uncertain: false };
  const n = text.length;
  const chunks = [];
  let kept = 0;
  let uncertain = false;
  const blank = (from, to) => {
    if (to <= from) return;
    // No `u` flag: each code unit, half of a surrogate pair included, becomes one space.
    chunks.push(text.slice(kept, from), text.slice(from, to).replace(/[^\n]/g, ' '));
    kept = to;
  };
  const lineEnd = (from) => {
    const end = text.indexOf('\n', from);
    return end < 0 ? n : end;
  };
  /** The end of a string opened by `quote` at `from`, past its closing quote; a line break or the end of the text first makes the pass uncertain. */
  const quoted = (from, quote, oneLine) => {
    for (let at = from + 1; at < n; at += 1) {
      const char = text[at];
      if (char === '\\') at += 1;
      else if (char === quote) return at + 1;
      else if (char === '\n' && oneLine) {
        uncertain = true;
        return at;
      }
    }
    uncertain = true;
    return n;
  };
  /** Past `close` from `from`, or the end of the text, uncertain. */
  const through = (from, close) => {
    const at = text.indexOf(close, from);
    if (at >= 0) return at + close.length;
    uncertain = true;
    return n;
  };
  /** The end of a template literal opened at `from`, its `${…}` parts and the templates inside them included. */
  const template = (from, depth) => {
    // Past the cap the enclosing template is left unclosed, which makes the pass uncertain.
    if (depth > TEMPLATE_DEPTH) return n;
    let at = from + 1;
    while (at < n) {
      const char = text[at];
      if (char === '\\') at += 2;
      else if (char === '`') return at + 1;
      else if (char === '$' && text[at + 1] === '{') {
        let braces = 1;
        let before = '{';
        at += 2;
        while (at < n && braces > 0) {
          const inner = text[at];
          if (inner === '`') {
            at = template(at, depth + 1);
            before = 'a';
            continue;
          }
          if (inner === '"' || inner === "'") {
            at = quoted(at, inner, true);
            before = 'a';
            continue;
          }
          if (inner === '/') {
            const end = slash(at, before);
            if (end > at) {
              at = end;
              before = 'a';
              continue;
            }
          }
          if (inner === '{') braces += 1;
          else if (inner === '}') braces -= 1;
          if (inner !== ' ' && inner !== '\t' && inner !== '\n' && inner !== '\r') before = isWord(text.charCodeAt(at)) ? 'a' : inner;
          at += 1;
        }
      } else at += 1;
    }
    uncertain = true;
    return n;
  };
  /** The end of a regular expression literal at `from`, or -1 when the line ends first. */
  const regex = (from) => {
    let inClass = false;
    for (let at = from + 1; at < n; at += 1) {
      const char = text[at];
      if (char === '\n') return -1;
      if (char === '\\') at += 1;
      else if (char === '[') inClass = true;
      else if (char === ']') inClass = false;
      else if (char === '/' && !inClass) return at + 1;
    }
    return -1;
  };
  const jsx = /\.[jt]sx$/u.test(path);
  /** The word that ends just before `from`, spaces skipped, up to a dozen characters. */
  const wordBefore = (from) => {
    let end = from;
    while (end > 0 && (text[end - 1] === ' ' || text[end - 1] === '\t')) end -= 1;
    let start = end;
    while (start > 0 && end - start < 12 && isWord(text.charCodeAt(start - 1))) start -= 1;
    return text.slice(start, end);
  };
  const quoteBetween = (from, to) => {
    for (let at = from; at < to; at += 1) if (text[at] === '"' || text[at] === "'" || text[at] === '`') return true;
    return false;
  };
  // A `/` whose regular expression would not close before this offset will not close one on its line.
  let noRegexBefore = 0;
  /**
   * What a JavaScript `/` at `from` opens after the code character `before`:
   * the end of a comment or regular expression, or -1 for a division. Where the
   * division and the regular expression would read strings differently, the
   * pass is uncertain.
   */
  const slash = (from, before) => {
    if (text[from + 1] === '/') return lineEnd(from);
    if (text[from + 1] === '*') return through(from + 2, '*/');
    if (from < noRegexBefore) return -1;
    const close = regex(from);
    if (close < 0) {
      noRegexBefore = lineEnd(from);
      return -1;
    }
    // `</` closes a JSX tag.
    if (before === '<' && jsx) return -1;
    if (REGEX_AFTER.has(before) || (before === 'a' && REGEX_AFTER_WORDS.has(wordBefore(from)))) return close;
    // After a name, `)`, `]` or `}` the `/` is read as division.
    if (quoteBetween(from + 1, close - 1)) uncertain = true;
    return -1;
  };

  let previous = '';
  let at = 0;
  while (at < n) {
    const char = text[at];
    const next = text[at + 1];
    let end = -1;
    let literal = false;
    if (language === 'py') {
      if (char === '#') end = lineEnd(at);
      else if (char === '"' || char === "'") {
        literal = true;
        const triple = char.repeat(3);
        if (text.startsWith(triple, at)) {
          end = -1;
          for (let close = at + 3; close < n; close += 1) {
            if (text[close] === '\\') close += 1;
            else if (text.startsWith(triple, close)) {
              end = close + 3;
              break;
            }
          }
          if (end < 0) {
            uncertain = true;
            end = n;
          }
        } else end = quoted(at, char, true);
      }
    } else if (char === '/' && next === '/') end = lineEnd(at);
    else if (char === '/' && next === '*') {
      if (language === 'rs') {
        let depth = 0;
        end = -1;
        for (let close = at; close < n; close += 1) {
          if (text[close] === '/' && text[close + 1] === '*') {
            depth += 1;
            close += 1;
          } else if (text[close] === '*' && text[close + 1] === '/') {
            depth -= 1;
            close += 1;
            if (depth === 0) {
              end = close + 1;
              break;
            }
          }
        }
        if (end < 0) {
          uncertain = true;
          end = n;
        }
      } else end = through(at + 2, '*/');
    } else if (language === 'js') {
      if (char === '"' || char === "'") {
        literal = true;
        end = quoted(at, char, true);
      } else if (char === '`') {
        literal = true;
        end = template(at, 0);
      } else if (char === '/') end = slash(at, previous);
    } else if (language === 'go') {
      if (char === '"' || char === "'") {
        literal = true;
        end = quoted(at, char, true);
      } else if (char === '`') {
        literal = true;
        end = through(at + 1, '`');
      }
    } else if (language === 'rs') {
      const raw = char === 'r' && (next === '"' || next === '#') && !isWord(text.charCodeAt(at - 1)) ? /^r(#*)"/.exec(text.slice(at, at + 260)) : null;
      if (raw) {
        literal = true;
        end = through(at + raw[0].length, `"${raw[1]}`);
      } else if (char === '"') {
        literal = true;
        end = quoted(at, '"', false);
      } else if (char === "'") {
        // A character literal closes within a few code units; a lifetime (`'a`) does not close at all.
        if (next === '\\') {
          for (let close = at + 2; close < Math.min(n, at + 12); close += 1) {
            if (text[close] === '\n') break;
            if (text[close] === "'") {
              end = close + 1;
              break;
            }
          }
        } else if (next !== '\n' && text[at + 2] === "'") end = at + 3;
        else if (isHighSurrogate(text.charCodeAt(at + 1)) && text[at + 3] === "'") end = at + 4;
        literal = end > 0;
      }
    }
    if (end > at) {
      if (literal) literalStarts.add(at);
      blank(at, end);
      previous = 'a';
      at = end;
      continue;
    }
    if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') previous = isWord(text.charCodeAt(at)) ? 'a' : char;
    at += 1;
  }
  chunks.push(text.slice(kept));
  return { code: chunks.join(''), literalStarts, uncertain };
}

/**
 * The lines an import reader may read: the original text, but a line that
 * starts inside a comment, or inside a string that opened on an earlier line,
 * is empty. Import specifiers are strings, so they are read from the original.
 *
 * @param {string} text the original text
 * @param {{ code: string, literalStarts: Set<number> }} blanked `blankLiterals(text)`
 */
export function importLines(text, { code, literalStarts }) {
  const lines = text.split('\n');
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const first = line.search(/\S/);
    const at = offset + first;
    if (first >= 0 && code[at] !== text[at] && !literalStarts.has(at)) lines[index] = '';
    offset += line.length + 1;
  }
  return lines;
}

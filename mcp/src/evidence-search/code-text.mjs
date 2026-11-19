/**
 * Source text with its comments and string literals blanked, so a pattern that
 * looks for declarations and class headers matches code only: a subclass shown
 * in a docstring, a template string or a comment is not a class. One forward
 * pass; every blanked character becomes a space and every line break stays, so
 * offsets and line numbers are those of the original text.
 *
 * Covered: JavaScript and TypeScript (line and block comments, quoted strings,
 * template literals with their `${…}` parts, regular expression literals),
 * Python (comments, quoted and triple-quoted strings), Go (comments, quoted,
 * rune and raw strings) and Rust (comments, nested block comments, quoted,
 * raw and character literals). Another language is returned as it is.
 */

import { languageOf } from './import-bindings.mjs';

// Templates nested inside `${…}` parts read before the rest of the text is taken as one literal.
const TEMPLATE_DEPTH = 32;

const isWord = (code) => (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;

// After one of these, a `/` starts a regular expression rather than a division.
const BEFORE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

/**
 * @param {string} text
 * @param {string} path repository-relative path; its extension picks the language
 * @returns {{ code: string, literalStarts: Set<number> }} the blanked text, and the offsets where a string literal opens
 */
export function blankLiterals(text, path) {
  const language = languageOf(path);
  const literalStarts = new Set();
  if (!['js', 'py', 'go', 'rs'].includes(language)) return { code: text, literalStarts };
  const n = text.length;
  const chunks = [];
  let kept = 0;
  const blank = (from, to) => {
    if (to <= from) return;
    chunks.push(text.slice(kept, from), text.slice(from, to).replace(/[^\n]/gu, ' '));
    kept = to;
  };
  const lineEnd = (from) => {
    const end = text.indexOf('\n', from);
    return end < 0 ? n : end;
  };
  /** The end of a string opened by `quote` at `from`: past its closing quote, or at the line break when it may not span lines. */
  const quoted = (from, quote, oneLine) => {
    for (let at = from + 1; at < n; at += 1) {
      const char = text[at];
      if (char === '\\') at += 1;
      else if (char === quote) return at + 1;
      else if (char === '\n' && oneLine) return at;
    }
    return n;
  };
  /** The end of a JavaScript template literal opened at `from`, its `${…}` parts and the templates inside them included; past `TEMPLATE_DEPTH` nested templates, the rest of the text. */
  const template = (from, depthOfTemplates = 0) => {
    if (depthOfTemplates > TEMPLATE_DEPTH) return n;
    let at = from + 1;
    while (at < n) {
      const char = text[at];
      if (char === '\\') at += 2;
      else if (char === '`') return at + 1;
      else if (char === '$' && text[at + 1] === '{') {
        let depth = 1;
        at += 2;
        while (at < n && depth > 0) {
          const inner = text[at];
          if (inner === '{') depth += 1;
          else if (inner === '}') depth -= 1;
          else if (inner === '`') {
            at = template(at, depthOfTemplates + 1);
            continue;
          } else if (inner === '"' || inner === "'") {
            at = quoted(at, inner, true);
            continue;
          }
          at += 1;
        }
      } else at += 1;
    }
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

  let previous = '';
  // A `/` that opened no regular expression before this offset will not open one again on its line.
  let noRegexBefore = 0;
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
          end = n;
          for (let close = at + 3; close < n; close += 1) {
            if (text[close] === '\\') close += 1;
            else if (text.startsWith(triple, close)) {
              end = close + 3;
              break;
            }
          }
        } else end = quoted(at, char, true);
      }
    } else if (char === '/' && next === '/') end = lineEnd(at);
    else if (char === '/' && next === '*') {
      if (language === 'rs') {
        let depth = 0;
        end = n;
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
      } else {
        const close = text.indexOf('*/', at + 2);
        end = close < 0 ? n : close + 2;
      }
    } else if (language === 'js') {
      if (char === '"' || char === "'") {
        literal = true;
        end = quoted(at, char, true);
      } else if (char === '`') {
        literal = true;
        end = template(at);
      } else if (char === '/' && at >= noRegexBefore && BEFORE_REGEX.has(previous)) {
        end = regex(at);
        if (end < 0) noRegexBefore = lineEnd(at);
      }
    } else if (language === 'go') {
      if (char === '"' || char === "'") {
        literal = true;
        end = quoted(at, char, true);
      } else if (char === '`') {
        literal = true;
        const close = text.indexOf('`', at + 1);
        end = close < 0 ? n : close + 1;
      }
    } else if (language === 'rs') {
      const raw = char === 'r' && (next === '"' || next === '#') && !isWord(text.charCodeAt(at - 1)) ? /^r(#*)"/u.exec(text.slice(at, at + 260)) : null;
      if (raw) {
        literal = true;
        const close = text.indexOf(`"${raw[1]}`, at + raw[0].length);
        end = close < 0 ? n : close + 1 + raw[1].length;
      } else if (char === '"') {
        literal = true;
        end = quoted(at, '"', false);
      } else if (char === "'") {
        // A character literal closes within a few characters; a lifetime (`'a`) does not close at all.
        if (next === '\\') {
          for (let close = at + 2; close < Math.min(n, at + 12); close += 1) {
            if (text[close] === '\n') break;
            if (text[close] === "'") {
              end = close + 1;
              break;
            }
          }
        } else if (next !== '\n' && text[at + 2] === "'") end = at + 3;
        else if (next !== '\n' && text[at + 3] === "'" && /[\uD800-\uDBFF]/u.test(next ?? '')) end = at + 4;
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
    if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') previous = isWord(text.charCodeAt(at)) || char === '$' ? 'a' : char;
    at += 1;
  }
  chunks.push(text.slice(kept));
  return { code: chunks.join(''), literalStarts };
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
    const first = line.search(/\S/u);
    const at = offset + first;
    if (first >= 0 && code[at] !== text[at] && !literalStarts.has(at)) lines[index] = '';
    offset += line.length + 1;
  }
  return lines;
}

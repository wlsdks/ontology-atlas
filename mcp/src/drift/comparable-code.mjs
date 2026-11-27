/**
 * A source file reduced to what can change its behaviour: comments removed where the
 * extension's comment syntax is known (JSX comment children included), JS/TS import
 * and re-export declarations and Rust `use` declarations removed, then every
 * whitespace character removed. Two revisions with equal results differ only in
 * comments, imports, spacing or blank lines.
 *
 * The scanner only ever errs toward keeping text: an unterminated string, comment or
 * template, or a construct it does not delimit (a heredoc, a raw string form it does
 * not read), makes the whole file compare by whitespace alone. The screen and the MCP
 * server import this one module, so their verdicts cannot disagree.
 */

const SLASH = { line: '//', block: true };

// Bindings may hold comments: `import {\n  a, // why\n} from 'x'`.
const BINDING = String.raw`(?:[\w$*{}\s,]|\/\/[^\n]*|\/\*[\s\S]*?\*\/)`;
/**
 * A JS/TS import or re-export declaration: `import x from 'm'`, `import 'm'`,
 * `export { a } from 'm'`, `export * as ns from 'm'`. Moving one changes nothing
 * unless some other line changes with it. A dynamic `import('m')` is code and stays.
 */
const JS_IMPORT = new RegExp(
  String.raw`^(?:import\s*(?:${BINDING}*?\bfrom\s*)?|export\s*(?:type\b\s*)?(?:\*(?:\s*as\s+[\w$]+)?|\{${BINDING}*?\})\s*from\s*)(['"])[^'"\n\\]*\1\s*;?`,
);
/** A Rust `use` declaration, `pub` or `pub(crate)` included. */
const RUST_USE = /^(?:pub(?:\s*\([^)]*\))?\s+)?use\s[^;]*;/;
// A JSX comment child: `{/* why */}`. Removing only the comment would leave `{}` behind.
const BRACED_COMMENT = /^\{\s*\/\*[\s\S]*?\*\/\s*\}/;

/** One entry per known language; an extension absent below compares by whitespace alone. */
const LANGUAGES = {
  js: { ...SLASH, template: true, regex: true, jsx: true, imports: JS_IMPORT, importWords: ['import', 'export'] },
  rust: { ...SLASH, nested: true, rust: true, multilineStrings: true, imports: RUST_USE, importWords: ['use', 'pub'] },
  java: { ...SLASH, triple: ['"""'] },
  kotlin: { ...SLASH, nested: true, triple: ['"""'], rawTriple: true, backtickName: true },
  go: { ...SLASH, backtickRaw: true, keepLine: /^\/\/(go:|\s*\+build)/ },
  swift: { ...SLASH, nested: true, triple: ['"""'], backtickName: true, unread: /#+"/ },
  c: { ...SLASH, unread: /R"/ },
  csharp: { ...SLASH, triple: ['"""'], rawTriple: true, verbatim: true },
  scala: { ...SLASH, nested: true, triple: ['"""'], rawTriple: true, backtickName: true },
  dart: { ...SLASH, nested: true, triple: ['"""', "'''"], rawPrefix: true },
  // Plain CSS has no line comment: `url(http://x)` is a value.
  css: { line: null, block: true, cssUrl: true },
  scss: { ...SLASH, cssUrl: true },
  python: { line: '#', hash: 'anywhere', triple: ['"""', "'''"], shebang: true },
  shell: { line: '#', hash: 'word-start', singleRaw: true, multilineStrings: true, shebang: true, unread: /<</ },
  ruby: {
    line: '#',
    hash: 'word-start',
    multilineStrings: true,
    shebang: true,
    unread: /<<[~-]?['"`A-Za-z_]|^=begin|%[qQwWiIrsx]?[{([<|!]/m,
  },
  toml: { line: '#', hash: 'anywhere', triple: ['"""', "'''"], literalSingle: true },
};

const EXTENSIONS = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  go: 'go',
  swift: 'swift',
  c: 'c', h: 'c', cc: 'c', cpp: 'c', hpp: 'c',
  cs: 'csharp',
  scala: 'scala',
  dart: 'dart',
  css: 'css',
  scss: 'scss',
  py: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  rb: 'ruby',
  toml: 'toml',
  yaml: 'yaml', yml: 'yaml',
};

const WHITESPACE = /\s+/g;
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);

/** The comment language a path is read in, or `null` when only whitespace is ignored. */
export function commentLanguageOf(path) {
  if (typeof path !== 'string') return null;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * @param {string} text
 * @param {string} path
 * @returns {string}
 */
export function comparableCode(text, path) {
  const source = String(text ?? '');
  const language = commentLanguageOf(path);
  let stripped = null;
  if (language === 'yaml') stripped = stripYamlComments(source);
  else if (language) stripped = stripComments(source, LANGUAGES[language]);
  return (stripped ?? source).replace(WHITESPACE, '');
}

/**
 * Removes comments, or returns `null` when the file holds something this scanner does
 * not delimit with certainty.
 */
function stripComments(text, spec) {
  if (spec.unread && spec.unread.test(text)) return null;
  const out = [];
  const n = text.length;
  let i = 0;
  // The last significant character and word outside comments, for regex detection.
  let lastSignificant = '';
  let lastWord = '';
  // The brace depth at each open `${` of a JS template, innermost last.
  const templateDepths = [];
  let braceDepth = 0;

  const lineEnd = (from) => {
    const end = text.indexOf('\n', from);
    return end < 0 ? n : end;
  };

  /** Index just past a quoted string starting at `start`, or -1 when it never closes. */
  const scanQuoted = (start, quote, { escapes = true, multiline = false, doubledQuote = false } = {}) => {
    let j = start + quote.length;
    while (j < n) {
      const ch = text[j];
      if (escapes && ch === '\\') {
        j += 2;
        continue;
      }
      if (text.startsWith(quote, j)) {
        if (doubledQuote && text.startsWith(quote, j + quote.length)) {
          j += quote.length * 2;
          continue;
        }
        return j + quote.length;
      }
      if (ch === '\n' && !multiline) return -1;
      j += 1;
    }
    return -1;
  };

  const blockEnd = (start) => {
    if (!spec.nested) {
      const end = text.indexOf('*/', start + 2);
      return end < 0 ? -1 : end + 2;
    }
    let depth = 0;
    let j = start;
    while (j < n) {
      if (text.startsWith('/*', j)) {
        depth += 1;
        j += 2;
      } else if (text.startsWith('*/', j)) {
        depth -= 1;
        j += 2;
        if (depth === 0) return j;
      } else j += 1;
    }
    return -1;
  };

  /** From inside a template, the index past its end or past its next `${`, or `null`. */
  const scanTemplate = (from) => {
    let j = from;
    while (j < n) {
      const c = text[j];
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === '`') return { index: j + 1, open: false };
      if (c === '$' && text[j + 1] === '{') return { index: j + 2, open: true };
      j += 1;
    }
    return null;
  };

  /** A JS regex literal from `start` (at `/`) to past its flags, or -1. */
  const scanRegex = (start) => {
    let j = start + 1;
    let inClass = false;
    while (j < n) {
      const ch = text[j];
      if (ch === '\n') return -1;
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (inClass) {
        if (ch === ']') inClass = false;
      } else if (ch === '[') inClass = true;
      else if (ch === '/') {
        j += 1;
        while (j < n && /[A-Za-z]/.test(text[j])) j += 1;
        return j;
      }
      j += 1;
    }
    return -1;
  };

  const regexAllowed = () =>
    lastSignificant === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSignificant) || REGEX_KEYWORDS.has(lastWord);

  // JSX text may hold `//` (`<a>http://x</a>`): there a line comment opens only at a
  // line's start, after whitespace or after punctuation.
  const lineCommentMayOpen = (index) => {
    if (!spec.jsx) return true;
    const before = text[index - 1];
    return before === undefined || /\s/.test(before) || ';,{}()[]'.includes(before);
  };

  const rawPrefixBefore = (index) =>
    (text[index - 1] === 'r' || text[index - 1] === 'R') && !IDENTIFIER_CHAR.test(text[index - 2] ?? '');

  const emit = (from, to) => {
    out.push(text.slice(from, to));
    lastSignificant = text[to - 1];
    lastWord = '';
  };

  if (spec.shebang && text.startsWith('#!')) {
    i = lineEnd(0);
    out.push(text.slice(0, i));
  }

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];

    if (spec.line === '//' && ch === '/' && next === '/' && lineCommentMayOpen(i)) {
      const end = lineEnd(i);
      if (spec.keepLine && spec.keepLine.test(text.slice(i, end))) out.push(text.slice(i, end));
      i = end;
      continue;
    }
    if (spec.block && ch === '/' && next === '*') {
      const end = blockEnd(i);
      if (end < 0) return null;
      out.push(' ');
      i = end;
      continue;
    }
    if (spec.line === '#' && ch === '#') {
      const before = text[i - 1];
      // In a shell `$#` and `${#x}` are not comments; a word-start `#` is.
      if (spec.hash === 'anywhere' || before === undefined || /\s/.test(before) || ';|&('.includes(before)) {
        i = lineEnd(i);
        continue;
      }
    }

    if (spec.jsx && ch === '{' && next !== undefined) {
      const braced = BRACED_COMMENT.exec(text.slice(i, i + 4096));
      if (braced) {
        out.push(' ');
        i += braced[0].length;
        continue;
      }
    }

    if (spec.template) {
      if (ch === '`') {
        const end = scanTemplate(i + 1);
        if (end === null) return null;
        if (end.open) templateDepths.push(braceDepth);
        emit(i, end.index);
        i = end.index;
        continue;
      }
      if (ch === '{') braceDepth += 1;
      if (ch === '}') {
        if (templateDepths.length > 0 && templateDepths[templateDepths.length - 1] === braceDepth) {
          templateDepths.pop();
          const end = scanTemplate(i + 1);
          if (end === null) return null;
          if (end.open) templateDepths.push(braceDepth);
          emit(i, end.index);
          i = end.index;
          continue;
        }
        braceDepth -= 1;
      }
    }

    if (spec.regex && ch === '/' && regexAllowed()) {
      const end = scanRegex(i);
      if (end > 0) {
        emit(i, end);
        i = end;
        continue;
      }
    }

    if (spec.triple) {
      const triple = spec.triple.find((quote) => text.startsWith(quote, i));
      if (triple) {
        const raw = spec.rawTriple || (spec.literalSingle && triple === "'''") || (spec.rawPrefix && rawPrefixBefore(i));
        const end = scanQuoted(i, triple, { escapes: !raw, multiline: true });
        if (end < 0) return null;
        emit(i, end);
        i = end;
        continue;
      }
    }
    if (spec.rust && (ch === 'r' || ch === 'b' || ch === 'c') && !IDENTIFIER_CHAR.test(text[i - 1] ?? '')) {
      const raw = /^[bc]?r(#*)"/.exec(text.slice(i, i + 260));
      if (raw) {
        const close = `"${raw[1]}`;
        const end = text.indexOf(close, i + raw[0].length);
        if (end < 0) return null;
        emit(i, end + close.length);
        i = end + close.length;
        continue;
      }
    }
    if (spec.rust && ch === "'") {
      // A char literal (`'a'`, `'\n'`, `'\u{1F600}'`) closes; a lifetime (`'a`) does not.
      const literal = /^'(\\(u\{[0-9a-fA-F]{1,6}\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'/u.exec(text.slice(i, i + 16));
      const end = literal ? i + literal[0].length : i + 1;
      emit(i, end);
      i = end;
      continue;
    }
    // In JSX text an apostrophe follows a letter (`Don't`); in code a string never does.
    if ((ch === '"' || ch === "'") && !(spec.jsx && IDENTIFIER_CHAR.test(text[i - 1] ?? ''))) {
      const verbatim = spec.verbatim && ch === '"' && /@\$?$|\$@$/.test(text.slice(Math.max(0, i - 2), i));
      const raw = (spec.rawPrefix && rawPrefixBefore(i)) || (spec.singleRaw && ch === "'") || (spec.literalSingle && ch === "'");
      const end = verbatim
        ? scanQuoted(i, '"', { escapes: false, multiline: true, doubledQuote: true })
        : scanQuoted(i, ch, { escapes: !raw, multiline: Boolean(spec.multilineStrings) });
      if (end < 0) return null;
      emit(i, end);
      i = end;
      continue;
    }
    if (ch === '`' && (spec.backtickRaw || spec.backtickName)) {
      const end = scanQuoted(i, '`', { escapes: false, multiline: Boolean(spec.backtickRaw) });
      if (end < 0) return null;
      emit(i, end);
      i = end;
      continue;
    }
    if (spec.cssUrl && (ch === 'u' || ch === 'U') && !/[A-Za-z0-9_-]/.test(text[i - 1] ?? '') && /^url\(\s*[^'"\s)]/i.test(text.slice(i, i + 64))) {
      const end = text.indexOf(')', i);
      if (end < 0) return null;
      emit(i, end + 1);
      i = end + 1;
      continue;
    }

    if (IDENTIFIER_CHAR.test(ch)) {
      let j = i + 1;
      while (j < n && IDENTIFIER_CHAR.test(text[j])) j += 1;
      const word = text.slice(i, j);
      // `x.import`, `r#use` and `obj.use` are names, not declarations.
      if (spec.imports && spec.importWords.includes(word) && !'.#:'.includes(lastSignificant || ' ')) {
        const declaration = spec.imports.exec(text.slice(i, i + 8192));
        if (declaration) {
          out.push(' ');
          lastSignificant = ';';
          lastWord = '';
          i += declaration[0].length;
          continue;
        }
      }
      out.push(word);
      lastSignificant = word[word.length - 1];
      lastWord = word;
      i = j;
      continue;
    }
    out.push(ch);
    if (!/\s/.test(ch)) {
      lastSignificant = ch;
      lastWord = '';
    }
    i += 1;
  }
  if (templateDepths.length > 0) return null;
  return out.join('');
}

// A quote opens a YAML string only where a scalar begins.
const SCALAR_START = /^\s*$|[:?-]\s+$|[[{,]\s*$/;
// `key: |`, `- >-`, a bare `|2`: the more-indented lines after it are text.
const BLOCK_SCALAR = /(?:^\s*|:\s+|-\s+)[|>][-+0-9]*\s*$/;

/**
 * YAML by line: `#` opens a comment at a line's start or after whitespace, and a block
 * scalar keeps every more-indented line as text, `#` included.
 */
function stripYamlComments(text) {
  const out = [];
  let blockIndent = -1;
  let quote = null;
  for (const line of text.split('\n')) {
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0 && !quote) {
      if (line.trim() === '' || indent > blockIndent) {
        out.push(line);
        continue;
      }
      blockIndent = -1;
    }
    let kept = '';
    let j = 0;
    while (j < line.length) {
      const ch = line[j];
      if (quote) {
        if (quote === "'" && ch === "'" && line[j + 1] === "'") {
          kept += "''";
          j += 2;
          continue;
        }
        if (quote === '"' && ch === '\\') {
          kept += line.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (ch === quote) quote = null;
        kept += ch;
        j += 1;
        continue;
      }
      if (ch === '#' && (j === 0 || /\s/.test(line[j - 1]))) break;
      if ((ch === '"' || ch === "'") && SCALAR_START.test(line.slice(0, j))) quote = ch;
      kept += ch;
      j += 1;
    }
    out.push(kept);
    if (!quote && BLOCK_SCALAR.test(kept)) blockIndent = indent;
  }
  if (quote) return null;
  return out.join('\n');
}

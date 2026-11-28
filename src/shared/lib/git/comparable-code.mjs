/**
 * A source file reduced to what can change its behaviour. Where the extension's comment
 * syntax is known, comments are removed (JSX comment children included), module import,
 * re-export and Rust `use` declarations become their sorted binding names without the
 * module they name, and every run of whitespace outside string, template and regex
 * literals becomes one space (one line break where the language reads lines, with the
 * indentation kept where it reads indentation). Literals are kept byte for byte.
 *
 * The scanner only ever errs toward keeping text: an unterminated literal or comment, an
 * interpolation holding quotes, or a construct it does not delimit (a heredoc, a raw
 * string form it does not read) makes the file compare by its exact lines, as does any
 * other extension. The cases in `tests/fixtures/comparable-code-cases.mjs` state the comparison the screen
 * and the Rust server must give.
 */

const SLASH = { line: '//', block: true };

// `${x}` in a template is code; a quote inside such an interpolation within a plain
// string means this scanner cannot find where the string ends.
const DOLLAR_BRACE = [['${', '{', '}']];

/** One entry per known language; an extension absent below compares by its exact lines. */
const LANGUAGES = {
  js: {
    ...SLASH,
    layout: 'free',
    template: true,
    regex: true,
    jsx: true,
    asi: true,
    imports: 'js',
    keepLine: /^\/\/(?:\/\s*<|\s*@(?:vitest-environment|jest-environment|ts-nocheck|ts-check|jsx|jsxImportSource|jsxRuntime|flow)\b)/,
  },
  rust: { ...SLASH, layout: 'free', nested: true, rust: true, multilineStrings: true, imports: 'rust' },
  java: { ...SLASH, layout: 'free', triple: ['"""'] },
  kotlin: { ...SLASH, layout: 'lines', nested: true, triple: ['"""'], rawTriple: true, greedyTriple: true, backtickName: true, interp: DOLLAR_BRACE },
  go: { ...SLASH, layout: 'lines', backtickRaw: true, keepLine: /^\/\/(go:|\s*\+build)/, unread: /^\s*import\s+(?:\(\s*)?"C"/m },
  swift: { ...SLASH, layout: 'lines', nested: true, triple: ['"""'], backtickName: true, unread: /#+"/, interp: [['\\(', '(', ')']] },
  c: { ...SLASH, layout: 'free', unread: /(?:^|[^A-Za-z0-9_])(?:u8|[uUL])?R"/ },
  csharp: { ...SLASH, layout: 'free', triple: ['"""'], rawTriple: true, greedyTriple: true, verbatim: true, dollarInterp: true },
  scala: { ...SLASH, layout: 'lines', nested: true, triple: ['"""'], rawTriple: true, greedyTriple: true, backtickName: true, interp: DOLLAR_BRACE },
  dart: { ...SLASH, layout: 'free', nested: true, triple: ['"""', "'''"], rawPrefix: true, interp: DOLLAR_BRACE },
  // Plain CSS has no line comment: `url(http://x)` is a value.
  css: { line: null, block: true, layout: 'free', cssUrl: true },
  scss: { ...SLASH, layout: 'free', cssUrl: true, guardSlash: true, interp: [['#{', '{', '}']] },
  python: {
    line: '#',
    hash: 'anywhere',
    layout: 'indented',
    triple: ['"""', "'''"],
    shebang: true,
    fString: true,
    keepLine: /^#\s*(?:type:|-\*-|(?:vim?|ex):|coding[:=])/,
  },
  shell: {
    line: '#',
    hash: 'word-start',
    layout: 'lines',
    singleRaw: true,
    multilineStrings: true,
    shebang: true,
    backslashEscapes: true,
    unread: /<</,
    interp: [['$(', '(', ')'], ['${', '{', '}'], ['`', null, '`']],
    interpIn: '"',
  },
  ruby: {
    line: '#',
    hash: 'word-start',
    layout: 'lines',
    multilineStrings: true,
    shebang: true,
    regex: true,
    unread: /<<[~-]?['"`A-Za-z_]|^=begin|%[qQwWiIrsx]?[{([<|!]/m,
    interp: [['#{', '{', '}']],
    interpIn: '"`',
    keepLine: /^#\s*(?:frozen_string_literal|-\*-|(?:vim?|ex):|(?:en)?coding[:=])/,
  },
  toml: { line: '#', hash: 'anywhere', layout: 'lines', triple: ['"""', "'''"], literalSingle: true },
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

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;
const WORD_CHAR = /[A-Za-z0-9_$]/;
// A regex literal may follow these words; so may a string in minified code.
const EXPRESSION_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
  'if', 'unless', 'when', 'and', 'or', 'not', 'while', 'until',
]);
// A line break after these ends the statement in JS (automatic semicolon insertion).
const ASI_RESTRICTED = /(?:^|[^\w$])(?:return|throw|break|continue|yield)$/;
const CONTROL_HEADS = new Set(['if', 'while', 'for', 'with']);
const JS_IDENT = /[A-Za-z_$][\w$]*/y;
const RUST_IDENT = /(?:r#)?[A-Za-z_][A-Za-z0-9_]*/y;

/** The comment language a path is read in, or `null` when its exact lines are compared. */
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
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const language = commentLanguageOf(path);
  let scanned = null;
  if (language === 'yaml') scanned = scanYaml(source);
  else if (language) scanned = scanSource(source, LANGUAGES[language]);
  if (!scanned) return exactLines(source);
  const layout = language === 'yaml' ? 'indented' : LANGUAGES[language].layout;
  const body = joinSegments(scanned.segments, layout, language === 'js');
  if (scanned.imports.length === 0) return body;
  return `${body}\n\0imports\n${scanned.imports.sort().join('\n')}`;
}

/** The fallback: the file's lines without trailing whitespace or blank lines. */
function exactLines(source) {
  return source
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Joins code and literal segments. Code whitespace runs become one space, or one line
 * break (plus the indentation that follows it, for `indented`) when the run holds one
 * and the language reads lines. Literals pass through untouched.
 */
function joinSegments(segments, layout, asi) {
  let out = '';
  let pending = '';
  let lastToken = '';
  const flush = () => {
    if (out !== '' && pending !== '') out += pending;
    pending = '';
  };
  const merge = (run) => {
    const newline = run.lastIndexOf('\n');
    if (newline < 0) {
      if (pending === '') pending = ' ';
      return;
    }
    if (layout === 'indented') pending = `\n${run.slice(newline + 1)}`;
    else if (layout === 'lines') pending = '\n';
    else if (asi && ASI_RESTRICTED.test(lastToken)) pending = '\n';
    else if (!pending.startsWith('\n')) pending = ' ';
  };
  for (const segment of segments) {
    if (segment.literal) {
      flush();
      out += segment.text;
      lastToken = '';
      continue;
    }
    const runs = /(\s+)|(\S+)/g;
    let match;
    while ((match = runs.exec(segment.text)) !== null) {
      if (match[1] !== undefined) merge(match[1]);
      else {
        flush();
        out += match[2];
        lastToken = match[2];
      }
    }
  }
  return out;
}

/**
 * Splits a file into code and literal segments with comments removed, or returns `null`
 * when it holds something this scanner does not delimit with certainty.
 */
function scanSource(text, spec) {
  if (spec.unread && spec.unread.test(text)) return null;
  const segments = [];
  const imports = [];
  const n = text.length;
  let code = '';
  let i = 0;
  // The last significant character and word outside comments, for regex detection.
  let lastSignificant = '';
  let lastWord = '';
  // Whether the `)` just passed closed an `if (...)`-style head, after which `/` opens a regex.
  const parenHeads = [];
  let closedControlHead = false;
  // The brace depth at each open `${` of a JS template, innermost last.
  const templateDepths = [];
  let braceDepth = 0;
  let unsafe = false;

  const pushCode = (value) => {
    code += value;
  };
  const pushLiteral = (from, to) => {
    if (code) {
      segments.push({ literal: false, text: code });
      code = '';
    }
    segments.push({ literal: true, text: text.slice(from, to) });
    lastSignificant = text[to - 1];
    lastWord = '';
    closedControlHead = false;
  };

  const lineEnd = (from) => {
    const end = text.indexOf('\n', from);
    return end < 0 ? n : end;
  };

  /** From an interpolation opener, the index past its closer, or -1; `unsafe` when it holds the quote. */
  const skipInterpolation = (start, opener, open, close, quote) => {
    let j = start + opener.length;
    let depth = 1;
    while (j < n) {
      if (text.startsWith(quote, j)) {
        unsafe = true;
        return -1;
      }
      const ch = text[j];
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (open && ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return j + 1;
      }
      j += 1;
    }
    return -1;
  };

  /** Index just past a quoted string starting at `start`, or -1 when it never closes. */
  const scanQuoted = (start, quote, { escapes = true, multiline = false, doubledQuote = false, interp = null, braces = false, greedy = false } = {}) => {
    let j = start + quote.length;
    while (j < n) {
      if (interp) {
        const opener = interp.find(([open]) => text.startsWith(open, j));
        if (opener) {
          const end = skipInterpolation(j, opener[0], opener[1], opener[2], quote);
          if (end < 0) return -1;
          j = end;
          continue;
        }
      }
      if (braces && text[j] === '{') {
        if (text[j + 1] === '{') {
          j += 2;
          continue;
        }
        const end = skipInterpolation(j, '{', '{', '}', quote);
        if (end < 0) return -1;
        j = end;
        continue;
      }
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
        let end = j + quote.length;
        if (greedy) while (text[end] === quote[0]) end += 1;
        return end;
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

  /** A regex literal from `start` (at `/`) to past its flags, or -1. */
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
    lastSignificant === '' ||
    '(,=:[!&|?{};+-*%<>~^'.includes(lastSignificant) ||
    EXPRESSION_KEYWORDS.has(lastWord) ||
    (lastSignificant === ')' && closedControlHead);

  // JSX text and SCSS selectors may hold `//` or `/*` (`<a>http://x</a>`, `<code>src/*.ts</code>`):
  // there a comment opens only at a line's start, after whitespace or after punctuation.
  const commentMayOpen = (index) => {
    if (!spec.jsx && !spec.guardSlash) return true;
    const before = text[index - 1];
    if (!(before === undefined || /\s/.test(before) || ';,{}()[]'.includes(before))) return false;
    // `<p>run it // then wait</p>`: the rest of the line closes a tag, so it is text.
    if (spec.jsx && text[index + 1] === '/') return lastTagOnLine(index) < index;
    return true;
  };

  // The last `</` or `/>` on the current line, found once per line so a long line costs one pass.
  let tagLineEnd = -1;
  let tagIndex = -1;
  const lastTagOnLine = (index) => {
    if (index > tagLineEnd) {
      tagLineEnd = lineEnd(index);
      const line = text.slice(index, tagLineEnd);
      const last = Math.max(line.lastIndexOf('</'), line.lastIndexOf('/>'));
      tagIndex = last < 0 ? -1 : index + last;
    }
    return tagIndex;
  };

  const rawPrefixBefore = (index) =>
    (text[index - 1] === 'r' || text[index - 1] === 'R') && !IDENTIFIER_CHAR.test(text[index - 2] ?? '');

  const nextSignificant = (from) => {
    let j = from;
    while (j < n && /\s/.test(text[j])) j += 1;
    return text[j];
  };

  if (spec.shebang && text.startsWith('#!')) {
    i = lineEnd(0);
    pushCode(text.slice(0, i));
  }

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];

    if (spec.line === '//' && ch === '/' && next === '/' && commentMayOpen(i)) {
      const end = lineEnd(i);
      if (spec.keepLine && spec.keepLine.test(text.slice(i, end))) pushCode(text.slice(i, end));
      i = end;
      continue;
    }
    if (spec.block && ch === '/' && next === '*' && commentMayOpen(i)) {
      const end = blockEnd(i);
      if (end < 0) return null;
      // A comment between two words keeps them apart; elsewhere it leaves nothing.
      if (WORD_CHAR.test(text[i - 1] ?? '') && WORD_CHAR.test(text[end] ?? '')) pushCode(' ');
      i = end;
      continue;
    }
    if (spec.line === '#' && ch === '#') {
      const before = text[i - 1];
      // In a shell `$#` and `${#x}` are not comments; a word-start `#` is.
      if (spec.hash === 'anywhere' || before === undefined || /\s/.test(before) || ';|&('.includes(before)) {
        const end = lineEnd(i);
        if (spec.keepLine && spec.keepLine.test(text.slice(i, end))) pushCode(text.slice(i, end));
        i = end;
        continue;
      }
    }
    if (spec.backslashEscapes && ch === '\\') {
      pushCode(text.slice(i, i + 2));
      lastSignificant = next ?? '';
      i += 2;
      continue;
    }

    // A JSX comment child, `{/* why */}` between tags, is a comment; the braces of an
    // empty block (`if (x) {/* handled */}`) are code.
    if (spec.jsx && ch === '{') {
      const braced = /^\{\s*\/\*/.test(text.slice(i, i + 64)) ? jsxCommentChild(i) : -1;
      if (braced > 0) {
        i = braced;
        continue;
      }
    }

    if (spec.template) {
      if (ch === '`') {
        const end = scanTemplate(i + 1);
        if (end === null) return null;
        if (end.open) templateDepths.push(braceDepth);
        pushLiteral(i, end.index);
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
          pushLiteral(i, end.index);
          i = end.index;
          continue;
        }
        braceDepth -= 1;
      }
    }

    if (spec.regex && ch === '/' && regexAllowed()) {
      const end = scanRegex(i);
      if (end > 0) {
        pushLiteral(i, end);
        i = end;
        continue;
      }
    }

    if (spec.triple) {
      const triple = spec.triple.find((quote) => text.startsWith(quote, i));
      if (triple) {
        const raw = spec.rawTriple || (spec.literalSingle && triple === "'''") || (spec.rawPrefix && rawPrefixBefore(i));
        const end = scanQuoted(i, triple, {
          escapes: !raw,
          multiline: true,
          interp: spec.interp ?? null,
          braces: Boolean(spec.fString && formatPrefixBefore(text, i)),
          greedy: Boolean(spec.greedyTriple),
        });
        if (unsafe || end < 0) return null;
        pushLiteral(i, end);
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
        pushLiteral(i, end + close.length);
        i = end + close.length;
        continue;
      }
    }
    if (spec.rust && ch === "'") {
      // A char literal (`'a'`, `'\n'`, `'\u{1F600}'`) closes; a lifetime (`'a`) does not.
      const literal = /^'(\\(u\{[0-9a-fA-F]{1,6}\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'/u.exec(text.slice(i, i + 16));
      if (literal) {
        pushLiteral(i, i + literal[0].length);
        i += literal[0].length;
      } else {
        pushCode("'");
        lastSignificant = "'";
        i += 1;
      }
      continue;
    }
    // In JSX text an apostrophe follows a letter (`Don't`); in code a string follows a
    // word only when the word is a keyword (`return"x"` in minified code).
    if ((ch === '"' || ch === "'") && !(spec.jsx && IDENTIFIER_CHAR.test(text[i - 1] ?? '') && !EXPRESSION_KEYWORDS.has(lastWord))) {
      const verbatim = spec.verbatim && ch === '"' && /@\$?$|\$@$/.test(text.slice(Math.max(0, i - 2), i));
      const raw = (spec.rawPrefix && rawPrefixBefore(i)) || (spec.singleRaw && ch === "'") || (spec.literalSingle && ch === "'");
      const interpolates = !spec.interpIn || spec.interpIn.includes(ch);
      const csharpInterpolated = spec.dollarInterp && /\$@?$|@\$$/.test(text.slice(Math.max(0, i - 2), i));
      const end = verbatim
        ? scanQuoted(i, '"', { escapes: false, multiline: true, doubledQuote: true, braces: csharpInterpolated })
        : scanQuoted(i, ch, {
            escapes: !raw,
            multiline: Boolean(spec.multilineStrings),
            interp: interpolates && !raw ? (spec.interp ?? null) : null,
            braces: Boolean((spec.fString && formatPrefixBefore(text, i)) || csharpInterpolated),
          });
      if (unsafe || end < 0) return null;
      pushLiteral(i, end);
      i = end;
      continue;
    }
    if (ch === '`' && (spec.backtickRaw || spec.backtickName)) {
      const end = scanQuoted(i, '`', { escapes: false, multiline: Boolean(spec.backtickRaw) });
      if (end < 0) return null;
      pushLiteral(i, end);
      i = end;
      continue;
    }
    if (spec.cssUrl && (ch === 'u' || ch === 'U') && !/[A-Za-z0-9_-]/.test(text[i - 1] ?? '') && /^url\(\s*[^'"\s)]/i.test(text.slice(i, i + 64))) {
      const end = text.indexOf(')', i);
      if (end < 0) return null;
      pushLiteral(i, end + 1);
      i = end + 1;
      continue;
    }

    if (IDENTIFIER_CHAR.test(ch)) {
      let j = i + 1;
      while (j < n && IDENTIFIER_CHAR.test(text[j])) j += 1;
      const word = text.slice(i, j);
      // `x.import`, `r#use` and `obj.use` are names, not declarations.
      if (spec.imports && !'.#:'.includes(lastSignificant || ' ')) {
        const declaration =
          spec.imports === 'js' && (word === 'import' || word === 'export')
            ? parseJsImport(text, j, word)
            : spec.imports === 'rust' && (word === 'use' || word === 'pub')
              ? parseRustUse(text, i)
              : null;
        if (declaration) {
          imports.push(...declaration.entries);
          pushCode(' ');
          lastSignificant = ';';
          lastWord = '';
          i = declaration.end;
          continue;
        }
      }
      pushCode(word);
      lastSignificant = word[word.length - 1];
      lastWord = word;
      closedControlHead = false;
      i = j;
      continue;
    }
    pushCode(ch);
    if (!/\s/.test(ch)) {
      if (ch === '(') parenHeads.push(CONTROL_HEADS.has(lastWord));
      closedControlHead = ch === ')' ? (parenHeads.pop() ?? false) : false;
      lastSignificant = ch;
      lastWord = '';
    }
    i += 1;
  }
  if (templateDepths.length > 0) return null;
  if (code) segments.push({ literal: false, text: code });
  return { segments, imports };

  /** The index past a JSX comment child starting at `start`, or -1 when the braces are code. */
  function jsxCommentChild(start) {
    let j = start + 1;
    while (j < n && /\s/.test(text[j])) j += 1;
    const end = text.indexOf('*/', j + 2);
    if (end < 0) return -1;
    j = end + 2;
    while (j < n && /\s/.test(text[j])) j += 1;
    if (text[j] !== '}') return -1;
    const afterTag = lastSignificant === '>' && text[lastIndexOfSignificant(start) - 1] !== '=';
    const beforeTag = nextSignificant(j + 1) === '<';
    return afterTag || beforeTag ? j + 1 : -1;
  }

  function lastIndexOfSignificant(from) {
    let j = from - 1;
    while (j >= 0 && /\s/.test(text[j])) j -= 1;
    return j;
  }
}

function formatPrefixBefore(text, index) {
  const prefix = /[A-Za-z]{1,3}$/.exec(text.slice(Math.max(0, index - 3), index))?.[0] ?? '';
  return /[fF]/.test(prefix) && !IDENTIFIER_CHAR.test(text[index - prefix.length - 1] ?? '');
}

/**
 * A JS/TS import or re-export declaration whose keyword ends at `from`, read token by
 * token so a near miss costs no more than its own length: `{ end, entries }`, or `null`
 * for anything else (`import('m')`, `export { a };`, `export const`). Entries keep every
 * binding and alias; only the module specifier is dropped.
 */
function parseJsImport(text, from, keyword) {
  const n = text.length;
  let j = from;
  const skip = () => {
    for (;;) {
      while (j < n && /\s/.test(text[j])) j += 1;
      if (text.startsWith('//', j)) {
        const end = text.indexOf('\n', j);
        j = end < 0 ? n : end;
      } else if (text.startsWith('/*', j)) {
        const end = text.indexOf('*/', j + 2);
        if (end < 0) return false;
        j = end + 2;
      } else return true;
    }
  };
  const ident = () => {
    JS_IDENT.lastIndex = j;
    const match = JS_IDENT.exec(text);
    if (!match) return null;
    j += match[0].length;
    return match[0];
  };
  const peekIdent = () => {
    JS_IDENT.lastIndex = j;
    return JS_IDENT.exec(text)?.[0] ?? null;
  };
  const moduleString = () => {
    const quote = text[j];
    if (quote !== '"' && quote !== "'") return false;
    let k = j + 1;
    while (k < n && text[k] !== quote && text[k] !== '\n' && text[k] !== '\\') k += 1;
    if (text[k] !== quote) return false;
    j = k + 1;
    return true;
  };
  const finish = () => {
    let k = j;
    while (k < n && (text[k] === ' ' || text[k] === '\t')) k += 1;
    return text[k] === ';' ? k + 1 : j;
  };
  const list = (prefix, entries) => {
    j += 1;
    for (;;) {
      if (!skip()) return false;
      if (text[j] === '}') {
        j += 1;
        return true;
      }
      let kind = prefix;
      let name = ident();
      if (!name) return false;
      if (name === 'type') {
        if (!skip()) return false;
        const after = peekIdent();
        if (after && after !== 'as') {
          kind = `${prefix}type `;
          name = ident();
        }
      }
      if (!skip()) return false;
      let alias = null;
      if (peekIdent() === 'as') {
        ident();
        if (!skip()) return false;
        alias = ident();
        if (!alias) return false;
        if (!skip()) return false;
      }
      entries.push(`${kind}${name}${alias ? ` as ${alias}` : ''}`);
      if (text[j] === ',') j += 1;
      else if (text[j] !== '}') return false;
    }
  };
  const entries = [];
  if (!skip()) return null;
  if (keyword === 'import') {
    if (moduleString()) return { end: finish(), entries: ['import'] };
    let prefix = 'import ';
    if (peekIdent() === 'type') {
      const save = j;
      ident();
      if (skip() && (text[j] === '{' || text[j] === '*' || (peekIdent() && peekIdent() !== 'from'))) prefix = 'import type ';
      else j = save;
    }
    if (!skip()) return null;
    const head = peekIdent();
    if (head && head !== 'from') {
      ident();
      entries.push(`${prefix}default as ${head}`);
      if (!skip()) return null;
      if (text[j] === ',') {
        j += 1;
        if (!skip()) return null;
      }
    }
    if (text[j] === '*') {
      j += 1;
      if (!skip() || ident() !== 'as' || !skip()) return null;
      const ns = ident();
      if (!ns) return null;
      entries.push(`${prefix}* as ${ns}`);
    } else if (text[j] === '{') {
      if (!list(prefix, entries)) return null;
    }
    if (entries.length === 0 || !skip() || ident() !== 'from' || !skip() || !moduleString()) return null;
    return { end: finish(), entries };
  }
  let prefix = 'export ';
  if (peekIdent() === 'type') {
    ident();
    if (!skip()) return null;
    prefix = 'export type ';
  }
  if (text[j] === '*') {
    j += 1;
    if (!skip()) return null;
    let entry = `${prefix}*`;
    if (peekIdent() === 'as') {
      ident();
      if (!skip()) return null;
      const ns = ident();
      if (!ns) return null;
      entry = `${prefix}* as ${ns}`;
      if (!skip()) return null;
    }
    entries.push(entry);
  } else if (text[j] === '{') {
    if (!list(prefix, entries) || !skip()) return null;
    if (entries.length === 0) entries.push(`${prefix}{}`);
  } else return null;
  if (ident() !== 'from' || !skip() || !moduleString()) return null;
  return { end: finish(), entries };
}

/**
 * A Rust `use` declaration (`pub` and `pub(crate)` included) from `start`: `{ end, entries }`
 * naming each binding it brings in and its visibility, or `null` for anything else.
 */
function parseRustUse(text, start) {
  const n = text.length;
  let j = start;
  const skip = () => {
    for (;;) {
      while (j < n && /\s/.test(text[j])) j += 1;
      if (text.startsWith('//', j)) {
        const end = text.indexOf('\n', j);
        j = end < 0 ? n : end;
      } else if (text.startsWith('/*', j)) {
        const end = text.indexOf('*/', j + 2);
        if (end < 0) return false;
        j = end + 2;
      } else return true;
    }
  };
  const ident = () => {
    RUST_IDENT.lastIndex = j;
    const match = RUST_IDENT.exec(text);
    if (!match) return null;
    j += match[0].length;
    return match[0];
  };
  let visibility = '';
  if (ident() === 'pub') {
    visibility = 'pub';
    if (!skip()) return null;
    if (text[j] === '(') {
      const close = text.indexOf(')', j);
      if (close < 0 || close - j > 64 || !/^\([\w\s:]*\)$/.test(text.slice(j, close + 1))) return null;
      visibility = `pub${text.slice(j, close + 1).replace(/\s+/g, '')}`;
      j = close + 1;
      if (!skip()) return null;
    }
    if (ident() !== 'use') return null;
  } else if (text.slice(start, j) !== 'use') return null;
  if (!/\s/.test(text[j] ?? '') && text[j] !== '{' && text[j] !== ':') return null;
  const entries = [];
  const prefix = visibility ? `${visibility} use ` : 'use ';
  // One use tree; `last` is the segment a `self` inside braces refers to.
  const tree = (last) => {
    if (!skip()) return false;
    if (text.startsWith('::', j)) {
      j += 2;
      if (!skip()) return false;
    }
    if (text[j] === '{') return group(last);
    if (text[j] === '*') {
      j += 1;
      entries.push(`${prefix}*`);
      return true;
    }
    let segment = ident();
    if (!segment) return false;
    for (;;) {
      if (!skip()) return false;
      if (!text.startsWith('::', j)) break;
      j += 2;
      if (!skip()) return false;
      if (text[j] === '{') return group(segment);
      if (text[j] === '*') {
        j += 1;
        entries.push(`${prefix}*`);
        return true;
      }
      segment = ident();
      if (!segment) return false;
    }
    const name = segment === 'self' ? last : segment;
    if (!name) return false;
    let alias = null;
    const save = j;
    if (ident() === 'as') {
      if (!skip()) return false;
      alias = ident();
      if (!alias) return false;
    } else j = save;
    entries.push(`${prefix}${name}${alias ? ` as ${alias}` : ''}`);
    return true;
  };
  const group = (last) => {
    j += 1;
    for (;;) {
      if (!skip()) return false;
      if (text[j] === '}') {
        j += 1;
        return true;
      }
      if (!tree(last)) return false;
      if (!skip()) return false;
      if (text[j] === ',') j += 1;
      else if (text[j] !== '}') return false;
    }
  };
  if (!tree(null) || !skip() || text[j] !== ';') return null;
  return { end: j + 1, entries };
}

// A quote opens a YAML string only where a scalar begins.
const BLOCK_SCALAR_TAIL = /(?:^|[:\-]\s+|^\s*)[|>][-+0-9]*$/;

/**
 * YAML by line: `#` opens a comment at a line's start or after whitespace, a quote opens a
 * string only where a scalar begins, and a block scalar keeps every more-indented line as
 * text, `#` included. One pass per line: the scalar-start state is carried, not re-read.
 */
function scanYaml(text) {
  const segments = [];
  let code = '';
  let blockIndent = -1;
  let quote = null;
  let literal = '';
  const pushLiteral = (value) => {
    if (code) {
      segments.push({ literal: false, text: code });
      code = '';
    }
    segments.push({ literal: true, text: value });
  };
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const newline = index > 0 ? '\n' : '';
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0 && !quote) {
      if (line.trim() === '' || indent > blockIndent) {
        code += newline;
        pushLiteral(line);
        continue;
      }
      blockIndent = -1;
    }
    if (quote) literal += newline;
    else code += newline;
    // Scalar-start state: only whitespace so far, or the last mark was `[{,` or `:?-` followed by space.
    let onlySpace = true;
    let lastMark = '';
    let spaceAfterMark = false;
    let lastNonSpace = '';
    let kept = '';
    let j = 0;
    while (j < line.length) {
      const ch = line[j];
      if (quote) {
        if (quote === "'" && ch === "'" && line[j + 1] === "'") {
          literal += "''";
          j += 2;
          continue;
        }
        if (quote === '"' && ch === '\\') {
          literal += line.slice(j, j + 2);
          j += 2;
          continue;
        }
        literal += ch;
        j += 1;
        if (ch === quote) {
          quote = null;
          pushLiteral(literal);
          literal = '';
          onlySpace = false;
          lastMark = '';
          lastNonSpace = ch;
        }
        continue;
      }
      if (ch === '#' && (j === 0 || /\s/.test(line[j - 1]))) break;
      const isSpace = /\s/.test(ch);
      const scalarStart =
        onlySpace || (lastMark !== '' && ('[{,'.includes(lastMark) || (':?-'.includes(lastMark) && spaceAfterMark)));
      if ((ch === '"' || ch === "'") && scalarStart) {
        code += kept;
        kept = '';
        quote = ch;
        literal = ch;
        j += 1;
        continue;
      }
      kept += ch;
      if (isSpace) {
        if (lastMark) spaceAfterMark = true;
      } else {
        onlySpace = false;
        lastNonSpace = ch;
        if ('[{,:?-'.includes(ch)) {
          lastMark = ch;
          spaceAfterMark = false;
        } else lastMark = '';
      }
      j += 1;
    }
    code += kept;
    const tail = kept.trimEnd().slice(-24);
    if (!quote && lastNonSpace && BLOCK_SCALAR_TAIL.test(tail)) blockIndent = indent;
  }
  if (quote) return null;
  if (code) segments.push({ literal: false, text: code });
  return { segments, imports: [] };
}

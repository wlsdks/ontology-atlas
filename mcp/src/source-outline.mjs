/**
 * A file's declarations with line numbers, so the next bounded read lands on
 * the right range instead of the head of a long file. A table of contents,
 * never a claim about behaviour. `outlineSource` is pure over text the caller
 * already read; a line scanner, not a parser, so a missed declaration is not
 * evidence of absence. Linear in the text.
 */

/** Declarations per outline. A longer file reports `truncated: true`. */
export const OUTLINE_DECLARATION_LIMIT = 400;

/** One signature is kept short so an outline stays a table of contents. */
export const OUTLINE_SIGNATURE_CHARS = 160;

/** A longer line (minified, generated) is skipped, and the outline says `truncated`. */
export const OUTLINE_LINE_CHARS = 1000;

const LANGUAGE_BY_EXTENSION = new Map(Object.entries({
  '.cjs': 'javascript',
  '.cs': 'csharp',
  '.cts': 'typescript',
  '.go': 'go',
  '.java': 'java',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.markdown': 'markdown',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.mts': 'typescript',
  '.py': 'python',
  '.pyi': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.ts': 'typescript',
  '.tsx': 'typescript',
}));

/** Call-shaped words (`name(`) that are not declarations; without them `if (ready) {` is a method. */
const NOT_A_DECLARATION = new Set([
  'case', 'catch', 'do', 'else', 'fixed', 'for', 'foreach', 'function', 'if',
  'lock', 'new', 'return', 'switch', 'synchronized', 'try', 'unsafe', 'using',
  'when', 'while', 'with',
]);

function languageForPath(path) {
  const name = String(path ?? '');
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'unknown';
  return LANGUAGE_BY_EXTENSION.get(name.slice(dot).toLowerCase()) ?? 'unknown';
}

function scannableLines(text) {
  const lines = String(text ?? '').split(/\r\n|\n|\r/u);
  const skipped = lines.some((line) => line.length > OUTLINE_LINE_CHARS);
  return { lines: skipped ? lines.map((line) => (line.length > OUTLINE_LINE_CHARS ? '' : line)) : lines, skipped };
}

function indentOf(line) {
  return /^[\t ]*/u.exec(line)[0].length;
}

function signatureOf(line) {
  return line.trim().slice(0, OUTLINE_SIGNATURE_CHARS);
}

/** A collector that stops at the declaration ceiling and says that it did. */
function collector() {
  const declarations = [];
  let truncated = false;
  return {
    declarations,
    add(index, kind, name, line) {
      if (!name) return;
      if (declarations.length >= OUTLINE_DECLARATION_LIMIT) {
        truncated = true;
        return;
      }
      declarations.push({ line: index + 1, kind, name, signature: signatureOf(line) });
    },
    get truncated() {
      return truncated;
    },
  };
}

/**
 * Brace-family comment openers only: `#` is a comment in Python and Ruby (which
 * check it themselves) but a private member in JavaScript (`#parse()`).
 */
function isCommentLine(trimmed) {
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

const JS_CLASS = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/u;
const JS_INTERFACE = /^(?:export\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/u;
const JS_ENUM = /^(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/u;
const JS_TYPE = /^(?:export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/u;
const JS_FUNCTION = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\s*(?:\*\s*)?([A-Za-z_$][\w$]*)\s*[<(]/u;
const JS_BINDING = /^(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(.*)$/u;
const JS_BINDING_IS_FUNCTION = /^(?:async\s+)?(?:function\b|\(|<[A-Za-z_$]|[A-Za-z_$][\w$]*\s*=>)/u;
const JS_REEXPORT = /^export\s+(?:\*|\{)/u;
const JS_FROM = /from\s+['"]([^'"]+)['"]/u;
const JS_METHOD = /^(?:(?:public|private|protected|readonly|static|abstract|override|async|get|set)\s+)*(?:\*\s*)?([A-Za-z_$#][\w$]*)\s*(?:<[^>]*>\s*)?\(/u;
const JS_METHOD_TAIL = /\)\s*(?::[^{]*)?\{$/u;

function endsWithMethodTail(trimmed) {
  return trimmed.endsWith('{') && JS_METHOD_TAIL.test(trimmed.slice(trimmed.lastIndexOf('{', trimmed.length - 2) + 1));
}

function outlineJavaScript(lines, out) {
  let classIndent = null;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || isCommentLine(trimmed)) continue;
    const indent = indentOf(line);
    if (classIndent !== null && trimmed.startsWith('}') && indent <= classIndent) classIndent = null;
    let match = JS_CLASS.exec(trimmed);
    if (match) {
      out.add(index, 'class', match[1], line);
      classIndent = indent;
      continue;
    }
    match = JS_INTERFACE.exec(trimmed);
    if (match) {
      out.add(index, 'interface', match[1], line);
      continue;
    }
    match = JS_ENUM.exec(trimmed);
    if (match) {
      out.add(index, 'enum', match[1], line);
      continue;
    }
    match = JS_TYPE.exec(trimmed);
    if (match) {
      out.add(index, 'type', match[1], line);
      continue;
    }
    match = JS_FUNCTION.exec(trimmed);
    if (match) {
      out.add(index, indent === 0 ? 'function' : 'method', match[1], line);
      continue;
    }
    match = JS_BINDING.exec(trimmed);
    if (match && (indent === 0 || trimmed.startsWith('export'))) {
      const kind = JS_BINDING_IS_FUNCTION.test(match[2]) ? 'function' : 'const';
      out.add(index, kind, match[1], line);
      continue;
    }
    if (JS_REEXPORT.test(trimmed)) {
      const from = JS_FROM.exec(trimmed);
      out.add(index, 'export', from ? from[1] : trimmed.slice(0, 40), line);
      continue;
    }
    if (classIndent === null || indent <= classIndent || !endsWithMethodTail(trimmed)) continue;
    match = JS_METHOD.exec(trimmed);
    if (match && !NOT_A_DECLARATION.has(match[1])) out.add(index, 'method', match[1], line);
  }
}

const PYTHON_DEF = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*[(\[]/u;
const PYTHON_CLASS = /^class\s+([A-Za-z_]\w*)\s*[(:\[]/u;

function outlinePython(lines, out) {
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const indent = indentOf(line);
    let match = PYTHON_CLASS.exec(trimmed);
    if (match) {
      out.add(index, 'class', match[1], line);
      continue;
    }
    match = PYTHON_DEF.exec(trimmed);
    if (match) out.add(index, indent === 0 ? 'function' : 'method', match[1], line);
  }
}

/**
 * A Go method keeps its receiver type, since `Run` alone is no findable
 * address: `func (c *Command) SuggestionsFor(` is listed as `Command.SuggestionsFor`.
 */
const GO_METHOD = /^func\s*\(\s*(?:[A-Za-z_]\w*\s+)?\*?([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*\)\s*([A-Za-z_]\w*)\s*[(\[]/u;
const GO_FUNCTION = /^func\s+([A-Za-z_]\w*)\s*[(\[]/u;
const GO_TYPE = /^type\s+([A-Za-z_]\w*)(?:\[[^\]]*\])?\s+(.*)$/u;
const GO_BINDING = /^(?:const|var)\s+([A-Za-z_]\w*)[\s=]/u;

function outlineGo(lines, out) {
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || isCommentLine(trimmed)) continue;
    let match = GO_METHOD.exec(trimmed);
    if (match) {
      out.add(index, 'method', `${match[1]}.${match[2]}`, line);
      continue;
    }
    match = GO_FUNCTION.exec(trimmed);
    if (match) {
      out.add(index, 'function', match[1], line);
      continue;
    }
    match = GO_TYPE.exec(trimmed);
    if (match) {
      const rest = match[2];
      const kind = rest.startsWith('struct') ? 'struct' : rest.startsWith('interface') ? 'interface' : 'type';
      out.add(index, kind, match[1], line);
      continue;
    }
    match = GO_BINDING.exec(trimmed);
    if (match) out.add(index, 'const', match[1], line);
  }
}

const RUST_FN = /^(?:pub(?:\([^)]*\))?\s+)?(?:default\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/u;
const RUST_IMPL = /^(?:unsafe\s+)?impl(?:<[^>]*>)?\s+(.+)$/u;
const RUST_STRUCT = /^(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)/u;
const RUST_ENUM = /^(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)/u;
const RUST_TRAIT = /^(?:pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?trait\s+([A-Za-z_]\w*)/u;
const RUST_TYPE = /^(?:pub(?:\([^)]*\))?\s+)?type\s+([A-Za-z_]\w*)/u;
const RUST_CONST = /^(?:pub(?:\([^)]*\))?\s+)?(?:const|static)\s+(?:mut\s+)?([A-Za-z_]\w*)\s*:/u;

function outlineRust(lines, out) {
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || isCommentLine(trimmed)) continue;
    const indent = indentOf(line);
    let match = RUST_FN.exec(trimmed);
    if (match) {
      out.add(index, indent === 0 ? 'function' : 'method', match[1], line);
      continue;
    }
    match = RUST_IMPL.exec(trimmed);
    if (match) {
      out.add(index, 'class', match[1].endsWith('{') ? match[1].slice(0, -1).trimEnd() : match[1], line);
      continue;
    }
    match = RUST_STRUCT.exec(trimmed);
    if (match) {
      out.add(index, 'struct', match[1], line);
      continue;
    }
    match = RUST_ENUM.exec(trimmed);
    if (match) {
      out.add(index, 'enum', match[1], line);
      continue;
    }
    match = RUST_TRAIT.exec(trimmed);
    if (match) {
      out.add(index, 'interface', match[1], line);
      continue;
    }
    match = RUST_CONST.exec(trimmed);
    if (match) {
      out.add(index, 'const', match[1], line);
      continue;
    }
    match = RUST_TYPE.exec(trimmed);
    if (match) out.add(index, 'type', match[1], line);
  }
}

const JVM_TYPE = /(?:^|\s)(class|interface|enum\s+class|enum|object|struct|record)\s+([A-Za-z_]\w*)/u;
const JVM_TYPE_KIND = new Map([
  ['class', 'class'],
  ['enum', 'enum'],
  ['enum class', 'enum'],
  ['interface', 'interface'],
  ['object', 'class'],
  ['record', 'class'],
  ['struct', 'struct'],
]);
const KOTLIN_FUN = /^(?:(?:public|private|protected|internal|open|override|abstract|final|inline|suspend|operator|infix|tailrec|external|expect|actual|companion)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/u;
const JVM_MEMBER_NAME = /\b([A-Za-z_]\w*)\s*(?:<[^<>]*>\s*)?\(/u;
const JVM_MEMBER_TAIL = /^[\w\s,.<>\[\]:?]*$/u;

function jvmMemberName(trimmed) {
  const close = trimmed.lastIndexOf(')');
  if (close < 0 || !trimmed.endsWith('{') || !JVM_MEMBER_TAIL.test(trimmed.slice(close + 1, -1))) return null;
  return JVM_MEMBER_NAME.exec(trimmed.slice(trimmed.lastIndexOf(';', close) + 1, close))?.[1] ?? null;
}

function outlineJvm(lines, out) {
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || isCommentLine(trimmed)) continue;
    const indent = indentOf(line);
    let match = JVM_TYPE.exec(trimmed);
    if (match) {
      out.add(index, JVM_TYPE_KIND.get(match[1].replace(/\s+/u, ' ')) ?? 'class', match[2], line);
      continue;
    }
    match = KOTLIN_FUN.exec(trimmed);
    if (match) {
      out.add(index, indent === 0 ? 'function' : 'method', match[1], line);
      continue;
    }
    const member = jvmMemberName(trimmed);
    if (member && !NOT_A_DECLARATION.has(member)) out.add(index, 'method', member, line);
  }
}

const RUBY_DEF = /^def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/u;
const RUBY_CLASS = /^class\s+([A-Za-z_][\w:]*)/u;
const RUBY_MODULE = /^module\s+([A-Za-z_][\w:]*)/u;

function outlineRuby(lines, out) {
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const indent = indentOf(line);
    let match = RUBY_CLASS.exec(trimmed) ?? RUBY_MODULE.exec(trimmed);
    if (match) {
      out.add(index, 'class', match[1], line);
      continue;
    }
    match = RUBY_DEF.exec(trimmed);
    if (match) out.add(index, indent === 0 ? 'function' : 'method', match[1], line);
  }
}

const MARKDOWN_FENCE = /^(?:```|~~~)/u;
const MARKDOWN_HEADING = /^(#{1,6})\s+(.*\S)\s*$/u;

function outlineMarkdown(lines, out) {
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (MARKDOWN_FENCE.test(trimmed)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = MARKDOWN_HEADING.exec(trimmed);
    if (match) out.add(index, 'section', match[2], line);
  }
}

const SCANNERS = new Map(Object.entries({
  csharp: outlineJvm,
  go: outlineGo,
  java: outlineJvm,
  javascript: outlineJavaScript,
  kotlin: outlineJvm,
  markdown: outlineMarkdown,
  python: outlinePython,
  ruby: outlineRuby,
  rust: outlineRust,
  typescript: outlineJavaScript,
}));

/**
 * Declarations with line numbers from text the caller already read. A language
 * with no scanner returns an empty list: "not outlined", not "no declarations".
 */
export function outlineSource(text, path) {
  const language = languageForPath(path);
  const scanner = SCANNERS.get(language);
  if (!scanner) return { language, declarations: [], truncated: false };
  const out = collector();
  const { lines, skipped } = scannableLines(text);
  scanner(lines, out);
  return { language, declarations: out.declarations, truncated: out.truncated || skipped };
}

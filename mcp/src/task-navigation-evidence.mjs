import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { extractSummaryExcerpt } from './vault.mjs';

const TASK_NAVIGATION_EVIDENCE_CONTRACT = 'taskNavigation:v1';

const SOURCE_FILE_MAX_BYTES = 2 * 1024 * 1024;
const COORDINATE_LIMITS = Object.freeze({ primary: 1, supporting: 1, test: 3 });
const LABEL_TO_ROLE = new Map([
  ['Primary implementation', 'primary'],
  ['Supporting implementation', 'supporting'],
  ['Focused test', 'test'],
]);

function empty(status, overrides = {}) {
  return {
    contract: TASK_NAVIGATION_EVIDENCE_CONTRACT,
    status,
    basis: 'reviewed_markdown_evidence',
    currentness: 'unavailable',
    primary: null,
    supporting: null,
    tests: [],
    boundary: { in: '', out: '', completeness: 'unknown' },
    diagnostics: [],
    readPlan: {
      kind: 'source_batch',
      targetCount: 0,
      policy: 'stop_on_match',
    },
    ...overrides,
  };
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function markdownSection(body, heading) {
  if (typeof body !== 'string' || !body) return '';
  const wanted = heading.toLocaleLowerCase('en-US');
  const rows = [];
  let collecting = false;
  for (const line of body.split('\n')) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (collecting) break;
      collecting = match[1].trim().toLocaleLowerCase('en-US') === wanted;
      continue;
    }
    if (collecting) rows.push(line);
  }
  return rows.join('\n').trim();
}

function boundedSection(body, heading) {
  const section = markdownSection(body, heading);
  return section ? extractSummaryExcerpt(section, 280) : '';
}

function safeRelativeFilePath(value) {
  const raw = normalizeText(value);
  if (raw.includes('\\')) return null;
  const path = raw.replace(/^\.\//, '');
  if (
    !path
    || path.length > 500
    || isAbsolute(path)
    || /^[A-Za-z]:\//.test(path)
    || /[\u0000-\u001f\u007f]/u.test(path)
  ) return null;
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return path;
}

function parseCoordinate(value, role, doc) {
  const raw = normalizeText(value);
  const separator = raw.indexOf('#');
  if (separator <= 0 || separator === raw.length - 1 || raw.indexOf('#', separator + 1) !== -1) {
    return { diagnostic: { code: 'coordinate_invalid', role } };
  }
  const path = safeRelativeFilePath(raw.slice(0, separator));
  const symbol = normalizeText(raw.slice(separator + 1));
  if (!path) return { diagnostic: { code: 'path_invalid', role } };
  if (!symbol || symbol.length > 200 || /[\u0000-\u001f\u007f]/u.test(symbol)) {
    return { diagnostic: { code: 'symbol_invalid', role } };
  }
  if (
    role !== 'test'
    && !/^[A-Za-z_$][A-Za-z0-9_$]*(?:<[^<>#\r\n]{1,80}>)?(?:::[A-Za-z_$][A-Za-z0-9_$]*(?:<[^<>#\r\n]{1,80}>)?)*$/.test(symbol)
  ) {
    return { diagnostic: { code: 'symbol_invalid', role } };
  }
  return { coordinate: { path, symbol, role, doc } };
}

export function parseTaskNavigationEvidenceSource(value) {
  const raw = normalizeText(value);
  if (!raw.startsWith('navigation:')) return null;
  const match = raw.match(/^navigation:(primary|supporting|test):(.+)$/);
  if (!match) return { ok: false, diagnostic: { code: 'coordinate_invalid', role: 'projection' } };
  const parsed = parseCoordinate(match[2], match[1], null);
  return parsed.coordinate
    ? { ok: true, coordinate: parsed.coordinate }
    : { ok: false, diagnostic: parsed.diagnostic };
}

function reviewedCoordinates(docs) {
  const coordinates = [];
  const diagnostics = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (doc?.frontmatter?.kind !== 'element') continue;
    const section = markdownSection(doc?.body, 'Evidence');
    if (!section) continue;
    for (const line of section.split('\n')) {
      const match = line.match(/^\s*-\s*(Primary implementation|Supporting implementation|Focused test):\s*`([^`]+)`(?:\s+.*)?$/);
      if (!match) continue;
      const role = LABEL_TO_ROLE.get(match[1]);
      const parsed = parseCoordinate(match[2], role, doc);
      if (parsed.coordinate) coordinates.push(parsed.coordinate);
      else diagnostics.push(parsed.diagnostic);
    }
  }
  const unique = [];
  const seen = new Set();
  for (const coordinate of coordinates) {
    const key = `${coordinate.role}\0${coordinate.path}\0${coordinate.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(coordinate);
  }
  return { coordinates: unique, diagnostics };
}

function outside(root, target) {
  const path = relative(root, target);
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function readNamedSourceFile(sourceRoot, path) {
  let root;
  let absolute;
  try {
    root = realpathSync(sourceRoot);
    absolute = resolve(root, path);
    let cursor = root;
    for (const segment of path.split('/')) {
      cursor = resolve(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) return { code: 'path_unsafe' };
    }
    const metadata = lstatSync(absolute);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return { code: 'path_unsafe' };
    const real = realpathSync(absolute);
    if (outside(root, real)) return { code: 'path_unsafe' };
    if (metadata.size > SOURCE_FILE_MAX_BYTES) return { code: 'file_too_large' };
    const bytes = readFileSync(real);
    const after = lstatSync(absolute);
    if (
      after.size !== metadata.size
      || after.mtimeMs !== metadata.mtimeMs
      || after.ino !== metadata.ino
    ) return { code: 'source_raced' };
    if (bytes.includes(0)) return { code: 'file_not_text' };
    return { lines: bytes.toString('utf8').split(/\r?\n/) };
  } catch {
    return { code: 'path_missing' };
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function identifier(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function stripGenerics(value) {
  return value.replace(/<[^<>]*>/g, '').trim();
}

function declarationPattern(name, { functionsOnly = false } = {}) {
  const escaped = escapeRegExp(name);
  const patterns = [
    `\\b(?:pub(?:\\([^)]*\\))?\\s+)?(?:async\\s+)?fn\\s+${escaped}\\b`,
    `\\b(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`,
    `^\\s*(?:async\\s+)?def\\s+${escaped}\\b`,
    `^\\s*func(?:\\s*\\([^)]*\\))?\\s+${escaped}\\b`,
  ];
  if (!functionsOnly) {
    patterns.push(
      `\\b(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\b`,
      `\\b(?:class|struct|enum|trait|interface|type)\\s+${escaped}\\b`,
    );
  }
  return new RegExp(patterns.join('|'));
}

function quotedTestPattern(label) {
  const escaped = escapeRegExp(label);
  return new RegExp("\\b(?:test|it)\\s*\\(\\s*([\\\"'`])" + escaped + "\\1", 'g');
}

function rustCharacterLiteralEnd(line, start) {
  let escaped = false;
  for (let index = start + 1; index < Math.min(line.length, start + 16); index += 1) {
    const char = line[index];
    if (!escaped && char === "'") return index;
    if (!escaped && char === '\\') escaped = true;
    else escaped = false;
  }
  return -1;
}

function sourceLexicalState() {
  return {
    blockCommentDepth: 0,
    quote: null,
    rawTerminator: null,
    regex: false,
    regexClass: false,
    templates: [],
    escaped: false,
  };
}

function templateFrame() {
  return {
    expressionDepth: 0,
    escaped: false,
    subquote: null,
    subquoteEscaped: false,
    blockComment: false,
    regex: false,
    regexClass: false,
    regexEscaped: false,
  };
}

function javascriptSourcePath(path) {
  return /\.(?:[cm]?js|jsx|ts|tsx)$/i.test(path);
}

function javascriptRegexLiteralStart(line, index) {
  const prefix = line.slice(0, index).trimEnd();
  if (!prefix) return true;
  if ('([{:;,=!?&|+\-*%^~<>'.includes(prefix.at(-1))) return true;
  if (prefix.endsWith(')')) {
    let depth = 0;
    for (let cursor = prefix.length - 1; cursor >= 0; cursor -= 1) {
      if (prefix[cursor] === ')') depth += 1;
      else if (prefix[cursor] === '(') {
        depth -= 1;
        if (depth === 0) {
          const control = prefix.slice(0, cursor).trimEnd().match(/([A-Za-z_$][A-Za-z0-9_$]*)$/)?.[1];
          if (['catch', 'for', 'if', 'switch', 'while', 'with'].includes(control)) return true;
          break;
        }
      }
    }
  }
  const keyword = prefix.match(/([A-Za-z_$][A-Za-z0-9_$]*)$/)?.[1];
  return new Set(['await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'of', 'return', 'throw', 'typeof', 'void', 'yield']).has(keyword);
}

function braceDelta(line, state, path) {
  let delta = 0;
  let openings = 0;
  const code = line.split('');
  const blank = (start, length = 1) => {
    for (let index = start; index < Math.min(code.length, start + length); index += 1) code[index] = ' ';
  };
  for (let index = 0; index < line.length; index += 1) {
    if (state.rawTerminator) {
      blank(index);
      if (line.startsWith(state.rawTerminator, index)) {
        blank(index, state.rawTerminator.length);
        index += state.rawTerminator.length - 1;
        state.rawTerminator = null;
      }
      continue;
    }
    if (state.templates.length > 0) {
      blank(index);
      const frame = state.templates.at(-1);
      const char = line[index];
      if (frame.expressionDepth === 0) {
        if (!frame.escaped && line.startsWith('${', index)) {
          blank(index, 2);
          frame.expressionDepth = 1;
          index += 1;
          continue;
        }
        if (!frame.escaped && char === '`') state.templates.pop();
        if (!frame.escaped && char === '\\') frame.escaped = true;
        else frame.escaped = false;
        continue;
      }
      if (frame.subquote) {
        if (!frame.subquoteEscaped && char === frame.subquote) frame.subquote = null;
        if (!frame.subquoteEscaped && char === '\\') frame.subquoteEscaped = true;
        else frame.subquoteEscaped = false;
        continue;
      }
      if (frame.regex) {
        if (!frame.regexEscaped && char === '[') frame.regexClass = true;
        else if (!frame.regexEscaped && char === ']') frame.regexClass = false;
        else if (!frame.regexEscaped && char === '/' && !frame.regexClass) frame.regex = false;
        if (!frame.regexEscaped && char === '\\') frame.regexEscaped = true;
        else frame.regexEscaped = false;
        continue;
      }
      if (frame.blockComment) {
        if (line.startsWith('*/', index)) {
          blank(index, 2);
          frame.blockComment = false;
          index += 1;
        }
        continue;
      }
      if (line.startsWith('//', index)) {
        blank(index, line.length - index);
        break;
      }
      if (line.startsWith('/*', index)) {
        blank(index, 2);
        frame.blockComment = true;
        index += 1;
        continue;
      }
      if (char === '/' && javascriptRegexLiteralStart(line, index)) {
        frame.regex = true;
        frame.regexClass = false;
        frame.regexEscaped = false;
        continue;
      }
      if (char === '"' || char === "'") {
        frame.subquote = char;
        frame.subquoteEscaped = false;
        continue;
      }
      if (char === '`') {
        state.templates.push(templateFrame());
        continue;
      }
      if (char === '{') frame.expressionDepth += 1;
      else if (char === '}') frame.expressionDepth -= 1;
      continue;
    }
    if (state.quote) {
      blank(index);
      const char = line[index];
      if (!state.escaped && char === state.quote) state.quote = null;
      if (!state.escaped && char === '\\') state.escaped = true;
      else state.escaped = false;
      continue;
    }
    if (state.regex) {
      blank(index);
      const char = line[index];
      if (!state.escaped && char === '[') state.regexClass = true;
      else if (!state.escaped && char === ']') state.regexClass = false;
      else if (!state.escaped && char === '/' && !state.regexClass) state.regex = false;
      if (!state.escaped && char === '\\') state.escaped = true;
      else state.escaped = false;
      continue;
    }
    if (state.blockCommentDepth > 0) {
      blank(index);
      if (path.endsWith('.rs') && line.startsWith('/*', index)) {
        blank(index, 2);
        state.blockCommentDepth += 1;
        index += 1;
        continue;
      }
      if (line.startsWith('*/', index)) {
        blank(index, 2);
        state.blockCommentDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (line.startsWith('//', index)) {
      blank(index, line.length - index);
      break;
    }
    if (line.startsWith('/*', index)) {
      blank(index, 2);
      state.blockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (path.endsWith('.rs')) {
      const raw = line.slice(index).match(/^(?:br|r)(#{0,16})"/);
      if (raw) {
        blank(index, raw[0].length);
        state.rawTerminator = `"${raw[1]}`;
        index += raw[0].length - 1;
        continue;
      }
    }
    const char = line[index];
    if (char === '/' && javascriptSourcePath(path) && javascriptRegexLiteralStart(line, index)) {
      blank(index);
      state.regex = true;
      state.regexClass = false;
      state.escaped = false;
      continue;
    }
    if (char === '`' && javascriptSourcePath(path)) {
      blank(index);
      state.templates.push(templateFrame());
      continue;
    }
    if (char === '"' || char === '`') {
      blank(index);
      state.quote = char;
      state.escaped = false;
      continue;
    }
    if (char === "'") {
      if (path.endsWith('.rs') && rustCharacterLiteralEnd(line, index) === -1) continue;
      blank(index);
      state.quote = char;
      state.escaped = false;
      continue;
    }
    if (char === '{') {
      delta += 1;
      openings += 1;
    }
    if (char === '}') delta -= 1;
  }
  if (state.quote && state.escaped) state.escaped = false;
  return { delta, openings, code: code.join(''), unsupported: false };
}

function codeOnlyLines(lines, path) {
  if (/\.py$/i.test(path)) {
    const state = pythonLexicalState();
    return lines.map((line) => pythonCodeLine(line, state));
  }
  const state = sourceLexicalState();
  return lines.map((line) => braceDelta(line, state, path).code);
}

function rustOwnerContains(lines, candidateIndex, owner) {
  const expectedOwner = stripGenerics(owner);
  for (let start = candidateIndex - 1; start >= 0; start -= 1) {
    if (!/^\s*impl\b/.test(lines[start])) continue;
    const header = lines[start].split(/\bwhere\b|\{/u, 1)[0];
    const withoutImplGenerics = stripGenerics(header)
      .replace(/^\s*impl\s+/, '')
      .trim();
    const target = withoutImplGenerics.includes(' for ')
      ? withoutImplGenerics.slice(withoutImplGenerics.lastIndexOf(' for ') + 5).trim()
      : withoutImplGenerics;
    const targetIdentifiers = target.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
    if (targetIdentifiers.at(-1) !== expectedOwner) continue;
    let depth = 0;
    let opened = false;
    let closedBeforeCandidate = false;
    const state = sourceLexicalState();
    for (let cursor = start; cursor <= candidateIndex; cursor += 1) {
      const braces = braceDelta(lines[cursor], state, '.rs');
      depth += braces.delta;
      if (depth > 0) opened = true;
      if (opened && depth === 0 && cursor < candidateIndex) {
        closedBeforeCandidate = true;
        break;
      }
    }
    if (opened && !closedBeforeCandidate && depth > 0) return true;
  }
  return false;
}

function goMethodHasOwner(line, owner, name) {
  const escapedOwner = escapeRegExp(stripGenerics(owner));
  const escapedName = escapeRegExp(name);
  return new RegExp(
    `^\\s*func\\s*\\([^)]*\\*?\\s*${escapedOwner}(?:\\[[^\\]]+\\])?\\s*\\)\\s*${escapedName}\\b`,
  ).test(line);
}

function quotedTestLines(lines, codeLines, symbol) {
  const pattern = quotedTestPattern(symbol);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(lines[index])) !== null) {
      const quoteIndex = lines[index].indexOf(match[1], match.index);
      if (quoteIndex < 0) continue;
      const call = codeLines[index].slice(match.index, quoteIndex);
      if (/^\b(?:test|it)\s*\(\s*$/.test(call)) matches.push(index + 1);
    }
  }
  return matches;
}

function testFilePath(path) {
  return /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|(?:^|[._-])(?:test|spec)\.[^.\/]+$/i.test(path);
}

function testDeclarationIsVerified(codeLines, candidateIndex, name, path) {
  if (path.endsWith('.rs')) {
    for (let index = candidateIndex - 1; index >= 0; index -= 1) {
      const line = codeLines[index].trim();
      if (!line) continue;
      if (!line.startsWith('#[')) return false;
      if (/#\[(?:[A-Za-z_$][A-Za-z0-9_$]*::)*test(?:\([^\]]*\))?\]/.test(line)) return true;
    }
    return false;
  }
  if (path.endsWith('.go')) {
    return /_test\.go$/i.test(path) && /^(?:Benchmark|Example|Fuzz|Test)[A-Za-z0-9_]+$/.test(name);
  }
  if (/\.py$/i.test(path)) {
    return /(?:^|\/)(?:tests?\/|test_[^/]*\.py$)/i.test(path) && /^test_[A-Za-z0-9_]+$/.test(name);
  }
  return false;
}

function symbolLines(lines, symbol, role, path) {
  const parts = symbol.split('::').map(stripGenerics).filter(Boolean);
  const name = parts.at(-1) ?? symbol;
  const codeLines = codeOnlyLines(lines, path);
  if (role === 'test' && testFilePath(path)) {
    const quoted = quotedTestLines(lines, codeLines, symbol);
    if (quoted.length > 0) return quoted;
  }
  if (!identifier(name)) {
    return [];
  }
  const pattern = declarationPattern(name, { functionsOnly: role === 'test' });
  let candidates = codeLines.flatMap((line, index) => pattern.test(line) ? [index] : []);
  if (role === 'test') {
    candidates = candidates.filter((index) => testDeclarationIsVerified(codeLines, index, name, path));
  }
  if (role === 'test' && parts.length >= 2) return [];
  if (path.endsWith('.rs') && parts.length >= 2) {
    const owner = parts.at(-2);
    candidates = candidates.filter((index) => rustOwnerContains(codeLines, index, owner));
  } else if (path.endsWith('.go') && parts.length >= 2) {
    const owner = parts.at(-2);
    candidates = candidates.filter((index) => goMethodHasOwner(codeLines[index], owner, name));
  } else if (parts.length >= 2) {
    return [];
  }
  return candidates.map((index) => index + 1);
}

function pythonLexicalState() {
  return { quote: null, triple: null, escaped: false };
}

function pythonCodeLine(line, state) {
  const code = line.split('');
  const blank = (start, length = 1) => {
    for (let index = start; index < Math.min(code.length, start + length); index += 1) code[index] = ' ';
  };
  for (let index = 0; index < line.length; index += 1) {
    if (state.triple) {
      blank(index);
      if (line.startsWith(state.triple, index)) {
        blank(index, 3);
        index += 2;
        state.triple = null;
      }
      continue;
    }
    if (state.quote) {
      blank(index);
      const char = line[index];
      if (!state.escaped && char === state.quote) state.quote = null;
      if (!state.escaped && char === '\\') state.escaped = true;
      else state.escaped = false;
      continue;
    }
    if (line[index] === '#') {
      blank(index, line.length - index);
      break;
    }
    if (line.startsWith("'''", index) || line.startsWith('"""', index)) {
      state.triple = line.slice(index, index + 3);
      blank(index, 3);
      index += 2;
      continue;
    }
    if (line[index] === "'" || line[index] === '"') {
      state.quote = line[index];
      state.escaped = false;
      blank(index);
    }
  }
  if (state.quote && state.escaped) state.escaped = false;
  return code.join('');
}

function sourceBlockEndLine(lines, startLine, path) {
  const startIndex = startLine - 1;
  if (/\.py$/i.test(path)) {
    const indent = lines[startIndex].match(/^\s*/)?.[0].length ?? 0;
    const state = pythonLexicalState();
    let bracketDepth = 0;
    let signatureEnd = null;
    for (let index = startIndex; index < lines.length; index += 1) {
      const code = pythonCodeLine(lines[index], state);
      for (let cursor = 0; cursor < code.length; cursor += 1) {
        if ('([{'.includes(code[cursor])) bracketDepth += 1;
        else if (')]}'.includes(code[cursor])) bracketDepth = Math.max(0, bracketDepth - 1);
        else if (code[cursor] === ':' && bracketDepth === 0) {
          signatureEnd = index;
          if (code.slice(cursor + 1).trim()) return index + 1;
          break;
        }
      }
      if (signatureEnd !== null) break;
    }
    if (signatureEnd === null) return null;
    for (let index = signatureEnd + 1; index < lines.length; index += 1) {
      const code = pythonCodeLine(lines[index], state);
      if (!code.trim()) continue;
      const nextIndent = lines[index].match(/^\s*/)?.[0].length ?? 0;
      if (nextIndent <= indent) return index;
    }
    return lines.length;
  }
  let depth = 0;
  let opened = false;
  const state = sourceLexicalState();
  for (let index = startIndex; index < lines.length; index += 1) {
    const braces = braceDelta(lines[index], state, path);
    if (braces.unsupported) return null;
    if (braces.openings > 0) opened = true;
    depth += braces.delta;
    if (opened && depth <= 0) return index + 1;
    if (!opened && /;\s*$/.test(lines[index])) return index + 1;
  }
  return opened ? null : startLine;
}

function verifyCoordinate(sourceRoot, coordinate) {
  const source = readNamedSourceFile(sourceRoot, coordinate.path);
  if (!source.lines) return { diagnostic: { code: source.code, role: coordinate.role } };
  const lines = symbolLines(source.lines, coordinate.symbol, coordinate.role, coordinate.path);
  if (lines.length === 0) return { diagnostic: { code: 'symbol_not_found', role: coordinate.role } };
  if (lines.length !== 1) return { diagnostic: { code: 'symbol_ambiguous', role: coordinate.role } };
  const endLine = sourceBlockEndLine(source.lines, lines[0], coordinate.path);
  if (endLine === null) return { diagnostic: { code: 'symbol_span_unresolved', role: coordinate.role } };
  return {
    target: {
      path: coordinate.path,
      symbol: coordinate.symbol,
      role: coordinate.role,
      line: lines[0],
      endLine,
      sourceStatus: 'supported_current',
    },
  };
}

export function verifyTaskNavigationEvidenceCoordinate(sourceRoot, coordinate) {
  return verifyCoordinate(sourceRoot, coordinate);
}

export function verifyTaskNavigationEvidencePath(sourceRoot, value) {
  const path = safeRelativeFilePath(value);
  if (!path) return { ok: false, diagnostic: { code: 'path_invalid', role: 'path' } };
  const source = readNamedSourceFile(sourceRoot, path);
  return source.lines
    ? { ok: true, path }
    : { ok: false, diagnostic: { code: source.code, role: 'path' } };
}

function cardinalityProblem(coordinates) {
  return Object.entries(COORDINATE_LIMITS).some(([role, limit]) => (
    coordinates.filter((coordinate) => coordinate.role === role).length > limit
  ));
}

export function buildTaskNavigationEvidence(input = {}) {
  if (input.sourceStatus !== 'verified_current' || input.sourceCurrentness !== 'current') {
    return empty('blocked', {
      blockedBy: input.sourceBlockedBy ?? 'source_not_current',
      currentness: input.sourceCurrentness ?? 'unavailable',
    });
  }
  const reviewed = reviewedCoordinates(input.docs);
  if (reviewed.coordinates.length === 0 && reviewed.diagnostics.length === 0) {
    return empty('unknown', { currentness: 'current' });
  }
  if (cardinalityProblem(reviewed.coordinates)) {
    return empty('blocked', {
      blockedBy: 'coordinate_cardinality',
      currentness: 'current',
      diagnostics: [{ code: 'coordinate_cardinality', role: 'projection' }],
    });
  }
  const verified = reviewed.coordinates.map((coordinate) => verifyCoordinate(input.sourceRoot, coordinate));
  const diagnostics = [...reviewed.diagnostics, ...verified.flatMap((row) => row.diagnostic ? [row.diagnostic] : [])];
  if (diagnostics.length > 0) {
    return empty('blocked', {
      blockedBy: 'coordinate_verification',
      currentness: 'current',
      diagnostics: diagnostics.sort((left, right) => left.code.localeCompare(right.code)),
    });
  }
  const targets = verified.map((row) => row.target);
  const primary = targets.find((target) => target.role === 'primary') ?? null;
  const supporting = targets.find((target) => target.role === 'supporting') ?? null;
  const tests = targets.filter((target) => target.role === 'test');
  const boundaryDoc = reviewed.coordinates.find((coordinate) => coordinate.role === 'primary')?.doc
    ?? reviewed.coordinates[0]?.doc;
  const boundaryIn = boundedSection(boundaryDoc?.body, 'Includes');
  const boundaryOut = boundedSection(boundaryDoc?.body, 'Excludes');
  const boundary = {
    in: boundaryIn,
    out: boundaryOut,
    completeness: boundaryIn && boundaryOut ? 'recorded_non_exhaustive' : 'unknown',
  };
  const status = primary && tests.length > 0 && boundary.completeness === 'recorded_non_exhaustive'
    ? 'ready'
    : 'partial';
  return empty(status, {
    currentness: 'current',
    primary,
    supporting,
    tests,
    boundary,
    readPlan: {
      kind: 'source_batch',
      targetCount: targets.length,
      policy: 'stop_on_match',
    },
  });
}

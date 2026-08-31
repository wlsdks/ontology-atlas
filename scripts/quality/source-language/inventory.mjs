import ts from 'typescript';

import {
  classifySourcePath,
  classifyStringScanPath,
  isSupportedSourcePath,
  sourceCommentSyntax,
  STRING_SCAN_SCOPES,
} from './source-paths.mjs';

export {
  classifySourcePath,
  classifyStringScanPath,
  isStringScannedPath,
  isSupportedSourcePath,
} from './source-paths.mjs';

const UNEXPECTED_LANGUAGE = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

function typescriptComments(source, jsx) {
  const sourceFile = ts.createSourceFile(
    jsx ? 'source.tsx' : 'source.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const protectedRanges = [];
  const protectedKinds = new Set([
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.RegularExpressionLiteral,
    ts.SyntaxKind.TemplateHead,
    ts.SyntaxKind.TemplateMiddle,
    ts.SyntaxKind.TemplateTail,
    ts.SyntaxKind.JsxText,
  ]);
  const collectProtectedRanges = (node) => {
    if (protectedKinds.has(node.kind)) {
      protectedRanges.push({ start: node.getStart(sourceFile), end: node.end });
    }
    ts.forEachChild(node, collectProtectedRanges);
  };
  collectProtectedRanges(sourceFile);
  protectedRanges.sort((left, right) => left.start - right.start);

  const comments = [];
  let protectedIndex = 0;
  for (let index = 0; index < source.length - 1; index += 1) {
    while (protectedRanges[protectedIndex]?.end <= index) protectedIndex += 1;
    const protectedRange = protectedRanges[protectedIndex];
    if (protectedRange && protectedRange.start <= index && index < protectedRange.end) {
      index = protectedRange.end - 1;
      continue;
    }
    if (source[index] !== '/' || !['/', '*'].includes(source[index + 1])) continue;
    const range = ts.getTrailingCommentRanges(source, index)?.find((item) => item.pos === index);
    if (!range) continue;
    comments.push({ start: range.pos, end: range.end, text: source.slice(range.pos, range.end) });
    index = range.end - 1;
  }
  return comments;
}

/**
 * Rust spends `'` on two unrelated things, and only one of them is a string.
 *
 * `'a` and `'static` are lifetimes; `'x'` and `'\n'` are char literals. Treating every `'` as a
 * quote makes one odd lifetime swallow the rest of the file: measured 2026-08-24 on
 * `src-tauri/src/lib.rs`, a single `&'static str` blinded the scanner to 2,624 consecutive lines,
 * and the file reported **zero** Korean comments while it actually held 199. Two lifetimes in a row
 * happened to pair up and re-sync, which is why the failure looked intermittent rather than total.
 *
 * Returns the index just past a genuine char literal, or `null` when the quote opens a lifetime.
 */
function rustCharLiteralEnd(source, index) {
  const match = /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\}|.)|[^\\'])'/.exec(
    source.slice(index),
  );
  return match ? index + match[0].length : null;
}

function rawStringEnd(source, index) {
  const match = /^(?:br|r)(#*)"/.exec(source.slice(index));
  if (!match) return null;
  const close = `"${match[1]}`;
  const at = source.indexOf(close, index + match[0].length);
  return at < 0 ? source.length : at + close.length;
}

function cLikeComments(
  source,
  { line = true, block = true, rust = false, nestedBlocks = false } = {},
) {
  const comments = [];
  let index = 0;
  let state = 'normal';
  let quote = '';
  let start = 0;
  let depth = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'string') {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === quote) state = 'normal';
      index += 1;
      continue;
    }
    if (state === 'line') {
      if (char === '\n') {
        comments.push({ start, end: index, text: source.slice(start, index) });
        state = 'normal';
      }
      index += 1;
      continue;
    }
    if (state === 'block') {
      if (nestedBlocks && char === '/' && next === '*') {
        depth += 1;
        index += 2;
        continue;
      }
      if (char === '*' && next === '/') {
        depth -= 1;
        index += 2;
        if (depth === 0) {
          comments.push({ start, end: index, text: source.slice(start, index) });
          state = 'normal';
        }
        continue;
      }
      index += 1;
      continue;
    }

    if (rust) {
      const end = rawStringEnd(source, index);
      if (end != null) {
        index = end;
        continue;
      }
    }
    if (rust && char === "'") {
      const charLiteralEnd = rustCharLiteralEnd(source, index);
      // A lifetime is not a string: step over the quote and keep reading code.
      index = charLiteralEnd ?? index + 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      state = 'string';
      quote = char;
      index += 1;
      continue;
    }
    if (line && char === '/' && next === '/') {
      state = 'line';
      start = index;
      index += 2;
      continue;
    }
    if (block && char === '/' && next === '*') {
      state = 'block';
      start = index;
      depth = 1;
      index += 2;
      continue;
    }
    index += 1;
  }

  if (state === 'line') comments.push({ start, end: source.length, text: source.slice(start) });
  if (state === 'block') comments.push({ start, end: source.length, text: source.slice(start) });
  return comments;
}

function htmlComments(source) {
  const comments = [];
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf('<!--', from);
    if (start < 0) break;
    const close = source.indexOf('-->', start + 4);
    const end = close < 0 ? source.length : close + 3;
    comments.push({ start, end, text: source.slice(start, end) });
    from = end;
  }

  const embedded = [
    {
      pattern: /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
      extract: (content) => cLikeComments(content, { line: false, block: true }),
    },
    {
      pattern: /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
      extract: (content) => {
        const candidates = [
          ...typescriptComments(content, false),
          ...cLikeComments(content),
        ].sort((left, right) => left.start - right.start || left.end - right.end);
        const merged = [];
        for (const comment of candidates) {
          if (merged.some((existing) => comment.start >= existing.start && comment.end <= existing.end)) {
            continue;
          }
          merged.push(comment);
        }
        return merged;
      },
    },
  ];
  for (const { pattern, extract } of embedded) {
    for (const match of source.matchAll(pattern)) {
      const content = match[1] ?? '';
      const contentAt = (match.index ?? 0) + match[0].indexOf(content);
      for (const comment of extract(content)) {
        comments.push({
          start: contentAt + comment.start,
          end: contentAt + comment.end,
          text: comment.text,
        });
      }
    }
  }
  return comments.sort((left, right) => left.start - right.start);
}

function hashComments(source) {
  const comments = [];
  let offset = 0;
  for (const line of source.split(/(?<=\n)/)) {
    let quote = null;
    let escaped = false;
    let commentAt = -1;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\' && quote) {
        escaped = true;
        continue;
      }
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
        if (index === 0 && line[1] === '!') break;
        commentAt = index;
        break;
      }
    }
    if (commentAt >= 0) {
      const text = line.slice(commentAt).replace(/\n$/u, '');
      comments.push({ start: offset + commentAt, end: offset + commentAt + text.length, text });
    }
    offset += line.length;
  }
  return comments;
}

export function extractCommentTokens(path, source) {
  const syntax = sourceCommentSyntax(path);
  if (syntax?.kind === 'typescript') return typescriptComments(source, syntax.jsx);
  if (syntax?.kind === 'cLike') {
    return cLikeComments(source, {
      rust: syntax.rust,
      nestedBlocks: syntax.rust,
    });
  }
  if (syntax?.kind === 'css') return cLikeComments(source, { line: false, block: true });
  if (syntax?.kind === 'html') return htmlComments(source);
  if (syntax?.kind === 'hash') return hashComments(source);
  return [];
}

function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function lineAt(starts, offset) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle;
  }
  return low + 1;
}

function emptyScope() {
  return {
    scannedFiles: 0,
    scannedComments: 0,
    unexpectedFiles: 0,
    unexpectedLines: 0,
    unexpectedLanguageCodePoints: 0,
  };
}

export function auditSourceCommentEntries(entries) {
  const result = {
    scannedFiles: 0,
    scannedComments: 0,
    unexpectedFiles: 0,
    unexpectedLines: 0,
    unexpectedLanguageCodePoints: 0,
    scopes: {
      current: emptyScope(),
      testFixture: emptyScope(),
      historicalPrototype: emptyScope(),
    },
    violations: [],
  };

  for (const entry of entries) {
    if (!isSupportedSourcePath(entry.path)) continue;
    const scopeName = classifySourcePath(entry.path);
    const scope = result.scopes[scopeName];
    const comments = extractCommentTokens(entry.path, entry.content);
    const starts = lineStarts(entry.content);
    const fileLines = new Set();
    let fileCodePoints = 0;

    result.scannedFiles += 1;
    result.scannedComments += comments.length;
    scope.scannedFiles += 1;
    scope.scannedComments += comments.length;

    for (const comment of comments) {
      const matches = [...comment.text.matchAll(UNEXPECTED_LANGUAGE)];
      if (matches.length === 0) continue;
      fileCodePoints += matches.length;
      for (const match of matches) {
        const line = lineAt(starts, comment.start + (match.index ?? 0));
        if (fileLines.has(line)) continue;
        fileLines.add(line);
        const text = entry.content.split(/\r?\n/)[line - 1]?.trim() ?? '';
        result.violations.push({
          path: entry.path,
          line,
          scope: scopeName,
          text,
        });
      }
    }

    if (fileCodePoints > 0) {
      result.unexpectedFiles += 1;
      result.unexpectedLines += fileLines.size;
      result.unexpectedLanguageCodePoints += fileCodePoints;
      scope.unexpectedFiles += 1;
      scope.unexpectedLines += fileLines.size;
      scope.unexpectedLanguageCodePoints += fileCodePoints;
    }
  }
  return result;
}

/**
 * The literal kinds a program can *print*.
 *
 * `RegularExpressionLiteral` is deliberately absent, and that is the whole exemption rule for
 * matcher data. A Korean alternation inside a regex is not prose this repository writes; it is how
 * `absorb` recognises a heading in the **user's own** Korean CLAUDE.md, how the verify scripts
 * assert against the installed app's Korean UI, and how a slug is built from a Korean title. That
 * is typed data in the same sense as `display_ko`. A regex cannot be an error message, so treating
 * every regex as data costs no coverage while removing ~60 lines of hand-maintained allowlist.
 */
const PRINTED_STRING_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

export function extractStringTokens(path, source) {
  const sourceFile = ts.createSourceFile(
    path.endsWith('.ts') ? 'source.ts' : 'source.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const tokens = [];
  const visit = (node) => {
    if (PRINTED_STRING_KINDS.has(node.kind)) {
      tokens.push({ start: node.getStart(sourceFile), end: node.end });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return tokens;
}

function emptyStringScope() {
  return {
    scannedFiles: 0,
    scannedStrings: 0,
    unexpectedFiles: 0,
    unexpectedLines: 0,
    unexpectedLanguageCodePoints: 0,
  };
}

/**
 * Counts non-English code points inside printed string literals, per ratchet scope.
 *
 * `allowlist` rows are `{ id, path, why, allow }`, where `allow` is `'file'` or a RegExp tested
 * against the whole source line. Every row's `id` is reported in `allowlistHits` so a row that
 * stopped matching anything can fail as stale — an exception nobody can see expiring is how the
 * previous allowlist grew to cover files that were merely never translated.
 */
export function auditSourceStringEntries(entries, allowlist = []) {
  const result = {
    scannedFiles: 0,
    scannedStrings: 0,
    unexpectedFiles: 0,
    unexpectedLines: 0,
    unexpectedLanguageCodePoints: 0,
    allowedLines: 0,
    allowlistHits: Object.fromEntries(allowlist.map((row) => [row.id, 0])),
    scopes: Object.fromEntries(
      Object.keys(STRING_SCAN_SCOPES).map((scope) => [scope, emptyStringScope()]),
    ),
    violations: [],
  };

  for (const entry of entries) {
    const scopeName = classifyStringScanPath(entry.path);
    if (!scopeName) continue;
    const scope = result.scopes[scopeName];
    const tokens = extractStringTokens(entry.path, entry.content);
    const starts = lineStarts(entry.content);
    const lines = entry.content.split(/\r?\n/);
    const rows = allowlist.filter((row) => row.path === entry.path);
    const seen = new Set();
    const allowedSeen = new Set();
    let fileCodePoints = 0;
    let fileLines = 0;

    result.scannedFiles += 1;
    result.scannedStrings += tokens.length;
    scope.scannedFiles += 1;
    scope.scannedStrings += tokens.length;

    for (const token of tokens) {
      const text = entry.content.slice(token.start, token.end);
      const matches = [...text.matchAll(UNEXPECTED_LANGUAGE)];
      for (const match of matches) {
        const line = lineAt(starts, token.start + (match.index ?? 0));
        const lineText = lines[line - 1] ?? '';
        const allowed = rows.find((row) => row.allow === 'file' || row.allow.test(lineText));
        if (allowed) {
          // Count *lines*, not code points: one Korean label is one exempted line, so a row's hit
          // count stays readable next to the file it covers.
          if (!allowedSeen.has(`${allowed.id}:${line}`)) {
            allowedSeen.add(`${allowed.id}:${line}`);
            result.allowlistHits[allowed.id] += 1;
            result.allowedLines += 1;
          }
          continue;
        }
        fileCodePoints += 1;
        if (seen.has(line)) continue;
        seen.add(line);
        fileLines += 1;
        result.violations.push({
          path: entry.path,
          line,
          scope: scopeName,
          text: lineText.trim(),
        });
      }
    }

    if (fileCodePoints > 0) {
      result.unexpectedFiles += 1;
      result.unexpectedLines += fileLines;
      result.unexpectedLanguageCodePoints += fileCodePoints;
      scope.unexpectedFiles += 1;
      scope.unexpectedLines += fileLines;
      scope.unexpectedLanguageCodePoints += fileCodePoints;
    }
  }
  return result;
}

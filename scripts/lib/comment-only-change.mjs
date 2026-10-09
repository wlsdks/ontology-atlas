import ts from 'typescript';

const KINDS = { '.ts': ts.ScriptKind.TS, '.tsx': ts.ScriptKind.TSX, '.mts': ts.ScriptKind.TS, '.js': ts.ScriptKind.JS, '.jsx': ts.ScriptKind.JSX, '.mjs': ts.ScriptKind.JS, '.cjs': ts.ScriptKind.JS };
const printer = ts.createPrinter({ removeComments: true });

export function supportsCommentOnlyCheck(path) {
  return Object.hasOwn(KINDS, path.slice(path.lastIndexOf('.')));
}

function codeOf(text, path) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, KINDS[path.slice(path.lastIndexOf('.'))]);
  if (source.parseDiagnostics?.length) return null;
  return printer.printFile(source);
}

export function isCommentOnlyChange(before, after, path) {
  if (typeof before !== 'string' || typeof after !== 'string' || !supportsCommentOnlyCheck(path)) return false;
  const a = codeOf(before, path);
  const b = codeOf(after, path);
  return a !== null && a === b;
}

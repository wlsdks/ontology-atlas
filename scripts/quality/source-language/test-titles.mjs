import ts from 'typescript';

const TITLE_ROOTS = new Set(['describe', 'it', 'test', 'suite', 'bench']);
const TITLE_MODIFIERS = new Set([
  'each', 'skip', 'only', 'todo', 'concurrent', 'sequential', 'describe', 'step',
  'fails', 'serial', 'parallel', 'fixme', 'skipIf', 'runIf', 'for',
]);
const THIRD_ARGUMENT_ASSERTS = new Set([
  'equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual',
  'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'throws',
  'doesNotThrow', 'rejects', 'doesNotReject', 'partialDeepStrictEqual',
]);
const SECOND_ARGUMENT_ASSERTS = new Set(['ok', 'ifError']);
const PRINTED_LITERALS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

const HANGUL = /\p{Script=Hangul}/u;

export function isTestSourcePath(path) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

export function hasHangul(text) {
  return HANGUL.test(text);
}

function titleRoot(expression) {
  let node = expression;
  while (true) {
    if (ts.isIdentifier(node)) return TITLE_ROOTS.has(node.text) ? node.text : null;
    if (ts.isPropertyAccessExpression(node) && TITLE_MODIFIERS.has(node.name.text)) node = node.expression;
    else if (ts.isCallExpression(node)) node = node.expression;
    else return null;
  }
}

const hole = (node, sourceFile) => `\${${node.getText(sourceFile)}}`;

function evaluatedText(node, sourceFile) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node)) return evaluatedText(node.expression, sourceFile);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.reduce(
      (text, span) => text + (evaluatedText(span.expression, sourceFile) ?? hole(span.expression, sourceFile)) + span.literal.text,
      node.head.text,
    );
  }
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return null;
  const left = evaluatedText(node.left, sourceFile);
  const right = evaluatedText(node.right, sourceFile);
  if (left === null && right === null) return null;
  return (left ?? hole(node.left, sourceFile)) + (right ?? hole(node.right, sourceFile));
}

function printedLiterals(node) {
  const parts = [];
  const visit = (child) => {
    if (PRINTED_LITERALS.has(child.kind) && child.text.trim() !== '') parts.push(child.text.trim());
    ts.forEachChild(child, visit);
  };
  visit(node);
  return parts.length > 0 ? parts.join(' … ') : null;
}

function messageText(node, sourceFile) {
  return evaluatedText(node, sourceFile) ?? printedLiterals(node);
}

function messageArgument(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    if (callee.text === 'expect') return call.arguments[1];
    if (callee.text === 'assert') return call.arguments[1];
    return undefined;
  }
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) return undefined;
  const owner = callee.expression.text;
  const method = callee.name.text;
  if (owner === 'expect' && method === 'soft') return call.arguments[1];
  if (owner !== 'assert') return undefined;
  if (SECOND_ARGUMENT_ASSERTS.has(method)) return call.arguments[1];
  if (THIRD_ARGUMENT_ASSERTS.has(method)) return call.arguments[2];
  return undefined;
}

export function extractTestTitles(path, source) {
  const jsx = /x$/.test(path);
  const sourceFile = ts.createSourceFile(
    jsx ? 'source.tsx' : 'source.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  const record = (kind, node, text) => {
    if (text === null) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    found.push({ kind, text, line });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const title = node.arguments[0];
      if (titleRoot(node.expression)) record('title', title, evaluatedText(title, sourceFile));
      const message = messageArgument(node);
      if (message) record('message', message, messageText(message, sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function hangulTestTitles(path, source) {
  return extractTestTitles(path, source).filter((entry) => hasHangul(entry.text));
}

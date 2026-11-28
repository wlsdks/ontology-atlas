import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const catalog: Record<string, unknown> = Object.fromEntries(
  readdirSync(path.join(ROOT, 'messages/en')).filter(file => file.endsWith('.json'))
    .map(file => [file.slice(0, -5), JSON.parse(readFileSync(path.join(ROOT, 'messages/en', file), 'utf8'))]),
);

function hasMessage(key: string) {
  let node: unknown = catalog;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object' || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function namespaceOf(init: ts.Expression | undefined): string | null {
  const call = init;
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  if (call.expression.text !== 'useTranslations') return null;
  const [arg] = call.arguments;
  if (!arg) return '';
  if (ts.isStringLiteralLike(arg)) return arg.text;
  if (ts.isObjectLiteralExpression(arg)) {
    const namespace = arg.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText() === 'namespace');
    return namespace && ts.isPropertyAssignment(namespace) && ts.isStringLiteralLike(namespace.initializer) ? namespace.initializer.text : '';
  }
  return null;
}

function literalKeys(node: ts.Expression, seen: Record<string, number>): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literalKeys(node.expression, seen);
  if (ts.isConditionalExpression(node)) {
    seen.ternary += 1;
    return [...literalKeys(node.whenTrue, seen), ...literalKeys(node.whenFalse, seen)];
  }
  return [];
}

function scan() {
  const missing: string[] = [];
  const seen = { ternary: 0, rich: 0 };
  let checked = 0;
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('useTranslations(')) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const scopes: Map<string, string>[] = [new Map()];
    const visit = (node: ts.Node) => {
      const opensScope = ts.isFunctionLike(node) || ts.isBlock(node);
      if (opensScope) scopes.push(new Map());
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const namespace = namespaceOf(node.initializer);
        if (namespace !== null) scopes[scopes.length - 1]!.set(node.name.text, namespace);
      }
      if (ts.isCallExpression(node) && node.arguments[0]) {
        const callee = ts.isPropertyAccessExpression(node.expression) && ['rich', 'markup', 'raw'].includes(node.expression.name.text) ? node.expression.expression : node.expression;
        const namespace = ts.isIdentifier(callee) ? [...scopes].reverse().find(scope => scope.has(callee.text))?.get(callee.text) : undefined;
        if (namespace !== undefined) {
          if (callee !== node.expression) seen.rich += 1;
          for (const key of literalKeys(node.arguments[0], seen)) {
            checked += 1;
            const full = namespace ? `${namespace}.${key}` : key;
            if (!hasMessage(full)) missing.push(`${path.relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${full}`);
          }
        }
      }
      ts.forEachChild(node, visit);
      if (opensScope) scopes.pop();
    };
    visit(source);
  }
  return { missing, checked, seen };
}

describe('used message keys', () => {
  const { missing, checked, seen } = scan();

  it('probe: the scan reads thousands of literal keys in every call shape', () => {
    expect(checked).toBeGreaterThan(3000);
    expect(seen.ternary, 'ternary keys').toBeGreaterThan(0);
    expect(seen.rich, 't.rich and t.markup keys').toBeGreaterThan(0);
  });

  it('every literal key the source asks for exists in the catalog', () => {
    expect(missing).toEqual([]);
  });
});

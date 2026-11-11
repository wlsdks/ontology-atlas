import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import ts from 'typescript';

export type ClassSource = {
  file: string;
  source: ts.SourceFile;
  bindings: Map<string, ts.Node[]>;
  imports: Map<string, { from: string; name: string }>;
  reexports: Array<{ from: string; names: Map<string, string> | null }>;
};

type Bound = readonly [ts.Node, ClassSource];
export type ClassModuleLoader = (specifier: string, importer: string) => ClassSource | undefined;

/** Every same-file binding of each name, shadowed ones included, and what the file imports and re-exports. */
export function readClassSource(fileName: string, text: string): ClassSource {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings = new Map<string, ts.Node[]>();
  const imports: ClassSource['imports'] = new Map();
  const reexports: ClassSource['reexports'] = [];
  const bind = (name: string, node: ts.Node) => bindings.set(name, [...(bindings.get(name) ?? []), node]);
  const index = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) bind(node.name.text, node.body);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) bind(node.name.text, node.initializer);
    ts.forEachChild(node, index);
  };
  index(source);
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const named = statement.importClause?.namedBindings;
      for (const element of named && ts.isNamedImports(named) ? named.elements : []) {
        imports.set(element.name.text, { from: statement.moduleSpecifier.text, name: (element.propertyName ?? element.name).text });
      }
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.exportClause;
      reexports.push({
        from: statement.moduleSpecifier.text,
        names: clause && ts.isNamedExports(clause)
          ? new Map(clause.elements.map((element) => [element.name.text, (element.propertyName ?? element.name).text]))
          : null,
      });
    }
  }
  return { file: fileName, source, bindings, imports, reexports };
}

/** Resolves `@/` and relative specifiers to a TypeScript module under the repository root. */
export function classModuleLoader(): ClassModuleLoader {
  const modules = new Map<string, ClassSource | undefined>();
  return (specifier, importer) => {
    const base = specifier.startsWith('@/') ? join('src', specifier.slice(2)) : specifier.startsWith('.') ? join(dirname(importer), specifier) : null;
    const file = base && ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((suffix) => base + suffix).find((path) => existsSync(path));
    if (!file) return undefined;
    if (!modules.has(file)) modules.set(file, readClassSource(file, readFileSync(file, 'utf8')));
    return modules.get(file);
  };
}

function exported(owner: ClassSource, name: string, load: ClassModuleLoader, visited = new Set<string>()): Bound[] {
  if (visited.has(owner.file)) return [];
  visited.add(owner.file);
  const local = owner.bindings.get(name);
  if (local) return local.map((node) => [node, owner] as const);
  for (const { from, names } of owner.reexports) {
    const original = names ? names.get(name) : name;
    const target = original ? load(from, owner.file) : undefined;
    const found = target && original ? exported(target, original, load, visited) : [];
    if (found.length > 0) return found;
  }
  return [];
}

function isValueUse(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.expression === node) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  return !((ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent)) && parent.name === node);
}

/**
 * A node's string literals, plus, when following, those of every binding it names. With a loader,
 * an imported name used as a value is followed into the module that declares it.
 */
export function stringsOf(home: ClassSource, root: ts.Node, follow = true, load?: ClassModuleLoader): string[] {
  const out: string[] = [];
  const seen = new Set<ts.Node>();
  const boundTo = (node: ts.Identifier, owner: ClassSource): Bound[] => {
    const local = owner.bindings.get(node.text);
    if (local) return local.map((bound) => [bound, owner] as const);
    const entry = load && isValueUse(node) ? owner.imports.get(node.text) : undefined;
    const target = entry && load ? load(entry.from, owner.file) : undefined;
    return target && entry && load ? exported(target, entry.name, load) : [];
  };
  const visit = (node: ts.Node, owner: ClassSource): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      out.push(node.text);
    }
    for (const [bound, boundOwner] of follow && ts.isIdentifier(node) ? boundTo(node, owner) : []) {
      if (seen.has(bound)) continue;
      seen.add(bound);
      visit(bound, boundOwner);
    }
    ts.forEachChild(node, (child) => visit(child, owner));
  };
  visit(root, home);
  return out;
}

export function classNameOf(element: ts.JsxOpeningLikeElement): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === 'className',
  );
}

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * What one end-to-end test can reach: its own `test(...)` call, the `beforeEach` hooks that apply to it, and every
 * top-level declaration of the local modules that those mention by name, transitively.
 *
 * A name reaches a declaration only where the code uses it: an import that nothing mentions reaches nothing, and a
 * function a module exports but the test never names stays out. A module the test does not import, or a package
 * outside `tests/`, is not followed. A declaration is reached whole: naming one method of an object or class that
 * also holds an installer reaches the installer too.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The `test.<modifier>(title, body)` forms that declare a test; `test.describe`, `test.step` and `test.use` do not. */
const TEST_MODIFIERS = new Set(["only", "skip", "fixme", "fail", "slow"]);

export interface ReachedNode {
  /** Repository-relative path with `/` separators of the file the node is in. */
  file: string;
  node: ts.Node;
}

export interface SpecTest {
  title: string;
  /** 1-based line of the `test(` call. */
  line: number;
  /** The call itself and the `beforeEach` calls that apply to it. */
  roots: ReachedNode[];
}

interface ImportBinding {
  file: string;
  /** The exported name, or null when the binding is the whole module (`import * as x`). */
  name: string | null;
}

interface SourceModule {
  file: string;
  source: ts.SourceFile;
  /** Top-level functions, classes, enums and variables by name. */
  declarations: Map<string, ts.Node>;
  imports: Map<string, ImportBinding>;
  /** Exported name to the local name behind it, for `export { a as b }`. */
  exportAliases: Map<string, string>;
  /** `export { a } from "./x"` (names) and `export * from "./x"` (null). */
  reExports: { file: string; names: Map<string, string> | null }[];
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function resolveLocalImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(ROOT, dirname(from), specifier);
  /* `.ts.txt` is a planted helper module: kept as text so no runner, linter or compiler collects it. */
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}.ts.txt`, join(base, "index.ts"), base];
  for (const candidate of candidates) {
    if (!/\.(?:ts|tsx|txt)$/.test(candidate)) continue;
    if (!existsSync(candidate)) continue;
    const relativePath = toPosix(relative(ROOT, candidate));
    return relativePath.startsWith("tests/") ? relativePath : null;
  }
  return null;
}

const modules = new Map<string, SourceModule>();

function moduleOf(file: string): SourceModule {
  const known = modules.get(file);
  if (known) return known;
  const text = readFileSync(join(ROOT, file), "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found: SourceModule = { file, source, declarations: new Map(), imports: new Map(), exportAliases: new Map(), reExports: [] };
  modules.set(file, found);
  for (const statement of source.statements) readStatement(found, statement);
  return found;
}

function readStatement(found: SourceModule, statement: ts.Statement): void {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    const from = ts.isStringLiteral(statement.moduleSpecifier) ? resolveLocalImport(found.file, statement.moduleSpecifier.text) : null;
    if (!clause || clause.isTypeOnly || !from) return;
    if (clause.name) found.imports.set(clause.name.text, { file: from, name: "default" });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) found.imports.set(bindings.name.text, { file: from, name: null });
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) found.imports.set(element.name.text, { file: from, name: (element.propertyName ?? element.name).text });
      }
    }
    return;
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.isTypeOnly) return;
    const from = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? resolveLocalImport(found.file, statement.moduleSpecifier.text) : null;
    const clause = statement.exportClause;
    if (statement.moduleSpecifier) {
      if (!from) return;
      if (!clause) found.reExports.push({ file: from, names: null });
      else if (ts.isNamedExports(clause)) {
        found.reExports.push({ file: from, names: new Map(clause.elements.map((element) => [element.name.text, (element.propertyName ?? element.name).text])) });
      }
    } else if (clause && ts.isNamedExports(clause)) {
      for (const element of clause.elements) found.exportAliases.set(element.name.text, (element.propertyName ?? element.name).text);
    }
    return;
  }
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
    found.declarations.set(statement.name.text, statement);
    return;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      for (const name of boundNames(declaration.name)) found.declarations.set(name, declaration);
    }
  }
}

function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : boundNames(element.name)));
}

/** The declaration an exported name stands for in a module, following re-exports; null when there is none. */
function resolveExport(file: string, name: string, seen = new Set<string>()): ReachedNode | null {
  if (seen.has(`${file}#${name}`)) return null;
  seen.add(`${file}#${name}`);
  const found = moduleOf(file);
  const local = found.exportAliases.get(name) ?? name;
  const declaration = found.declarations.get(local);
  if (declaration) return { file, node: declaration };
  const imported = found.imports.get(local);
  if (imported?.name) return resolveExport(imported.file, imported.name, seen);
  for (const reExport of found.reExports) {
    const original = reExport.names ? reExport.names.get(name) : name;
    const reached = original ? resolveExport(reExport.file, original, seen) : null;
    if (reached) return reached;
  }
  return null;
}

/** The declaration a name used in `file` stands for, local or imported; null for a global or a package. */
function resolveName(file: string, name: string): ReachedNode | null {
  const found = moduleOf(file);
  const declaration = found.declarations.get(name);
  if (declaration) return { file, node: declaration };
  const imported = found.imports.get(name);
  return imported?.name ? resolveExport(imported.file, imported.name) : null;
}

/** Whether an identifier is used as a value or function name, not as a property name or key. */
function isNameUse(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === identifier) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === identifier) return false;
  return true;
}

const referenceCache = new WeakMap<ts.Node, ReachedNode[]>();

/** The declarations a node mentions by name: the one step the reach follows. */
function declarationsMentionedBy(reached: ReachedNode): ReachedNode[] {
  const cached = referenceCache.get(reached.node);
  if (cached) return cached;
  const mentioned: ReachedNode[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = moduleOf(reached.file).imports.get(node.expression.text);
      if (binding && binding.name === null) {
        const member = resolveExport(binding.file, node.name.text);
        if (member) mentioned.push(member);
        return;
      }
    }
    if (ts.isIdentifier(node) && isNameUse(node)) {
      const declaration = resolveName(reached.file, node.text);
      if (declaration) mentioned.push(declaration);
    }
    ts.forEachChild(node, visit);
  };
  visit(reached.node);
  referenceCache.set(reached.node, mentioned);
  return mentioned;
}

/** The roots and every declaration they reach by name, each once. */
export function reachFrom(roots: ReachedNode[]): ReachedNode[] {
  const seen = new Set<ts.Node>();
  const reached: ReachedNode[] = [];
  const pending = [...roots];
  for (let next = pending.pop(); next; next = pending.pop()) {
    if (seen.has(next.node)) continue;
    seen.add(next.node);
    reached.push(next);
    pending.push(...declarationsMentionedBy(next));
  }
  return reached;
}

function isTestDeclaration(call: ts.CallExpression): boolean {
  const callee = call.expression;
  const named = ts.isIdentifier(callee) && callee.text === "test";
  const modified =
    ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "test" && TEST_MODIFIERS.has(callee.name.text);
  const body = call.arguments[call.arguments.length - 1];
  return (named || modified) && call.arguments.length >= 2 && body !== undefined && (ts.isArrowFunction(body) || ts.isFunctionExpression(body));
}

function isBeforeEachHook(call: ts.CallExpression): boolean {
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "test" && callee.name.text === "beforeEach";
}

function callsIn(node: ts.Node, accept: (call: ts.CallExpression) => boolean): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child) && accept(child)) found.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function statementCall(statement: ts.Statement): ts.CallExpression | null {
  if (!ts.isExpressionStatement(statement)) return null;
  let expression = statement.expression;
  while (ts.isAwaitExpression(expression) || ts.isParenthesizedExpression(expression)) expression = expression.expression;
  return ts.isCallExpression(expression) ? expression : null;
}

/**
 * The `beforeEach` hooks of every enclosing scope of a test: a `test.beforeEach(...)` statement, or a call to a
 * function that registers one (`failOnConsoleNoise()`), written among the statements of any scope around the test.
 */
function hooksAround(file: string, test: ts.CallExpression): ReachedNode[] {
  const hooks: ReachedNode[] = [];
  for (let scope: ts.Node | undefined = test.parent; scope; scope = scope.parent) {
    if (!ts.isSourceFile(scope) && !ts.isBlock(scope) && !ts.isModuleBlock(scope)) continue;
    for (const statement of scope.statements) {
      const call = statementCall(statement);
      if (!call) continue;
      if (isBeforeEachHook(call)) {
        hooks.push({ file, node: call });
        continue;
      }
      if (!ts.isIdentifier(call.expression)) continue;
      const registrar = resolveName(file, call.expression.text);
      if (!registrar) continue;
      for (const hook of callsIn(registrar.node, isBeforeEachHook)) hooks.push({ file: registrar.file, node: hook });
    }
  }
  return hooks;
}

function titleOf(call: ts.CallExpression): string {
  const title = call.arguments[0];
  if (ts.isStringLiteralLike(title)) return title.text;
  return title.getText().replace(/^`|`$/g, "");
}

/** Every test a spec declares, in source order, with the nodes that decide how it runs. */
export function testsOfSpec(spec: string): SpecTest[] {
  const { source } = moduleOf(spec);
  return callsIn(source, isTestDeclaration).map((call) => ({
    title: titleOf(call),
    line: source.getLineAndCharacterOfPosition(call.getStart()).line + 1,
    roots: [{ file: spec, node: call }, ...hooksAround(spec, call)],
  }));
}

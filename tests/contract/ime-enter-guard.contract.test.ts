import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const HELPER = 'isImeComposing';
const HELPER_MODULE = '@/shared/lib/ime-composition';
const ENTER_KEYS = new Set(['Enter', 'NumpadEnter']);
const LEGACY_KEY_CODE_PROPERTIES = new Set(['keyCode', 'which']);
const ENTER_KEY_CODE = 13;
const GUARDED_FLOOR = 23;

const NOT_TEXT_ENTRY: ReadonlyArray<readonly [file: string, sites: number, target: string]> = [
  ['src/shared/ui/inline-editable.tsx', 1, 'the read-mode element Enter switches into editing'],
  ['src/shared/ui/select.tsx', 2, 'listbox trigger and options'],
  ['src/views/architecture/ui/ArchitectureSketch.tsx', 1, 'SVG role box'],
  ['src/widgets/atlas-git-panel/ui/ConceptEgoGraph.tsx', 1, 'SVG graph mark'],
  ['src/widgets/global-search/ui/GlobalSearch.tsx', 1, 'rows other than the search field, whose Enter cmdk guards'],
  ['src/widgets/library-graph/ui/LibraryGraph.tsx', 2, 'graph canvas'],
  ['src/widgets/ontology-map/ui/use-topology-input.ts', 1, 'map canvas'],
  ['src/widgets/topology-index-panel/ui/TopologyIndexTreeRow.tsx', 1, 'tree row'],
];

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

interface Site {
  file: string;
  line: number;
  guarded: boolean;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function isEnterLiteral(node: ts.Node): boolean {
  return (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ENTER_KEYS.has(node.text);
}

function isEnterKeyCode(sides: readonly ts.Expression[]): boolean {
  const readsKeyCode = sides.some(
    (side) => ts.isPropertyAccessExpression(side) && LEGACY_KEY_CODE_PROPERTIES.has(side.name.text),
  );
  const isThirteen = sides.some((side) => ts.isNumericLiteral(side) && Number(side.text) === ENTER_KEY_CODE);
  return readsKeyCode && isThirteen;
}

function isEnterTest(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node) && EQUALITY.has(node.operatorToken.kind)) {
    const sides = [node.left, node.right];
    return sides.some(isEnterLiteral) || isEnterKeyCode(sides);
  }
  if (ts.isCaseClause(node)) return isEnterLiteral(node.expression);
  if (ts.isArrayLiteralExpression(node)) return node.elements.some(isEnterLiteral);
  if (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) {
    return (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && ENTER_KEYS.has(node.name.text);
  }
  return false;
}

function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | null {
  for (let at = node.parent; at; at = at.parent) {
    if (ts.isFunctionLike(at) && 'body' in at) return at as ts.FunctionLikeDeclaration;
  }
  return null;
}

function callsHelper(fn: ts.FunctionLikeDeclaration): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (node !== fn.body && ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === HELPER) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

function importsHelper(file: ts.SourceFile): boolean {
  return file.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === HELPER_MODULE &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some((element) => element.name.text === HELPER),
  );
}

function sitesIn(rel: string, source: string): Site[] {
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, kind);
  const helperInScope = importsHelper(file);
  const sites: Site[] = [];
  const visit = (node: ts.Node) => {
    if (isEnterTest(node)) {
      const fn = enclosingFunction(node);
      sites.push({
        file: rel,
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        guarded: helperInScope && fn !== null && callsHelper(fn),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return sites;
}

function scan() {
  const sites: Site[] = [];
  let scanned = 0;
  for (const dir of ['src', 'app']) {
    for (const abs of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      scanned += 1;
      sites.push(...sitesIn(rel, readFileSync(abs, 'utf8')));
    }
  }
  return { sites, scanned };
}

describe('IME Enter guard — Enter on a text field waits for the composition to end', () => {
  const census = scan();
  const register = new Map(NOT_TEXT_ENTRY.map(([file, sites]) => [file, sites]));
  const unguarded = census.sites.filter((site) => !site.guarded);
  const unguardedIn = (file: string) => unguarded.filter((site) => site.file === file).length;

  it('scans real Enter handlers', () => {
    expect(census.scanned, 'the walker found too few source files').toBeGreaterThan(300);
    expect(census.sites.length, 'no Enter handler was found; the detector is idle').toBeGreaterThan(20);
    expect(
      census.sites.filter((site) => site.guarded).length,
      `guarded Enter handlers fell below ${GUARDED_FLOOR}; a guard was removed`,
    ).toBeGreaterThanOrEqual(GUARDED_FLOOR);
  });

  it('every Enter handler outside the register consults isImeComposing', () => {
    const offenders = unguarded
      .filter((site) => !register.has(site.file))
      .map((site) => `${site.file}:${site.line}`);
    expect(
      offenders,
      `Enter handlers that act during IME composition. Call ${HELPER}(event) from ${HELPER_MODULE} ` +
        'in the same function, or, when the target is not a text field, add the file to NOT_TEXT_ENTRY',
    ).toEqual([]);
  });

  it('the register holds exactly the unguarded Enter handlers it names', () => {
    const drift = NOT_TEXT_ENTRY.filter(([file, sites]) => unguardedIn(file) !== sites).map(
      ([file, sites]) => `${file}: registered ${sites}, measured ${unguardedIn(file)}`,
    );
    expect(
      drift,
      'a registered file gained an unguarded Enter handler (guard it) or lost one (lower its count)',
    ).toEqual([]);
  });
});

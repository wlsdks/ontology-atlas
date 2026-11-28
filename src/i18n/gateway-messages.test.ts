import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { GATEWAY_MESSAGE_PATHS, pickMessagePaths } from './gateway-messages';

/**
 * The gateway layout hands its client tree only `GATEWAY_MESSAGE_PATHS`, so a client module that
 * reads another namespace would render a missing message on a public page. This walks the import
 * graph from the gateway layout and pages the way the bundler would: a named import follows only
 * the re-exports it names, so a barrel does not pull in every sibling it lists. Each module reached
 * on the client side contributes the namespaces of its `useTranslations` calls.
 */

const ROOT = process.cwd();
const GATEWAY_DIR = path.join(ROOT, 'app', '(gateway)');

const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  ROOT,
);
const host = ts.createCompilerHost(config.options);

type Names = ReadonlySet<string> | 'all';

interface Edge {
  specifier: string;
  names: Names;
}

interface ModuleFacts {
  client: boolean;
  /** Imports the module's own code makes. */
  imports: Edge[];
  /** `export { a as b } from` — exported name to the imported one, per specifier. */
  reexports: { specifier: string; exported: string; imported: string }[];
  /** `export * from`. */
  starExports: string[];
  /** Whether anything beside re-exports and types lives here. */
  ownCode: boolean;
  namespaces: string[];
  /** `useTranslations` calls whose namespace is not a literal, and `useMessages` calls. */
  unreadable: string[];
}

function resolve(specifier: string, from: string): string | null {
  const resolved = ts.resolveModuleName(specifier, from, config.options, host).resolvedModule;
  if (!resolved || resolved.isExternalLibraryImport) return null;
  const file = resolved.resolvedFileName;
  if (!file.startsWith(ROOT) || file.endsWith('.d.ts') || !/\.[cm]?[jt]sx?$/.test(file)) return null;
  return file;
}

function namespaceOf(arg: ts.Expression | undefined): string | null {
  if (!arg) return '';
  if (ts.isStringLiteralLike(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    // `topology.${key}` reads somewhere inside `topology`; the static head is the namespace.
    const head = arg.head.text;
    return head.includes('.') ? head.slice(0, head.lastIndexOf('.')) : null;
  }
  return null;
}

const factsCache = new Map<string, ModuleFacts>();

function factsOf(file: string): ModuleFacts {
  const cached = factsCache.get(file);
  if (cached) return cached;
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const facts: ModuleFacts = { client: false, imports: [], reexports: [], starExports: [], ownCode: false, namespaces: [], unreadable: [] };
  const first = source.statements[0];
  // Everything under `src/` ships to the browser; the Next routes under `app/` still mark their client modules.
  const declaredClient = Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use client');
  facts.client = declaredClient || path.relative(ROOT, file).startsWith(`src${path.sep}`);
  const translators = new Set<string>();
  const messageReaders = new Set<string>();

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      if ((specifier === 'use-intl' || specifier === 'next-intl') && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          if (imported === 'useTranslations') translators.add(element.name.text);
          if (imported === 'useMessages') messageReaders.add(element.name.text);
        }
      }
      let names: Names = 'all';
      if (clause && (!clause.namedBindings || ts.isNamedImports(clause.namedBindings))) {
        const named = new Set<string>();
        if (clause.name) named.add('default');
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (!element.isTypeOnly) named.add((element.propertyName ?? element.name).text);
          }
        }
        if (named.size === 0) continue;
        names = named;
      }
      facts.imports.push({ specifier, names });
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.exportClause;
      if (!clause) facts.starExports.push(specifier);
      else if (ts.isNamespaceExport(clause)) facts.reexports.push({ specifier, exported: clause.name.text, imported: '*' });
      else {
        for (const element of clause.elements) {
          if (element.isTypeOnly) continue;
          facts.reexports.push({ specifier, exported: element.name.text, imported: (element.propertyName ?? element.name).text });
        }
      }
      continue;
    }
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) continue;
    facts.ownCode = true;
  }

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const at = () => `${path.relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        facts.imports.push({ specifier: node.arguments[0].text, names: 'all' });
      }
      if (ts.isIdentifier(node.expression) && translators.has(node.expression.text)) {
        const namespace = namespaceOf(node.arguments[0]);
        if (namespace === null) facts.unreadable.push(`${at()} useTranslations with a computed namespace`);
        else if (namespace === '') facts.unreadable.push(`${at()} useTranslations() reads the whole catalog`);
        else facts.namespaces.push(namespace);
      }
      if (ts.isIdentifier(node.expression) && messageReaders.has(node.expression.text)) {
        facts.unreadable.push(`${at()} useMessages() reads the whole catalog`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  factsCache.set(file, facts);
  return facts;
}

function pageEntries(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pageEntries(full);
    return /^(page|layout|not-found|error|loading|template)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function walk(entries: string[]) {
  const visitedOwn = new Map<string, boolean>(); // file → visited as client
  const visitedNames = new Map<string, Set<string>>();
  const namespaces = new Set<string>();
  const unreadable = new Set<string>();
  const stack: { file: string; names: Names; client: boolean }[] = entries.map((file) => ({ file, names: 'all', client: false }));

  while (stack.length > 0) {
    const { file, names, client: inheritedClient } = stack.pop()!;
    const facts = factsOf(file);
    const client = inheritedClient || facts.client;
    const follow = (specifier: string, next: Names) => {
      const target = resolve(specifier, file);
      if (target) stack.push({ file: target, names: next, client });
    };

    const ownWanted = names === 'all' || facts.ownCode;
    if (ownWanted && !(visitedOwn.has(file) && (visitedOwn.get(file) || !client))) {
      visitedOwn.set(file, client);
      if (client) {
        facts.namespaces.forEach((namespace) => namespaces.add(namespace));
        facts.unreadable.forEach((issue) => unreadable.add(issue));
      }
      for (const edge of facts.imports) follow(edge.specifier, edge.names);
    }

    const seenKey = `${file}\0${client}`;
    const seen = visitedNames.get(seenKey) ?? new Set<string>();
    visitedNames.set(seenKey, seen);
    const wanted = names === 'all' ? null : [...names].filter((name) => !seen.has(name));
    if (wanted) wanted.forEach((name) => seen.add(name));
    if (names === 'all') {
      if (seen.has('*')) continue;
      seen.add('*');
    } else if (wanted!.length === 0) continue;

    const unmatched = new Set(wanted ?? []);
    for (const reexport of facts.reexports) {
      if (wanted && !wanted.includes(reexport.exported)) continue;
      unmatched.delete(reexport.exported);
      follow(reexport.specifier, reexport.imported === '*' ? 'all' : new Set([reexport.imported]));
    }
    for (const specifier of facts.starExports) {
      follow(specifier, names === 'all' ? 'all' : unmatched);
    }
  }
  return { namespaces, unreadable, modules: visitedOwn.size };
}

/** Drops a path whose ancestor is listed: the ancestor already carries it. */
function minimalCover(paths: Iterable<string>): string[] {
  const unique = [...new Set(paths)];
  return unique.filter((p) => !unique.some((other) => p.startsWith(`${other}.`))).sort();
}

describe('gateway message paths', () => {
  const entries = pageEntries(GATEWAY_DIR);
  const { namespaces, unreadable, modules } = walk(entries);

  it('probe: the walk starts at the gateway layout and reaches the pages’ client tree', () => {
    expect(entries.map((file) => path.relative(GATEWAY_DIR, file))).toContain(path.join('[locale]', 'layout.tsx'));
    expect(entries.length).toBeGreaterThanOrEqual(5);
    expect(modules, 'modules reached').toBeGreaterThan(100);
    expect(namespaces.size, 'namespaces read').toBeGreaterThan(10);
  });

  it('every namespace the client tree reads can be read statically', () => {
    expect([...unreadable].sort()).toEqual([]);
  });

  it('the layout hands over exactly the namespaces its client tree reads', () => {
    expect(
      [...GATEWAY_MESSAGE_PATHS].sort(),
      'Edit GATEWAY_MESSAGE_PATHS in src/i18n/gateway-messages.ts to this list.',
    ).toEqual(minimalCover(namespaces));
  });

  it('every listed path exists in each locale', () => {
    for (const locale of ['en', 'ko', 'ja', 'zh']) {
      const catalog = JSON.parse(readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'));
      const picked = pickMessagePaths(catalog, GATEWAY_MESSAGE_PATHS);
      for (const dotted of GATEWAY_MESSAGE_PATHS) {
        const value = dotted.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], picked);
        expect(value, `${locale}: ${dotted}`).toBeDefined();
      }
    }
  });
});

describe('pickMessagePaths', () => {
  it('copies the named subtrees and nothing beside them', () => {
    const messages = { a: { b: { c: 1 }, d: 2 }, e: 3, f: { g: 4 } };
    expect(pickMessagePaths(messages, ['a.b', 'f'])).toEqual({ a: { b: { c: 1 } }, f: { g: 4 } });
  });

  it('keeps an ancestor whole and leaves the source untouched', () => {
    const messages = { a: { b: 1, c: 2 } };
    expect(pickMessagePaths(messages, ['a.b', 'a'])).toEqual({ a: { b: 1, c: 2 } });
    expect(messages).toEqual({ a: { b: 1, c: 2 } });
  });

  it('skips a path the catalog lacks', () => {
    expect(pickMessagePaths({ a: 1 }, ['missing.key', 'a'])).toEqual({ a: 1 });
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Same-layer cross-import ratchet — **a slice can never read more names from a
 * sibling slice of its own layer than the ledger allows.**
 *
 * **Why.** `.claude/rules/architecture.md` says "avoid cross-imports within one
 * layer; move truly shared behaviour down one layer instead", but
 * `eslint-plugin-boundaries` only checks the layer *direction*.
 *
 * **What counts.** The distinct names a slice imports or re-exports from
 * `@/<layer>/<other-slice>`, tests excluded: named, type, dynamic and
 * `import("…")` type members. A default, namespace, or bare import counts as
 * the whole module. Names, not statements, so splitting a file inside the slice
 * keeps its row.
 *
 * **How to lower it.** Delete the edge, run the test, and lower the row it
 * reports. Never raise a row; move the shared code down a layer instead.
 */

const ROOT = process.cwd();
const LAYERS = ["views", "widgets", "features", "entities"] as const;

/** `layer:from->to` → maximum number of distinct imported names allowed. */
const LEDGER: Record<string, number> = {
  "views:root-entry->download": 1,
  "views:root-entry->first-run": 1,
  "views:root-entry->home": 1,
  "widgets:project-drawer->public-quick-actions": 1,
  "features:acp-session->vault-ontology": 1,
  "features:first-run-starter->docs-vault-local": 2,
  "features:ontology-meaning-editor->ontology-change-review": 1,
  "features:project-edit->taxonomy": 1,
  "features:project-quick-edit->project-data-source": 2,
  "entities:docs-vault->knowledge-graph": 1,
  "entities:docs-vault->project": 5,
  "entities:vault-session->docs-vault": 22,
  "entities:vault-session->local-fs-handle": 10,
  "entities:vault-session->ontology-class": 1,
};

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "data") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      yield p;
    }
  }
}

function bindingNames(pattern: ts.ObjectBindingPattern): string[] {
  return pattern.elements.map((element) => (element.propertyName ?? element.name).getText());
}

/** Every `[specifier, name]` a file reads from another module. */
function importedNames(file: string, text: string): Array<[string, string]> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Array<[string, string]> = [];
  const whole = (specifier: string) => found.push([specifier, `* of ${specifier}`]);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (!clause || clause.name || (bindings && ts.isNamespaceImport(bindings))) whole(specifier);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) found.push([specifier, (element.propertyName ?? element.name).text]);
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) found.push([specifier, (element.propertyName ?? element.name).text]);
      } else {
        whole(specifier);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const specifier = node.arguments[0].text;
      const awaited = ts.isAwaitExpression(node.parent) ? node.parent : undefined;
      const access = awaited && ts.isParenthesizedExpression(awaited.parent) ? awaited.parent.parent : undefined;
      if (awaited && ts.isVariableDeclaration(awaited.parent) && ts.isObjectBindingPattern(awaited.parent.name)) {
        for (const name of bindingNames(awaited.parent.name)) found.push([specifier, name]);
      } else if (access && ts.isPropertyAccessExpression(access)) {
        found.push([specifier, access.name.text]);
      } else {
        whole(specifier);
      }
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      const specifier = node.argument.literal.text;
      let qualifier = node.qualifier;
      while (qualifier && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
      if (qualifier) found.push([specifier, qualifier.text]);
      else whole(specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function scan(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const layer of LAYERS) {
    const layerDir = path.join(ROOT, "src", layer);
    const target = new RegExp(`^@/${layer}/([a-z0-9-]+)(?:/|$)`);
    for (const slice of readdirSync(layerDir)) {
      const sliceDir = path.join(layerDir, slice);
      if (!statSync(sliceDir).isDirectory()) continue;
      for (const file of walk(sliceDir)) {
        for (const [specifier, name] of importedNames(file, readFileSync(file, "utf8"))) {
          const other = target.exec(specifier)?.[1];
          if (!other || other === slice) continue;
          const key = `${layer}:${slice}->${other}`;
          found.set(key, (found.get(key) ?? new Set()).add(name));
        }
      }
    }
  }
  return found;
}

describe("same-layer cross-import ratchet", () => {
  const found = scan();

  it("reads no more names across two slices of one layer than the ledger allows", () => {
    const violations = [...found]
      .filter(([key, names]) => names.size > (LEDGER[key] ?? 0))
      .map(([key, names]) => `${key}: ${names.size} (ledger ${LEDGER[key] ?? 0}): ${[...names].sort().join(", ")}`);
    expect(
      violations,
      "a slice reads more names from a sibling slice of its own layer than the ledger allows. " +
        "Move the shared behaviour down one layer (features → entities, entities → shared) " +
        "instead of raising the row.",
    ).toEqual([]);
  });

  it("keeps the ledger honest — every row is still observed", () => {
    const stale = Object.keys(LEDGER).filter((key) => !found.has(key));
    expect(stale, "edges no longer exist; delete their ledger rows so the ratchet only falls").toEqual([]);
    const loosened = Object.entries(LEDGER)
      .filter(([key, max]) => (found.get(key)?.size ?? 0) < max)
      .map(([key, max]) => `${key}: observed ${found.get(key)?.size} < ledger ${max}`);
    expect(loosened, "an edge reads fewer names; lower its ledger row to the observed value").toEqual([]);
  });

  it("reads a split file's imports as one set of names, and every import form", () => {
    const files = {
      "a.ts": `import { Named, type TypeOnly } from "@/entities/other";
        export { ReExported } from "@/entities/other/lib/deep";
        import Whole from "@/entities/other/lib/whole";`,
      "b.tsx": `import { Named } from "@/entities/other";
        import * as All from "@/entities/other";
        const { Destructured: local } = await import("@/entities/other");
        const member = (await import("@/entities/other")).Member;
        type Q = import("@/entities/other").Qualified.Inner;`,
    };
    const names = new Set(Object.entries(files).flatMap(([file, text]) => importedNames(file, text).map(([, name]) => name)));
    expect([...names].sort()).toEqual([
      "* of @/entities/other",
      "* of @/entities/other/lib/whole",
      "Destructured",
      "Member",
      "Named",
      "Qualified",
      "ReExported",
      "TypeOnly",
    ]);
  });
});

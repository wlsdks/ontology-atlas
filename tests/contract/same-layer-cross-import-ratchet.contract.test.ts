import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Same-layer cross-import ratchet — **a slice importing a sibling slice of its
 * own layer can never exceed the ledger.**
 *
 * **Why.** `.claude/rules/architecture.md` says "avoid cross-imports within one
 * layer; move truly shared behaviour down one layer instead", but
 * `eslint-plugin-boundaries` only checks the layer *direction*. Measured on
 * 2026-08-30: 26 feature→feature edges had grown unnoticed, 20 of them into
 * `docs-vault-local`, because nothing counted them. Moving the shared vault
 * state into `entities/vault-session` brought the feature edges down to seven;
 * this ledger holds that number so it can only fall.
 *
 * **What counts.** Every static `import … from`, `export … from`, and dynamic
 * `import("…")` whose target is `@/<layer>/<other-slice>` from a file inside
 * `src/<layer>/<slice>/`, tests excluded. Type-only imports count too: a type
 * dependency still ties the two slices' change cadence together.
 *
 * **How to lower it.** Delete the edge, run the test, and remove the row it
 * reports as no longer observed. Never raise a row; move the shared code down a
 * layer instead.
 */

const ROOT = process.cwd();
const LAYERS = ["views", "widgets", "features", "entities"] as const;

/** `layer:from->to` → maximum number of importing statements allowed. */
const LEDGER: Record<string, number> = {
  "views:root-entry->download": 1,
  "views:root-entry->first-run": 1,
  "views:root-entry->home": 1,
  "widgets:project-drawer->public-quick-actions": 1,
  "features:acp-session->vault-ontology": 1,
  "features:first-run-starter->docs-vault-local": 2,
  "features:ontology-meaning-editor->ontology-change-review": 1,
  "features:project-edit->taxonomy": 2,
  "features:project-quick-edit->project-data-source": 1,
  "entities:docs-vault->knowledge-graph": 1,
  "entities:docs-vault->project": 4,
  "entities:vault-session->docs-vault": 5,
  "entities:vault-session->local-fs-handle": 2,
  "entities:vault-session->ontology-class": 1,
};

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

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

function scan(): Map<string, number> {
  const found = new Map<string, number>();
  for (const layer of LAYERS) {
    const layerDir = path.join(ROOT, "src", layer);
    for (const slice of readdirSync(layerDir)) {
      const sliceDir = path.join(layerDir, slice);
      if (!statSync(sliceDir).isDirectory()) continue;
      const pattern = new RegExp(
        `(?:from\\s*|import\\s*\\()\\s*["']@/${layer}/([a-z0-9-]+)(?:/[^"']*)?["']`,
        "g",
      );
      for (const file of walk(sliceDir)) {
        const source = stripComments(readFileSync(file, "utf8"));
        for (const m of source.matchAll(pattern)) {
          const target = m[1];
          if (target === slice) continue;
          const key = `${layer}:${slice}->${target}`;
          found.set(key, (found.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return found;
}

describe("same-layer cross-import ratchet", () => {
  const found = scan();

  it("adds no edge between two slices of one layer beyond the ledger", () => {
    const violations = [...found]
      .filter(([key, count]) => count > (LEDGER[key] ?? 0))
      .map(([key, count]) => `${key}: ${count} (ledger ${LEDGER[key] ?? 0})`);
    expect(
      violations,
      "a slice imports a sibling slice of its own layer more than the ledger allows. " +
        "Move the shared behaviour down one layer (features → entities, entities → shared) " +
        "instead of raising the row.",
    ).toEqual([]);
  });

  it("keeps the ledger honest — every row is still observed", () => {
    const stale = Object.keys(LEDGER).filter((key) => !found.has(key));
    expect(stale, "edges no longer exist; delete their ledger rows so the ratchet only falls").toEqual([]);
    const loosened = Object.entries(LEDGER)
      .filter(([key, max]) => (found.get(key) ?? 0) < max)
      .map(([key, max]) => `${key}: observed ${found.get(key)} < ledger ${max}`);
    expect(loosened, "an edge count fell; lower its ledger row to the observed value").toEqual([]);
  });
});

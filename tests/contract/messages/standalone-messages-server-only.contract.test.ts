import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Everything under `src/` is browser code, so a whole-language message file imported there ships all
 * of that language's catalogue in the page. The screens outside the workbench's providers (the 404
 * and the error boundary) take only the namespace files they read, through the two modules named below.
 */
const ROOT = process.cwd();
const SCAN_DIRS = ["src"];
const WHOLE_CATALOGUE_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*messages\/[a-z]{2}\.json['"]/mu;
const NAMESPACE_IMPORT = /from\s+['"][^'"]*messages\/([a-z]{2})\/([A-Za-z]+)\.json['"]/gu;
/** An import of a namespace file with the clause before `from`, to judge what is taken from it. */
const NAMESPACE_IMPORT_CLAUSE = /import\s+([^;]*?)\s+from\s+['"][^'"]*messages\/[a-z]{2}\/([A-Za-z]+)\.json['"]/gu;

/** A large namespace a standalone screen may read one named string from, and nothing else of it. */
const ONE_NAMED_STRING: Record<string, string> = { download: "downloadSectionLabel" };

/** What each standalone screen may import, so a large namespace cannot ride along unseen. */
const STANDALONE_NAMESPACES: Record<string, readonly string[]> = {
  "src/i18n/route-error-messages.ts": ["routeError"],
  "src/i18n/not-found-messages.ts": ["notFound", "gatewayNav", "locale", "download"],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "data" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:ts|tsx|mts|js|jsx|mjs)$/u.test(name) && !/\.test\.|\.spec\./u.test(name)) out.push(path);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir))).map((path) => ({
  rel: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

describe("message files stay out of the browser's first pages", () => {
  it("scans real source", () => {
    expect(FILES.length, "no source scanned; the checks below would idle").toBeGreaterThan(200);
  });

  it("no module imports a whole-language message file", () => {
    const importers = FILES.filter((f) => WHOLE_CATALOGUE_IMPORT.test(f.text)).map((f) => f.rel);
    expect(importers).toEqual([]);
  });

  it("the standalone screens import only the namespaces listed for them", () => {
    for (const [rel, allowed] of Object.entries(STANDALONE_NAMESPACES)) {
      const file = FILES.find((f) => f.rel === rel);
      expect(file, `${rel} is missing`).toBeDefined();
      const namespaces = [...new Set([...file!.text.matchAll(NAMESPACE_IMPORT)].map((m) => m[2]!))].sort();
      expect(namespaces, `${rel} imports a namespace that is not listed`).toEqual([...allowed].sort());
    }
  });

  it("a large namespace is read by its one named string, never whole", () => {
    const wholeReads: string[] = [];
    let named = 0;
    for (const rel of Object.keys(STANDALONE_NAMESPACES)) {
      const file = FILES.find((f) => f.rel === rel)!;
      for (const [, clause, namespace] of file.text.matchAll(NAMESPACE_IMPORT_CLAUSE)) {
        const only = ONE_NAMED_STRING[namespace!];
        if (only === undefined) continue;
        named += 1;
        if (!new RegExp(`^\\{\\s*${only}(?:\\s+as\\s+\\w+)?\\s*\\}$`, "u").test(clause!.trim())) wholeReads.push(`${rel}: ${clause}`);
      }
    }
    expect(named, "no named import found; the check would idle").toBeGreaterThan(0);
    expect(wholeReads).toEqual([]);
  });
});

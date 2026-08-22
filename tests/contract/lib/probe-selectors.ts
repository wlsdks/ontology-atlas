import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Extracts the `data-testid` values queried by the WebView probes in
 * `src-tauri/src/lib.rs`. The probes are JS inside a Rust raw string, so static
 * parsing is impossible; only the selector literals are scraped from the text, which
 * is exact enough for this purpose.
 */
export function collectProbeSelectors(rustSource: string): string[] {
  const found = new Set<string>();
  // Both `[data-testid="foo"]` and `[data-testid='foo']`.
  const pattern = /\[data-testid=["']([^"']+)["']\]/g;
  for (const match of rustSource.matchAll(pattern)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Returns the given testids that have **no definition** in `src/` or `app/`.
 *
 * No external binary is used. A draft used `execFileSync("rg", …)`, that call failed
 * silently, and **every selector was reported dead** — exactly the class of defect
 * this test exists to catch (an external dependency dying quietly and a catch
 * swallowing it). So the files are read directly.
 *
 * JSON under `data/` (the docs vault manifest) is excluded: it holds the body text of
 * old planning documents, where deleted selector names survive as prose, and counting
 * those as alive would neutralise this gate.
 */
/**
 * **testids assembled at runtime** — absent from source as literals but alive.
 *
 * This gate decides "alive" by whether the string appears in the source text. But
 * some primitives append a suffix to the testid their parent received and put it on a
 * child — for example `src/shared/ui/select.tsx` marks the list with
 * `data-testid={`${dataTestid}-listbox`}`. So `ai-local-model-listbox` **exists in the
 * DOM and not in the source.**
 *
 * Putting such a selector in `KNOWN_STALE_OPTIONAL` is the wrong fix: that list is for
 * **optional** evidence pointing at dead UI, whereas this one is alive and hard-fails
 * when its probe is missing. Listing it would also pass silently once it really dies.
 *
 * So the suffix is stripped and the verdict is whether **the stem exists**. If the
 * stem disappears it is still caught — the gate is not weakened. When adding a new
 * suffix, name the primitive file that assembles it in the comment.
 */
const COMPOSED_SUFFIXES = [
  // src/shared/ui/select.tsx — appends `-listbox` to the open list.
  "-listbox",
] as const;

export function findDeadSelectors(selectors: readonly string[], cwd: string): string[] {
  const haystack = readSourceText(cwd);
  const alive = (id: string): boolean => {
    if (haystack.includes(id)) return true;
    for (const suffix of COMPOSED_SUFFIXES) {
      if (!id.endsWith(suffix)) continue;
      const base = id.slice(0, -suffix.length);
      // Alive only if the stem exists — a suffix alone does not exempt it.
      if (base && haystack.includes(base)) return true;
    }
    return false;
  };
  return selectors.filter((id) => !alive(id));
}

const SOURCE_ROOTS = ["src", "app"] as const;
const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "data"]);

/** Concatenates every `.ts`/`.tsx` under `src/` and `app/` into one string (paid once per test). */
function readSourceText(cwd: string): string {
  const chunks: string[] = [];
  for (const root of SOURCE_ROOTS) {
    walk(join(cwd, root), chunks);
  }
  return chunks.join("\n");
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // A missing root is skipped quietly (e.g. a package with no app/).
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
      continue;
    }
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    out.push(readFileSync(join(dir, entry.name), "utf8"));
  }
}

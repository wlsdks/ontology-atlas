import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Decides which end-to-end specs still reach an app screen without the faked app runtime.
 *
 * A spec is listed when it visits an app route and its own file plus the local modules it imports
 * never install the faked app runtime, or when it names a browser-only door: `?shell=desktop`,
 * `stubDirectoryPicker`, `useDogfoodSample` or `demo:sample-source`.
 *
 * Print the list with `node tests/contract/e2e/app-route-runtime-classifier.ts`; add `--by-folder`
 * for counts, or `--json` for the sorted file list.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const E2E_ROOT = join(ROOT, "tests", "e2e");

/** Folders and files the check never reads: the public site has no app runtime to install. */
const EXCLUDED_SPEC_PREFIXES = ["tests/e2e/gateway/", "tests/e2e/web-surface-smoke.spec.ts"];

/** Routes of the route list that the public site serves; a spec that visits only these is not listed. */
const PUBLIC_ROUTES = new Set(["/download", "/guide", "/guide/[segment]", "/changelog"]);

/** What a spec names that belongs to the browser alone. */
const BROWSER_DOORS = ["?shell=desktop", "stubDirectoryPicker", "useDogfoodSample", "demo:sample-source"];

/** A module that defines the native bridge in the page is a faked app runtime. */
const RUNTIME_MARKERS = ["__TAURI_INTERNALS__"];

const LOCALES = ["en", "ko", "ja", "zh"];

export interface RouteRuntimeVerdict {
  /** Repository-relative path with `/` separators. */
  spec: string;
  /** The first app route the spec or a helper it imports visits, or null. */
  visitedRoute: string | null;
  /** The faked runtime installers reached through the imports, nearest first, or empty. */
  installers: string[];
  /** The browser-only doors the spec itself names. */
  doors: string[];
  /** Why the spec is listed; null when it is clean. */
  pending: "browser door" | "no faked runtime" | null;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/** The route list of `docs/ARCHITECTURE.md`, as `desktop-frontend-paths.contract.test.ts` reads it. */
export function architectureRoutes(root: string = ROOT): string[] {
  const architecture = readFileSync(join(root, "docs/ARCHITECTURE.md"), "utf8");
  const section = architecture.split(/^## Routes$/m)[1] ?? "";
  const block = section.split("```")[1] ?? "";
  return block
    .split("\n")
    .filter((line) => line.startsWith("/"))
    .map((line) => line.split(/\s+/)[0]);
}

/** The routes a person reaches in the installed app: the route list without the public pages. */
export function appRoutes(root: string = ROOT): string[] {
  return architectureRoutes(root).filter((route) => !PUBLIC_ROUTES.has(route));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches a quoted or template path that opens an app route, with or without a locale prefix:
 * `"/en/topology?x=1"`, `` `/ko/project/${slug}` ``, `"/library"`. The root is a visit only when a
 * locale names it (`"/en/"`, `"/en?guides=off"`) or `goto("/")` does. A template that opens with a
 * locale variable (`` `/${locale}/${route}/` ``) names a route it cannot spell, and counts as one.
 */
function routePattern(routes: string[]): RegExp {
  const firstSegments = new Set<string>();
  for (const route of routes) {
    const first = route.split("/")[1];
    if (first) firstSegments.add(first);
  }
  const names = [...firstSegments].map(escapeRegExp).join("|");
  const locales = LOCALES.join("|");
  return new RegExp(
    `["'\`](?:/(?:${locales}))?/(?:${names})(?=[/?#"'\`$\\\\]|$)|["'\`]/(?:${locales})(?=[/?#"'\`])|goto\\(\\s*["'\`]/["'\`?#]|\`/\\$\\{[\\w.]*[lL]ocale\\w*\\}/`,
  );
}

function listSpecs(): string[] {
  return readdirSync(E2E_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
    .map((entry) => toPosix(relative(ROOT, join(entry.parentPath, entry.name))))
    .filter((spec) => !EXCLUDED_SPEC_PREFIXES.some((prefix) => spec.startsWith(prefix)))
    .sort();
}

const IMPORT_SPECIFIER = /(?:^|\n)\s*(?:import|export)\s(?!type\s)[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveLocalImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(ROOT, dirname(from), specifier);
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base];
  for (const candidate of candidates) {
    if (!candidate.endsWith(".ts") && !candidate.endsWith(".tsx")) continue;
    if (!existsSync(candidate)) continue;
    const relativePath = toPosix(relative(ROOT, candidate));
    return relativePath.startsWith("tests/") ? relativePath : null;
  }
  return null;
}

const sourceCache = new Map<string, string>();

function sourceOf(file: string): string {
  let text = sourceCache.get(file);
  if (text === undefined) {
    text = readFileSync(join(ROOT, file), "utf8");
    sourceCache.set(file, text);
  }
  return text;
}

/** The spec and every module under `tests/` it imports, nearest first. */
function importClosure(spec: string): string[] {
  const seen = new Set<string>([spec]);
  const queue = [spec];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    for (const match of sourceOf(file).matchAll(IMPORT_SPECIFIER)) {
      const next = resolveLocalImport(file, match[1] ?? match[2]);
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen];
}

export function classifySpec(spec: string, routes: RegExp = routePattern(appRoutes())): RouteRuntimeVerdict {
  const closure = importClosure(spec);
  const installers = closure.filter((file) => RUNTIME_MARKERS.some((marker) => sourceOf(file).includes(marker)));
  const doors = BROWSER_DOORS.filter((door) => sourceOf(spec).includes(door));
  let visitedRoute: string | null = null;
  for (const file of closure) {
    const match = sourceOf(file).match(routes);
    if (match) {
      visitedRoute = match[0].replace(/^["'`]/, "");
      break;
    }
  }
  let pending: RouteRuntimeVerdict["pending"] = null;
  if (doors.length > 0) pending = "browser door";
  else if (visitedRoute !== null && installers.length === 0) pending = "no faked runtime";
  return { spec, visitedRoute, installers, doors, pending };
}

/** Every spec the check reads, each with its verdict. */
export function classifyAllSpecs(): RouteRuntimeVerdict[] {
  const routes = routePattern(appRoutes());
  return listSpecs().map((spec) => classifySpec(spec, routes));
}

/** The specs that still reach an app screen without the faked runtime, sorted. */
export function pendingSpecs(): string[] {
  return classifyAllSpecs()
    .filter((verdict) => verdict.pending !== null)
    .map((verdict) => verdict.spec);
}

/** Counts by the folder under `tests/e2e/`; a spec directly in it counts as `top level`. */
export function countByFolder(specs: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const spec of specs) {
    const parts = spec.slice("tests/e2e/".length).split("/");
    const folder = parts.length > 1 ? parts[0] : "top level";
    counts[folder] = (counts[folder] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const specs = pendingSpecs();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(specs, null, 2));
  } else if (process.argv.includes("--by-folder")) {
    console.log(`${specs.length} specs`);
    for (const [folder, count] of Object.entries(countByFolder(specs))) console.log(`${folder} ${count}`);
  } else {
    for (const spec of specs) console.log(spec);
    console.log(`${specs.length} specs`);
  }
}

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { architectureRoutes } from "../architecture-routes.ts";

/**
 * Decides which end-to-end specs still reach an app screen without the faked app runtime.
 *
 * A spec is listed when it visits an app route and neither it nor the local modules it imports
 * call a function that installs the faked app runtime, or when it names a browser-only door:
 * `?shell=desktop`, `stubDirectoryPicker`, `useDogfoodSample` or `demo:sample-source`. A module that
 * merely mentions the native bridge, or one that only serves fixture data, installs nothing.
 *
 * Print the list with `node tests/contract/e2e/app-route-runtime-classifier.ts`; add `--json` for the
 * sorted file list.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const E2E_ROOT = join(ROOT, "tests", "e2e");

/** Folders and files the check never reads: the public site has no app runtime to install. */
const EXCLUDED_SPEC_PREFIXES = ["tests/e2e/gateway/", "tests/e2e/web-surface-smoke.spec.ts"];

/** Routes of the route list that the public site serves; a spec that visits only these is not listed. */
const PUBLIC_ROUTES = new Set(["/download", "/guide", "/guide/[segment]", "/changelog"]);

/** What a spec names that belongs to the browser alone. */
const BROWSER_DOORS = ["?shell=desktop", "stubDirectoryPicker", "useDogfoodSample", "demo:sample-source"];

/** An exported function whose body defines the native bridge in the page installs a faked app runtime. */
const RUNTIME_MARKER = "__TAURI_INTERNALS__";

const LOCALES = ["en", "ko", "ja", "zh"];

interface RouteRuntimeVerdict {
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

/** The routes a person reaches in the installed app: the route list without the public pages. */
function appRoutes(root: string = ROOT): string[] {
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

/** A top-level function of a module, by name, with its body: from its `function` line to the next declaration at column 0. */
function functionBodies(file: string): Map<string, string> {
  const text = sourceOf(file);
  const starts = [...text.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)];
  const boundaries = [...text.matchAll(/^(?:export |async function |function |const |let |interface |type |\/\*\*)/gm)].map((match) => match.index);
  return new Map(
    starts.map((start) => {
      const next = boundaries.find((at) => at > start.index);
      return [start[1], text.slice(start.index, next ?? text.length)] as const;
    }),
  );
}

/** Whether code (not a comment) calls `name`; a comment that spells a call is not one. */
function callsFunction(text: string, name: string): boolean {
  const code = text.replace(/\/\*[\s\S]*?\*\/|(?<![:"'`])\/\/.*$/gm, "");
  return new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`).test(code);
}

/**
 * The functions among these modules that install a faked app runtime: one whose body defines the native
 * bridge in the page, or one that calls such a function (`openLibraryWorkScenario` installs through
 * `installLibraryWorkHarness`). A function that only serves fixture data, such as `storefrontSampleFiles`, is
 * not one, however much its module mentions the bridge.
 */
function installerFunctions(closure: string[]): Set<string> {
  const bodies = closure.flatMap((file) => [...functionBodies(file)]);
  const installers = new Set(bodies.filter(([, body]) => body.includes(RUNTIME_MARKER)).map(([name]) => name));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, body] of bodies) {
      if (installers.has(name)) continue;
      if ([...installers].some((installer) => callsFunction(body, installer))) {
        installers.add(name);
        grew = true;
      }
    }
  }
  return installers;
}

export function classifySpec(spec: string, routes: RegExp = routePattern(appRoutes())): RouteRuntimeVerdict {
  const closure = importClosure(spec);
  const functions = installerFunctions(closure);
  /* A spec that defines the bridge inline installs it itself; any file counts by the installer it calls. */
  const installers = closure.filter(
    (file) =>
      (file === spec && sourceOf(file).includes(RUNTIME_MARKER)) ||
      [...functions].some((name) => callsFunction(sourceOf(file), name) && !functionBodies(file).has(name)),
  );
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

/** The specs that still reach an app screen without the faked runtime, sorted. */
export function pendingSpecs(): string[] {
  const routes = routePattern(appRoutes());
  return listSpecs()
    .map((spec) => classifySpec(spec, routes))
    .filter((verdict) => verdict.pending !== null)
    .map((verdict) => verdict.spec);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const specs = pendingSpecs();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(specs, null, 2));
  } else {
    for (const spec of specs) console.log(spec);
    console.log(`${specs.length} specs`);
  }
}

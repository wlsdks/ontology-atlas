import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { architectureRoutes } from "../architecture-routes.ts";
import { reachFrom, testsOfSpec, type ReachedNode } from "./spec-test-reach.ts";

/**
 * Decides which end-to-end tests still reach an app screen without the faked app runtime.
 *
 * Each `test(...)` is judged alone, with the `beforeEach` hooks that apply to it and the declarations those reach
 * by name (`spec-test-reach.ts`). A test is listed when what it reaches visits an app route and none of it installs
 * the faked app runtime, or when any of it names a browser-only door: `?shell=desktop`, `stubDirectoryPicker`,
 * `useDogfoodSample` or `demo:sample-source`. A door outweighs an installer.
 *
 * Installing the runtime means assigning the native bridge in the page: `window.__TAURI_INTERNALS__ = { ... }`.
 * Reading it, wrapping its `invoke`, or naming it in a string installs nothing. Importing a module that installs
 * it, without naming the function that does, reaches nothing.
 *
 * Print the list with `node tests/contract/e2e/app-route-runtime-classifier.ts`; add `--json` for the sorted spec
 * files.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const E2E_ROOT = join(ROOT, "tests", "e2e");

/** Folders and files the check never reads: the public site has no app runtime to install. */
const EXCLUDED_SPEC_PREFIXES = ["tests/e2e/gateway/", "tests/e2e/web-surface-smoke.spec.ts"];

/** Routes of the route list that the public site serves; a test that visits only these is not listed. */
const PUBLIC_ROUTES = new Set(["/download", "/guide", "/guide/[segment]", "/changelog"]);

/** What a test names that belongs to the browser alone. */
const BROWSER_DOOR_NAMES = ["stubDirectoryPicker", "useDogfoodSample"];
const BROWSER_DOOR_TEXTS = ["?shell=desktop", "demo:sample-source"];

/** The page property that holds the native bridge. */
const BRIDGE_PROPERTY = "__TAURI_INTERNALS__";

const LOCALES = ["en", "ko", "ja", "zh"];

type Pending = "browser door" | "no faked runtime";

interface TestRuntimeVerdict {
  title: string;
  /** 1-based line of the `test(` call in the spec. */
  line: number;
  /** The first app route the test reaches, or null. */
  visitedRoute: string | null;
  /** Whether the test reaches an assignment of the native bridge. */
  installsRuntime: boolean;
  /** The browser-only doors the test reaches. */
  doors: string[];
  /** Why the test is listed; null when it is clean. */
  pending: Pending | null;
}

interface RouteRuntimeVerdict {
  /** Repository-relative path with `/` separators. */
  spec: string;
  tests: TestRuntimeVerdict[];
}

interface Facts {
  installsRuntime: boolean;
  visitedRoute: string | null;
  doors: Set<string>;
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

/** How a string or template written in a test can name an app route. */
interface RouteReader {
  /** The route a literal opens, or null: `"/en/topology?x=1"`, `` `/ko/project/${slug}` ``, `"/library"`, `"/en/"`. */
  routeOf(literal: ts.StringLiteralLike | ts.TemplateExpression): string | null;
}

function routeReader(routes: string[]): RouteReader {
  const firstSegments = new Set<string>();
  for (const route of routes) {
    const first = route.split("/")[1];
    if (first) firstSegments.add(first);
  }
  const names = [...firstSegments].map(escapeRegExp).join("|");
  const locales = LOCALES.join("|");
  /* A path in quotes, with or without a locale. The root is a visit only when a locale names it (`"/en/"`). */
  const quoted = new RegExp(`^["'\`](?:/(?:${locales}))?/(?:${names})(?=[/?#"'\`$\\\\]|$)|^["'\`]/(?:${locales})(?=[/?#"'\`])`);
  /* The same path after a `${...}` in a template: a locale must name it, or any bare route would match a file path. */
  const afterExpression = new RegExp(`^/(?:${locales})(?:/(?:${names})(?=[/?#]|$)|/?(?=[?#]|$))`);
  /* What may follow a locale expression: a route name, the root, or another expression (`/${locale}/${route}/`). */
  const afterLocale = new RegExp(`^/(?:(?:${names})(?=[/?#]|$)|(?=[?#]|$))`);
  const namesLocale = (expression: string) => /locale|lang/i.test(expression);

  return {
    routeOf(literal) {
      const text = literal.getText();
      const quotedStart = quoted.exec(text);
      if (quotedStart) return quotedStart[0].slice(1);
      if (ts.isStringLiteralLike(literal)) return null;
      const { head, templateSpans } = literal;
      if (head.text === "/" && templateSpans[0] && namesLocale(templateSpans[0].expression.getText())) {
        const next = templateSpans[0].literal.text;
        const unknownRoute = next === "/" && templateSpans.length > 1;
        if (unknownRoute || afterLocale.test(next)) return `/\${${templateSpans[0].expression.getText()}}${next}`;
      }
      for (const span of templateSpans) {
        if (afterExpression.test(span.literal.text)) return span.literal.text;
      }
      return null;
    },
  };
}

function isRootVisit(call: ts.CallExpression): boolean {
  const callee = call.expression;
  const goes = (ts.isPropertyAccessExpression(callee) && callee.name.text === "goto") || (ts.isIdentifier(callee) && callee.text === "goto");
  const target = call.arguments[0];
  return goes && target !== undefined && ts.isStringLiteralLike(target) && /^\/(?:[?#]|$)/.test(target.text);
}

/** `undefined`, `null` and `void 0`: assigning one of them removes the bridge. */
function isNothing(value: ts.Expression): boolean {
  let bare = value;
  while (ts.isParenthesizedExpression(bare) || ts.isAsExpression(bare) || ts.isNonNullExpression(bare)) bare = bare.expression;
  return (ts.isIdentifier(bare) && bare.text === "undefined") || bare.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(bare);
}

function assignsBridge(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken || isNothing(node.right)) return false;
  const target = node.left;
  if (ts.isPropertyAccessExpression(target)) return target.name.text === BRIDGE_PROPERTY;
  return ts.isElementAccessExpression(target) && ts.isStringLiteralLike(target.argumentExpression) && target.argumentExpression.text === BRIDGE_PROPERTY;
}

const factsCache = new WeakMap<ts.Node, Facts>();

/** What one node says on its own, without following the names in it. */
function factsOf(reached: ReachedNode, reader: RouteReader): Facts {
  const cached = factsCache.get(reached.node);
  if (cached) return cached;
  const facts: Facts = { installsRuntime: false, visitedRoute: null, doors: new Set() };
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    if (assignsBridge(node)) facts.installsRuntime = true;
    if (ts.isIdentifier(node) && BROWSER_DOOR_NAMES.includes(node.text)) facts.doors.add(node.text);
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const text = node.getText();
      for (const door of BROWSER_DOOR_TEXTS) if (text.includes(door)) facts.doors.add(door);
      facts.visitedRoute ??= reader.routeOf(node);
    }
    if (ts.isCallExpression(node) && isRootVisit(node)) facts.visitedRoute ??= "/";
    ts.forEachChild(node, visit);
  };
  visit(reached.node);
  factsCache.set(reached.node, facts);
  return facts;
}

function listSpecs(): string[] {
  return readdirSync(E2E_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
    .map((entry) => toPosix(relative(ROOT, join(entry.parentPath, entry.name))))
    .filter((spec) => !EXCLUDED_SPEC_PREFIXES.some((prefix) => spec.startsWith(prefix)))
    .sort();
}

export function classifySpec(spec: string, reader: RouteReader = routeReader(appRoutes())): RouteRuntimeVerdict {
  const tests = testsOfSpec(spec).map((test): TestRuntimeVerdict => {
    const reached = reachFrom(test.roots).map((each) => factsOf(each, reader));
    const doors = [...new Set(reached.flatMap((facts) => [...facts.doors]))];
    const installsRuntime = reached.some((facts) => facts.installsRuntime);
    const visitedRoute = reached.find((facts) => facts.visitedRoute !== null)?.visitedRoute ?? null;
    let pending: Pending | null = null;
    if (doors.length > 0) pending = "browser door";
    else if (visitedRoute !== null && !installsRuntime) pending = "no faked runtime";
    return { title: test.title, line: test.line, visitedRoute, installsRuntime, doors, pending };
  });
  return { spec, tests };
}

function verdictsOfEverySpec(): RouteRuntimeVerdict[] {
  const reader = routeReader(appRoutes());
  return listSpecs().map((spec) => classifySpec(spec, reader));
}

/** Every test that still reaches an app screen without the faked runtime, as `spec:line title (reason)`, sorted. */
export function pendingTests(): string[] {
  return verdictsOfEverySpec().flatMap(({ spec, tests }) =>
    tests.filter((test) => test.pending !== null).map((test) => `${spec}:${test.line} ${test.title} (${test.pending})`),
  );
}

/** The spec files that hold one or more of those tests, sorted. */
export function pendingSpecs(): string[] {
  return verdictsOfEverySpec()
    .filter(({ tests }) => tests.some((test) => test.pending !== null))
    .map(({ spec }) => spec);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tests = pendingTests();
  const specs = pendingSpecs();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(specs, null, 2));
  } else {
    for (const test of tests) console.log(test);
    console.log(`${tests.length} tests in ${specs.length} specs`);
  }
}

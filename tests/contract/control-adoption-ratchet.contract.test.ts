import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative } from 'node:path';

import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

import { judgeRatchet, RAISES_DIR, type RatchetJudgement } from './lib/ratchet-base';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Hand-written control classNames can never grow: button, anchor and form counts (registered, debt,
 * no-basis) are judged against the merge base (`lib/ratchet-base.ts`). A deliberate rise needs a
 * `tests/contract/ratchet-raises/<gate>/<slug>.json` record; registry rows are one file each.
 */
/**
 * Kind of claim that a place is outside the value layer; a new kind also goes in the criteria table
 * above. `shape-gap` must always carry a `conditional`, else it becomes a permanent exemption and
 * the registry stops being a debt list.
 */
const OUTSIDE_CLAIMS = [
  'chrome-token',
  'stage-geometry',
  'value-layer-peer',
  'standard-button',
  'no-spec',
  'state-scoped',
  'prose',
  'shape-gap',
] as const;
type OutsideClaim = (typeof OUTSIDE_CLAIMS)[number];

interface OutsideEntry {
  /** Repo-relative path. Must exist. */
  readonly file: string;
  /** **How many places in this file are registered as outside the value layer.** Not the whole file. */
  readonly count: number;
  readonly claim: OutsideClaim;
  /**
   * The evidence string that **must remain in that file**. If it disappears the
   * claim is dead and the gate turns red. `chrome-token` uses the token name,
   * and the gate goes on to check in globals.css that the token really is beyond
   * the fixed steps.
   */
  readonly proof: string;
  readonly why: string;
  /** "Move it once X exists" — when the value layer gains that axis, delete the registration and drop the place into debt. */
  readonly conditional?: string;
  readonly note?: string;
}

/**
 * **The third category — "no basis".**
 *
 * It claims something **different** from a registration (`OutsideEntry`):
 *
 * | Category | Claim | Can the value layer emit this? |
 * |---|---|---|
 * | registered | "outside in principle" | **No** (viewport function · JS coordinates · the layer's own house · another layer's contract) |
 * | **no-basis** | "it could, but **there is nothing to emit**" | Yes it could. But this element has **no spec** — it is not a control |
 * | debt | "not moved yet" | It could, and there is something to emit. It simply was not moved |
 *
 * ⚠️ **Do not confuse this with `no-spec` (a registration).** There the spec is
 * **delegated to the caller** (`className={className}`) — the value layer cannot
 * emit someone else's decision, so it is outside in principle. Here **nobody**
 * decides a spec, because there is nothing to decide.
 *
 * The only claim type today is `click-surface`: a **screen-covering click
 * surface** (scrim, blocking backdrop). It gets pressed but it is not a control
 * — it declares **no** shape, size, type, or ink, only placement
 * (`absolute inset-0 z-*`) plus one background layer, and the value layer has
 * already declared both of those outside its share (placement belongs to
 * `className`).
 *
 * ⚠️ **These rows are not debt to repay.** Debt targets 0; these do not — which
 * is why the counts were split. Mixed together, debt becomes a number that
 * **cannot reach 0 in principle**, and at that moment it stops being a progress
 * gauge and becomes decoration.
 *
 * **The anchor side is 0 today — a measurement, not an empty row.** Running all
 * anchors through the predicate returns 0: an `<a>` exists to **go somewhere**,
 * so it rarely becomes a spec-less click surface. Probe ⑮ asserts exactly that.
 */
const NO_BASIS_CLAIMS = ['click-surface'] as const;
type NoBasisClaim = (typeof NO_BASIS_CLAIMS)[number];

interface NoBasisEntry {
  readonly file: string;
  readonly count: number;
  readonly family: 'button' | 'anchor';
  readonly claim: NoBasisClaim;
  /** The evidence string that must remain in the file. Same discipline as a registration. */
  readonly proof: string;
  readonly why: string;
  readonly note?: string;
}

/**
 * Registries are data files, one row each: `<registry>/<file basename>.<claim>[.<proof slug>].json`.
 * Verify a place before adding a row; a row raises a registered count and needs a raise record.
 */
const REGISTRY_DIR = 'tests/contract/control-adoption';
type RegistryName = 'buttons' | 'anchors' | 'fields' | 'no-basis';

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function rowProblems(name: string, row: Record<string, unknown>, registry: RegistryName): string[] {
  const problems: string[] = [];
  if (!isText(row.file)) problems.push('`file` must be a repository path');
  else if (!name.startsWith(`${basename(row.file, extname(row.file))}.`)) {
    problems.push(`file name must start with "${basename(row.file, extname(row.file))}."`);
  }
  if (!Number.isInteger(row.count) || (row.count as number) <= 0) problems.push('`count` must be a positive integer');
  if (!isText(row.proof)) problems.push('`proof` must name the evidence string');
  if (!isText(row.why)) problems.push('`why` must say why the place is outside');
  const claims: readonly string[] = registry === 'no-basis' ? NO_BASIS_CLAIMS : OUTSIDE_CLAIMS;
  if (!claims.includes(row.claim as string)) problems.push(`\`claim\` must be one of ${claims.join(', ')}`);
  if (registry === 'no-basis' && row.family !== 'button' && row.family !== 'anchor') {
    problems.push('`family` must be "button" or "anchor"');
  }
  return problems;
}

/**
 * Read one registry under `root` (the working tree, or a merge-base tree).
 *
 * **A root without the registry directory throws** rather than returning empty: that tree
 * predates the data files, so measuring it would count zero registrations and report every
 * row as growth. The judge treats a throwing base as "nothing comparable" and uses the absolute
 * ceiling instead.
 */
function loadRegistry(root: string, registry: 'no-basis'): NoBasisEntry[];
function loadRegistry(root: string, registry: Exclude<RegistryName, 'no-basis'>): OutsideEntry[];
function loadRegistry(root: string, registry: RegistryName): (OutsideEntry | NoBasisEntry)[] {
  if (!existsSync(join(root, REGISTRY_DIR))) {
    throw new Error(`${join(root, REGISTRY_DIR)} does not exist; this tree predates the registry files`);
  }
  const dir = join(root, REGISTRY_DIR, registry);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const row = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
      const problems = rowProblems(name, row, registry);
      if (problems.length > 0) throw new Error(`${REGISTRY_DIR}/${registry}/${name}: ${problems.join('; ')}`);
      return row as unknown as OutsideEntry | NoBasisEntry;
    });
}

const OUTSIDE_VALUE_LAYER = loadRegistry(process.cwd(), 'buttons');
const OUTSIDE_VALUE_LAYER_ANCHORS = loadRegistry(process.cwd(), 'anchors');
const NO_BASIS = loadRegistry(process.cwd(), 'no-basis');
const NO_BASIS_BUTTONS = NO_BASIS.filter((e) => e.family === 'button');
const NO_BASIS_ANCHORS = NO_BASIS.filter((e) => e.family === 'anchor');

/**
 * Ceilings for when no merge base exists (shallow clone) and a floor when the tree is compared with
 * itself; raise records widen them. Each is a literal: a value derived from the registry would rise
 * with every row and never fail.
 */
const FALLBACK = {
  registered: 24,
  debt: 0,
  noBasis: 5,
  clickSurfaces: 5,
  anchorRegistered: 38,
  anchorDebt: 0,
  anchorNoBasis: 0,
  fieldDebt: -6,
} as const;

const ROOTS = ['src', 'app'];
const SELF = 'tests/contract/control-adoption-ratchet.contract.test.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Terminates an opening tag by **brace depth**.
 *
 * Without this, the `=>` inside `onClick={() => …}` reads as the end of the tag.
 * That happened in the first measurement and classified 251 of 419 as "no
 * className", nearly inverting the conclusion. **Measure the wrong element and
 * the number is wrong even though it is a number.**
 */
/**
 * Blank comments before tag parsing, keeping offsets and line numbers: an apostrophe in a comment
 * inside a JSX opening tag opens a quote `openingTag` never closes, swallowing the JSX after it.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

const BUTTON_TAGS = ['button'] as const;
const ANCHOR_TAGS = ['Link', 'a'] as const;
const FIELD_TAGS = ['input', 'textarea', 'select', 'label'] as const;

const VALUE_LAYER_CALL = /(?:controlClass|fieldClass|fieldLabel)\s*\(/;
const VALUE_LAYER = new Set(['controlClass', 'fieldClass', 'fieldLabel']);
const helperCache = new Map<string, string[]>();

const isFunctionLike = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
const rendersJsx = (n: ts.Node): boolean =>
  ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || ts.forEachChild(n, rendersJsx) === true;

function returnedValues(fn: ts.FunctionLikeDeclaration): ts.Node[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const values: ts.Node[] = [];
  const visit = (n: ts.Node): void => {
    if (isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) values.push(n.expression);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn.body, visit);
  return values;
}

/** A value only the value layer can produce: its call, or a function every return of which is one. */
function yieldsValueLayer(node: ts.Node): boolean {
  if (rendersJsx(node)) return false;
  if (isFunctionLike(node)) {
    const values = returnedValues(node);
    return values.length > 0 && values.every(yieldsValueLayer);
  }
  const visit = (n: ts.Node): boolean =>
    isFunctionLike(n)
      ? yieldsValueLayer(n)
      : (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && VALUE_LAYER.has(n.expression.text)) ||
        ts.forEachChild(n, (child) => (visit(child) ? true : undefined)) === true;
  return visit(node);
}

/** Names (and `NAME.key`) whose every same-file binding yields the value layer. */
function valueLayerNames(source: string): string[] {
  const cached = helperCache.get(source);
  if (cached) return cached;
  const verdicts = new Map<string, boolean[]>();
  const record = (name: string, value: ts.Node) => verdicts.set(name, [...(verdicts.get(name) ?? []), yieldsValueLayer(value)]);
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) record(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!ts.isObjectLiteralExpression(node.initializer)) record(node.name.text, node.initializer);
      else {
        for (const property of node.initializer.properties) {
          const value = ts.isPropertyAssignment(property) ? property.initializer : property;
          if (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
            record(`${node.name.text}.${property.name.text}`, value);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('control.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  const names = [...verdicts].filter(([, each]) => each.every(Boolean)).map(([name]) => name);
  helperCache.set(source, names);
  return names;
}

function classValue(tag: string): string {
  const at = tag.search(/\bclassName\s*=/);
  if (at < 0) return '';
  let i = tag.indexOf('=', at) + 1;
  while (/\s/.test(tag[i] ?? '')) i += 1;
  if (tag[i] !== '{') return tag.slice(i, tag.indexOf(tag[i], i + 1) + 1);
  for (let j = i, depth = 0, quote = ''; j < tag.length; j += 1) {
    if (quote) {
      if (tag[j] === quote && tag[j - 1] !== '\\') quote = '';
    } else if (tag[j] === '"' || tag[j] === "'" || tag[j] === '`') quote = tag[j];
    else if (tag[j] === '{') depth += 1;
    else if (tag[j] === '}' && --depth === 0) return tag.slice(i, j + 1);
  }
  return tag.slice(i);
}

function handWrittenTags(file: string, tags: readonly string[] = BUTTON_TAGS): string[] {
  const source = stripComments(readFileSync(file, 'utf8'));
  const systemNames = valueLayerNames(source).map(
    (name) => new RegExp(`(?<![\\w$.])${name.replace(/[.$]/g, (c) => `\\${c}`)}(?![\\w$])`),
  );
  const found: string[] = [];
  for (const m of source.matchAll(new RegExp(`<(?:${tags.join('|')})\\b`, 'g'))) {
    const tag = openingTag(source, m.index + m[0].length);
    if (!/className/.test(tag)) continue; // No class means no hand-written spec
    /*
     * A finished class extracted into a constant built from `controlClass(` or `fieldClass` and shared by
     * several places must not count as hand-written; leaving a value-layer name out keeps moved places
     * counted as debt.
     */
    const className = classValue(tag);
    if (VALUE_LAYER_CALL.test(className)) continue;
    if (systemNames.some((name) => name.test(className))) continue;
    found.push(tag);
  }
  return found;
}

function countInFile(file: string, tags: readonly string[] = BUTTON_TAGS): number {
  return handWrittenTags(file, tags).length;
}

/**
 * **The words inside string literals in an opening tag.** Even when the class is
 * assembled from constants or templates, the literal fragments are caught here.
 * Variant prefixes (`hover:`, `focus:`, …) are stripped — "did it declare a
 * spec" is a question independent of state.
 */
function literalClassTokens(tag: string): string[] {
  const out: string[] = [];
  for (const m of tag.matchAll(/["'`]([^"'`]*)["'`]/g)) {
    for (const word of m[1].split(/\s+/)) {
      if (word) out.push(word.replace(/^[a-z-]+:/, ''));
    }
  }
  return out;
}

/** The property kinds the value layer **owns**. Declaring any one of them makes it a control spec. */
const RAMP_OWNED_TOKEN =
  /^-?(min-h|h|w|size|p|px|py|pt|pb|pl|pr|gap|rounded|border|text|font|leading|tracking)(-|$)/;

/**
 * **The predicate for "this is not a control but a screen-covering click
 * surface".**
 *
 * It requires **both**:
 *
 * 1. `inset-0` — it covers the screen (or its parent) entirely. If it does not,
 *    it is just a small control, which is "not moved yet" rather than "nothing
 *    to say".
 * 2. **Zero** ramp-owned properties — it declares no height, inset, radius,
 *    border, type, or weight. The moment it declares one, the value layer has
 *    something to emit, the qualification disappears, and it returns to debt.
 *
 * (2) is this category's pawl. It has already rejected a real place —
 * `DemoStage`'s playback overlay is `absolute inset-0` but carries `text-body`
 * and `leading-body`. **Full-bleed does not mean click surface.**
 */
function isClickSurface(tag: string): boolean {
  if (!/inset-0/.test(tag)) return false;
  return !literalClassTokens(tag).some((token) => RAMP_OWNED_TOKEN.test(token));
}

/** The **exhaustive count** of qualifying click surfaces across the repository. Measured independently of the registry. */
function clickSurfaceCensus(scanned: string[], tags: readonly string[] = BUTTON_TAGS): string[] {
  const hits: string[] = [];
  for (const file of scanned) {
    for (const tag of handWrittenTags(file, tags)) {
      if (isClickSurface(tag)) hits.push(file);
    }
  }
  return hits;
}

/**
 * Takes the registry **as an argument** so a probe can remove a row or add a
 * file and aim at the detector itself (same reason as the hard-cut ratchet's
 * `stillHardCut(registry)`).
 */
function census(
  scanned: string[],
  registry: readonly OutsideEntry[] = OUTSIDE_VALUE_LAYER,
  tags: readonly string[] = BUTTON_TAGS,
  noBasisRegistry: readonly NoBasisEntry[] = NO_BASIS_BUTTONS,
) {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const file of scanned) {
    const n = countInFile(file, tags);
    if (n > 0) {
      byFile.set(file, n);
      total += n;
    }
  }
  const registeredByFile = new Map<string, number>();
  for (const entry of registry) {
    registeredByFile.set(entry.file, (registeredByFile.get(entry.file) ?? 0) + entry.count);
  }
  let registered = 0;
  for (const n of registeredByFile.values()) registered += n;
  const noBasisByFile = new Map<string, number>();
  for (const entry of noBasisRegistry) {
    noBasisByFile.set(entry.file, (noBasisByFile.get(entry.file) ?? 0) + entry.count);
  }
  let noBasis = 0;
  for (const n of noBasisByFile.values()) noBasis += n;
  return {
    total,
    registered,
    noBasis,
    debt: total - registered - noBasis,
    byFile,
    registeredByFile,
    noBasisByFile,
  };
}

/**
 * Is a chrome token **really beyond the fixed steps?**
 *
 * The value layer emits fixed px steps, so "inexpressible" is true only when the
 * token is redefined to a different value per condition (width, pointer) or uses
 * a viewport function. The day a token collapses into one ordinary px value this
 * check turns red and that row becomes debt rather than a registration.
 */
function tokenIsBeyondFixedSteps(css: string, token: string): boolean {
  const declarations = [...css.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
  if (declarations.length === 0) return false;
  if (declarations.length > 1) return true;
  return /clamp\(|max\(|min\(|\d+v[hw]|touch-target-min/.test(declarations[0]);
}

type Census = ReturnType<typeof census>;
type TreeMeasure = {
  scanned: string[];
  button: Census;
  anchor: Census;
  field: Census;
  clickSurfaces: string[];
  anchorClickSurfaces: string[];
};

/**
 * Every count this gate judges, for the tree rooted at `root`, with **that tree's own
 * registries**. The merge-base judge calls it with the extracted base tree, which is why the
 * registries are data files: the base's rows are only readable if they are not code in this file.
 */
function measureTree(root: string): TreeMeasure {
  const cwd = process.cwd();
  const scanned = ROOTS.map((r) => join(root, r))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => walk(relative(cwd, dir) || '.'));
  const noBasis = loadRegistry(root, 'no-basis');
  return {
    scanned,
    button: census(scanned, loadRegistry(root, 'buttons'), BUTTON_TAGS, noBasis.filter((e) => e.family === 'button')),
    anchor: census(scanned, loadRegistry(root, 'anchors'), ANCHOR_TAGS, noBasis.filter((e) => e.family === 'anchor')),
    field: census(scanned, loadRegistry(root, 'fields'), FIELD_TAGS, []),
    clickSurfaces: clickSurfaceCensus(scanned),
    anchorClickSurfaces: clickSurfaceCensus(scanned, ANCHOR_TAGS),
  };
}

/**
 * The working tree and each extracted merge base are measured once. An extracted base is
 * content-addressed and never changes; a scratch repository in a probe does, so it is not cached.
 */
const BASE_CACHE = join(tmpdir(), 'atlas-ratchet-base');
const measured = new Map<string, TreeMeasure>();
function measureOnce(root: string): TreeMeasure {
  const cacheable = root === process.cwd() || root.startsWith(BASE_CACHE);
  if (!cacheable) return measureTree(root);
  let result = measured.get(root);
  if (!result) {
    result = measureTree(root);
    measured.set(root, result);
  }
  return result;
}

const today = measureOnce(process.cwd());
const scannedFiles = today.scanned;
const { total, registered, noBasis, debt, byFile, registeredByFile, noBasisByFile } = today.button;
const anchorCensus = today.anchor;
const fieldCensus = today.field;
const globalsCss = readGlobalCss();

/** Everything `measureTree` reads; only these are extracted at the merge base. */
const READS = [...ROOTS, REGISTRY_DIR];

type JudgeOptions = { cwd?: string; base?: string | null; fallback?: number };

/**
 * **The eight judged counts.** Each is one `judgeRatchet` call with its gate id written out,
 * because a raise record is valid only for a gate that a contract file names this way
 * (`ratchet-merge-base.contract.test.ts`). The probes at the end of this file run these same
 * calls on a scratch repository, so what they prove is what the tests above enforce.
 */
const judgeControl = {
  registered: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-registered',
      measure: (root) => measureOnce(root).button.registered,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.registered,
      cwd: o.cwd,
      base: o.base,
    }),
  debt: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-debt',
      measure: (root) => measureOnce(root).button.debt,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.debt,
      cwd: o.cwd,
      base: o.base,
    }),
  noBasis: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-no-basis',
      measure: (root) => measureOnce(root).button.noBasis,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.noBasis,
      cwd: o.cwd,
      base: o.base,
    }),
  clickSurfaces: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-click-surfaces',
      measure: (root) => measureOnce(root).clickSurfaces.length,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.clickSurfaces,
      cwd: o.cwd,
      base: o.base,
    }),
  anchorRegistered: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-anchor-registered',
      measure: (root) => measureOnce(root).anchor.registered,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.anchorRegistered,
      cwd: o.cwd,
      base: o.base,
    }),
  anchorDebt: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-anchor-debt',
      measure: (root) => measureOnce(root).anchor.debt,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.anchorDebt,
      cwd: o.cwd,
      base: o.base,
    }),
  anchorNoBasis: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-anchor-no-basis',
      measure: (root) => measureOnce(root).anchor.noBasis,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.anchorNoBasis,
      cwd: o.cwd,
      base: o.base,
    }),
  fieldDebt: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-field-debt',
      measure: (root) => measureOnce(root).field.debt,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.fieldDebt,
      cwd: o.cwd,
      base: o.base,
    }),
} satisfies Record<keyof typeof FALLBACK, (o?: JudgeOptions) => RatchetJudgement>;

describe('컨트롤 채택 래칫 — 폼(`<input>` · `<textarea>` · `<select>` · `<label>`)', () => {
  /**
   * ⚠️ **A lower bound on the debt count punishes progress.** This assertion used
   * to require "more than 20" and turned red the moment debt fell 29 → 20 — the
   * third time the same failure was repeated in one day. Debt falling is the
   * destination, not a defect.
   *
   * So the question here is not "is there enough debt" but **"is the detector still
   * alive"** — the per-tag field-of-view assertions below check that. Here we only
   * check that, **while debt is non-zero**, the three categories sum to the total.
   */
  /**
   * Total and debt are different numbers: assert the three categories sum to the total, which holds
   * whether debt is 0 or 100.
   */
  it('세 부류의 합이 전수와 같다 — 어느 칸에도 안 들어간 폼이 없다', () => {
    expect(fieldCensus.registered + fieldCensus.noBasis + fieldCensus.debt).toBe(fieldCensus.total);
  });

  it('손으로 규격을 쓴 폼이 머지 베이스보다 늘지 않는다', () => {
    const verdict = judgeControl.fieldDebt();
    const worst = [...fieldCensus.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    expect(
      verdict.current,
      `Hand-specced form controls rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(total ${fieldCensus.total}).\n${verdict.explain}\n` +
        `Most in: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}\n` +
        'New form controls use `fieldClass` / `fieldLabel`; a place they cannot style is a verified row in ' +
        `${REGISTRY_DIR}/fields/.`,
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it('세 부류의 합이 전수와 같다 — 어느 칸에도 안 들어간 건이 없다', () => {
    expect(fieldCensus.registered + fieldCensus.noBasis + fieldCensus.debt).toBe(fieldCensus.total);
  });

  /**
   * Check non-zero per tag, one tag at a time: `label` alone puts the total over 20, so a total-only
   * assertion cannot catch `input` going uncounted.
   */
  /**
   * Measure the scanner's field of view (the tag exists in the repository), not debt: debt reaching
   * 0 is the destination, and a lower bound on debt turns red on progress.
   */
  it('네 태그를 각각 보고 있다 — 한 태그만 보면서 총계로 위장하지 못한다', () => {
    const seen = Object.fromEntries(FIELD_TAGS.map((tag) => [tag, 0])) as Record<string, number>;
    for (const file of scannedFiles) {
      const source = readFileSync(file, 'utf8');
      for (const tag of FIELD_TAGS) {
        seen[tag] += [...source.matchAll(new RegExp(`<${tag}\\b`, 'g'))].length;
      }
    }
    for (const tag of FIELD_TAGS) {
      expect(seen[tag], `<${tag}> 가 저장소에 하나도 없다 — 스캐너의 시야 밖이거나 태그가 사라졌다`).toBeGreaterThan(0);
    }
  });
});

describe('컨트롤 채택 래칫 — 등재된 「값 층 밖」', () => {
  it('등재된 파일이 전부 실재한다 — 없는 파일을 세면 수가 거짓이 된다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      expect(existsSync(entry.file), `${entry.file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
    }
  });

  it('각 줄의 근거가 아직 파일에 있다 — 근거가 사라지면 주장도 죽는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      expect(
        readFileSync(entry.file, 'utf8').includes(entry.proof),
        `"${entry.proof}" disappeared from ${entry.file}. This row's claim (${entry.claim}) stands on that evidence: ` +
          `if the site moved, rewrite the registry; if it moved onto the value layer, delete the row.`,
      ).toBe(true);
    }
  });

  it('`chrome-token` 줄의 토큰이 정말 고정 단 밖이다 — px 하나가 되면 부채로 내려온다', () => {
    const chromeTokens = OUTSIDE_VALUE_LAYER.filter((e) => e.claim === 'chrome-token');
    expect(chromeTokens.length, '`chrome-token` 줄이 하나도 없으면 이 검사는 공집합 위에서 논다').toBeGreaterThan(0);
    for (const entry of chromeTokens) {
      expect(
        tokenIsBeyondFixedSteps(globalsCss, entry.proof),
        `${entry.proof} became **one fixed step** in globals.css. The value layer can now emit it, so ` +
          `the "cannot be expressed" claim is dead: remove ${entry.file} from the registry and pay it down as debt.`,
      ).toBe(true);
    }
  });

  it('등재 수가 그 파일의 실측을 넘지 않는다 — 있지도 않은 것을 등재할 수 없다', () => {
    for (const [file, claimed] of registeredByFile) {
      const actual = byFile.get(file) ?? 0;
      expect(
        claimed,
        `${file}: registered ${claimed}, but only ${actual} hand-built controls were measured. If sites moved onto the value layer, ` +
          `lower the registry count with them; otherwise that much disappears from the debt without anyone seeing it.`,
      ).toBeLessThanOrEqual(actual);
    }
  });

  it('등재가 머지 베이스보다 늘지 않는다 — 늘리려면 raise 기록에 왜를 적는다', () => {
    const verdict = judgeControl.registered();
    expect(
      verdict.current,
      `Registered button places rose to ${verdict.current} over the ceiling ${verdict.ceiling}.\n` +
        `${verdict.explain}\n` +
        '**The registry is a debt list, not a permit list** — registering a place that could move is the ' +
        'failure this gate exists to stop. Only a place the value layer cannot emit in principle earns a row.',
    ).toBeLessThanOrEqual(verdict.ceiling);
  });
});

describe('컨트롤 채택 래칫 — 앵커(`<Link>` · `<a>`)', () => {
  it('등재된 앵커 파일이 전부 실재한다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER_ANCHORS) {
      expect(existsSync(entry.file), `${entry.file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
    }
  });

  it('각 줄의 근거가 아직 파일에 있다 — 근거가 사라지면 주장도 죽는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER_ANCHORS) {
      expect(
        readFileSync(entry.file, 'utf8').includes(entry.proof),
        `"${entry.proof}" disappeared from ${entry.file}. This row's claim (${entry.claim}) stands on that evidence: ` +
          `if the site moved, rewrite the registry; if it moved onto the value layer, delete the row.`,
      ).toBe(true);
    }
  });

  it('`chrome-token` 앵커 줄의 토큰이 정말 고정 단 밖이다', () => {
    const chromeTokens = OUTSIDE_VALUE_LAYER_ANCHORS.filter((e) => e.claim === 'chrome-token');
    expect(chromeTokens.length, '`chrome-token` 줄이 없으면 이 검사는 공집합 위에서 논다').toBeGreaterThan(0);
    for (const entry of chromeTokens) {
      expect(
        tokenIsBeyondFixedSteps(globalsCss, entry.proof),
        `${entry.proof} became **one fixed step** in globals.css, so the value layer can emit it: ` +
          `remove ${entry.file} from the registry and pay it down as debt.`,
      ).toBe(true);
    }
  });

  it('등재 수가 그 파일의 실측을 넘지 않는다 — 있지도 않은 것을 등재할 수 없다', () => {
    for (const [file, claimed] of anchorCensus.registeredByFile) {
      const actual = anchorCensus.byFile.get(file) ?? 0;
      expect(
        claimed,
        `${file}: ${claimed} anchors registered, but only ${actual} hand-built anchors were measured. If sites moved onto the value layer, ` +
          `lower the registry count with them.`,
      ).toBeLessThanOrEqual(actual);
    }
  });

  it('앵커 등재가 머지 베이스보다 늘지 않는다', () => {
    const verdict = judgeControl.anchorRegistered();
    expect(
      verdict.current,
      `Registered anchor places rose to ${verdict.current} over the ceiling ${verdict.ceiling}.\n` +
        `${verdict.explain}\n` +
        '**The registry is a debt list, not a permit list** — "the shape does not exist yet" is not a reason to register.',
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it('앵커 부채가 머지 베이스보다 늘지 않는다 — 누를 수 있는 것은 전부 값 층을 지난다', () => {
    const verdict = judgeControl.anchorDebt();
    const worst = [...anchorCensus.byFile.entries()]
      .filter(([f]) => !anchorCensus.registeredByFile.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    expect(
      verdict.current,
      `Hand-specced anchors rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(total ${anchorCensus.total} − registered ${anchorCensus.registered}).\n${verdict.explain}\n` +
        `\`controlClass({ shape: 'link' })\` exists for this place. \`<Link>\` needs a \`cn\` merge — the raw ` +
        `variant lets the base's border-transparent win by source order (measured in this file).\n` +
        `A registered file is not exempt: a hand anchor added there leaves the registered count alone and raises this one.\n` +
        `Unregistered files with the most: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it('세 수의 합이 앵커 전수와 맞는다', () => {
    expect(anchorCensus.registered + anchorCensus.noBasis + anchorCensus.debt).toBe(anchorCensus.total);
  });

  /**
   * Per-tag counts are not pinned as a literal: both tags are counted and together they are the
   * whole census.
   */
  it('태그 내역이 전수와 맞는다 — 두 태그가 서로를 잃지 않는다', () => {
    const perTag = Object.fromEntries(
      ANCHOR_TAGS.map((tag) => [tag, census(scannedFiles, [], [tag], []).total]),
    );
    for (const tag of ANCHOR_TAGS) {
      expect(perTag[tag], `no hand <${tag}> counted — the scanner lost that tag`).toBeGreaterThan(0);
    }
    expect(Object.values(perTag).reduce((a, b) => a + b, 0), JSON.stringify(perTag)).toBe(anchorCensus.total);
  });
});

describe('컨트롤 채택 래칫 — 아직 안 옮긴 부채', () => {
  it('부채가 머지 베이스보다 늘지 않는다 — 새 컨트롤은 controlClass() 를 쓴다', () => {
    const verdict = judgeControl.debt();
    const worst = [...byFile.entries()]
      .filter(([f]) => !registeredByFile.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    expect(
      verdict.current,
      `Hand-written controls not yet moved rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(total ${total} − registered ${registered} − no-basis ${noBasis}).\n${verdict.explain}\n` +
        `New controls use \`controlClass({ shape })\` — the eight shapes came from measurement and cannot emit off-ramp values.\n` +
        `A registered file is not exempt: a hand control added there leaves the registered count alone and raises this one.\n` +
        `Unregistered files with the most: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it('세 수의 합이 전수와 맞는다 — 갈라진 수가 서로를 잃지 않는다', () => {
    expect(
      registered + noBasis + debt,
      `registered ${registered} + no basis ${noBasis} + debt ${debt} differs from the census total ${total}. ` +
        'One site sits in two classes at once, or a class registers more than was measured.',
    ).toBe(total);
  });
});

describe('컨트롤 채택 래칫 — 근거 없음(값 층이 낼 것이 없다)', () => {
  it('등재된 파일이 전부 실재하고 근거가 아직 파일에 있다', () => {
    expect(NO_BASIS.length, '이 등록부가 비면 아래 검사 전부가 공집합 위에서 논다').toBeGreaterThan(0);
    for (const entry of NO_BASIS) {
      expect(existsSync(entry.file), `${entry.file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
      expect(
        readFileSync(entry.file, 'utf8').includes(entry.proof),
        `${entry.file} 에서 «${entry.proof}» 가 사라졌다 — 이 줄의 주장이 그 근거 위에 서 있다.`,
      ).toBe(true);
    }
  });

  it('등재한 수만큼 **자격 있는** 클릭면이 그 파일에 실재한다 — 규격을 하나라도 달면 부채로 돌아온다', () => {
    for (const entry of NO_BASIS) {
      const tags = entry.family === 'button' ? BUTTON_TAGS : ANCHOR_TAGS;
      const qualified = handWrittenTags(entry.file, tags).filter(isClickSurface).length;
      expect(
        qualified,
        `${entry.file}: claims "${entry.claim}" ${entry.count} times, but only ${qualified} sites pass the verdict. ` +
          'The verdict requires both (1) full cover (inset-0) and (2) zero ramp-owned properties: once a scrim carries any height, inset, radius or type step, ' +
          'the value layer has something to emit and "nothing to emit" is false. Pay those sites down as debt.',
      ).toBeGreaterThanOrEqual(entry.count);
    }
  });

  it('이 사유의 **전수**가 머지 베이스보다 늘지 않는다 — 새 클릭면은 조용히 면제되지 않는다', () => {
    const hits = today.clickSurfaces;
    const verdict = judgeControl.clickSurfaces();
    expect(
      verdict.current,
      `Qualifying click surfaces rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(${[...new Set(hits)].join(' · ')}).\n${verdict.explain}\n` +
        'A new full-bleed click catcher appeared. If it truly carries zero spec, register it in ' +
        `${REGISTRY_DIR}/no-basis/ and say why in the raise record; otherwise repay it as debt.`,
    ).toBeLessThanOrEqual(verdict.ceiling);
    expect(noBasis, '등재한 근거 없음이 실측 전수를 넘었다').toBeLessThanOrEqual(hits.length);
  });

  it('근거 없음이 머지 베이스보다 늘지 않는다', () => {
    for (const verdict of [judgeControl.noBasis(), judgeControl.anchorNoBasis()]) {
      expect(
        verdict.current,
        `${verdict.gate} rose to ${verdict.current} over the ceiling ${verdict.ceiling}.\n${verdict.explain}\n` +
          '**If this category becomes an escape hatch the round has failed** — "too cumbersome to move" is debt, not no-basis.',
      ).toBeLessThanOrEqual(verdict.ceiling);
    }
  });

  it('근거 없음 수가 그 파일의 실측을 넘지 않는다 — 파일 면제가 아니다', () => {
    for (const [file, claimed] of noBasisByFile) {
      const actual = byFile.get(file) ?? 0;
      expect(claimed, `${file}: 근거 없음 ${claimed} 인데 실측 손 컨트롤은 ${actual} 뿐이다.`).toBeLessThanOrEqual(
        actual,
      );
    }
  });
});

/**
 * **Detector probes** — the `/gate-probe` discipline.
 *
 * The tests above run only on "today's numbers" and "today's registry". That
 * leaves room for the detector to idle on an empty set, or for registrations to
 * swallow debt whole, with everything still green. Here the predicate is aimed at
 * **in both directions**.
 *
 * ⚠️ The hard-cut ratchet had the defect where `BASELINE = REGISTRY.length` made
 * "it never grows" **impossible to fail in principle**. Here the ceiling is the
 * merge base's own registry, which a row added in this change cannot lift (the
 * scratch-repository probes at the end prove it), and the fallback ceilings are
 * literals (④).
 */
describe('탐지기 프로브 — 이 게이트가 실제로 무엇을 잡는가', () => {
  const FIXTURE = 'tests/fixtures/control-adoption/HandWrittenControl.tsx.fixture';

  it('① 손으로 쓴 컨트롤을 실제로 센다 — 0을 통과로 읽지 않는다', () => {
    expect(existsSync(FIXTURE), '프로브 픽스처가 사라지면 탐지기 증명도 사라진다').toBe(true);
    // Two fixtures: one off-ramp spec + one **unregistered** chrome-token place.
    expect(countInFile(FIXTURE), '픽스처의 손 컨트롤 2건을 못 셌다면 파서가 깨진 것이다').toBe(2);

    /*
     * Measure the number of files scanned, not remaining debt: a lower bound on debt turns red once
     * everything is moved.
     */
    expect(scannedFiles.length, '훑은 파일이 너무 적다 — 스캐너의 시야가 죽었다').toBeGreaterThan(150);
  });

  it('a class counts as adopted only when every path to it runs through the value layer', () => {
    const cases: Record<string, [string[], number]> = {
      'a helper, a component, and a hand-written tag that names the component': [
        [
          'function chipClass(active: boolean) {',
          "  return controlClass({ shape: 'pill', active });",
          '}',
          'function Toolbar() {',
          "  return <span className={controlClass({ shape: 'pill' })} />;",
          '}',
          'export const P = ({ active }: { active: boolean }) => (',
          '  <>',
          '    <button className={chipClass(active)} />',
          '    <button className={chipClass(!active)} />',
          '    <button data-owner={Toolbar} className="h-9 px-3" />',
          '  </>',
          ');',
        ],
        1,
      ],
      'a helper that discards the value layer': [
        [
          'function chipClass() {',
          "  void controlClass({ shape: 'pill' });",
          "  return 'h-8 rounded-full border px-3';",
          '}',
          'export const P = () => <button className={chipClass()} />;',
        ],
        1,
      ],
      'a helper with one hand-written branch': [
        [
          'function chipClass(active: boolean) {',
          "  if (active) return controlClass({ shape: 'pill', active });",
          "  return 'h-8 rounded-full border px-3';",
          '}',
          'export const P = () => <button className={chipClass(false)} />;',
        ],
        1,
      ],
      'an object mixing adopted and hand-written tones': [
        [
          'const TONE = {',
          "  primary: controlClass({ shape: 'pill' }),",
          "  ghost: 'h-9 rounded-md px-3',",
          '};',
          'export const P = () => <><button className={TONE.primary} /><button className={TONE.ghost} /></>;',
        ],
        1,
      ],
      'a wrapped local className constant': [
        [
          'export function P({ selected }: { selected: boolean }) {',
          '  const className = cn(',
          "    controlClass({ shape: 'row' }),",
          "    selected && 'bg-x',",
          '  );',
          '  return (',
          '    <div>',
          '      <button className={className}>A</button>',
          '      <button className="h-9 rounded-md px-3">B</button>',
          '      <button type="button" className="h-8 rounded px-2">C</button>',
          '    </div>',
          '  );',
          '}',
        ],
        2,
      ],
      'a helper named label beside aria-label': [
        [
          'function label(kind: string) {',
          '  return fieldLabel({ kind });',
          '}',
          'export const P = () => <button aria-label="Close" className="h-9 rounded-md px-3">x</button>;',
        ],
        1,
      ],
      'a helper named active beside data-active': [
        [
          'const active = (on: boolean) =>',
          "  controlClass({ shape: 'pill', active: on });",
          'export const P = ({ on }: { on: boolean }) => <button data-active={on} className="h-9 rounded-md px-3">x</button>;',
        ],
        1,
      ],
      'a shadowed local name': [
        [
          "function B() { const chip = 'h-9 px-3'; return <button className={chip} />; }",
          "function A() { const chip = controlClass({ shape: 'pill' }); return <button className={chip} />; }",
        ],
        2,
      ],
      'a wrapped cn constant': [
        ['const CHIP = cn(', "  controlClass({ shape: 'pill' }),", "  'bg-x',", ');', 'export const P = () => <button className={CHIP} />;'],
        0,
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'control-adoption-helper-'));
    try {
      const counts = Object.entries(cases).map(([name, [lines]], index) => {
        const probe = join(dir, `Probe${index}.tsx`);
        writeFileSync(probe, lines.join('\n'));
        return [name, countInFile(probe)];
      });
      expect(Object.fromEntries(counts)).toEqual(
        Object.fromEntries(Object.entries(cases).map(([name, [, expected]]) => [name, expected])),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('② 등재 안 된 자리를 손 컨트롤로 만들면 **부채**로 잡힌다 — 등재 쪽으로 새지 않는다', () => {
    /*
     * Adding the fixtures to the scan sends both straight to debt. A place using a
     * chrome token is **not registered unless it is in the registry** — the rule is
     * "only verified, registered rows are exempt", not "using a token exempts you".
     */
    const withFixture = census([...scannedFiles, FIXTURE]);
    expect(withFixture.registered).toBe(registered);
    expect(withFixture.debt).toBe(debt + 2);
    expect(
      withFixture.debt,
      '미등재 자리에 손 컨트롤이 늘었는데 판정하는 수가 안 올랐다면 이 게이트는 아무것도 안 막는다',
    ).toBeGreaterThan(debt);
  });

  it('③ 등록부에서 줄을 지우면 그 자리가 **부채로 돌아온다** — 등재가 사실을 지우지 않는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      const without = census(
        scannedFiles,
        OUTSIDE_VALUE_LAYER.filter((e) => e !== entry),
      );
      expect(without.registered).toBe(registered - entry.count);
      expect(
        without.debt,
        `${entry.file}(${entry.proof}) 줄을 지웠는데 부채가 안 늘었다 — 그 줄은 아무것도 등재하고 있지 않다`,
      ).toBe(debt + entry.count);
    }
  });

  it('④ 대체 천장이 **리터럴**이다 — 등록부에서 파생되면 「늘지 않는다」가 실패 불가가 된다', () => {
    const source = readFileSync(SELF, 'utf8');
    const block = /const FALLBACK = \{\n([\s\S]*?)\n\} as const;/.exec(source);
    expect(block, 'FALLBACK 블록을 못 찾았다 — 이 프로브가 헛돈다').not.toBeNull();
    const lines = block![1].split('\n').map((line) => line.trim());
    expect(lines.length).toBe(Object.keys(FALLBACK).length);
    for (const line of lines) {
      expect(
        /^[a-zA-Z]+: -?\d+,$/.test(line),
        `${line} — a fallback derived from a registry (\`.length\`, a reduce) rises with every row, the ` +
          "hard-cut ratchet's actual defect.",
      ).toBe(true);
    }
  });

  /**
   * The negative example is derived from the CSS rather than a named token, so a legitimate change to
   * one token's value cannot fail the check.
   */
  it('⑤ 토큰 검사가 아무거나 통과시키지 않는다 — 고정 단 토큰은 반드시 거절한다', () => {
    // Positive: redefined per condition, or using a viewport function.
    expect(tokenIsBeyondFixedSteps(globalsCss, '--git-row-h')).toBe(true);
    expect(tokenIsBeyondFixedSteps(globalsCss, '--overlay-close-size')).toBe(true);
    expect(
      tokenIsBeyondFixedSteps(globalsCss, '--control-h-md'),
      'coarse 승격이 사라졌다면 그건 손가락 바닥이 무너진 것이다',
    ).toBe(true);

    // Negative: pick a "one declaration + plain px" token straight from the CSS.
    const counts = new Map<string, string[]>();
    for (const m of globalsCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
      const list = counts.get(m[1]) ?? [];
      list.push(m[2].trim());
      counts.set(m[1], list);
    }
    const plainPx = [...counts.entries()]
      .filter(([, values]) => values.length === 1 && /^\d+(\.\d+)?px$/.test(values[0]))
      .map(([token]) => token);
    expect(
      plainPx.length,
      '평범한 px 토큰이 하나도 없다 — 이 프로브가 빈 집합 위에서 돌고 있다',
    ).toBeGreaterThan(10);
    for (const token of plainPx) {
      expect(
        tokenIsBeyondFixedSteps(globalsCss, token),
        `${token} 은 px 하나뿐인데 통과했다 — 「크롬 토큰이라 못 옮긴다」가 무제한 면제가 된다`,
      ).toBe(false);
    }
    // A token that does not exist is not evidence.
    expect(tokenIsBeyondFixedSteps(globalsCss, '--not-a-real-token-xyz')).toBe(false);
  });

  it('⑦ 앵커 탐지기가 실제로 센다 — `<button>` 만 세던 사각지대의 자(尺)', () => {
    // Must count the fixture's two anchors (one `<Link>`, one `<a>`).
    expect(
      countInFile(FIXTURE, ANCHOR_TAGS),
      '픽스처의 손 앵커 2건을 못 셌다면 앵커 탐지기가 죽은 것이다',
    ).toBe(2);
    /*
     * Alive on the real tree — without this, "anchor debt 0" and "not counted at
     * all" are the same green. **But measure the scanner's field of view, not the
     * debt count** (same reason as above).
     */
    expect(scannedFiles.length, '훑은 파일이 너무 적다 — 스캐너의 시야가 죽었다').toBeGreaterThan(150);
  });

  it('⑧ 앵커를 하나 더 쓰면 **앵커 부채로** 잡힌다 — 버튼 수는 안 움직인다', () => {
    const withFixture = census([...scannedFiles, FIXTURE], OUTSIDE_VALUE_LAYER_ANCHORS, ANCHOR_TAGS, NO_BASIS_ANCHORS);
    // The fixtures are not in the registry, so both go to **debt**.
    expect(withFixture.registered).toBe(anchorCensus.registered);
    expect(withFixture.debt).toBe(anchorCensus.debt + 2);
    // The two counts do not contaminate each other.
    expect(census([...scannedFiles, FIXTURE]).debt, '앵커 픽스처가 버튼 부채를 움직였다').toBe(debt + 2);
  });

  it('⑪ 앵커 등록부에서 줄을 지우면 그 자리가 **부채로 돌아온다**', () => {
    for (const entry of OUTSIDE_VALUE_LAYER_ANCHORS) {
      const without = census(
        scannedFiles,
        OUTSIDE_VALUE_LAYER_ANCHORS.filter((e) => e !== entry),
        ANCHOR_TAGS,
        NO_BASIS_ANCHORS,
      );
      expect(without.registered).toBe(anchorCensus.registered - entry.count);
      expect(
        without.debt,
        `${entry.file}(${entry.proof}) 줄을 지웠는데 앵커 부채가 안 늘었다 — 그 줄은 아무것도 등재하고 있지 않다`,
      ).toBe(anchorCensus.debt + entry.count);
    }
  });

  /**
   * Plant a hand anchor in a registered file and check debt rises: registration must not become a
   * file-wide exemption, and the check holds even at zero defects.
   */
  it('⑫ 앵커 등재는 **파일 면제가 아니다** — 등재된 파일에 손 앵커를 더하면 부채가 오른다', () => {
    const file = 'src/views/download/ui/DownloadPage.tsx';
    const claimed = anchorCensus.registeredByFile.get(file) ?? 0;
    expect(claimed, '이 프로브는 그 파일이 실제로 등재돼 있을 때만 뜻이 있다').toBeGreaterThan(0);
    const withOneMore = census(
      [...scannedFiles, FIXTURE],
      OUTSIDE_VALUE_LAYER_ANCHORS,
      ANCHOR_TAGS,
      NO_BASIS_ANCHORS,
    );
    expect(
      withOneMore.debt - anchorCensus.debt,
      '등재된 파일 곁에 손 앵커를 더했는데 부채가 안 올랐다 — 등재가 면제로 새고 있다',
    ).toBeGreaterThan(0);
  });

  /**
   * `shape-gap` needs a condition for when it reopens; without one it becomes a permanent exemption,
   * breaking the debt-list definition of the registry.
   */
  it('⑭ `shape-gap` 등재는 전부 «언제 다시 여는가» 를 진다', () => {
    const gaps = OUTSIDE_VALUE_LAYER.concat(OUTSIDE_VALUE_LAYER_ANCHORS).filter(
      (e) => e.claim === 'shape-gap',
    );
    expect(gaps.length, '이 단언은 shape-gap 등재가 있을 때만 뜻이 있다').toBeGreaterThan(0);
    for (const e of gaps) {
      expect(
        e.conditional,
        `${e.file} 의 shape-gap 등재에 조건이 없다 — 조건 없는 「못 낸다」는 영구 면제다`,
      ).toBeTruthy();
      expect(
        (e.conditional ?? '').length,
        `${e.file} 의 조건이 너무 짧다 — 무엇이 관측되면 다시 여는지 적어야 한다`,
      ).toBeGreaterThan(15);
    }
  });

  it('⑬ 기각된 주장이 실제로 기각된다 — 하단 탭바의 56px 은 크롬 토큰 면제가 아니다', () => {
    /*
     * Pins that the fixed 56px token is rejected by the gate; if the value becomes conditional this turns
     * red and the registration is reconsidered.
     */
    expect(
      tokenIsBeyondFixedSteps(globalsCss, '--topology-bottom-tab-min-height'),
      '이 토큰이 조건부가 됐다 — BottomTabBar 2건의 `chrome-token` 등재를 다시 심사하라',
    ).toBe(false);
    /*
     * Guards only that a fixed 56px token cannot buy a chrome exemption: checks registration under the
     * `chrome-token` claim, not any registration.
     */
    const bottomTabClaims = OUTSIDE_VALUE_LAYER_ANCHORS.concat(OUTSIDE_VALUE_LAYER)
      .filter((e) => e.file === 'src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx')
      .map((e) => e.claim);
    expect(
      !bottomTabClaims.includes('chrome-token'),
      'BottomTabBar 가 `chrome-token` 으로 등재됐다 — 그 주장은 56px 고정 단이라 기각된 것이다',
    ).toBe(true);
  });

  it('⑩ 값 층을 지난 앵커는 안 센다 — 램프를 통과해도 세면 옮길 이유가 사라진다', () => {
    // The probe only means something if a consumer exists: an anchor already using `controlClass`.
    const adopted = scannedFiles.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /<(Link|a)\b[^>]*controlClass\s*\(/.test(src.replace(/\n/g, ' '));
    });
    expect(adopted.length, '값 층을 지난 앵커 소비처가 0이면 이 면제는 검증된 적이 없다').toBeGreaterThan(0);
  });

  /*
   * The no-basis category fails if it becomes an escape hatch, so its predicate is probed both ways:
   * what it catches on the real tree, what it rejects, synthetic input, and row deletion.
   */

  it('⑭ 판정 함수가 실물에서 센다 — 빈 집합 위에서 놀지 않는다', () => {
    const hits = clickSurfaceCensus(scannedFiles);
    expect(hits.length, '실물에서 한 자리도 못 잡으면 이 부류는 검증된 적이 없다').toBeGreaterThan(0);
    for (const file of new Set(hits)) {
      expect(
        NO_BASIS.some((e) => e.file === file),
        `${file} 이 클릭면 판정을 통과하는데 등록부에 없다 — 등재하거나 부채로 갚아라.`,
      ).toBe(true);
    }
  });

  /**
   * Test the predicate (`isClickSurface`) with a synthetic tag, not a real file's debt: being full-bleed
   * alone must not buy an exemption, and this holds at zero defects.
   */
  it('⑮ 음성 대조군 — 전면이어도 규격을 지면 클릭면이 아니다', () => {
    /*
     * `DemoStage`'s playback overlay really had this shape — full-bleed (`inset-0`)
     * with a scrim background, but it carries **`text-body` and `leading-body`**. The
     * value layer has something to emit, so it is debt, not a click surface. If this
     * passed, "full-bleed means exempt" would make the category an escape hatch.
     */
    const fullBleedWithSpec =
      ' type="button" className="absolute inset-0 flex items-center justify-center' +
      ' bg-[color:var(--color-backdrop-medium)] text-body leading-body' +
      ' text-[color:var(--color-text-primary)] transition-colors"';
    expect(
      isClickSurface(fullBleedWithSpec),
      '전면 + 스크림이지만 타입을 싣는 오버레이가 클릭면으로 통과했다 — 「전면이면 면제」가 열렸다',
    ).toBe(false);
    expect(NO_BASIS.some((e) => e.file === 'src/views/download/ui/DemoStage.tsx')).toBe(false);
    // Anchor 0 means "0 after seeing all 102", not "not counted".
    /*
     * **A lower bound near the measured value turns red on every move.** The
     * question is not "are there enough" but **"is it counting"** — when every anchor
     * has moved into the value layer this number is correctly 0, and at that point
     * the `fullBleed` assertions above would already have gone red first, making this
     * probe moot.
     */
    expect(anchorCensus.total, '앵커를 한 건도 안 세고 있으면 아래 0 은 무의미하다').toBeGreaterThan(0);
    expect(today.anchorClickSurfaces.length, 'an anchor click surface that is not registered as no-basis').toBe(anchorCensus.noBasis);
  });

  it('⑯ 합성 프로브 — 규격을 하나만 달아도, 전면을 벗어나도 자격이 죽는다', () => {
    const scrim = ' type="button" className="absolute inset-0 z-[25] bg-[color:var(--x)]" onClick={close}';
    expect(isClickSurface(scrim), '순수 스크림을 못 잡으면 판정 함수가 죽은 것이다').toBe(true);
    for (const spec of ['px-3', 'min-h-9', 'rounded-chip', 'text-label', 'border', 'font-medium', 'gap-2']) {
      expect(
        isClickSurface(scrim.replace('inset-0', `inset-0 ${spec}`)),
        `«${spec}» 를 달았는데도 통과한다 — 값 층이 낼 것이 생겼는데 「낼 것이 없다」가 남으면 도피처다.`,
      ).toBe(false);
    }
    // The same holds when hidden behind a variant prefix.
    expect(isClickSurface(scrim.replace('inset-0', 'inset-0 hover:rounded-chip'))).toBe(false);
    // Not full-bleed means it is simply a control.
    expect(isClickSurface(scrim.replace('inset-0 ', ''))).toBe(false);
  });

  it('⑰ 근거 없음 줄을 지우면 그 자리가 **부채로 돌아온다** — 분류가 사실을 지우지 않는다', () => {
    for (const entry of NO_BASIS_BUTTONS) {
      const without = census(
        scannedFiles,
        OUTSIDE_VALUE_LAYER,
        BUTTON_TAGS,
        NO_BASIS_BUTTONS.filter((e) => e !== entry),
      );
      expect(without.noBasis).toBe(noBasis - entry.count);
      expect(
        without.debt,
        `${entry.file} 줄을 지웠는데 부채가 안 늘었다 — 그 줄은 아무것도 분류하고 있지 않다`,
      ).toBe(debt + entry.count);
    }
    // Adding fixtures does not leak into no-basis — anything not in the registry is debt.
    const withFixture = census([...scannedFiles, FIXTURE]);
    expect(withFixture.noBasis).toBe(noBasis);
    expect(withFixture.debt).toBe(debt + 2);
  });

  /**
   * Plant a hand control in a registered file and check debt rises: registration must not exempt a
   * whole file; this holds even when defects are 0.
   */
  it('⑥ 등재는 **파일 면제가 아니다** — 등재된 파일에 손 컨트롤을 더하면 부채가 오른다', () => {
    const registeredFile = OUTSIDE_VALUE_LAYER[0]?.file;
    expect(registeredFile, '등록부가 비었다 — 이 프로브가 헛돈다').toBeTruthy();
    expect(registeredByFile.has(registeredFile as string)).toBe(true);

    const withOneMore = census([...scannedFiles, FIXTURE], OUTSIDE_VALUE_LAYER, BUTTON_TAGS, NO_BASIS_BUTTONS);
    expect(
      withOneMore.debt - debt,
      '등재된 파일 곁에 손 컨트롤을 더했는데 부채가 안 올랐다 — 등재가 면제로 새고 있다',
    ).toBeGreaterThan(0);
  });
});

/**
 * A panel rendered inside another surface does not draw that surface's close button. Both halves are
 * checked: hosts must not pass `onClose`, and the panel must have no close control to receive it.
 */
const WORKBENCH_HOSTED_PANEL = 'src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx';
const WORKBENCH_HOSTED_PANEL_PROPS = 'src/widgets/acp-chat-panel/ui/chat-panel/types.ts';
const WORKBENCH_HOSTS = [
  'src/views/home/ui/TopologyAgentDock.tsx',
  'src/views/ontology-insights/ui/parts/InsightsAgentDock.tsx',
  'src/views/architecture/ui/ArchitectureAgentDock.tsx',
] as const;

/** Attribute names on every `<AcpChatPanel …>` element in a file. */
function chatPanelAttributes(text: string): string[][] {
  const found: string[][] = [];
  // The opening tag ends at the first `>` outside braces and quotes — the same brace-depth walk
  // `static-surface-census` uses, because `onClick={() => …}` contains a `>`.
  for (const match of text.matchAll(/<AcpChatPanel\b/g)) {
    let depth = 0;
    let quote: string | null = null;
    let end = text.length;
    for (let index = match.index + 1; index < text.length; index += 1) {
      const character = text[index];
      if (quote) {
        if (character === quote && text[index - 1] !== '\\') quote = null;
      } else if (character === '"' || character === "'" || character === '`') quote = character;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      else if (character === '>' && depth === 0) {
        end = index;
        break;
      }
    }
    const tag = text.slice(match.index, end);
    found.push([...tag.matchAll(/(?:^|\s)([a-zA-Z][a-zA-Z0-9-]*)=/g)].map((attr) => attr[1]));
  }
  return found;
}

describe('컨트롤 소유권 — 한 화면에 닫기는 하나', () => {
  it('탐지기가 공회전하지 않는다 — 세 호스트 모두에서 패널을 찾는다', () => {
    for (const host of WORKBENCH_HOSTS) {
      const tags = chatPanelAttributes(readFileSync(host, 'utf8'));
      expect(tags.length, `${host} 에서 AcpChatPanel 을 못 찾았다`).toBeGreaterThan(0);
      // A tag with no attributes read means the brace walk stopped early.
      expect(tags[0].length, `${host} 의 속성을 못 읽었다`).toBeGreaterThan(3);
    }
  });

  it('호스트는 자기 닫기를 패널에 넘기지 않는다', () => {
    for (const host of WORKBENCH_HOSTS) {
      for (const attributes of chatPanelAttributes(readFileSync(host, 'utf8'))) {
        expect(
          attributes,
          `${host}: 워크벤치 안의 대화 패널에 onClose 를 넘겼다 — X 가 둘이 되고, 안쪽 것은 자기 것이 아닌 화면을 닫는다`,
        ).not.toContain('onClose');
      }
    }
  });

  it('패널에는 넘겨줄 닫기 자체가 없다 — 규칙이 무시되는 prop 으로 반만 지켜지지 않게', () => {
    const panel = readFileSync(WORKBENCH_HOSTED_PANEL, 'utf8');
    const props = readFileSync(WORKBENCH_HOSTED_PANEL_PROPS, 'utf8');
    expect(panel, '패널이 여전히 닫기 버튼을 그린다').not.toContain('data-testid="acp-chat-close"');
    expect(props, 'the panel props still accept onClose').not.toMatch(/^\s*onClose\??:/m);
    expect(panel, '패널이 여전히 onClose 를 받는다').not.toMatch(/^\s*onClose\??:/m);
  });

  /**
   * ⚠️ **A gate that can only pass is not a gate.** The violation is planted in the shape it had:
   * a host passing its own close down to the panel it contains.
   */
  it('탐지기 프로브 — 심은 위반을 잡고, 이웃 prop 은 놓아둔다', () => {
    const host = readFileSync(WORKBENCH_HOSTS[1], 'utf8');
    const planted = host.replace('onTurnStarted={capture.onTurnStarted}', 'onClose={onClose}');
    expect(planted, '심을 자리를 못 찾았다 — 이 프로브가 헛돈다').not.toBe(host);
    expect(chatPanelAttributes(planted).some((attrs) => attrs.includes('onClose'))).toBe(true);
    // `onDraftPresenceChange` and friends are not close buttons; the detector must name the prop.
    expect(chatPanelAttributes(host).some((attrs) => attrs.includes('onClose'))).toBe(false);
    expect(chatPanelAttributes(host)[0]).toContain('onDraftPresenceChange');
  });
});

/**
 * Probes build a scratch repository and run the same eight `judgeControl` calls: each planted
 * regression must turn red, a raise record turns it green, a fall needs no file. Two branches
 * registering different places must merge without a conflict.
 */
describe('머지 베이스 판정 — 스크래치 저장소 프로브', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'control-adoption-judge-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const git = (repo: string, ...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', '-c', 'commit.gpgsign=false', ...args],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();

  const put = (repo: string, path: string, text: string) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  const tsx = (element: string) => `export function Probe() {\n  return (${element});\n}\n`;
  const row = (repo: string, registry: RegistryName, name: string, extra: Record<string, unknown>) =>
    put(
      repo,
      `${REGISTRY_DIR}/${registry}/${name}.json`,
      JSON.stringify({ file: `src/${name.split('.')[0]}.tsx`, count: 1, proof: 'probe', why: 'probe row', ...extra }),
    );
  const raise = (repo: string, gate: string, slug: string) =>
    put(
      repo,
      `${RAISES_DIR}/${gate}/${slug}.json`,
      JSON.stringify({ gate, raise: 1, why: 'A probe raise that states a full sentence of reason for the growth.' }),
    );

  /** One of each: a registered button, a no-basis scrim, a registered anchor, and a hand field. */
  function repo(name: string, { registry = true } = {}): string {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '-b', 'main');
    put(dir, 'src/Reg.tsx', tsx('<button className="h-[var(--probe)]">r</button>'));
    put(dir, 'src/Scrim.tsx', tsx('<button type="button" className="absolute inset-0 bg-[var(--s)]" />'));
    put(dir, 'src/Door.tsx', tsx('<a className="px-2" href="#">x</a>'));
    put(dir, 'src/Field.tsx', tsx('<input className="h-8" />'));
    if (registry) {
      row(dir, 'buttons', 'Reg.chrome-token', { claim: 'chrome-token' });
      row(dir, 'no-basis', 'Scrim.click-surface', { claim: 'click-surface', family: 'button' });
      row(dir, 'anchors', 'Door.no-spec', { claim: 'no-spec' });
    }
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'base');
    return dir;
  }

  const judgeAt = (key: keyof typeof judgeControl, cwd: string, base: string | null) =>
    judgeControl[key]({ cwd, base, fallback: 1000 });

  /** Each count, the smallest change that makes it grow, and the gate id its raise record names. */
  const PLANTS: { key: keyof typeof judgeControl; gate: string; plant: (dir: string) => void }[] = [
    {
      key: 'registered',
      gate: 'control-registered',
      plant: (dir) => {
        put(dir, 'src/Reg2.tsx', tsx('<button className="h-[var(--probe)]">r</button>'));
        row(dir, 'buttons', 'Reg2.chrome-token', { claim: 'chrome-token' });
      },
    },
    { key: 'debt', gate: 'control-debt', plant: (dir) => put(dir, 'src/Hand.tsx', tsx('<button className="px-3">h</button>')) },
    {
      key: 'noBasis',
      gate: 'control-no-basis',
      plant: (dir) => {
        put(dir, 'src/Scrim2.tsx', tsx('<button type="button" className="absolute inset-0 bg-[var(--s)]" />'));
        row(dir, 'no-basis', 'Scrim2.click-surface', { claim: 'click-surface', family: 'button' });
      },
    },
    {
      key: 'clickSurfaces',
      gate: 'control-click-surfaces',
      plant: (dir) => put(dir, 'src/Scrim3.tsx', tsx('<button type="button" className="absolute inset-0" />')),
    },
    {
      key: 'anchorRegistered',
      gate: 'control-anchor-registered',
      plant: (dir) => {
        put(dir, 'src/Door2.tsx', tsx('<a className="px-2" href="#">x</a>'));
        row(dir, 'anchors', 'Door2.no-spec', { claim: 'no-spec' });
      },
    },
    {
      key: 'anchorDebt',
      gate: 'control-anchor-debt',
      plant: (dir) => put(dir, 'src/Hand.tsx', tsx('<a className="px-2" href="#">h</a>')),
    },
    {
      key: 'anchorNoBasis',
      gate: 'control-anchor-no-basis',
      plant: (dir) => {
        put(dir, 'src/Veil.tsx', tsx('<a className="absolute inset-0" href="#" />'));
        row(dir, 'no-basis', 'Veil.click-surface', { claim: 'click-surface', family: 'anchor' });
      },
    },
    {
      key: 'fieldDebt',
      gate: 'control-field-debt',
      plant: (dir) => put(dir, 'src/Field2.tsx', tsx('<input className="h-8" />')),
    },
  ];

  it('covers every judged count exactly once', () => {
    expect(PLANTS.map((p) => p.key).sort()).toEqual(Object.keys(judgeControl).sort());
    for (const p of PLANTS) expect(judgeControl[p.key]({ base: null }).gate).toBe(p.gate);
  });

  it.each(PLANTS)('$gate: RED on growth over the base, GREEN with a raise record, GREEN on a fall', ({ key, gate, plant }) => {
    const dir = repo(`plant-${key}`);
    const base = git(dir, 'rev-parse', 'HEAD');

    const unchanged = judgeAt(key, dir, base);
    expect(unchanged.atBase, 'the base must be measured, not skipped').not.toBeNull();
    expect(unchanged.current).toBe(unchanged.atBase);
    expect(unchanged.current).toBeLessThanOrEqual(unchanged.ceiling);

    plant(dir);
    const grown = judgeAt(key, dir, base);
    expect(grown.current, `${gate}: the planted regression did not move the count`).toBe(grown.atBase! + 1);
    expect(grown.current, `${gate}: growth passed`).toBeGreaterThan(grown.ceiling);

    raise(dir, gate, 'probe');
    const raised = judgeAt(key, dir, base);
    expect(raised.added.map((r) => r.gate)).toEqual([gate]);
    expect(raised.current).toBeLessThanOrEqual(raised.ceiling);

    // A fall: every place and row removed, with nothing else edited.
    rmSync(join(dir, 'src'), { recursive: true, force: true });
    for (const registry of ['buttons', 'anchors', 'fields', 'no-basis'] as const) {
      rmSync(join(dir, REGISTRY_DIR, registry), { recursive: true, force: true });
    }
    const fallen = judgeAt(key, dir, base);
    expect(fallen.current, `${gate}: removing every place must be a fall`).toBeLessThan(fallen.atBase! + 1);
    expect(fallen.current).toBeLessThanOrEqual(fallen.ceiling);
  });

  it('a registry row added in this change cannot lift the ceiling it is judged by', () => {
    const dir = repo('row-only');
    const base = git(dir, 'rev-parse', 'HEAD');
    put(dir, 'src/Reg.tsx', tsx('<><button className="h-[var(--probe)]">r</button><button className="px-3">h</button></>'));
    // Registering the new hand control keeps it out of debt, so the registered count is what grows.
    row(dir, 'buttons', 'Reg.chrome-token.second', { claim: 'chrome-token' });
    const debt = judgeAt('debt', dir, base);
    expect(debt.current).toBeLessThanOrEqual(debt.ceiling);
    const verdict = judgeAt('registered', dir, base);
    expect(verdict.atBase).toBe(1);
    expect(verdict.current, 'the row lifted its own ceiling').toBeGreaterThan(verdict.ceiling);
  });

  it('lets two branches that each register a different place merge without a conflict', () => {
    const dir = repo('parallel');
    const base = git(dir, 'rev-parse', 'HEAD');
    const register = (branch: string, name: string) => {
      git(dir, 'switch', '-q', '-c', branch, base);
      put(dir, `src/${name}.tsx`, tsx('<button className="h-[var(--probe)]">r</button>'));
      row(dir, 'buttons', `${name}.chrome-token`, { claim: 'chrome-token' });
      raise(dir, 'control-registered', branch);
      const verdict = judgeAt('registered', dir, base);
      expect(verdict.current, `${branch} alone`).toBeLessThanOrEqual(verdict.ceiling);
      git(dir, 'add', '.');
      git(dir, 'commit', '-q', '-m', branch);
    };
    register('register-a', 'Alpha');
    register('register-b', 'Beta');

    git(dir, 'switch', '-q', 'main');
    git(dir, 'merge', '-q', '--no-edit', 'register-a');
    git(dir, 'merge', '-q', '--no-edit', 'register-b');
    expect(git(dir, 'status', '--porcelain'), 'the merge left conflicts').toBe('');
    const merged = judgeAt('registered', dir, base);
    expect(merged.current).toBe(3);
    expect(merged.current).toBeLessThanOrEqual(merged.ceiling);

    // The next branch starts from the merge: both raises are spent.
    const next = git(dir, 'rev-parse', 'HEAD');
    put(dir, 'src/Gamma.tsx', tsx('<button className="h-[var(--probe)]">r</button>'));
    row(dir, 'buttons', 'Gamma.chrome-token', { claim: 'chrome-token' });
    const later = judgeAt('registered', dir, next);
    expect(later.atBase).toBe(3);
    expect(later.current, 'a raise already landed widened a later change').toBeGreaterThan(later.ceiling);
  });

  it('judges against the absolute ceiling when the base predates the registry files', () => {
    const dir = repo('transition', { registry: false });
    const base = git(dir, 'rev-parse', 'HEAD');
    row(dir, 'buttons', 'Reg.chrome-token', { claim: 'chrome-token' });
    const verdict = judgeControl.registered({ cwd: dir, base, fallback: 1 });
    expect(verdict.atBase, 'a base without registries would count every row as growth').toBeNull();
    expect(verdict.ceiling).toBe(1);
    expect(judgeControl.registered({ cwd: dir, base, fallback: 0 }).current).toBeGreaterThan(0);
  });

  it('refuses a malformed row rather than counting it as zero', () => {
    const dir = repo('malformed');
    put(dir, `${REGISTRY_DIR}/buttons/Wrong.chrome-token.json`, JSON.stringify({ file: 'src/Reg.tsx', count: 1 }));
    expect(() => measureTree(dir)).toThrow(/file name must start with "Reg\."/);
  });
});

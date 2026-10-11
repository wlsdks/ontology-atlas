import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Counts conditionally appearing surfaces with no exit, from an exhaustive walk of `src/` and `app/`.
 * Swaps (the alternative branch renders something) and non-interactive roots (`pointer-events-none`,
 * `aria-hidden`) are not appearances; only roots that genuinely cannot be clicked drop out.
 */

/** The call site decides, not the suffix; this only narrows candidates. */
const SURFACE_SUFFIXES = [
  'Panel',
  'Sheet',
  'Modal',
  'Drawer',
  'Popover',
  'Dialog',
  'Overlay',
  'Menu',
  'Tooltip',
  'Toast',
  'HoverCard',
  'Banner',
];

/**
 * Matching is substring containment over source, so a mechanism name in a probe fixture comment
 * silently kills the probe. Entrance-only classes do not belong: no way out is the debt counted.
 */
export const MOTION_MECHANISMS = [
  'AnimatePresence',
  'usePanelPresence',
  'useSurfaceSwap',
  '<Surface',
  // `Dialog` holds `AnimatePresence` inside, so it owns its entrance and exit even when mounted
  // conditionally.
  '<Dialog',
  'atlas-tooltip',
];

export interface HardCut {
  /** The surface's name (a named component) or an inline tag such as `<div>`. */
  readonly what: string;
  /** Where the evidence lives — the definition file for a named component, the call site for an inline one. */
  readonly file: string;
  /** The call sites that render it conditionally. */
  readonly at: readonly string[];
  readonly kind: 'named' | 'inline';
}

export function walkTsx(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walkTsx(p, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

function resolveImport(root: string, fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(root, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * Follows barrels (`index.ts`) to the real definition file; reading the barrel yields a false
 * hard cut.
 */
function resolveComponent(root: string, file: string | null, name: string, seen = new Set<string>()): string | null {
  if (!file || seen.has(file + name) || !existsSync(file)) return file;
  seen.add(file + name);
  const src = readFileSync(file, 'utf8');
  const defines = new RegExp(`(function|const|class)\\s+${name}\\b`);
  if (defines.test(src)) return file;
  for (const m of src.matchAll(/export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const names = m[1].split(',').map((r) => r.trim().split(/\s+as\s+/).pop()!.trim());
    if (names.includes(name)) {
      const next = resolveImport(root, file, m[2]);
      if (next) return resolveComponent(root, next, name, seen);
    }
  }
  for (const m of src.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const next = resolveImport(root, file, m[1]);
    if (next && existsSync(next) && defines.test(readFileSync(next, 'utf8'))) return next;
  }
  return file;
}

/**
 * Returns the **alternative branch** of a `?` ternary by counting paren/brace/bracket
 * depth rather than parsing JSX.
 *
 * The first version, which walked the JSX tree, was wrong twice: it read the `=>` in
 * `onSave={() => {` as the end of the opening tag (the trap the control ratchet's
 * preamble already records), and it mispaired the closing tags of nested containers.
 * The result was that `DeltaPreviewModal`, a genuine appearance, **was classified as
 * a swap** and dropped out of the inventory entirely. A depth scan has neither trap.
 */
export function ternaryAlternative(src: string, qmark: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = qmark + 1; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') {
      depth -= 1;
      if (depth < 0) return '';
    } else if (c === ':' && depth === 0) return src.slice(i + 1, i + 80).trim();
  }
  return '';
}

/**
 * Returns the **whole body** of a conditional branch — children included, not just
 * the opening tag.
 *
 * Needed because of positioners. The map's node popover is
 * `{mounted && <div positioner><OntologyMapDetailPanel open onExited/></div>}`, where
 * **the exit window belongs to the `<Surface>` inside the child** and this wrapper is
 * a layout shell that unmounts on that notification (`onExited`). Reading only the
 * opening tag makes it look like there is no way out.
 *
 * `.claude/rules/design.md` records the same trap: *"Measure the wrong element and the conclusion inverts entirely"* — measure the wrong element and the conclusion inverts; a popover's
 * positioner (a layout wrapper that correctly has no transition) was measured and
 * reported as the top defect "the subject receives no transition at all", when the
 * animation was on its child panel. This place really was miscounted that way once.
 */
function branchSource(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') {
      depth -= 1;
      if (depth < 0) return src.slice(from, i);
    } else if (c === ':' && depth === 0) return src.slice(from, i);
  }
  return src.slice(from, from + 4000);
}

/** `onExited` is the `Surface` exit-complete notification, so its presence means a child owns the exit. */
const EXIT_DELEGATED = [...MOTION_MECHANISMS, 'onExited'];

/** An alternative branch rendering nothing is an appearance; rendering something is a swap. */
function branchAppears(src: string, matchStart: number, matchText: string): boolean {
  if (matchText.includes('&&')) return true;
  const alt = ternaryAlternative(src, matchStart + matchText.indexOf('?')).replace(/^\(?\s*/, '');
  return alt === '' || /^(null|undefined|false)\b/.test(alt);
}

/** A root that cannot be clicked or is hidden from assistive tech is not a surface. */
function notASurface(openingTag: string): boolean {
  return /pointer-events-none|aria-hidden/.test(openingTag);
}

/**
 * Slices the opening tag alone, terminated by brace depth: the first `>` would hit the `=>` in
 * `onClick={() => ...}`, and without a boundary the result leaks outside the tag.
 */
/**
 * Comments are blanked before tag parsing, preserving offsets: an apostrophe in a comment inside a JSX
 * opening tag opens a quote that never closes and the parser runs past the tag.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function openingTag(source: string, ltIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = ltIndex; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(ltIndex, i + 1);
  }
  return source.slice(ltIndex, ltIndex + 800);
}

/**
 * Exhaustive inventory. `roots` is normally `['src', 'app']`.
 *
 * It returns **scan results rather than a list**, so a new surface placed anywhere is
 * caught on the next run — the opposite of the old registry, which only saw what
 * someone had added a row for.
 */
/**
 * **All conditionally appearing surfaces** — **regardless** of whether they have a
 * way out.
 *
 * This is the hard-cut inventory's denominator, and the answer when the accessibility
 * ratchet asks how many open states it is measuring. A gate that measured only the
 * first screen never had this denominator, which is why "zero violations" was
 * indistinguishable from "never opened".
 */
export function censusAppearingSurfaces(root: string, roots: readonly string[] = ['src', 'app']): HardCut[] {
  return collect(root, roots, [], { onlyHardCuts: false });
}

export function censusHardCuts(root: string, roots: readonly string[] = ['src', 'app'], extraFiles: readonly string[] = []): HardCut[] {
  return collect(root, roots, extraFiles, { onlyHardCuts: true });
}

function collect(root: string, roots: readonly string[], extraFiles: readonly string[], opts: { onlyHardCuts: boolean }): HardCut[] {
  const files = roots.flatMap((r) => walkTsx(join(root, r))).concat(extraFiles.map((f) => (f.startsWith('/') ? f : join(root, f))));
  const rel = (f: string) => f.replace(`${root}/`, '');

  const namedSites = new Map<string, { def: string | null; at: string[] }>();
  const inline: HardCut[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const src = stripComments(readFileSync(file, 'utf8'));

    const imports = new Map<string, string | null>();
    for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      const target = resolveImport(root, file, m[2]);
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop()!.trim();
        if (name) imports.set(name, target);
      }
    }
    for (const m of src.matchAll(/import\s+([A-Z][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
      imports.set(m[1], resolveImport(root, file, m[2]));
    }

    // ── Detector ⓪ `<Surface open={…}>` — **the migrated surfaces themselves**
    //
    // Without this, the denominator shrinks as debt is repaid. Migration turns the call
    // site from `{cond && <div className="fixed … z-50">}` into `<Surface open={cond}>`,
    // and detectors ① and ② look only at **conditional call sites**, so the surface
    // disappears from view entirely. Measured: repaying 13 dropped the denominator from
    // 19 to 8 — back to the state where "zero violations" and "not looking" are
    // indistinguishable.
    if (!opts.onlyHardCuts) {
      for (const m of src.matchAll(/<Surface[\s>]/g)) {
        const tag = openingTag(src, m.index!);
        if (!/\bopen[=\s]/.test(tag)) continue;
        const line = src.slice(0, m.index!).split('\n').length;
        inline.push({ what: '<Surface>', file: rel(file), at: [`${rel(file)}:${line}`], kind: 'named' });
      }
    }

    // ── Detector ① named surface components
    for (const m of src.matchAll(/(&&|\?)\s*\(?\s*<([A-Z][\w$]*)/g)) {
      const name = m[2];
      if (!SURFACE_SUFFIXES.some((s) => name.endsWith(s))) continue;
      if (!branchAppears(src, m.index!, m[0])) continue;
      const line = src.slice(0, m.index!).split('\n').length;
      const def = imports.has(name) ? resolveComponent(root, imports.get(name)!, name) : file;
      const entry = namedSites.get(name) ?? { def, at: [] };
      entry.at.push(`${rel(file)}:${line}`);
      namedSites.set(name, entry);
    }

    // Detector 2: inline overlays such as `{open && <div className="fixed ...">}` have no name.
    for (const m of src.matchAll(/(&&|\?)\s*\(?\s*<(div|section|aside|nav)\s/g)) {
      const ltIndex = m.index! + m[0].length - m[2].length - 1;
      const tag = openingTag(src, ltIndex);
      if (!/className=\{?["'`][^"'`]*\b(fixed|absolute)\b[^"'`]*\bz-\d/.test(tag)) continue;
      if (notASurface(tag)) continue;
      if (!branchAppears(src, m.index!, m[0])) continue;
      // The way out must be inside this branch; if a child owns it, this wrapper is a positioner. The
      // exclusion applies to the denominator too, or a positioner and its `<Surface>` count twice.
      if (EXIT_DELEGATED.some((x) => branchSource(src, ltIndex).includes(x))) continue;
      const line = src.slice(0, ltIndex).split('\n').length;
      inline.push({ what: `<${m[2]}>`, file: rel(file), at: [`${rel(file)}:${line}`], kind: 'inline' });
    }
  }

  const named: HardCut[] = [];
  for (const [name, { def, at }] of namedSites) {
    if (!def || !existsSync(def)) continue;
    const defSrc = stripComments(readFileSync(def, 'utf8'));
    if (opts.onlyHardCuts && MOTION_MECHANISMS.some((x) => defSrc.includes(x))) continue;
    // Same de-duplication: the `<Surface>` inside the definition was already counted.
    if (!opts.onlyHardCuts && /<Surface[\s>]/.test(defSrc)) continue;
    // A passive readout whose root cannot be clicked (a hover card) is not a surface.
    const rootLt = defSrc.search(/<(div|section|aside|nav)\s/);
    if (rootLt >= 0 && notASurface(openingTag(defSrc, rootLt))) continue;
    named.push({ what: name, file: rel(def), at, kind: 'named' });
  }

  return [...named, ...inline].sort((a, b) => a.file.localeCompare(b.file) || a.what.localeCompare(b.what));
}

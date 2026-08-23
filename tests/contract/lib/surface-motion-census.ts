import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Hard-cut inventory — **counts, across all source, every surface that appears
 * conditionally and has no way out.**
 *
 * This used to walk a hand-written registry, and when that registry was empty the
 * gate ran over an empty set. "Zero hard cuts" was then true of the list, not of the
 * product. This module replaces that: the input is an exhaustive walk of `src/` and
 * `app/`, not a list.
 *
 * **What counts as an appearance** — the number only means something once three
 * categories are separated. The old registry's preamble already warned that counting
 * by suffix over-reports; following the parent's render gate splits them three ways:
 *
 * | Category | This inventory | How it is decided |
 * |---|---|---|
 * | The parent renders it conditionally | **Counted** | The call site is `{cond && <X/>}` or `{cond ? <X/> : null}` |
 * | Always rendered | Not counted | **Structurally excluded** — only conditional call sites are examined, so it is never matched |
 * | The parent already animates it | Not counted | If the alternative branch **renders something**, this is a swap, not an appearance. Places where only the content changes inside an already-mounted container (sections of the settings sheet, step branches of the connect sheet) all fall out here |
 *
 * That third row is this inventory's key discriminator. It filtered out three real
 * places: `AgentGlobalScopePanel` (the connect sheet's scope branch),
 * `VaultAgentSetupPanel`, and `ProjectQuickEditPanel` — the category the old
 * registry had hand-annotated as "the parent already animates it" is now filtered
 * **mechanically**.
 *
 * **An element that cannot be interacted with is not a surface.** A root that is
 * `pointer-events-none` or `aria-hidden` is not counted, on two grounds:
 *
 * 1. **The motion-budget rule already says so** — `.claude/rules/design.md`:
 *    *"Frequency eats the budget. Hover/focus surfaces are `0~--motion-fast`."* (frequency
 *    eats the budget; hover/focus surfaces get 0 to `--motion-fast`). For a passive
 *    readout that follows the pointer, 0ms is a **permitted value**, not a defect.
 *    Measured: the map's edge and cluster hover cards are exactly this category
 *    (root is `pointer-events-none fixed z-40`).
 * 2. Position markers that are **neither visible nor clickable** — a tour anchor
 *    (`aria-hidden` plus zero size) — drop out here. Before this exclusion the
 *    measured false-positive rate was about 40%; after it, 1 of 11 (a borderline
 *    case).
 *
 * ⚠️ **This exclusion has a direction.** Ask whether an exemption that "keeps
 * legitimate use alive" also becomes "keeps illegitimate use alive" (the lesson from
 * the shadow rule leaking through its `var(` exemption). Here it is narrow: only
 * elements whose root genuinely cannot be clicked drop out, and such an element has
 * no reason to own an exit window anyway (the pointer has already left by the time
 * it closes).
 */

/** Surface naming convention. The **call site** makes the verdict, not the suffix — this only narrows candidates. */
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
 * The **recognised mechanisms** that give a surface an entrance and an exit.
 *
 * ⚠️ The verdict is **substring containment** over source, so comments read as code
 * — writing a mechanism name into a probe fixture silently kills the probe.
 *
 * `animate-out` / `data-[state=closed]` are the Radix-family exits. The first
 * version lacked both and wrongly counted `Tooltip` as a hard cut: **a short
 * mechanism list produces false positives.** Conversely an **entrance-only** class
 * such as `map-overlay-in` does not belong here — having no way out is exactly the
 * debt this gate counts.
 */
export const MOTION_MECHANISMS = [
  'AnimatePresence',
  'usePanelPresence',
  'useSurfaceSwap',
  '<Surface',
  // Dialog is the modal primitive holding AnimatePresence inside, so it owns its
  // entrance and exit even when mounted conditionally (ratified by the system seat,
  // 2026-08-15, dialog.tsx).
  '<Dialog',
  'animate-out',
  'data-[state=closed]',
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
 * Follows barrels (`index.ts`) through to the real definition file.
 *
 * Without this, the **barrel** is read instead of the file behind the re-export and
 * the verdict becomes "no mechanism". That happened in the first measurement: five
 * surfaces reached through a widget barrel were all caught as false hard cuts. The
 * false positive is structural, so the interpretation was wrong, not the value.
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
 * `{mounted && <div positioner><TopologyV2DetailPanel open onExited/></div>}`, where
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

/**
 * The marker that a child owns the exit. `onExited` is this repository's `Surface`
 * contract's **exit-complete notification**, so its presence means the owner of the
 * way out is inside.
 */
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
 * Slices out the opening tag alone — **terminated by brace depth.**
 *
 * Without a boundary the verdict leaks outside the tag. Measured: a
 * `<div className="fixed …">` written inside a probe fixture's **comment** paired
 * with a `z-50` in the real code that followed and counted one place twice. A comment
 * is not code, and another element's classes are not this element's classes.
 *
 * Simply finding the first `>` catches the `=>` in `onClick={() => …}` — the trap
 * recorded in the control ratchet's preamble, so it is terminated the same way, by
 * brace depth.
 */
/**
 * Blank out comments before tag parsing, preserving byte offsets and line
 * numbers. `openingTag` tracks quotes, and a comment inside a JSX opening tag
 * defeats that: an English apostrophe (`This scrim's name`) opens a quote that
 * never closes, so the parser runs past the tag and swallows what follows.
 * Measured 2026-08-22 in `control-adoption-ratchet`, where a census silently
 * fell 5 to 4 when the repo's comments were translated to English. Latent here
 * for the same reason, and closed the same way.
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

    // ── Detector ② inline overlays — exactly the shape the owner's probe used:
    //    `{open && <div className="fixed …">}`. It has no name, so ① cannot see it.
    for (const m of src.matchAll(/(&&|\?)\s*\(?\s*<(div|section|aside|nav)\s/g)) {
      const ltIndex = m.index! + m[0].length - m[2].length - 1;
      const tag = openingTag(src, ltIndex);
      if (!/className=\{?["'`][^"'`]*\b(fixed|absolute)\b[^"'`]*\bz-\d/.test(tag)) continue;
      if (notASurface(tag)) continue;
      if (!branchAppears(src, m.index!, m[0])) continue;
      // The way out must be **inside this branch** — an `AnimatePresence` somewhere else
      // in the file does not belong to this element, and conversely, if a child owns it
      // then this wrapper is a positioner, not a surface.
      //
      // ⚠️ This exclusion must apply to the **denominator too** (2026-08-04). Without it a
      //    positioner and the `<Surface>` inside it count **one surface twice** — the
      //    recorded precedent: measure the wrong element and the number is wrong even
      //    though it is a number.
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

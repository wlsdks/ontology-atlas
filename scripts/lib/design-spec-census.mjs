/**
 * Design **spec** inventory — it watches changes in **vocabulary and values**,
 * not a text diff.
 *
 * ## Why "the file is in the diff" is not the test
 *
 * `.claude/rules/design.md`'s “Changing the specification requires
 * `design-system`” section names the trigger files. Those
 * are the **most frequently touched files in this repository** — `app/globals.css`
 * alone appears in more than a third of the last 200 commits. Requiring a ledger
 * entry whenever one appears in a diff would catch typo fixes, comments,
 * formatting, and single-surface colour tweaks, so the gate would not protect the
 * spec — it would **fill the ledger with meaningless rows**. That is noise, not
 * enforcement, and this repository has already suffered it (banning `shadow-[`
 * wholesale took lint from 144 to 548).
 *
 * ## So what counts as a spec change
 *
 * In one sentence: **the vocabulary (what there is to choose from) and the ramp
 * (the values that vocabulary emits).** Implementation, comments, and prose are
 * not watched.
 *
 * | Source | Counted | Not counted |
 * |---|---|---|
 * | `app/globals.css` | the **names and values** of ramp tokens (type · line height · radius · shadow · control height · content icon · the fixed-scale contract) | surface-only tokens, comments, order, whitespace |
 * | `src/shared/ui/control-class.ts` | cva **axis names, axis options, and defaults** (shape/size/tone/scope…) | the class strings each option emits |
 * | `src/shared/ui/controls.tsx` · `surface.tsx` | **exported primitive names** | internal implementation |
 * | `.claude/rules/design.md` | the **numbers and token names** in the “Fixed scale contract” section | that section's sentences |
 *
 * The nature of the judgement differs per layer:
 *
 * - **A change in vocabulary** (axes, options, primitives) always counts, because
 *   it means the system gained something to choose from. That is precisely the
 *   accident design.md names: adding an exception axis every time a rule hit a
 *   wall produced 8–9 distinct control heights on one screen.
 * - **A change in a ramp value** also counts. Moving `--text-body` from 12.5 to 13
 *   is a decision that moves the whole app, not "a single value edit".
 * - **The class strings an option emits** are not counted. Changing `chip`'s
 *   `gap-1.5` to `gap-2` is an adjustment inside that shape, and if it leaks off
 *   the ramp `control-class.contract.test.ts` already catches it. Watching this far
 *   lets false positives win.
 *
 * ## Why not all of `--color-*`
 *
 * globals.css has more than 200 `--color-*` entries, most of them **alpha ladders
 * for a single surface**. Treating them all as ramp would demand a ledger entry for
 * every colour tweak, which goes straight to the noise failure above. The real
 * gates for colour spec already exist elsewhere: the charter (achromatic plus a
 * single indigo) is held by `.claude/rules/forbidden.md` and the
 * `accentTintPairingSelectors` lint, and contrast by `contrast-ratchet`. What is
 * counted here is only the **root of the palette** — the solid values that define
 * a hue. A new hue appearing, or the brand indigo moving, is a vocabulary change.
 */

import ts from 'typescript';

/** The authority the gate reads the trigger list from. The list is never duplicated here. */
export const SPEC_RULE_DOC = '.claude/rules/design.md';

/** The section of that document where the list lives. Renaming the heading makes the parser die loudly. */
export const SPEC_RULE_SECTION = 'Changing the specification requires `design-system`';

/** design.md's “Fixed scale contract” section — the target of the number and token inventory. */
export const SCALE_CONTRACT_SECTION = 'Fixed scale contract';

/**
 * Tokens in globals.css counted as ramp.
 *
 * The named ladders (type · line height · radius · shadow · control height ·
 * content icon) plus the two dimensions design.md pins in “Fixed scale contract.”
 * The first four follow the regular `--<ramp>-<step>` naming
 * and number about 40 in total, so anything caught here is almost certainly spec.
 */
const RAMP_TOKEN_PATTERN =
  /^--(?:text|leading|radius|shadow|control-h|icon)-|^--(?:chrome-tile-size|app-nav-rail-icon-size)$/;

/**
 * The root of the palette — the solid colours that define a hue.
 *
 * Alpha ladders (`--color-indigo-a08` …) and surface-only colours are excluded.
 * What is caught are the values that **define what this app's colours are**: 3
 * background steps, 4 text steps, 3 indigo steps, 4 signal tones. If these move,
 * the charter has moved.
 */
const PALETTE_ROOT_PATTERN =
  /^--color-(?:canvas|panel|elevated|text-[a-z]+|indigo-(?:brand|accent|hover)|status-[a-z]+)$/;

/**
 * **Value-layer files that emit axes and options through cva** — the inventory
 * counts their names and values. `badge-class.ts` (static badge geometry) joined on
 * 2026-08-15.
 */
const VARIANT_VOCABULARY_FILES = new Set([
  'src/shared/ui/control-class.ts',
  'src/shared/ui/badge-class.ts',
]);

/** These files carry no ramp vocabulary of their own — only their export list is counted. */
const PRIMITIVE_EXPORT_FILES = new Set([
  'src/shared/ui/controls.tsx',
  'src/shared/ui/surface.tsx',
  // The modal authority created on 2026-08-15 with design-system ratification — what it exports is the contract.
  'src/shared/ui/dialog.tsx',
  // 2026-08-15 (2) form behaviour layer — Input/Textarea · Checkbox.
  'src/shared/ui/input.tsx',
  'src/shared/ui/checkbox.tsx',
  // 2026-08-15 (3) exclusive single selection — SegmentedControl.
  'src/shared/ui/segmented-control.tsx',
  /*
   * 2026-08-15 (8) the radiogroup **behaviour layer** — what this file exports is
   * the contract (changing the shape of `groupProps`/`itemProps` changes every
   * container wearing it). It emits no values at all, so an export inventory is
   * correct here rather than a vocabulary inventory.
   */
  'src/shared/lib/use-roving-radio-group.ts',
]);

/**
 * **Files where the values themselves are the spec** — the strings are the spec,
 * not the exported names.
 *
 * The `PRIMITIVE_EXPORT_FILES` inventory counts **names only**, which is right for
 * part files (what they export is the contract, the implementation is free). But
 * `page-frame.ts` is entirely values, so a name inventory catches **none** of a
 * spec change like `md:pt-12` → `md:pt-6` — confirmed by measurement (an empty
 * Map). Watching it that way would only pretend to protect it.
 */
const VALUE_EXPORT_FILES = new Set(['src/shared/ui/page-frame.ts']);

/**
 * **Derives** the trigger file list from the authoritative document.
 *
 * Duplicating it makes two copies, and two copies with no gate means drift is the
 * default (a failure this repository actually suffered with duplicated skill
 * files). So the list lives only in design.md and is read here. Divergence itself
 * is caught by `tests/contract/design-spec-ledger.contract.test.ts`.
 */
export function parseTriggerFiles(designMdText) {
  const section = extractSection(designMdText, SPEC_RULE_SECTION);
  if (section === null) {
    throw new Error(
      `[design-spec] could not find section “${SPEC_RULE_SECTION}” in ${SPEC_RULE_DOC}; ` +
        'update this constant when renaming the heading.',
    );
  }
  // ⚠️ Do not scrape backticked paths from the **whole** section. Its last
  // paragraph cites a gate file (`…design-council.contract.test.ts`), and the first
  // implementation swallowed that as a trigger — making the file that watches this
  // one a watched file. So only **list rows** (`- \`path\` — description`) are read.
  // The format is the contract.
  const files = [];
  for (const line of section.split('\n')) {
    const match = /^-\s+`([A-Za-z0-9_./[\]-]+\.(?:ts|tsx|css|md))`/.exec(line.trim());
    if (match && !files.includes(match[1])) files.push(match[1]);
  }
  if (files.length === 0) {
    throw new Error(
      `[design-spec] section “${SPEC_RULE_SECTION}” has no list row shaped as “- \`path\`”.`,
    );
  }
  return files;
}

/** From `## <heading>` up to just before the next heading at the same level. */
function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## ') && line.includes(heading));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * One file's spec inventory. Keys are human-readable spec names, values are what
 * that spec emits today. A file carrying no spec returns an empty Map.
 */
export function censusFor(path, text) {
  if (text === null || text === undefined) return new Map();
  if (path === 'app/globals.css') return cssRampCensus(text);
  if (VARIANT_VOCABULARY_FILES.has(path)) return variantVocabularyCensus(path, text);
  if (PRIMITIVE_EXPORT_FILES.has(path)) return exportedPrimitiveCensus(path, text);
  if (VALUE_EXPORT_FILES.has(path)) return exportedValueCensus(path, text);
  if (path === SPEC_RULE_DOC) return scaleContractCensus(text);
  return new Map();
}

/** Ramp token name → value. Comments, whitespace, and declaration order are normalised away. */
function cssRampCensus(css) {
  const census = new Map();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const [, name, rawValue] of stripped.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    if (!RAMP_TOKEN_PATTERN.test(name) && !PALETTE_ROOT_PATTERN.test(name)) continue;
    const value = rawValue.replace(/\s+/g, ' ').trim();
    const key = `token ${name}`;
    // The same token is declared in several blocks (:root, media queries). When the
    // values differ both are spec, so both are kept — changing only one is still a
    // spec change.
    const previous = census.get(key);
    if (previous === undefined) census.set(key, value);
    else if (!previous.split(' | ').includes(value)) census.set(key, `${previous} | ${value}`);
  }
  return census;
}

/**
 * The vocabulary of cva's `variants` / `defaultVariants`.
 *
 * Read with the TypeScript parser rather than a regex: this file is full of tables
 * and code examples inside comments, so a text rule like "lines beginning with
 * `shape:`" would count comments as spec.
 */
function variantVocabularyCensus(path, source) {
  const census = new Map();
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
      const name = propertyName(node);
      if (name === 'variants') {
        for (const axis of node.initializer.properties) {
          if (!ts.isPropertyAssignment(axis) || !ts.isObjectLiteralExpression(axis.initializer)) {
            continue;
          }
          const axisName = propertyName(axis);
          const options = axis.initializer.properties
            .filter((option) => ts.isPropertyAssignment(option))
            .map((option) => propertyName(option))
            .filter(Boolean)
            .sort();
          census.set(`axis ${axisName}`, options.join(' '));
        }
      } else if (name === 'defaultVariants') {
        for (const entry of node.initializer.properties) {
          if (!ts.isPropertyAssignment(entry)) continue;
          census.set(`default ${propertyName(entry)}`, entry.initializer.getText(sourceFile));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return census;
}

function propertyName(node) {
  const name = node.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return name?.getText?.() ?? '';
}

/** The set of exported primitive names — the list of parts the system provides. */
/** Counts the **values** of exported string constants — the same name with a new value is still a spec change. */
function exportedValueCensus(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const census = new Map();

  const visit = (node) => {
    if (
      ts.isVariableStatement(node) &&
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        // Strip `as const` — the spec is the literal inside.
        const literal =
          initializer && ts.isAsExpression(initializer) ? initializer.expression : initializer;
        if (literal && ts.isStringLiteral(literal)) {
          census.set(`value ${declaration.name.text}`, literal.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return census;
}

function exportedPrimitiveCensus(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const names = new Set();

  const visit = (node) => {
    const exported = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
    if (exported) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if (node.name && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return names.size === 0 ? new Map() : new Map([[`exports ${path}`, [...names].sort().join(' ')]]);
}

/**
 * Number and token inventory of design.md's “Fixed scale contract” section.
 *
 * The section is prose, but the **numbers and token names** inside it are spec
 * (36px pill · 20px rail icon · `--chrome-tile-size` …). Comparing whole sentences
 * would catch typo fixes, so only the values are extracted.
 */
function scaleContractCensus(designMdText) {
  const section = extractSection(designMdText, SCALE_CONTRACT_SECTION);
  if (section === null) return new Map();
  const numbers = [...section.matchAll(/\b(\d+(?:\.\d+)?)(px)\b/g)].map((match) => match[0]);
  // Trim so prose wildcards such as `--leading-*` are not captured with a trailing hyphen.
  const tokens = [...section.matchAll(/--[a-z0-9-]+/g)]
    .map((match) => match[0].replace(/-+$/, ''))
    .filter((token) => token.length > 2);
  const census = new Map();
  if (numbers.length > 0) census.set('scale-contract numbers', [...new Set(numbers)].sort().join(' '));
  if (tokens.length > 0) census.set('scale-contract tokens', [...new Set(tokens)].sort().join(' '));
  return census;
}

/** The difference between two inventories. An empty array means the spec is unchanged. */
export function diffCensus(before, after) {
  const changes = [];
  for (const [key, value] of after) {
    if (!before.has(key)) changes.push({ kind: 'added', key, to: value });
    else if (before.get(key) !== value) {
      changes.push({ kind: 'changed', key, from: before.get(key), to: value });
    }
  }
  for (const [key, value] of before) {
    if (!after.has(key)) changes.push({ kind: 'removed', key, from: value });
  }
  return changes;
}

export function describeChange(path, change) {
  if (change.kind === 'added') return `Spec added: ${path} — ${change.key} = ${change.to}`;
  if (change.kind === 'removed') return `Spec removed: ${path} — ${change.key} (was: ${change.from})`;
  return `Spec value changed: ${path} — ${change.key}: ${change.from} → ${change.to}`;
}

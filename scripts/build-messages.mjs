#!/usr/bin/env node
/**
 * Composes the i18n message catalogues from one file per namespace.
 *
 * Authored source: `messages/<locale>/<Namespace>.json`, each holding only that
 * namespace's object. Generated output: `messages/<locale>.json`, the composite
 * `src/i18n/request.ts` and every test import. The composite is ignored by Git and
 * materialized the same way the Docs Vault output is: installation (`prepare`),
 * checkout and merge hooks, `predev`, `build`, and Vitest's global setup.
 *
 * Why: on 2026-09-26 the two 450-500 KB catalogues had been touched by 44% of the
 * last 170 commits, which made them the repository's largest merge-conflict hot
 * spot. An edit to one screen's copy now touches one small file, and adding a
 * namespace adds two files with no shared index to edit. Namespaces compose in
 * sorted order, so nothing orders them by hand.
 *
 * Modes:
 *   (none)       write every composite whose content changed
 *   --check      fail if a composite is missing or differs from its parts, or a
 *                namespace exists in one locale only
 *   --validate   parts only (structure and namespace parity); the pre-commit hook
 *                runs this on the staged index, which has no composite
 *   --watch      write, then rewrite on every part change (the dev server)
 *   --adopt      migrate a branch that still edits `messages/<locale>.json` after
 *                merging the split: three-way per namespace against the merge base
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMESPACE_FILE = /^[A-Za-z][A-Za-z0-9_-]*\.json$/;
const TOP_LEVEL_KEY = /^ {2}("(?:[^"\\]|\\.)+"): (.*)$/;

export class MessagesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MessagesError';
  }
}

const codeUnitCompare = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const normalizeLf = (text) => String(text).replace(/\r\n?/g, '\n');

export function messagesDir(root = ROOT) {
  return path.join(root, 'messages');
}

/** Locales are the directories under `messages/`; each holds that locale's namespaces. */
export function listLocales(root = ROOT) {
  const dir = messagesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && statSync(path.join(dir, name)).isDirectory())
    .sort(codeUnitCompare);
}

function parseObject(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new MessagesError(`${label}: invalid JSON (${error.message})`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MessagesError(`${label}: a namespace file must hold one JSON object`);
  }
  return value;
}

/** One locale's parts, sorted by namespace name, validated and LF-normalized. */
export function readLocaleParts(locale, root = ROOT) {
  const dir = path.join(messagesDir(root), locale);
  const parts = [];
  for (const file of readdirSync(dir).sort(codeUnitCompare)) {
    if (file.startsWith('.')) continue;
    const label = `messages/${locale}/${file}`;
    if (!NAMESPACE_FILE.test(file)) {
      throw new MessagesError(`${label}: a namespace file is named <Namespace>.json (letters, digits, _ or -)`);
    }
    const text = normalizeLf(readFileSync(path.join(dir, file), 'utf8'));
    parseObject(text, label);
    parts.push({ namespace: file.slice(0, -'.json'.length), text });
  }
  if (parts.length === 0) throw new MessagesError(`messages/${locale}/: no namespace files`);
  return parts;
}

/**
 * The composite is the parts' own text, indented one level under their key, so the
 * generated file keeps every hand-formatted line an author wrote.
 */
export function composeLocale(parts) {
  const body = parts.map(({ namespace, text }) => {
    const lines = text.trimEnd().split('\n');
    const indented = lines.map((line, index) => (index === 0 || line === '' ? line : `  ${line}`));
    return `  ${JSON.stringify(namespace)}: ${indented.join('\n')}`;
  });
  return `{\n${body.join(',\n')}\n}\n`;
}

/**
 * The inverse of `composeLocale` for a two-space catalogue: each top-level
 * namespace's exact text, dedented one level, in file order. Used by `--adopt` and
 * by the one-time split; the caller proves the result parses back to the same data.
 */
export function splitComposite(text, label = 'catalogue') {
  const lines = normalizeLf(text).trimEnd().split('\n');
  if (lines[0] !== '{' || lines.at(-1) !== '}') {
    throw new MessagesError(`${label}: expected a two-space formatted JSON object`);
  }
  const parts = [];
  let current = null;
  for (const line of lines.slice(1, -1)) {
    const match = TOP_LEVEL_KEY.exec(line);
    if (match) {
      if (current) parts.push(current);
      current = { namespace: JSON.parse(match[1]), lines: [match[2]] };
      continue;
    }
    if (!current) throw new MessagesError(`${label}: content before the first namespace`);
    if (line !== '' && !line.startsWith('  ')) throw new MessagesError(`${label}: line is not indented under a namespace`);
    current.lines.push(line.slice(2));
  }
  if (current) parts.push(current);
  const whole = parseObject(normalizeLf(text), label);
  const split = parts.map(({ namespace, lines: body }, index) => {
    const joined = body.join('\n');
    const partText = `${index < parts.length - 1 ? joined.replace(/,$/, '') : joined}\n`;
    const value = parseObject(partText, `${label} → ${namespace}`);
    if (JSON.stringify(value) !== JSON.stringify(whole[namespace])) {
      throw new MessagesError(`${label}: namespace ${namespace} did not split faithfully`);
    }
    return { namespace, text: partText };
  });
  if (split.length !== Object.keys(whole).length) {
    throw new MessagesError(`${label}: found ${split.length} namespaces, the object has ${Object.keys(whole).length}`);
  }
  return split;
}

/** Every locale's parts and composite text, with the namespace-parity verdict. */
export function composeAll(root = ROOT) {
  const locales = listLocales(root);
  if (locales.length === 0) throw new MessagesError('messages/: no locale directories');
  const byLocale = new Map(locales.map((locale) => [locale, readLocaleParts(locale, root)]));
  const problems = [];
  const all = new Set([...byLocale.values()].flatMap((parts) => parts.map((part) => part.namespace)));
  for (const namespace of [...all].sort(codeUnitCompare)) {
    const missing = locales.filter((locale) => !byLocale.get(locale).some((part) => part.namespace === namespace));
    if (missing.length > 0) {
      problems.push(`namespace ${namespace} is missing from ${missing.map((locale) => `messages/${locale}/`).join(', ')}`);
    }
  }
  return {
    locales,
    problems,
    composites: new Map(locales.map((locale) => [locale, composeLocale(byLocale.get(locale))])),
  };
}

export function compositePath(locale, root = ROOT) {
  return path.join(messagesDir(root), `${locale}.json`);
}

/** Atomic and idempotent: an unchanged composite is not rewritten, so watchers stay quiet. */
function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, text, 'utf8');
  renameSync(temp, file);
  return true;
}

const digest = (text) => createHash('sha256').update(text).digest('hex');
const statePath = (root) => path.join(messagesDir(root), '.composed.json');

function readState(root) {
  try {
    return JSON.parse(readFileSync(statePath(root), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * A composite edited by hand. The file sits where the catalogue used to, so a person
 * or agent with the old layout in mind will edit it. Overwriting that edit would lose
 * it silently, so: if the parts have not moved since the last compose, the edit is
 * carried into the parts; if both moved, composition stops and says so.
 */
function carryHandEdit({ root, locale, onDisk, composed, recorded, log }) {
  const label = `messages/${locale}.json`;
  if (digest(composed) !== recorded) {
    throw new MessagesError(
      `${label} differs from its last composition and its parts changed too. Move the edit into messages/${locale}/<Namespace>.json and delete ${label}; while merging a pre-split branch, run pnpm messages:adopt instead.`,
    );
  }
  const dir = path.join(messagesDir(root), locale);
  const edited = splitComposite(onDisk, `${label} (hand edit)`);
  const keep = new Set(edited.map((part) => part.namespace));
  for (const part of readLocaleParts(locale, root)) {
    if (!keep.has(part.namespace)) rmSync(path.join(dir, `${part.namespace}.json`));
  }
  for (const part of edited) {
    const file = path.join(dir, `${part.namespace}.json`);
    if (!existsSync(file) || normalizeLf(readFileSync(file, 'utf8')) !== part.text) {
      writeFileSync(file, part.text, 'utf8');
      log(`[messages] carried a hand edit of ${label} into messages/${locale}/${part.namespace}.json`);
    }
  }
}

export function buildMessages({ root = ROOT, check = false, validate = false, log = () => {} } = {}) {
  let { locales, problems, composites } = composeAll(root);
  if (validate) return { locales, problems, stale: [], written: [] };
  const stale = [];
  const written = [];
  const state = readState(root);
  if (!check) {
    let carried = false;
    for (const locale of locales) {
      const file = compositePath(locale, root);
      const recorded = state[locale];
      if (!recorded || !existsSync(file)) continue;
      const onDisk = readFileSync(file, 'utf8');
      if (digest(onDisk) === recorded || onDisk === composites.get(locale)) continue;
      carryHandEdit({ root, locale, onDisk, composed: composites.get(locale), recorded, log });
      carried = true;
    }
    if (carried) ({ locales, problems, composites } = composeAll(root));
  }
  for (const locale of locales) {
    const file = compositePath(locale, root);
    const text = composites.get(locale);
    if (check) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text) stale.push(`messages/${locale}.json`);
      continue;
    }
    if (writeIfChanged(file, text)) written.push(`messages/${locale}.json`);
    state[locale] = digest(text);
  }
  if (!check) writeIfChanged(statePath(root), `${JSON.stringify(state, null, 2)}\n`);
  if (written.length > 0) log(`[messages] composed ${written.join(', ')}`);
  return { locales, problems, stale, written };
}

/**
 * Vitest global setup (`vitest.config.ts`). Tests import the composite, and a part
 * edited since the last install or checkout would otherwise be tested stale.
 */
export function setup() {
  buildMessages();
}

function gitText(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function gitShow(root, ref, file) {
  try {
    return gitText(root, ['show', `${ref}:${file}`]);
  } catch {
    return null;
  }
}

/**
 * Carries a branch's edits to the old single-file catalogue onto the split parts.
 *
 * After merging the split, Git reports `messages/<locale>.json` as modified on the
 * branch and deleted upstream. Per namespace: unchanged on the branch keeps the part;
 * changed only on the branch takes the branch's text; changed on both is merged with
 * `git merge-file`, and a true conflict is left in the part with markers.
 */
export function adoptBranchCatalogue({ root = ROOT, ours = 'HEAD', base, log = console.log } = {}) {
  const mergeBase = base ?? gitText(root, ['merge-base', ours, 'MERGE_HEAD']).trim();
  const conflicts = [];
  for (const locale of listLocales(root)) {
    const file = `messages/${locale}.json`;
    const ourText = gitShow(root, ours, file);
    const baseText = gitShow(root, mergeBase, file);
    if (ourText === null || baseText === null) continue;
    const ourParts = new Map(splitComposite(ourText, `${ours}:${file}`).map((part) => [part.namespace, part.text]));
    const baseParts = new Map(splitComposite(baseText, `${mergeBase}:${file}`).map((part) => [part.namespace, part.text]));
    const dir = path.join(messagesDir(root), locale);
    for (const namespace of new Set([...ourParts.keys(), ...baseParts.keys()])) {
      const mine = ourParts.get(namespace);
      const old = baseParts.get(namespace);
      if (mine === old) continue;
      const partFile = path.join(dir, `${namespace}.json`);
      const theirs = existsSync(partFile) ? normalizeLf(readFileSync(partFile, 'utf8')) : undefined;
      if (theirs === old || theirs === mine) {
        if (mine === undefined) {
          rmSync(partFile, { force: true });
        } else {
          writeFileSync(partFile, mine, 'utf8');
        }
        log(`[messages] adopted ${locale}/${namespace} from ${ours}`);
        continue;
      }
      if (mine === undefined || old === undefined || theirs === undefined) {
        conflicts.push(`messages/${locale}/${namespace}.json (added or removed on one side, edited on the other)`);
        continue;
      }
      const scratch = path.join(dir, `.${namespace}.adopt`);
      writeFileSync(`${scratch}.mine`, mine);
      writeFileSync(`${scratch}.base`, old);
      writeFileSync(partFile, theirs);
      try {
        // merge-file writes the result into its first path, the upstream part.
        execFileSync('git', ['merge-file', '-L', 'upstream', '-L', 'base', '-L', ours, partFile, `${scratch}.base`, `${scratch}.mine`], { cwd: root, stdio: 'pipe' });
      } catch {
        conflicts.push(`messages/${locale}/${namespace}.json (conflict markers written)`);
      } finally {
        rmSync(`${scratch}.mine`, { force: true });
        rmSync(`${scratch}.base`, { force: true });
      }
      log(`[messages] merged ${locale}/${namespace}`);
    }
    // The branch's composite is now carried by the parts; the next compose replaces it.
    rmSync(compositePath(locale, root), { force: true });
  }
  return conflicts;
}

export function watchMessages({ root = ROOT, log = console.log } = {}) {
  const rebuild = () => {
    try {
      const { problems } = buildMessages({ root, log });
      for (const problem of problems) log(`[messages] ${problem}`);
    } catch (error) {
      log(`[messages] ${error.message}`);
    }
  };
  rebuild();
  let timer = null;
  // Only parts (`<locale>/<Namespace>.json`); the composite's own write is ignored.
  const watcher = watch(messagesDir(root), { recursive: true }, (_event, name) => {
    if (!name || !String(name).includes(path.sep) || !String(name).endsWith('.json')) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 50);
  });
  return watcher;
}

const USAGE = [
  'Usage: node scripts/build-messages.mjs [--check | --validate | --watch | --adopt [--base=<ref>]]',
  '',
  '  (none)      Compose messages/<locale>.json from messages/<locale>/<Namespace>.json.',
  '  --check     Fail if a composite is missing or stale, or a namespace exists in one locale only.',
  '  --validate  Check the parts only (JSON objects, file names, namespace parity).',
  '  --watch     Compose, then recompose whenever a part changes.',
  '  --adopt     After merging the split into a branch that edited messages/<locale>.json,',
  '              carry those edits onto the parts (three-way per namespace).',
].join('\n');

function main(argv) {
  const flags = new Set(argv.filter((arg) => !arg.startsWith('--base=')));
  const base = argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  if (flags.has('--help') || flags.has('-h')) {
    console.log(USAGE);
    return 0;
  }
  const known = new Set(['--check', '--validate', '--watch', '--adopt']);
  const unknown = [...flags].filter((flag) => !known.has(flag));
  if (unknown.length > 0 || flags.size > 1 || (base && !flags.has('--adopt'))) {
    console.error(`[messages] unexpected arguments: ${argv.join(' ')}\n${USAGE}`);
    return 2;
  }
  if (flags.has('--watch')) {
    watchMessages();
    return undefined;
  }
  if (flags.has('--adopt')) {
    const conflicts = adoptBranchCatalogue({ base });
    buildMessages({ log: console.log });
    console.log('[messages] now run: git rm --cached --ignore-unmatch messages/*.json, then stage messages/<locale>/');
    if (conflicts.length > 0) {
      console.error(`[messages] resolve by hand:\n  ${conflicts.join('\n  ')}`);
      return 1;
    }
    return 0;
  }
  const check = flags.has('--check');
  const validate = flags.has('--validate');
  const { locales, problems, stale } = buildMessages({ check, validate, log: console.log });
  for (const problem of problems) console.error(`[messages] ${problem}`);
  if (stale.length > 0) {
    console.error(`[messages] stale or missing composite: ${stale.join(', ')}. Run pnpm messages:build.`);
  }
  if (problems.length > 0 || stale.length > 0) return 1;
  if (check || validate) console.log(`[messages] ${locales.length} locales, parts ${check ? 'and composites ' : ''}agree ✓`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const code = main(process.argv.slice(2));
    if (code !== undefined) process.exitCode = code;
  } catch (error) {
    if (!(error instanceof MessagesError)) throw error;
    console.error(`[messages] ${error.message}`);
    process.exitCode = 1;
  }
}

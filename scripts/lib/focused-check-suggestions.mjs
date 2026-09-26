import { existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { isSupportedSourcePath } from '../quality/source-language/source-paths.mjs';

/**
 * The changed-path focused-check advisor: which checks a set of changed paths
 * should run first.
 *
 * **To add a check, add a rule file under `scripts/lib/check-rules/<area>.mjs`**
 * (or append to the area file that already owns the subject). Nothing else
 * needs an edit: this module reads that directory at load time, so a new file
 * is picked up without touching an index. The rule table used to live here, a
 * 1,700-line registry every new check appended to at the same anchor, and two
 * branches doing that on one day conflicted twice (2026-09-26).
 *
 * A rule file exports any of:
 *
 * - `rules`: `{ order?, command, reason, matches: RegExp[] }[]`, the first checks.
 * - `escalations`: the same shape, printed as "escalate when needed".
 * - `directTests`: `{ mcp?, cli?, script?, focusedCheck?: [source, test][] }`,
 *   sibling tests run directly when their source or the test itself changes.
 *
 * `order` decides the printed order across every file, and, when two rules
 * name the same command, which rule's reason and paths are shown (the lower
 * one). Ties, and rules without an `order`, which sort after every ordered
 * rule, fall back to file name and then position in the file. The existing
 * rules carry their former position in the one table times ten, so a new rule
 * can sit between two of them without renumbering anything.
 */
export const CHECK_RULES_DIRECTORY = new URL('./check-rules/', import.meta.url);

export { BROWSER_EXECUTION_SURFACE_PATTERNS, CI_PLANNER_SURFACE_PATTERNS } from './check-rules/ci.mjs';

const DIRECT_TEST_KINDS = ['mcp', 'cli', 'script', 'focusedCheck'];

/** Lists the rule files of `directory`, sorted by name; helpers and tests are not rule files. */
function listCheckRuleFiles(directory = CHECK_RULES_DIRECTORY) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[^_.][^/]*\.mjs$/.test(entry.name) && !entry.name.endsWith('.test.mjs'))
    .map((entry) => entry.name)
    .sort();
}

/** Imports every rule file of `directory` and merges it into one registry. */
export async function loadCheckRules(directory = CHECK_RULES_DIRECTORY) {
  const modules = [];
  for (const name of listCheckRuleFiles(directory)) {
    modules.push({ name, module: await import(new URL(name, directory).href) });
  }
  return composeCheckRules(modules);
}

/**
 * Merges `{ name, module }` pairs into sorted rule and escalation lists plus one
 * source-to-test map per direct-test kind. Throws on a malformed rule or on two
 * files mapping one source to different tests, so a bad file fails loudly here
 * rather than silently recommending nothing.
 */
export function composeCheckRules(modules) {
  const collect = (key) => {
    const entries = [];
    for (const { name, module } of modules) {
      const list = module[key] ?? [];
      if (!Array.isArray(list)) throw new Error(`check-rules/${name}: \`${key}\` must be an array`);
      list.forEach((rule, index) => {
        if (
          typeof rule?.command !== 'string' ||
          typeof rule.reason !== 'string' ||
          !Array.isArray(rule.matches) ||
          rule.matches.length === 0 ||
          !rule.matches.every((pattern) => pattern instanceof RegExp) ||
          (rule.order !== undefined && !Number.isFinite(rule.order))
        ) {
          throw new Error(`check-rules/${name}: ${key}[${index}] needs command, reason, RegExp matches, and a finite order if any`);
        }
        entries.push({ rule, name, index });
      });
    }
    return entries
      .sort(
        (a, b) =>
          (a.rule.order ?? Infinity) - (b.rule.order ?? Infinity) ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
          a.index - b.index,
      )
      .map(({ rule }) => rule);
  };
  const directTests = Object.fromEntries(DIRECT_TEST_KINDS.map((kind) => [kind, new Map()]));
  for (const { name, module } of modules) {
    for (const [kind, pairs] of Object.entries(module.directTests ?? {})) {
      const map = directTests[kind];
      if (!map) throw new Error(`check-rules/${name}: unknown directTests kind "${kind}"`);
      for (const [source, test] of pairs) {
        if (map.has(source) && map.get(source) !== test) {
          throw new Error(`check-rules/${name}: ${source} already maps to ${map.get(source)}`);
        }
        map.set(source, test);
      }
    }
  }
  return {
    rules: collect('rules'),
    escalations: collect('escalations'),
    directTests: Object.fromEntries(
      Object.entries(directTests).map(([kind, map]) => [kind, { bySource: map, testFiles: new Set(map.values()) }]),
    ),
  };
}

const { rules: RULES, escalations: ESCALATIONS, directTests: DIRECT_TESTS } = await loadCheckRules();

export function normalizeChangedPath(path) {
  return String(path || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

export function suggestFocusedChecks(paths = [], { deletedPaths = [] } = {}) {
  const normalizedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  // Deleted paths participate in RULE matching only — the per-file direct
  // suggestions below embed paths into file-reading commands, which a deleted
  // path would kill (measured 2026-08-21), while a rule command is global.
  const normalizedDeleted = [...new Set(deletedPaths.map(normalizeChangedPath).filter(Boolean))]
    .filter((path) => !normalizedPaths.includes(path));
  const rulePaths = [...normalizedPaths, ...normalizedDeleted];
  const staticCommands = rulesToSuggestions(RULES, rulePaths);
  const withSourceLanguage = prependSuggestions(
    staticCommands,
    directSourceLanguageSuggestions(normalizedPaths),
  );
  const withVitestDirect = prependSuggestions(
    withSourceLanguage,
    directVitestTestSuggestions(normalizedPaths),
  );
  const withPlaywrightDirect = prependSuggestions(
    withVitestDirect,
    directPlaywrightTestSuggestions(normalizedPaths),
  );
  const withLintDirect = prependSuggestions(
    withPlaywrightDirect,
    directLintSuggestions(normalizedPaths),
  );
  const withMcpDirect = insertBeforeCommand(
    withLintDirect,
    directMcpUnitTestSuggestions(normalizedPaths),
    'pnpm test:mcp:unit',
  );
  const commands = insertBeforeCommand(
    withMcpDirect,
    directMappedTestSuggestions(normalizedPaths, 'cli', 'direct CLI lib unit test for changed helper'),
    'pnpm test:cli:lib',
  );
  const withScriptDirect = insertBeforeCommand(
    commands,
    directMappedTestSuggestions(normalizedPaths, 'script', 'direct script helper unit test for changed helper'),
    'pnpm test:dogfood:script-refs',
  );
  const withFocusedCheckDirect = insertBeforeCommand(
    withScriptDirect,
    directMappedTestSuggestions(normalizedPaths, 'focusedCheck', 'direct focused-check advisor test for changed helper'),
    'pnpm test:checks:changed',
  );
  const escalations = rulesToSuggestions(ESCALATIONS, rulePaths);
  return {
    paths: normalizedPaths,
    deletedPaths: normalizedDeleted,
    commands: withFocusedCheckDirect,
    escalations,
  };
}

function directSourceLanguageSuggestions(paths) {
  const sourcePaths = paths.filter(isSupportedSourcePath);
  if (sourcePaths.length === 0) return [];
  return [
    {
      command: 'pnpm source:language',
      reason: 'source comments are English-only across current code, tests, and prototypes',
      paths: sourcePaths,
    },
  ];
}

/**
 * A changed test runs itself; a changed source file runs **every suite that
 * imports it**, through Vitest's module graph (`vitest related`). The sibling
 * `<name>.test.tsx` alone missed the suite that renders the file: a change to
 * `AcpPermissionCard.tsx` passed every recommended lane while
 * `AcpChatPanel.test.tsx` had 25 failing cases (lesson dbb4417c). Agents in a
 * fan-out never reach the pre-push `--changed` lane, so this is where it is caught.
 */
function directVitestTestSuggestions(paths) {
  const pathSet = new Set(paths);
  const rows = [];
  const sources = [];
  for (const path of paths) {
    const testFile = resolveVitestTestFile(path, pathSet);
    if (!testFile) continue;
    if (testFile === path) {
      rows.push({ command: `pnpm exec vitest run ${testFile}`, reason: 'changed Vitest test file', paths: [path] });
    } else {
      sources.push(path);
    }
  }
  if (sources.length > 0) {
    rows.push({
      command: `pnpm exec vitest related --run --passWithNoTests ${sources.join(' ')}`,
      reason: 'every Vitest suite that imports a changed source file (module graph), not only its sibling',
      paths: sources,
    });
  }
  return rows;
}

/**
 * Runs **ESLint directly** on changed `src/**` and `app/**` sources.
 *
 * In this repository the design-system spec (type, radius, leading, motion, and
 * shadow ramps; forbidden gradients; accent×tint pairing; FSD boundaries) is
 * enforced by `no-restricted-syntax`, not by a document. Yet in the 2026-08-04
 * field trial this advisor suggested only tsc, contracts, and i18n for a new `.tsx`
 * view and **never once suggested lint** — the gate carrying the spec was absent
 * from the list.
 *
 * It runs on **the changed files only**, not the whole `pnpm lint`. The full run is
 * an escalation; what is needed here is an immediate answer to "is the screen I
 * just wrote inside the spec".
 */
function directLintSuggestions(paths) {
  const lintable = paths.filter((path) => /^(?:src|app)\/.+\.(?:ts|tsx)$/.test(path));
  if (lintable.length === 0) return [];
  return [
    {
      // --max-warnings 0 matches the full `pnpm lint` lane (2026-09-01 review):
      // the warning ratchet lives at zero, and a bare eslint run exits 0 on a
      // new warning, so the breach only surfaced as a red main after merge.
      command: `pnpm exec eslint --max-warnings 0 ${lintable.join(' ')}`,
      reason: 'design-system ramps and FSD boundaries are lint-enforced on changed source',
      paths: lintable,
    },
  ];
}

function directPlaywrightTestSuggestions(paths) {
  return paths
    .filter((path) => /^tests\/e2e\/.+\.spec\.ts$/.test(path))
    .map((path) => ({
      command: `pnpm exec playwright test ${path}`,
      reason: 'direct Playwright spec for changed e2e test',
      paths: [path],
    }));
}

function resolveVitestTestFile(path) {
  if (!/^(?:src|app)\//.test(path)) return null;
  if (!/\.(?:ts|tsx)$/.test(path)) return null;
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(path)) return path;
  return path.replace(/\.(tsx?)$/, '.test.$1');
}

function resolveMcpUnitTestFile(path, pathSet) {
  const { bySource, testFiles } = DIRECT_TESTS.mcp;
  const mapped = bySource.get(path);
  if (mapped) return mapped;
  if (testFiles.has(path)) return path;
  if (/^mcp\/src\/(?!integration\.test\.mjs$)[^/]+\.test\.mjs$/.test(path)) return path;
  if (!/^mcp\/src\/[^/]+\.(?:mjs|js)$/.test(path)) return null;
  const testFile = path.replace(/\.(?:mjs|js)$/, '.test.mjs');
  return pathSet.has(testFile) || existsSync(testFile) ? testFile : null;
}

function directMcpUnitTestSuggestions(paths) {
  const pathSet = new Set(paths);
  return groupByTestFile(
    paths,
    (path) => resolveMcpUnitTestFile(path, pathSet),
    'direct MCP unit test for changed source or test',
  );
}

/** A source maps to its declared test; a declared test maps to itself. */
function directMappedTestSuggestions(paths, kind, reason) {
  const { bySource, testFiles } = DIRECT_TESTS[kind];
  return groupByTestFile(paths, (path) => bySource.get(path) ?? (testFiles.has(path) ? path : null), reason);
}

function groupByTestFile(paths, resolve, reason) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = resolve(path);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? { command: `pnpm exec node --test ${testFile}`, reason, paths: [] };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function prependSuggestions(suggestions, additions) {
  if (additions.length === 0) return suggestions;
  const existing = new Set(suggestions.map((item) => item.command));
  const uniqueAdditions = additions.filter((item) => !existing.has(item.command));
  return [...uniqueAdditions, ...suggestions];
}

function insertBeforeCommand(suggestions, additions, command) {
  if (additions.length === 0) return suggestions;
  const seen = new Set();
  const uniqueAdditions = additions.filter((item) => {
    if (seen.has(item.command)) return false;
    seen.add(item.command);
    return true;
  });
  const index = suggestions.findIndex((item) => item.command === command);
  if (index === -1) return [...uniqueAdditions, ...suggestions];
  return [
    ...suggestions.slice(0, index),
    ...uniqueAdditions,
    ...suggestions.slice(index),
  ];
}

function rulesToSuggestions(rules, paths) {
  const seen = new Set();
  const suggestions = [];
  for (const rule of rules) {
    const matchedPaths = paths.filter((path) => rule.matches.some((pattern) => pattern.test(path)));
    if (matchedPaths.length === 0 || seen.has(rule.command)) continue;
    seen.add(rule.command);
    suggestions.push({ command: rule.command, reason: rule.reason, paths: matchedPaths });
  }
  return suggestions;
}

export function formatFocusedCheckSuggestions({ paths = [], commands = [], escalations = [] } = {}) {
  if (paths.length === 0) {
    return [
      '[focused-checks] no changed paths against HEAD or untracked files',
      'Use `pnpm checks:changed -- <path...>` to inspect a planned file set.',
    ].join('\n');
  }
  const lines = [
    `[focused-checks] ${paths.length} changed path${paths.length === 1 ? '' : 's'}`,
  ];
  if (commands.length === 0) {
    lines.push('First checks: no focused mapping; do not jump to the full suite by default.');
    lines.push('Choose the nearest area from docs/DEVELOPMENT-CHECKS.md, then escalate only for concrete uncovered risk.');
  } else {
    lines.push('First checks:');
    for (const suggestion of commands) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
    lines.push('Run these before broad lint/build/test; escalate only when the change risk requires it.');
  }
  if (escalations.length > 0) {
    lines.push('Escalate when needed:');
    for (const suggestion of escalations) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
  }
  return lines.join('\n');
}

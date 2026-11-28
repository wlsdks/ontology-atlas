// The committed facts the harness checks the corpus against, in four files under
// `tests/differential/`:
//   manifest.json            each family's tools, "equal except" rules and whether it counts as proven;
//   equal-except-ceiling.json the most those rules may hold (a list that may only shrink);
//   tool-functions.json      per tool, the functions its calls execute (`--coverage --write-manifest`);
//   unrun-functions.json     per family, the functions its corpus never runs, each with a reason.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DIFFERENTIAL_DIRECTORY = ['tests', 'differential'];
export const DEFAULT_BASE_REF = 'origin/main';

function filePath(repoRoot, name) {
  return path.join(repoRoot, ...DIFFERENTIAL_DIRECTORY, name);
}

function readJson(repoRoot, name) {
  return JSON.parse(readFileSync(filePath(repoRoot, name), 'utf8'));
}

export function loadManifest(repoRoot) {
  return readJson(repoRoot, 'manifest.json');
}

function loadEqualExceptCeiling(repoRoot) {
  return readJson(repoRoot, 'equal-except-ceiling.json');
}

export function loadFamilies(repoRoot) {
  return readJson(repoRoot, 'families.json');
}

/**
 * `tool-functions.json` keeps each function key once (`functions`) and, per tool, the positions of
 * the functions its calls run, which keeps the file a third of its plain size.
 * @returns {{ tools: Record<string, string[]> }} tool -> function keys
 */
export function loadToolFunctions(repoRoot) {
  if (!existsSync(filePath(repoRoot, 'tool-functions.json'))) return { tools: {} };
  const { functions, tools } = readJson(repoRoot, 'tool-functions.json');
  return { tools: Object.fromEntries(Object.entries(tools).map(([tool, positions]) => [tool, positions.map((position) => functions[position])])) };
}

/** The text of `tool-functions.json` for a map of tool -> function keys, one tool and one key per line. */
export function formatToolFunctions(tools, about) {
  const functions = [...new Set(Object.values(tools).flat())].sort((a, b) => a.localeCompare(b, 'en'));
  const positionOf = new Map(functions.map((key, position) => [key, position]));
  const names = Object.keys(tools).sort((a, b) => a.localeCompare(b, 'en'));
  const functionLines = functions.map((key) => `    ${JSON.stringify(key)}`).join(',\n');
  const toolLines = names
    .map((tool) => `    ${JSON.stringify(tool)}: [${tools[tool].map((key) => positionOf.get(key)).sort((a, b) => a - b).join(',')}]`)
    .join(',\n');
  return `{\n  "about": ${JSON.stringify(about)},\n  "functions": [\n${functionLines}\n  ],\n  "tools": {\n${toolLines}\n  }\n}\n`;
}

export function loadUnrunFunctions(repoRoot) {
  return existsSync(filePath(repoRoot, 'unrun-functions.json')) ? readJson(repoRoot, 'unrun-functions.json') : { families: {} };
}

/** The text of `unrun-functions.json`, one function per line. */
export function formatUnrunFunctions(families, about) {
  const familyLines = Object.entries(families)
    .map(([family, entries]) => {
      const lines = entries.map((entry) => `      ${JSON.stringify(entry)}`).join(',\n');
      return `    ${JSON.stringify(family)}: [${entries.length > 0 ? `\n${lines}\n    ` : ''}]`;
    })
    .join(',\n');
  return `{\n  "about": ${JSON.stringify(about)},\n  "families": {\n${familyLines}\n  }\n}\n`;
}

/** The two lists of differences a green run already knows about; each entry is one request or one path. */
const EXPECTED_DIFFERENCE_FILES = Object.freeze({
  locale: 'expect-locale-diff.json',
  'node-vs-bun': 'node-vs-bun-differences.json',
  'node-vs-rust': 'declared-changes.json',
});

/** The lists that may only shrink; the declared changes grow as the specification's table does. */
const SHRINKING_LISTS = new Set(['locale', 'node-vs-bun']);

export function loadExpectedDifferences(repoRoot, which, { everyPlatform = false } = {}) {
  const name = EXPECTED_DIFFERENCE_FILES[which];
  const entries = existsSync(filePath(repoRoot, name)) ? (readJson(repoRoot, name).differences ?? []) : [];
  // An entry with a `platform` is a difference only there (a Windows path rule the Node server
  // gets wrong); on another platform the case is equal and the entry is not looked for.
  return everyPlatform ? entries : entries.filter((entry) => entry.platform === undefined || entry.platform === process.platform);
}

export function exceptRulesByFamily(repoRoot) {
  const manifest = loadManifest(repoRoot);
  return Object.fromEntries(
    Object.entries(manifest.families).map(([family, entry]) => [family, entry.equalExcept ?? []]),
  );
}

function ruleKey(rule) {
  return `${rule.tool ?? '(no tool)'}:${rule.path}`;
}

/** Why a rule is not allowed, or null. A rule names one tool and one field, never a whole answer. */
function problemWithRule(rule, family, tools) {
  const key = ruleKey(rule);
  if (typeof rule.tool !== 'string' || rule.tool === '') return `family ${family}: rule "${key}" names no tool`;
  if (!tools.includes(rule.tool)) return `family ${family}: rule "${key}" names a tool the family does not own`;
  if (typeof rule.path !== 'string' || !rule.path.startsWith('result.')) {
    return `family ${family}: rule "${key}" must be a path inside result (the envelope and an error are never excepted)`;
  }
  const segments = rule.path.match(/[^.[\]]+|\[\]/g) ?? [];
  if (['result.content', 'result.structuredContent', 'result.isError'].includes(rule.path) || segments.at(-1) === '*' || segments.length < 3) {
    return `family ${family}: rule "${key}" covers a whole result; name the field`;
  }
  return null;
}

function surfaceToolNames(repoRoot) {
  const surface = JSON.parse(readFileSync(path.join(repoRoot, 'docs', '.generated', 'mcp-surface.json'), 'utf8'));
  return surface.mcp.tools.map((tool) => tool.name);
}

function fileAtRef(repoRoot, ref, name) {
  try {
    const text = execFileSync(
      'git',
      ['show', `${ref}:${DIFFERENTIAL_DIRECTORY.join('/')}/${name}`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function refExists(repoRoot, ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const differenceKey = (entry) => `${entry.case}|${entry.where}|${JSON.stringify(entry.id ?? null)}|${entry.path}`;

/**
 * Problems with the manifest itself, each a sentence; empty when it holds. Against `baseRef` (the
 * branch this one merges into) no list may have grown: the ceiling, and the two lists of known
 * differences. A base that does not exist here (a shallow clone) is said so and not an error.
 */
/** The numbers of the rows of the specification's table of declared changes. */
function specificationRows(repoRoot) {
  const text = readFileSync(path.join(repoRoot, 'docs', 'specs', '2026-11-27-mcp-server-in-rust.md'), 'utf8');
  const start = text.indexOf('### Declared behaviour changes');
  const end = text.indexOf('### What equal means');
  const rows = new Set();
  for (const line of text.slice(start, end === -1 ? undefined : end).split('\n')) {
    const match = /^\| (\d+) \|/.exec(line);
    if (match) rows.add(Number(match[1]));
  }
  return rows;
}

export function checkManifest(repoRoot, { baseRef } = {}) {
  const problems = [];
  const manifest = loadManifest(repoRoot);
  const ceiling = loadEqualExceptCeiling(repoRoot);
  const owners = new Map();
  for (const [family, entry] of Object.entries(manifest.families)) {
    for (const tool of entry.tools) {
      if (owners.has(tool)) problems.push(`tool ${tool} is in both ${owners.get(tool)} and ${family}`);
      owners.set(tool, family);
    }
    const allowed = new Set((ceiling.families[family] ?? []).map(ruleKey));
    for (const rule of entry.equalExcept ?? []) {
      const invalid = problemWithRule(rule, family, entry.tools);
      if (invalid) problems.push(invalid);
      if (!allowed.has(ruleKey(rule))) {
        problems.push(`family ${family}: equal-except "${ruleKey(rule)}" is not in the ceiling; the list may only shrink`);
      }
    }
  }
  for (const [family, rules] of Object.entries(ceiling.families)) {
    for (const rule of rules) {
      const invalid = problemWithRule(rule, family, manifest.families[family]?.tools ?? []);
      if (invalid) problems.push(`ceiling: ${invalid}`);
    }
  }
  const specRows = specificationRows(repoRoot);
  for (const entry of loadExpectedDifferences(repoRoot, 'node-vs-rust')) {
    if (!Number.isInteger(entry.change) || typeof entry.reason !== 'string' || entry.reason === '') {
      problems.push(`declared-changes.json: ${differenceKey(entry)} names no row of the specification's table (change) or no reason`);
    } else if (!specRows.has(entry.change)) {
      problems.push(`declared-changes.json: ${differenceKey(entry)} names row ${entry.change}, which the specification's table does not have`);
    }
  }
  const unrun = loadUnrunFunctions(repoRoot).families;
  for (const [family, entries] of Object.entries(unrun)) {
    for (const entry of entries) {
      if (!entry.reason) problems.push(`family ${family}: unrun function ${entry.key} has no reason`);
    }
  }
  const surface = surfaceToolNames(repoRoot);
  for (const tool of surface) {
    if (!owners.has(tool)) problems.push(`tool ${tool} belongs to no family in the manifest`);
  }
  for (const tool of owners.keys()) {
    if (!surface.includes(tool)) problems.push(`manifest names tool ${tool}, which the surface does not`);
  }
  if (baseRef) {
    if (!refExists(repoRoot, baseRef)) {
      console.warn(`manifest: ${baseRef} is not here, so growth of the ceiling and of the known-difference lists was not checked`);
    } else {
      const before = fileAtRef(repoRoot, baseRef, 'equal-except-ceiling.json');
      if (before) {
        for (const [family, rules] of Object.entries(ceiling.families)) {
          const was = new Set((before.families[family] ?? []).map(ruleKey));
          for (const rule of rules) {
            if (!was.has(ruleKey(rule))) problems.push(`ceiling grew in ${family}: "${ruleKey(rule)}" is new against ${baseRef}`);
          }
        }
      }
      for (const [which, name] of Object.entries(EXPECTED_DIFFERENCE_FILES)) {
        if (!SHRINKING_LISTS.has(which)) continue;
        const earlier = fileAtRef(repoRoot, baseRef, name);
        if (!earlier) continue;
        const was = new Set((earlier.differences ?? []).map(differenceKey));
        for (const entry of loadExpectedDifferences(repoRoot, which)) {
          if (!was.has(differenceKey(entry))) problems.push(`${name} grew: ${differenceKey(entry)} is new against ${baseRef}`);
        }
      }
    }
  }
  return problems;
}

export { differenceKey };

// The committed facts the harness checks the corpus against: which family each tool belongs to,
// each family's "equal except" fields (a list that may only shrink), and the functions its corpus
// leaves unrun with a reason for each.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DIFFERENTIAL_DIRECTORY = ['tests', 'differential'];

function readJson(repoRoot, name) {
  return JSON.parse(readFileSync(path.join(repoRoot, ...DIFFERENTIAL_DIRECTORY, name), 'utf8'));
}

export function loadManifest(repoRoot) {
  return readJson(repoRoot, 'manifest.json');
}

export function loadEqualExceptCeiling(repoRoot) {
  return readJson(repoRoot, 'equal-except-ceiling.json');
}

export function loadFamilies(repoRoot) {
  return readJson(repoRoot, 'families.json');
}

export function loadExpectedLocaleDiffs(repoRoot) {
  const file = path.join(repoRoot, ...DIFFERENTIAL_DIRECTORY, 'expect-locale-diff.json');
  if (!existsSync(file)) return new Set();
  return new Set(JSON.parse(readFileSync(file, 'utf8')).cases);
}

/** Cases where Node and Bun already differ; the Bun binary is the reference. */
export function loadKnownNodeBunDifferences(repoRoot) {
  const file = path.join(repoRoot, ...DIFFERENTIAL_DIRECTORY, 'node-vs-bun-differences.json');
  if (!existsSync(file)) return new Set();
  return new Set(JSON.parse(readFileSync(file, 'utf8')).cases.map((entry) => entry.case));
}

export function exceptRulesByFamily(repoRoot) {
  const manifest = loadManifest(repoRoot);
  return Object.fromEntries(
    Object.entries(manifest.families).map(([family, entry]) => [family, entry.equalExcept ?? []]),
  );
}

function ruleKey(rule) {
  return `${rule.tool ?? '*'}:${rule.path}`;
}

function surfaceToolNames(repoRoot) {
  const surface = JSON.parse(readFileSync(path.join(repoRoot, 'docs', '.generated', 'mcp-surface.json'), 'utf8'));
  return surface.mcp.tools.map((tool) => tool.name);
}

function ceilingAtRef(repoRoot, ref) {
  try {
    const text = execFileSync(
      'git',
      ['show', `${ref}:${DIFFERENTIAL_DIRECTORY.join('/')}/equal-except-ceiling.json`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Problems with the manifest itself, each a sentence; empty when it holds. */
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
      if (!allowed.has(ruleKey(rule))) {
        problems.push(`family ${family}: equal-except "${ruleKey(rule)}" is not in the ceiling; the list may only shrink`);
      }
    }
    for (const unrun of entry.unrunFunctions ?? []) {
      if (!unrun.reason) problems.push(`family ${family}: unrun function ${unrun.file}:${unrun.name} has no reason`);
    }
  }
  for (const tool of surfaceToolNames(repoRoot)) {
    if (!owners.has(tool)) problems.push(`tool ${tool} belongs to no family in the manifest`);
  }
  for (const tool of owners.keys()) {
    if (!surfaceToolNames(repoRoot).includes(tool)) problems.push(`manifest names tool ${tool}, which the surface does not`);
  }
  if (baseRef) {
    const before = ceilingAtRef(repoRoot, baseRef);
    if (before) {
      for (const [family, rules] of Object.entries(ceiling.families)) {
        const was = new Set((before.families[family] ?? []).map(ruleKey));
        for (const rule of rules) {
          if (!was.has(ruleKey(rule))) problems.push(`ceiling grew in ${family}: "${ruleKey(rule)}" is new against ${baseRef}`);
        }
      }
    }
  }
  return problems;
}

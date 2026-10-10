import {
  readFileSync,
  readdirSync,
  statSync,
  lstatSync,
  existsSync,
} from '../confined-source-fs.mjs';
import { basename, join, relative } from 'node:path';
import { pathResolvesInsideRoot } from './path-confinement.mjs';
import { DEFAULT_IGNORE } from './source-files.mjs';

const WORKSPACE_DISCOVERY_MAX_ENTRIES = 10000;
const WORKSPACE_PACKAGE_LIMIT = 500;
const WORKSPACE_MANIFEST_MAX_BYTES = 256 * 1024;
const WORKSPACE_PATTERN_LIMIT = 64;
const WORKSPACE_PATTERN_MAX_SEGMENTS = 24;
const WORKSPACE_PATTERN_MAX_GLOBSTARS = 2;
const WORKSPACE_PATTERN_MAX_WILDCARDS = 16;
const WORKSPACE_PATTERN_MATCH_STATE_LIMIT = 250000;

/**
 * Repository-declared Node workspace layouts, as implementation evidence only:
 * package names and manifests decide which source roots and aliases are safe to
 * inspect, never business meaning.
 *
 * @param {string} rootPath
 * @param {{ ignore?: Set<string> }} [options]
 * @returns {{ hasDeclaration: boolean, packages: Array<{ path: string, name: string|null, slug: string }>, skipped: Array<{ path: string, reason: string }> }}
 */
export function discoverDeclaredWorkspacePackages(rootPath, options = {}) {
  const ignore = options.ignore instanceof Set ? options.ignore : DEFAULT_IGNORE;
  const declarations = readWorkspaceDeclarations(rootPath);
  if (declarations.patterns.length === 0) {
    return {
      hasDeclaration: declarations.hasDeclaration,
      packages: [],
      skipped: declarations.skipped,
    };
  }

  const includedPatterns = declarations.patterns.filter((row) => !row.exclude);
  const excludedPatterns = declarations.patterns.filter((row) => row.exclude);
  const candidates = enumeratePackageDirectories(rootPath, ignore, declarations.skipped);
  for (const declaration of includedPatterns) {
    const literalPackage = readDeclaredLiteralWorkspacePackage(
      rootPath,
      declaration,
      ignore,
      declarations.skipped,
    );
    if (!literalPackage || candidates.some((candidate) => candidate.path === literalPackage.path)) {
      continue;
    }
    candidates.push(literalPackage);
  }
  const packages = [];
  const matchedPatterns = new Set();
  const matchBudget = { remaining: WORKSPACE_PATTERN_MATCH_STATE_LIMIT, exhausted: false };

  candidateLoop:
  for (const candidate of candidates) {
    const matchingIncludes = [];
    for (const declaration of includedPatterns) {
      if (workspacePatternMatches(declaration.pattern, candidate.path, matchBudget)) {
        matchingIncludes.push(declaration);
      }
      if (matchBudget.exhausted) break candidateLoop;
    }
    if (matchingIncludes.length === 0) continue;
    for (const match of matchingIncludes) matchedPatterns.add(match.key);
    let excluded = false;
    for (const declaration of excludedPatterns) {
      if (workspacePatternMatches(declaration.pattern, candidate.path, matchBudget)) {
        excluded = true;
      }
      if (matchBudget.exhausted) break candidateLoop;
      if (excluded) break;
    }
    if (excluded) {
      declarations.skipped.push({ path: candidate.path, reason: 'workspace-declaration-excluded' });
      continue;
    }
    packages.push(candidate);
  }

  if (matchBudget.exhausted) {
    declarations.skipped.push({
      path: '.',
      reason: `workspace-declaration-match-limit: reached ${WORKSPACE_PATTERN_MATCH_STATE_LIMIT} pattern states`,
    });
  }

  for (const declaration of includedPatterns) {
    if (matchedPatterns.has(declaration.key)) continue;
    declarations.skipped.push({
      path: declaration.source,
      reason: `workspace-declaration-no-package-match: ${declaration.pattern}`,
    });
  }

  packages.sort((a, b) => a.path.localeCompare(b.path));
  const omitted = Math.max(0, packages.length - WORKSPACE_PACKAGE_LIMIT);
  if (omitted > 0) {
    declarations.skipped.push({
      path: '.',
      reason: `workspace-declaration-package-limit: omitted ${omitted} declared package roots`,
    });
  }
  return {
    hasDeclaration: true,
    packages: assignWorkspacePackageSlugs(packages.slice(0, WORKSPACE_PACKAGE_LIMIT)),
    skipped: dedupeWorkspaceSkipped(declarations.skipped),
  };
}

function readWorkspaceDeclarations(rootPath) {
  const patterns = [];
  const skipped = [];
  let hasDeclaration = false;
  const pnpmWorkspacePath = join(rootPath, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    hasDeclaration = true;
    const parsed = readPnpmWorkspacePatterns(rootPath, pnpmWorkspacePath, skipped);
    for (const pattern of parsed) {
      patterns.push({
        pattern,
        exclude: pattern.startsWith('!'),
        source: 'pnpm-workspace.yaml',
        key: `pnpm-workspace.yaml:${pattern}`,
      });
    }
  }

  const packagePath = join(rootPath, 'package.json');
  if (existsSync(packagePath)) {
    const parsed = readNodeWorkspacePatterns(rootPath, packagePath, skipped);
    if (parsed !== null) hasDeclaration = true;
    for (const pattern of parsed ?? []) {
      patterns.push({
        pattern,
        exclude: pattern.startsWith('!'),
        source: 'package.json#workspaces',
        key: `package.json#workspaces:${pattern}`,
      });
    }
  }

  if (patterns.length > WORKSPACE_PATTERN_LIMIT) {
    skipped.push({
      path: '.',
      reason: `workspace-declaration-pattern-limit: omitted ${patterns.length - WORKSPACE_PATTERN_LIMIT} patterns`,
    });
    // Past the declaration budget, a later exclusion may be omitted and a prefix
    // could re-admit a package it removes, so discovery fails closed.
    return { hasDeclaration, patterns: [], skipped };
  }
  const normalized = [];
  for (const declaration of patterns) {
    const normalizedPattern = normalizeWorkspacePattern(declaration.pattern, declaration.source, skipped);
    if (!normalizedPattern) continue;
    normalized.push({
      ...declaration,
      pattern: normalizedPattern.pattern,
      exclude: normalizedPattern.exclude,
    });
  }
  return { hasDeclaration, patterns: normalized, skipped };
}

function readPnpmWorkspacePatterns(rootPath, workspacePath, skipped) {
  const source = relative(rootPath, workspacePath);
  let text;
  try {
    const size = statSync(workspacePath).size;
    if (size > WORKSPACE_MANIFEST_MAX_BYTES) {
      skipped.push({ path: source, reason: `workspace-declaration-skip: exceeds ${WORKSPACE_MANIFEST_MAX_BYTES} byte limit` });
      return [];
    }
    text = readFileSync(workspacePath, 'utf-8');
  } catch (error) {
    skipped.push({ path: source, reason: `workspace-declaration-skip: ${error.message}` });
    return [];
  }

  const patterns = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*(?:#.*)?$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^\S[^:]*:\s*(?:#.*)?$/.test(line)) break;
    const match = line.match(/^\s*-\s*(.*?)\s*(?:#.*)?$/);
    if (!match) continue;
    const value = unquoteWorkspaceScalar(match[1]);
    if (value) patterns.push(value);
  }
  if (patterns.length === 0) {
    skipped.push({ path: source, reason: 'workspace-declaration-skip: no static packages entries' });
  }
  return patterns;
}

function readNodeWorkspacePatterns(rootPath, packagePath, skipped) {
  let manifest;
  try {
    const size = statSync(packagePath).size;
    if (size > WORKSPACE_MANIFEST_MAX_BYTES) {
      skipped.push({ path: relative(rootPath, packagePath), reason: `workspace-declaration-skip: exceeds ${WORKSPACE_MANIFEST_MAX_BYTES} byte limit` });
      return null;
    }
    manifest = JSON.parse(readFileSync(packagePath, 'utf-8'));
  } catch {
    return null;
  }
  if (!Object.hasOwn(manifest, 'workspaces')) return null;
  const value = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : Array.isArray(manifest.workspaces?.packages)
      ? manifest.workspaces.packages
      : null;
  if (!value || !value.every((pattern) => typeof pattern === 'string')) {
    skipped.push({ path: 'package.json', reason: 'workspace-declaration-skip: workspaces must be a static string array' });
    return [];
  }
  return value;
}

function normalizeWorkspacePattern(value, source, skipped) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const exclude = raw.startsWith('!');
  const body = (exclude ? raw.slice(1) : raw).replace(/\\/g, '/');
  if (!body || body.startsWith('/') || /^[A-Za-z]:\//.test(body)) {
    skipped.push({ path: source, reason: `workspace-declaration-skip: invalid absolute pattern ${JSON.stringify(value)}` });
    return null;
  }
  const segments = body.split('/');
  if (segments.some((segment) => segment === '..' || segment.includes('\0'))) {
    skipped.push({ path: source, reason: `workspace-declaration-skip: unsafe pattern ${JSON.stringify(value)}` });
    return null;
  }
  const normalizedSegments = segments.filter((segment) => segment && segment !== '.');
  if (normalizedSegments.length > WORKSPACE_PATTERN_MAX_SEGMENTS) {
    skipped.push({
      path: source,
      reason: `workspace-declaration-skip: segment limit ${WORKSPACE_PATTERN_MAX_SEGMENTS} exceeded`,
    });
    return null;
  }
  const globstarCount = normalizedSegments.filter((segment) => segment === '**').length;
  if (globstarCount > WORKSPACE_PATTERN_MAX_GLOBSTARS) {
    skipped.push({
      path: source,
      reason: `workspace-declaration-skip: globstar limit ${WORKSPACE_PATTERN_MAX_GLOBSTARS} exceeded`,
    });
    return null;
  }
  const wildcardCount = normalizedSegments.reduce(
    (count, segment) => count + [...segment].filter((character) => character === '*').length,
    0,
  );
  if (wildcardCount > WORKSPACE_PATTERN_MAX_WILDCARDS) {
    skipped.push({
      path: source,
      reason: `workspace-declaration-skip: wildcard limit ${WORKSPACE_PATTERN_MAX_WILDCARDS} exceeded`,
    });
    return null;
  }
  return { exclude, pattern: normalizedSegments.join('/') || '.' };
}

function unquoteWorkspaceScalar(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function enumeratePackageDirectories(rootPath, ignore, skipped) {
  const candidates = [];
  let entriesSeen = 0;
  let stopped = false;

  function visit(directory) {
    if (stopped) return;
    const manifestPath = join(directory, 'package.json');
    if (existsSync(manifestPath) && statSync(manifestPath).isFile()) {
      const path = relative(rootPath, directory) || '.';
      candidates.push({ path, name: readWorkspacePackageName(manifestPath) });
    }
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch (error) {
      skipped.push({ path: relative(rootPath, directory) || '.', reason: `workspace-discovery-skip: ${error.message}` });
      return;
    }
    for (const entry of entries) {
      if (stopped) return;
      entriesSeen += 1;
      if (entriesSeen > WORKSPACE_DISCOVERY_MAX_ENTRIES) {
        stopped = true;
        skipped.push({ path: relative(rootPath, directory) || '.', reason: `workspace-discovery-entry-limit: reached ${WORKSPACE_DISCOVERY_MAX_ENTRIES}` });
        return;
      }
      if (ignore.has(entry) || entry.startsWith('.')) continue;
      const fullPath = join(directory, entry);
      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch (error) {
        skipped.push({ path: relative(rootPath, fullPath), reason: `workspace-discovery-skip: ${error.message}` });
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(fullPath);
    }
  }

  visit(rootPath);
  return candidates;
}

function readDeclaredLiteralWorkspacePackage(rootPath, declaration, ignore, skipped) {
  if (declaration.pattern.includes('*')) return null;
  const segments = declaration.pattern === '.' ? [] : declaration.pattern.split('/');
  if (segments.some((segment) => ignore.has(segment))) {
    skipped.push({
      path: declaration.source,
      reason: `workspace-declaration-ignored: ${declaration.pattern}`,
    });
    return null;
  }
  const packageRoot = declaration.pattern === '.' ? rootPath : join(rootPath, declaration.pattern);
  let stat;
  try {
    stat = lstatSync(packageRoot);
  } catch {
    return null;
  }
  if (stat.isSymbolicLink()) {
    skipped.push({ path: declaration.pattern, reason: 'workspace-declaration-skip: symbolic package root' });
    return null;
  }
  if (!stat.isDirectory() || !existsSync(join(packageRoot, 'package.json'))) return null;
  try {
    if (!pathResolvesInsideRoot(rootPath, packageRoot)) {
      skipped.push({ path: declaration.pattern, reason: 'workspace-declaration-skip: package root resolves outside repository' });
      return null;
    }
  } catch (error) {
    skipped.push({ path: declaration.pattern, reason: `workspace-declaration-skip: ${error.message}` });
    return null;
  }
  return {
    path: declaration.pattern,
    name: readWorkspacePackageName(join(packageRoot, 'package.json')),
  };
}

function readWorkspacePackageName(packagePath) {
  try {
    const manifest = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return typeof manifest.name === 'string' && manifest.name.trim() === manifest.name
      ? manifest.name
      : null;
  } catch {
    return null;
  }
}

function assignWorkspacePackageSlugs(packages) {
  const baseSlugs = packages.map((workspacePackage) => ({
    ...workspacePackage,
    baseSlug: workspacePackageBaseSlug(workspacePackage),
  }));
  const counts = new Map();
  for (const workspacePackage of baseSlugs) {
    counts.set(workspacePackage.baseSlug, (counts.get(workspacePackage.baseSlug) ?? 0) + 1);
  }
  return baseSlugs.map((workspacePackage) => ({
    path: workspacePackage.path,
    name: workspacePackage.name,
    slug: (counts.get(workspacePackage.baseSlug) ?? 0) === 1
      ? workspacePackage.baseSlug
      : workspacePathSlug(workspacePackage.path),
  }));
}

function workspacePackageBaseSlug(workspacePackage) {
  const name = workspacePackage.name?.replace(/^@[^/]+\//, '') || basename(workspacePackage.path);
  return workspacePathSlug(name) || 'workspace-package';
}

function workspacePathSlug(value) {
  return value
    .replace(/\\/g, '/')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function workspacePatternMatches(pattern, candidatePath, budget) {
  const patternSegments = pattern === '.' ? [] : pattern.split('/');
  const pathSegments = candidatePath === '.' ? [] : candidatePath.split('/');
  let states = closeWorkspaceGlobStates(new Set([0]), patternSegments);
  for (const pathSegment of pathSegments) {
    const next = new Set();
    for (const patternIndex of states) {
      if (!consumeWorkspacePatternBudget(budget)) return false;
      const segment = patternSegments[patternIndex];
      if (segment === '**') {
        next.add(patternIndex);
      } else if (segment && workspaceSegmentMatches(segment, pathSegment)) {
        next.add(patternIndex + 1);
      }
    }
    states = closeWorkspaceGlobStates(next, patternSegments);
    if (states.size === 0) return false;
  }
  return closeWorkspaceGlobStates(states, patternSegments).has(patternSegments.length);
}

function closeWorkspaceGlobStates(states, patternSegments) {
  const closed = new Set(states);
  for (let index = 0; index < patternSegments.length; index += 1) {
    if (patternSegments[index] === '**' && closed.has(index)) {
      closed.add(index + 1);
    }
  }
  return closed;
}

function consumeWorkspacePatternBudget(budget) {
  if (!budget) return true;
  if (budget.remaining <= 0) {
    budget.exhausted = true;
    return false;
  }
  budget.remaining -= 1;
  return true;
}

function workspaceSegmentMatches(pattern, value) {
  if (!pattern.includes('*')) return pattern === value;
  const fragments = pattern.split('*');
  let cursor = 0;
  let sawFragment = false;
  let finalFragmentEnd = 0;
  for (const fragment of fragments) {
    if (!fragment) continue;
    const found = value.indexOf(fragment, cursor);
    if (found === -1) return false;
    if (!sawFragment && !pattern.startsWith('*') && found !== 0) return false;
    sawFragment = true;
    cursor = found + fragment.length;
    finalFragmentEnd = cursor;
  }
  return pattern.endsWith('*') || (!sawFragment ? value.length === 0 : finalFragmentEnd === value.length);
}

function dedupeWorkspaceSkipped(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.path}\u0000${row.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Implementation evidence for repositories that are not JavaScript: Autotools/C
// role assignment read out of `Makefile.am` and friends, and Cargo target and
// module evidence read out of `Cargo.toml` plus the Rust sources it names.

import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { join, basename, relative, isAbsolute, dirname } from 'node:path';
import {
  AUTOTOOLS_IDENTITY_FILES,
  AUTOTOOLS_IMPLEMENTATION_MANIFESTS,
  AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT,
  AUTOTOOLS_ROLE_CLASSIFICATION_PRIORITY,
  AUTOTOOLS_ROLE_LITERAL_PATH_MAX_LENGTH,
  AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES,
  AUTOTOOLS_ROLE_SELECTION_PRIORITY,
  AUTOTOOLS_ROLE_TARGET_LIMIT,
  CARGO_MANIFEST_MAX_BYTES,
  NATIVE_DOC_BUILD_ELEMENT_LIMIT,
  NATIVE_ROLE_EVIDENCE_FILE,
  NATIVE_SOURCE_ELEMENT_LIMIT,
  NATIVE_SOURCE_FILE,
  RUST_IMPLEMENTATION_ELEMENT_LIMIT,
  RUST_MODULES_PER_TARGET_LIMIT,
  RUST_SOURCE_MAX_BYTES,
  SOURCE_FOLDERS,
} from './constants.mjs';
import { humanize, slugify } from './text.mjs';
import {
  packageContractPathIssue,
  pathResolvesInsideRoot,
  pushSkippedOnce,
} from './scan-guards.mjs';
import { extractCargoPackageContract } from './package-contracts.mjs';

function readAutotoolsRoleManifest(rootPath, path, skipped) {
  const source = relative(rootPath, path);
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return null;
    if (!pathResolvesInsideRoot(rootPath, path)) {
      pushSkippedOnce(skipped, {
        path,
        reason: 'autotools-role-evidence-skip: ' + source + ' resolves outside repository root',
      });
      return null;
    }
    if (statSync(path).size > AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES) {
      pushSkippedOnce(skipped, {
        path,
        reason: 'autotools-role-evidence-skip: ' + source + ' exceeds ' + AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES + ' bytes',
      });
      return null;
    }
    return readFileSync(path, 'utf-8');
  } catch {
    pushSkippedOnce(skipped, {
      path,
      reason: 'autotools-role-evidence-skip: ' + source + ' is unreadable',
    });
    return null;
  }
}

function staticAutotoolsLines(contents) {
  return contents
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:dnl\b|#)/i.test(line))
    .map((line) => line.trim());
}

function isStaticAutotoolsRolePath(value) {
  if (
    !value ||
    value.length > AUTOTOOLS_ROLE_LITERAL_PATH_MAX_LENGTH ||
    isAbsolute(value) ||
    value.includes('\\') ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
  ) {
    return false;
  }
  return value.split('/').every(
    (segment) => segment !== '.' && segment !== '..' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
  );
}

function extractStaticAutotoolsMakefileTargets(contents) {
  const targets = new Set();
  const source = staticAutotoolsLines(contents).join('\n');
  const pattern = /\bAC_CONFIG_FILES\s*\(\s*(?:\[([^\]]*)\]|([^)]*))\s*\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const candidates = (match[1] ?? match[2] ?? '').trim().split(/\s+/).filter(Boolean);
    if (
      candidates.length === 0 ||
      candidates.length > AUTOTOOLS_ROLE_TARGET_LIMIT ||
      !candidates.every(isStaticAutotoolsRolePath)
    ) {
      continue;
    }
    for (const candidate of candidates) {
      const segments = candidate.split('/');
      if (
        candidate === 'Makefile' ||
        (segments.length === 2 && segments[1] === 'Makefile')
      ) {
        targets.add(candidate);
      }
    }
  }
  return [...targets].sort().slice(0, AUTOTOOLS_ROLE_TARGET_LIMIT);
}

function makefileAmPathForTarget(rootPath, target) {
  if (target === 'Makefile') return join(rootPath, 'Makefile.am');
  return join(rootPath, target.slice(0, -'/Makefile'.length), 'Makefile.am');
}

function extractStaticAutotoolsRoleAssignments(contents) {
  const assignments = [];
  let pending = '';
  const flush = (line) => {
    const assignment = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*(?:\+?=|:=)\s*(.+)$/);
    if (!assignment) return;
    const name = assignment[1];
    if (!/_HEADERS$/.test(name) && !/_SOURCES$/.test(name)) return;
    const values = assignment[2].trim().split(/\s+/).filter(Boolean);
    if (
      values.length === 0 ||
      values.length > AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT ||
      !values.every(isStaticAutotoolsRolePath)
    ) {
      return;
    }
    assignments.push({ name, values });
  };

  for (const line of staticAutotoolsLines(contents)) {
    if (!line) continue;
    const current = pending ? pending + ' ' + line : line;
    if (current.endsWith('\\')) {
      pending = current.slice(0, -1).trim();
      continue;
    }
    flush(current);
    pending = '';
    if (assignments.length >= AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT) break;
  }
  return assignments;
}

function resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath) {
  if (!isStaticAutotoolsRolePath(literalPath)) return null;
  const path = join(dirname(manifestPath), literalPath);
  try {
    if (
      !existsSync(path) ||
      !statSync(path).isFile() ||
      !pathResolvesInsideRoot(rootPath, path)
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

function resolveStaticAutotoolsHeaderFile(rootPath, manifestPath, literalPath) {
  if (!/\.h(?:\.in)?$/i.test(literalPath)) return null;
  const direct = resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath);
  if (direct && NATIVE_ROLE_EVIDENCE_FILE.test(direct)) return direct;
  if (!/\.h$/i.test(literalPath)) return null;
  const template = resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath + '.in');
  return template && /\.h\.in$/i.test(template) ? template : null;
}

function nativeRoleForSource(path, isExtra, source) {
  const name = basename(path).replace(NATIVE_ROLE_EVIDENCE_FILE, '');
  if (/(?:^|[-_.])(raw|api)(?:[-_.]|$)/i.test(name)) {
    return 'Specialized API source';
  }
  if (isExtra && source.includes('/')) {
    return 'Selectable platform backend';
  }
  return 'Core implementation source';
}

function discoverAutotoolsDeclaredRoleEvidence(rootPath, skipped) {
  const roleCandidates = new Map();
  const makefilePaths = new Set();
  const addRoleCandidate = (path, role, evidenceSource) => {
    if (!NATIVE_ROLE_EVIDENCE_FILE.test(path)) return;
    const source = relative(rootPath, path);
    const existing = roleCandidates.get(source);
    if (
      !existing ||
      (AUTOTOOLS_ROLE_CLASSIFICATION_PRIORITY.get(role) ?? Infinity) <
        (AUTOTOOLS_ROLE_CLASSIFICATION_PRIORITY.get(existing.role) ?? Infinity)
    ) {
      roleCandidates.set(source, { path, role, evidenceSource });
    }
  };

  for (const configName of AUTOTOOLS_IDENTITY_FILES) {
    const configPath = join(rootPath, configName);
    const contents = readAutotoolsRoleManifest(rootPath, configPath, skipped);
    if (!contents) continue;
    for (const target of extractStaticAutotoolsMakefileTargets(contents)) {
      makefilePaths.add(makefileAmPathForTarget(rootPath, target));
    }
  }

  for (const manifestPath of [...makefilePaths].sort()) {
    const contents = readAutotoolsRoleManifest(rootPath, manifestPath, skipped);
    if (!contents) continue;
    const manifestSource = relative(rootPath, manifestPath);
    for (const assignment of extractStaticAutotoolsRoleAssignments(contents)) {
      if (/(?:^|_)(?:include|pkginclude)_HEADERS$/.test(assignment.name)) {
        for (const literalPath of assignment.values) {
          const path = resolveStaticAutotoolsHeaderFile(rootPath, manifestPath, literalPath);
          if (path) addRoleCandidate(path, 'Public interface contract', manifestSource);
        }
        continue;
      }
      if (assignment.name.endsWith('_HEADERS')) continue;

      const isExtra = assignment.name.startsWith('EXTRA_');
      for (const literalPath of assignment.values) {
        const path = resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath);
        if (!path || !NATIVE_SOURCE_FILE.test(path)) continue;
        const source = relative(rootPath, path);
        const role = nativeRoleForSource(path, isExtra, source);
        addRoleCandidate(
          path,
          role,
          role === 'Specialized API source' ? source : manifestSource,
        );
      }
    }
  }

  return roleCandidates;
}

function nativeEvidenceTitle(source, role) {
  const fileName = source.split('/').at(-1);
  const stem = slugify(fileName.replace(NATIVE_ROLE_EVIDENCE_FILE, ''));
  return role + ': ' + humanize(stem);
}

function compareNativeEvidenceCandidates(left, right) {
  const roleDelta =
    (AUTOTOOLS_ROLE_SELECTION_PRIORITY.get(left.role) ?? Infinity) -
    (AUTOTOOLS_ROLE_SELECTION_PRIORITY.get(right.role) ?? Infinity);
  if (roleDelta !== 0) return roleDelta;
  const representativePriority = (candidate) => {
    const fileName = candidate.source.split('/').at(-1).toLowerCase();
    const stem = fileName.replace(NATIVE_ROLE_EVIDENCE_FILE, '');
    if (candidate.role === 'Public interface contract') {
      return fileName.endsWith('.h.in') ? 0 : candidate.source.startsWith('include/') ? 1 : 2;
    }
    if (candidate.role === 'Core implementation source') {
      if (/(?:^|[-_.])prep(?:[-_.]|$)/.test(stem)) return 0;
      return /(?:^|[-_.])(main|core)(?:[-_.]|$)/.test(stem) ? 1 : 2;
    }
    if (candidate.role === 'Specialized API source') {
      return /^(?:raw[-_.]?api|api)$/.test(stem) ? 0 : 1;
    }
    return 0;
  };
  const representativeDelta = representativePriority(left) - representativePriority(right);
  if (representativeDelta !== 0) return representativeDelta;
  const leftBase = left.source.split('/').at(-1).toLowerCase();
  const rightBase = right.source.split('/').at(-1).toLowerCase();
  const basePriority = (base) => (
    base === 'main.c' || base === 'main.h' ? 0 : base.endsWith('.c') ? 1 : 2
  );
  return basePriority(leftBase) - basePriority(rightBase) || left.source.localeCompare(right.source);
}

export function discoverAutotoolsImplementationEvidence(rootPath, { ignore, skipped }) {
  const hasAutotoolsManifest = [...AUTOTOOLS_IMPLEMENTATION_MANIFESTS.keys()].some(
    (manifest) => {
      const path = join(rootPath, manifest);
      try {
        return existsSync(path) && statSync(path).isFile() && pathResolvesInsideRoot(rootPath, path);
      } catch {
        return false;
      }
    },
  );
  if (!hasAutotoolsManifest) {
    return { isNativeProject: false, elements: [] };
  }

  const sourceCandidates = new Map();
  const visitedDirectories = new Set();
  let entriesSeen = 0;

  const addSourceCandidate = (path) => {
    const source = relative(rootPath, path);
    if (!source || sourceCandidates.has(source)) return;
    try {
      if (
        !statSync(path).isFile() ||
        !NATIVE_SOURCE_FILE.test(path) ||
        !pathResolvesInsideRoot(rootPath, path)
      ) {
        return;
      }
      sourceCandidates.set(source, path);
    } catch {
      // A broken or concurrently removed path is not evidence.
    }
  };

  const visitSourceRoot = (dir, depth, descend = true) => {
    if (depth > 3 || entriesSeen >= 2000) return;
    let realDirectory;
    try {
      realDirectory = realpathSync(dir);
      if (visitedDirectories.has(realDirectory)) return;
      visitedDirectories.add(realDirectory);
    } catch {
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entriesSeen >= 2000) break;
      entriesSeen += 1;
      if (ignore.has(entry) || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      let pathStat;
      try {
        if (!pathResolvesInsideRoot(rootPath, path)) continue;
        pathStat = statSync(path);
      } catch {
        continue;
      }
      if (pathStat.isDirectory() && descend) {
        visitSourceRoot(path, depth + 1);
      } else if (pathStat.isFile()) {
        addSourceCandidate(path);
      }
    }
  };

  // Root-level C files are common in small native tools. Conventional source
  // roots are walked separately so a large repository does not turn every
  // documentation/vendor file into an implementation candidate.
  visitSourceRoot(rootPath, 0, false);
  for (const sourceFolder of SOURCE_FOLDERS) {
    const sourceRoot = join(rootPath, sourceFolder);
    try {
      if (existsSync(sourceRoot) && statSync(sourceRoot).isDirectory()) {
        visitSourceRoot(sourceRoot, 0);
      }
    } catch {
      // Continue with the remaining conventional source roots.
    }
  }

  const declaredRoleEvidence = discoverAutotoolsDeclaredRoleEvidence(rootPath, skipped);
  for (const [source, row] of declaredRoleEvidence) {
    sourceCandidates.set(source, row.path);
  }

  if (sourceCandidates.size === 0) {
    return { isNativeProject: false, elements: [] };
  }

  const elements = [];
  const claimedSlugs = new Set();
  const addElement = (row) => {
    if (claimedSlugs.has(row.slug)) return;
    claimedSlugs.add(row.slug);
    elements.push(row);
  };

  for (const [manifest, descriptor] of AUTOTOOLS_IMPLEMENTATION_MANIFESTS) {
    const path = join(rootPath, manifest);
    try {
      if (!existsSync(path) || !statSync(path).isFile() || !pathResolvesInsideRoot(rootPath, path)) {
        continue;
      }
    } catch {
      continue;
    }
    const source = relative(rootPath, path);
    addElement({
      slug: descriptor.slug,
      title: descriptor.title,
      path: source,
      evidence: { source },
    });
  }

  const docsDependencyPath = join(rootPath, 'docs', 'Pipfile');
  try {
    if (
      existsSync(docsDependencyPath) &&
      statSync(docsDependencyPath).isFile() &&
      pathResolvesInsideRoot(rootPath, docsDependencyPath)
    ) {
      const source = relative(rootPath, docsDependencyPath);
      addElement({
        slug: 'elements/docs-dependencies',
        title: 'Documentation Dependencies',
        path: source,
        evidence: { source },
      });
    }
  } catch {
    // An unreadable dependency manifest is not evidence.
  }

  const docsRoot = join(rootPath, 'docs');
  let docsBuildScripts = [];
  try {
    if (existsSync(docsRoot) && statSync(docsRoot).isDirectory()) {
      docsBuildScripts = readdirSync(docsRoot)
        .filter((entry) => /^build_[A-Za-z0-9_-]+\.py$/i.test(entry))
        .filter((entry) => {
          const path = join(docsRoot, entry);
          try {
            return statSync(path).isFile() && pathResolvesInsideRoot(rootPath, path);
          } catch {
            return false;
          }
        })
        .sort()
        .slice(0, NATIVE_DOC_BUILD_ELEMENT_LIMIT);
    }
  } catch {
    docsBuildScripts = [];
  }
  for (const entry of docsBuildScripts) {
    const source = `docs/${entry}`;
    const suffix = slugify(entry.slice('build_'.length, -'.py'.length));
    if (!suffix) continue;
    addElement({
      slug: `elements/docs-build-${suffix}`,
      title: `Documentation Build ${humanize(suffix)}`,
      path: source,
      evidence: { source },
    });
  }

  const sortedSources = [...sourceCandidates.entries()]
    .map(([source, path]) => ({
      source,
      path,
      role: declaredRoleEvidence.get(source)?.role ?? 'Unclassified native source evidence',
    }))
    .sort(compareNativeEvidenceCandidates);
  const selectedSources = [];
  const selectedSourcePaths = new Set();
  for (const role of AUTOTOOLS_ROLE_SELECTION_PRIORITY.keys()) {
    const representative = sortedSources.find((candidate) => candidate.role === role);
    if (!representative || selectedSourcePaths.has(representative.source)) continue;
    selectedSources.push(representative);
    selectedSourcePaths.add(representative.source);
  }
  for (const candidate of sortedSources) {
    if (selectedSources.length >= NATIVE_SOURCE_ELEMENT_LIMIT) break;
    if (selectedSourcePaths.has(candidate.source)) continue;
    selectedSources.push(candidate);
    selectedSourcePaths.add(candidate.source);
  }
  if (sortedSources.length > selectedSources.length) {
    pushSkippedOnce(skipped, {
      path: rootPath,
      reason: `native-source-element-limit: omitted ${sortedSources.length - selectedSources.length} C/C header paths after ${NATIVE_SOURCE_ELEMENT_LIMIT}`,
    });
  }
  const sourceSlugCounts = new Map();
  for (const { source, role } of selectedSources) {
    const fileName = source.split('/').at(-1);
    const stem = slugify(fileName.replace(NATIVE_ROLE_EVIDENCE_FILE, ''));
    if (!stem) continue;
    const count = sourceSlugCounts.get(stem) ?? 0;
    sourceSlugCounts.set(stem, count + 1);
    const slug = count === 0
      ? `elements/${stem}`
      : `elements/${stem}-${slugify(source.split('/').slice(-2, -1)[0]) || 'native'}`;
    addElement({
      slug,
      title: nativeEvidenceTitle(source, role),
      path: source,
      evidence: {
        source: declaredRoleEvidence.get(source)?.evidenceSource ?? source,
      },
    });
  }

  return { isNativeProject: true, elements };
}

export function discoverRustImplementationEvidence(rootPath, skipped) {
  const empty = { rows: [], skipDirectories: new Set() };
  const manifestPath = join(rootPath, 'Cargo.toml');
  if (!existsSync(manifestPath)) return empty;
  try {
    const issue = packageContractPathIssue(
      rootPath,
      manifestPath,
      'Cargo.toml',
      CARGO_MANIFEST_MAX_BYTES,
    );
    if (issue) {
      pushSkippedOnce(skipped, { path: manifestPath, reason: issue });
      return empty;
    }
    if (!extractCargoPackageContract(readFileSync(manifestPath, 'utf-8')).packageName) {
      return empty;
    }
  } catch {
    return empty;
  }

  const srcRoot = join(rootPath, 'src');
  try {
    if (!existsSync(srcRoot) || !statSync(srcRoot).isDirectory()) return empty;
    if (!pathResolvesInsideRoot(rootPath, srcRoot)) return empty;
  } catch {
    return empty;
  }

  const targetRows = [];
  const skipDirectories = new Set();
  const addTarget = (path, name) => {
    try {
      if (
        !existsSync(path) ||
        !statSync(path).isFile() ||
        !pathResolvesInsideRoot(rootPath, path)
      ) {
        return;
      }
      targetRows.push({
        path: relative(rootPath, path),
        name,
        kind: 'rust-target',
      });
    } catch {
      // Only resolved, regular files can become evidence.
    }
  };
  addTarget(join(srcRoot, 'lib.rs'), 'lib');
  addTarget(join(srcRoot, 'main.rs'), 'main');

  const binRoot = join(srcRoot, 'bin');
  try {
    if (existsSync(binRoot) && statSync(binRoot).isDirectory()) {
      if (pathResolvesInsideRoot(rootPath, binRoot)) {
        skipDirectories.add('src/bin');
        for (const entry of readdirSync(binRoot).sort()) {
          const path = join(binRoot, entry);
          if (entry.endsWith('.rs')) {
            addTarget(path, entry.slice(0, -3));
          } else if (statSync(path).isDirectory()) {
            addTarget(join(path, 'main.rs'), entry);
          }
        }
      }
    }
  } catch {
    // An unreadable target directory contributes no evidence.
  }

  const moduleRows = [];
  const seenModulePaths = new Set(targetRows.map((row) => row.path));
  for (const target of targetRows) {
    if (moduleRows.length >= RUST_IMPLEMENTATION_ELEMENT_LIMIT) break;
    const targetPath = join(rootPath, target.path);
    let text;
    try {
      if (statSync(targetPath).size > RUST_SOURCE_MAX_BYTES) continue;
      text = readFileSync(targetPath, 'utf-8');
    } catch {
      continue;
    }
    for (const moduleName of extractRustModuleNames(text).slice(0, RUST_MODULES_PER_TARGET_LIMIT)) {
      const modulePath = resolveRustModulePath(rootPath, targetPath, moduleName);
      if (!modulePath) continue;
      const source = relative(rootPath, modulePath);
      if (seenModulePaths.has(source)) continue;
      seenModulePaths.add(source);
      const moduleRoot = relative(rootPath, join(modulePath, '..')).replaceAll('\\', '/');
      if (moduleRoot !== 'src') skipDirectories.add(moduleRoot);
      moduleRows.push({ path: source, name: moduleName, kind: 'rust-module' });
      if (targetRows.length + moduleRows.length >= RUST_IMPLEMENTATION_ELEMENT_LIMIT) break;
    }
  }
  return {
    rows: [...targetRows, ...moduleRows].slice(0, RUST_IMPLEMENTATION_ELEMENT_LIMIT),
    skipDirectories,
  };
}

export function materializeRustImplementationElements(rows, { existingElements }) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  for (const row of rows) {
    const base = slugify(row.name.replace(/_/g, '-'));
    if (!base) continue;
    const bareSlug = `elements/${base}`;
    const slug = claimed.has(bareSlug)
      ? `elements/${base}-${row.kind}`
      : bareSlug;
    if (claimed.has(slug)) continue;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(base),
      path: row.path,
      evidence: { source: row.path },
    });
  }
  return out;
}

function resolveRustModulePath(rootPath, targetPath, moduleName) {
  const targetDir = join(targetPath, '..');
  for (const candidate of [
    join(targetDir, `${moduleName}.rs`),
    join(targetDir, moduleName, 'mod.rs'),
  ]) {
    try {
      if (
        existsSync(candidate) &&
        statSync(candidate).isFile() &&
        pathResolvesInsideRoot(rootPath, candidate)
      ) {
        return candidate;
      }
    } catch {
      // Continue to the alternate Rust module convention.
    }
  }
  return null;
}

function extractRustModuleNames(text) {
  const names = new Set();
  for (const line of stripRustNonCode(text).split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:pub(?:\s*\([^\r\n)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/,
    );
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

function stripRustNonCode(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('//', index)) {
      const end = text.indexOf('\n', index + 2);
      const consumed = end === -1 ? text.length : end;
      output += text.slice(index, consumed).replace(/[^\n]/g, ' ');
      index = consumed;
      continue;
    }
    if (text.startsWith('/*', index)) {
      const consumed = consumeRustBlockComment(text, index);
      output += text.slice(index, consumed).replace(/[^\n]/g, ' ');
      index = consumed;
      continue;
    }
    const rawEnd = consumeRustRawString(text, index);
    if (rawEnd !== null) {
      output += text.slice(index, rawEnd).replace(/[^\n]/g, ' ');
      index = rawEnd;
      continue;
    }
    if (text[index] === '"') {
      const consumed = consumeRustQuoted(text, index);
      output += text.slice(index, consumed).replace(/[^\n]/g, ' ');
      index = consumed;
      continue;
    }
    output += text[index];
    index += 1;
  }
  return output;
}

function consumeRustBlockComment(text, start) {
  let depth = 1;
  let index = start + 2;
  while (index < text.length && depth > 0) {
    if (text.startsWith('/*', index)) {
      depth += 1;
      index += 2;
    } else if (text.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  return index;
}

function consumeRustRawString(text, start) {
  const match = text.slice(start).match(/^(?:br|r)(#*)"/);
  if (!match) return null;
  const terminator = `"${match[1]}`;
  const end = text.indexOf(terminator, start + match[0].length);
  return end === -1 ? text.length : end + terminator.length;
}

function consumeRustQuoted(text, start) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (text[index] === '\\') {
      escaped = true;
      continue;
    }
    if (text[index] === '"') return index + 1;
  }
  return text.length;
}

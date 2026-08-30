// Element candidates materialised from source layout and import evidence: Go
// packages and their dependency edges, Python packages and import boundaries,
// root-level packages, and workspace members.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import {
  GO_PACKAGE_ELEMENT_LIMIT,
  IMPLEMENTATION_SOURCE_ELEMENT_LIMIT,
  PYTHON_IMPORT_ELEMENT_LIMIT,
  PYTHON_IMPORT_RISK_ELEMENT_LIMIT,
  PYTHON_NON_PRODUCT_PACKAGES,
  SOURCE_FOLDERS,
  WORKSPACE_ELEMENT_LIMIT,
  WORKSPACE_FOLDERS,
} from './constants.mjs';
import { humanize, slugify, uniqueStrings } from './text.mjs';
import { pathResolvesInsideRoot, pushSkippedOnce } from './scan-guards.mjs';

export function materializeGoPackageElements(packageImportEvidence, { existingElements, skipped }) {
  const candidatesByPath = new Map();
  for (const edge of packageImportEvidence?.moduleEdges ?? []) {
    const count = Number.isInteger(edge.count) && edge.count > 0 ? edge.count : 0;
    const productValueCount = Number.isInteger(edge.productValueCount) && edge.productValueCount > 0
      ? edge.productValueCount
      : 0;
    for (const path of [edge.fromPackage, edge.toPackage]) {
      if (typeof path !== 'string') continue;
      const candidate = candidatesByPath.get(path) ?? {
        path,
        count: 0,
        productValueCount: 0,
      };
      candidate.count += count;
      candidate.productValueCount += productValueCount;
      candidatesByPath.set(path, candidate);
    }
  }
  const candidates = [...candidatesByPath.values()].sort((a, b) =>
    b.productValueCount - a.productValueCount ||
    b.count - a.count ||
    a.path.localeCompare(b.path),
  );
  const admittedCandidates = candidates.slice(0, GO_PACKAGE_ELEMENT_LIMIT);
  if (candidates.length > admittedCandidates.length) {
    skipped.push({
      path: 'go.mod',
      reason: `go-package-element-limit: omitted ${candidates.length - admittedCandidates.length} lower-priority package directories`,
    });
  }
  const packagePaths = new Set(admittedCandidates.map((candidate) => candidate.path));
  const claimed = new Set(existingElements.map((element) => element.slug));
  const existingPaths = new Set(existingElements.map((element) => element.path));
  const elements = [];
  for (const { path, name } of resolveGoPackageElementNames(
    admittedCandidates.filter((candidate) => !existingPaths.has(candidate.path)),
    claimed,
  )) {
    const slug = `elements/${name}`;
    claimed.add(slug);
    elements.push({
      slug,
      title: humanize(name),
      path,
      evidence: { source: path },
    });
  }
  return { elements, packagePaths };
}

function resolveGoPackageElementNames(candidates, claimed) {
  const rows = candidates
    .map((candidate) => ({
      path: candidate.path,
      segments: (candidate.path === '.' ? ['root'] : candidate.path.split('/'))
        .map((segment) => slugify(segment))
        .filter(Boolean),
      depth: 1,
    }))
    .filter((row) => row.segments.length > 0);
  while (true) {
    const names = new Map(rows.map((row) => [
      row,
      row.segments.slice(-row.depth).join('-'),
    ]));
    const counts = new Map();
    for (const name of names.values()) {
      const slug = `elements/${name}`;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    const conflicts = rows.filter((row) => {
      const slug = `elements/${names.get(row)}`;
      return claimed.has(slug) || (counts.get(slug) ?? 0) > 1;
    });
    if (conflicts.length === 0) {
      return rows.map((row) => ({ path: row.path, name: names.get(row) }));
    }
    let advanced = false;
    for (const row of conflicts) {
      if (row.depth < row.segments.length) {
        row.depth += 1;
        advanced = true;
      }
    }
    if (advanced) continue;

    const assigned = new Set(claimed);
    return rows.map((row) => {
      const baseName = names.get(row);
      let name = baseName;
      let suffix = 2;
      while (assigned.has(`elements/${name}`)) {
        name = `${baseName}-${suffix}`;
        suffix += 1;
      }
      assigned.add(`elements/${name}`);
      return { path: row.path, name };
    });
  }
}

export function mapGoPackageDependencyRelations(packageImportEvidence, elements) {
  const elementsByPath = new Map(elements.map((element) => [element.path, element.slug]));
  return (packageImportEvidence?.moduleEdges ?? [])
    .map((edge) => ({
      ...edge,
      from: elementsByPath.get(edge.fromPackage),
      to: elementsByPath.get(edge.toPackage),
      evidence: (edge.evidence ?? []).map((receipt) => ({
        from: receipt.fromFile,
        to: receipt.toPackage,
        kind: receipt.kind,
        sourceRole: receipt.sourceRole,
        importUsage: receipt.importUsage,
      })),
    }))
    .filter((edge) => edge.from && edge.to && edge.from !== edge.to);
}

export function mapGoPackageImportReceipts(packageImportEvidence) {
  return (packageImportEvidence?.packageImports ?? []).map((receipt) => ({
    from: receipt.fromFile,
    to: receipt.toPackage,
    kind: receipt.kind,
    sourceRole: receipt.sourceRole,
    importUsage: receipt.importUsage,
  }));
}

export function buildSuggestedDependencyRelations(moduleEdges, implementationNodes) {
  const implementationSlugs = new Set(implementationNodes.map((node) => node.slug));
  return [...moduleEdges]
    .filter((edge) =>
      edge?.productValueCount > 0 &&
      implementationSlugs.has(edge.from) &&
      implementationSlugs.has(edge.to),
    )
    .sort((a, b) =>
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
    )
    .slice(0, 24)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      type: 'depends_on',
      why: 'proposal-only: bounded production value-import evidence; runtime impact is not asserted',
      evidence: uniqueStrings(
        (edge.evidence ?? []).flatMap((row) => [row.from, row.to]),
      ).slice(0, 4),
      confidence: 0.5,
      uncertainty: 'static import evidence requires semantic impact review before relation admission',
    }));
}

export function discoverSourcePythonPackagePaths(rootPath, { srcDir, ignore, skipped }) {
  if (!srcDir || !['src', 'source'].includes(basename(srcDir))) return [];
  let entries;
  try {
    entries = readdirSync(srcDir).sort();
  } catch {
    return [];
  }
  const paths = [];
  for (const entry of entries) {
    if (
      ignore.has(entry) ||
      PYTHON_NON_PRODUCT_PACKAGES.has(entry.toLowerCase()) ||
      entry.startsWith('.')
    ) {
      continue;
    }
    const packagePath = join(srcDir, entry);
    const packageEntry = join(packagePath, '__init__.py');
    try {
      if (!statSync(packagePath).isDirectory() || !existsSync(packageEntry)) continue;
      if (
        !pathResolvesInsideRoot(rootPath, packagePath) ||
        !pathResolvesInsideRoot(rootPath, packageEntry)
      ) {
        pushSkippedOnce(skipped, {
          path: packagePath,
          reason: 'python-package-skip: path resolves outside repository root',
        });
        continue;
      }
      paths.push(relative(rootPath, packagePath));
    } catch {
      // A concurrent or unreadable package is not evidence.
    }
  }
  return paths;
}

export function materializePythonPackageElements(paths, { domainForName, existingElements }) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  for (const path of [...paths].sort()) {
    const flatName = slugify(basename(path).replace(/_/g, '-'));
    if (!flatName || claimed.has(`elements/${flatName}`)) continue;
    const slug = `elements/${flatName}`;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(flatName),
      ...(domainForName(flatName) ? { domain: domainForName(flatName) } : {}),
      path,
      evidence: { source: path },
    });
  }
  return out;
}

export function materializeImplementationOnlySourceElements(
  rootPath,
  sourceDir,
  { ignore, domainForName, existingElements, skipped },
) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  let admitted = 0;
  let limitRecorded = false;
  for (const entry of readdirSync(sourceDir).sort()) {
    if (ignore.has(entry) || entry.startsWith('.')) {
      skipped.push({ path: join(sourceDir, entry), reason: 'dotfile/ignore' });
      continue;
    }
    const entryPath = join(sourceDir, entry);
    let entryStat;
    try {
      entryStat = statSync(entryPath);
    } catch {
      continue;
    }
    if (!entryStat.isDirectory()) continue;
    if (admitted >= IMPLEMENTATION_SOURCE_ELEMENT_LIMIT) {
      if (!limitRecorded) {
        skipped.push({
          path: sourceDir,
          reason: `implementation-source-element-limit: omitted direct internal entries after ${IMPLEMENTATION_SOURCE_ELEMENT_LIMIT}`,
        });
        limitRecorded = true;
      }
      continue;
    }
    const name = slugify(entry);
    const slug = name ? `elements/${name}` : null;
    const source = relative(rootPath, entryPath);
    if (!slug || claimed.has(slug)) continue;
    out.push({
      slug,
      title: humanize(name),
      ...(domainForName(name) ? { domain: domainForName(name) } : {}),
      path: source,
      evidence: { source },
    });
    claimed.add(slug);
    admitted += 1;
  }
  return out;
}

/**
 * Proposes top-level standalone packages (a directory with its own `package.json`
 * directly under root) as element candidates — sibling packages such as `mcp/`
 * and `cli/`.
 *
 * Why (measured 2026-08-01): without this function, analyze caught only the `src/`
 * FSD layers and `apps/`/`packages/` workspaces, and **the tool's field of view
 * became the vault's reach**. When an agent with no spec context regenerated the
 * dogfood vault from these proposals alone, this repository's entire agent surface
 * (the MCP server `mcp/`, the CLI `cli/`) fell off the map: all 43 `path:` values
 * were under `src/`. An omission in a proposal tool propagates as silence, so the
 * reach is fixed in code — fixing only the wording lets the next person build the
 * same vault.
 *
 * `package.json` is the discriminator: top-level folders that are not standalone
 * packages (`scripts/`, `tests/`, `docs/`) are not proposed. Coverage is not the goal.
 */
export function detectRootPackages(rootPath, { ignore, domainForName, existingElements }) {
  const out = [];
  const claimed = new Set(existingElements.map((el) => el.slug));
  let entries;
  try {
    entries = readdirSync(rootPath).sort();
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (ignore.has(entry) || entry.startsWith('.')) continue;
    if (SOURCE_FOLDERS.includes(entry) || WORKSPACE_FOLDERS.includes(entry)) continue;
    const memberPath = join(rootPath, entry);
    let isDir;
    try {
      isDir = statSync(memberPath).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (!existsSync(join(memberPath, 'package.json'))) continue;
    // Flat slugs — a collision with an already-taken name is split by a -package suffix.
    const flatName = claimed.has(`elements/${entry}`) ? `${entry}-package` : entry;
    const slug = `elements/${flatName}`;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(entry),
      ...(domainForName(entry) ? { domain: domainForName(entry) } : {}),
      path: entry,
      evidence: { source: entry },
    });
  }
  return out;
}

export function detectRootPythonPackages(
  rootPath,
  { ignore, domainForName, existingElements, skipped },
) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  let entries;
  try {
    entries = readdirSync(rootPath).sort();
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (
      ignore.has(entry) ||
      PYTHON_NON_PRODUCT_PACKAGES.has(entry.toLowerCase()) ||
      entry.startsWith('.') ||
      SOURCE_FOLDERS.includes(entry) ||
      WORKSPACE_FOLDERS.includes(entry)
    ) {
      continue;
    }
    const packagePath = join(rootPath, entry);
    try {
      if (!statSync(packagePath).isDirectory()) continue;
    } catch {
      continue;
    }
    const packageEntry = join(packagePath, '__init__.py');
    if (!existsSync(packageEntry)) continue;
    if (
      !pathResolvesInsideRoot(rootPath, packagePath) ||
      !pathResolvesInsideRoot(rootPath, packageEntry)
    ) {
      pushSkippedOnce(skipped, {
        path: packagePath,
        reason: 'python-package-skip: path resolves outside repository root',
      });
      continue;
    }
    const flatName = slugify(entry.replace(/_/g, '-'));
    if (!flatName || claimed.has(`elements/${flatName}`)) continue;
    const slug = `elements/${flatName}`;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(entry),
      ...(domainForName(entry) ? { domain: domainForName(entry) } : {}),
      path: entry,
      evidence: { source: entry },
    });
  }
  return out;
}

export function detectPythonImportBoundaryElements(
  rootPath,
  {
    ignore,
    domainForName,
    existingElements,
    rootPythonPackages,
    sourcePythonPackages = [],
    imports,
    skipped,
  },
) {
  const pythonPackages = [...rootPythonPackages, ...sourcePythonPackages];
  if (pythonPackages.length === 0 || !imports) return [];

  const scores = new Map();
  const neighbors = new Map();
  for (const edge of imports.moduleEdges) {
    if (!edge.from.startsWith('elements/') || !edge.to.startsWith('elements/')) {
      continue;
    }
    for (const [slug, neighbor] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      scores.set(slug, (scores.get(slug) ?? 0) + edge.count);
      const adjacent = neighbors.get(slug) ?? new Set();
      adjacent.add(neighbor);
      neighbors.set(slug, adjacent);
    }
  }

  const pathCandidates = new Map();
  for (const packageElement of pythonPackages) {
    const packagePath = join(rootPath, packageElement.path);
    let entries;
    try {
      entries = readdirSync(packagePath).sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === '__init__.py' || ignore.has(entry) || entry.startsWith('.')) {
        continue;
      }
      const path = join(packagePath, entry);
      let isModuleBoundary = false;
      try {
        if (!pathResolvesInsideRoot(rootPath, path)) continue;
        if (statSync(path).isFile() && entry.endsWith('.py')) {
          isModuleBoundary = true;
        } else if (
          statSync(path).isDirectory() &&
          existsSync(join(path, '__init__.py')) &&
          pathResolvesInsideRoot(rootPath, join(path, '__init__.py'))
        ) {
          isModuleBoundary = true;
        }
      } catch {
        continue;
      }
      if (!isModuleBoundary) continue;
      const name = entry.endsWith('.py') ? entry.slice(0, -3) : entry;
      const flatName = slugify(name.replace(/_/g, '-'));
      if (!flatName) continue;
      const slug = `elements/${flatName}`;
      const candidates = pathCandidates.get(slug) ?? [];
      candidates.push(relative(rootPath, path));
      pathCandidates.set(slug, candidates);
    }
  }

  const claimed = new Set(existingElements.map((element) => element.slug));
  const riskPathCandidates = new Map();
  for (const source of new Set(
    imports.edges.flatMap((edge) => [edge.from, edge.to]),
  )) {
    if (!source.endsWith('.py') || source.endsWith('/__init__.py')) continue;
    if (!pythonPackages.some((row) => source.startsWith(`${row.path}/`))) {
      continue;
    }
    const relativeParts = source.split('/');
    if (relativeParts.length < 3) continue;
    const fileName = relativeParts.at(-1).slice(0, -3);
    const priority = pythonRiskEndpointPriority(fileName);
    if (priority === 0) continue;
    const flatName = slugify(
      fileName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-'),
    );
    if (!flatName) continue;
    const slug = `elements/${flatName}`;
    const paths = riskPathCandidates.get(slug) ?? [];
    paths.push({ path: source, priority });
    riskPathCandidates.set(slug, paths);
  }
  const ranked = [...scores.keys()]
    .filter((slug) => !claimed.has(slug))
    .sort((a, b) => {
      const degreeDelta = (neighbors.get(b)?.size ?? 0) - (neighbors.get(a)?.size ?? 0);
      if (degreeDelta !== 0) return degreeDelta;
      const weightDelta = (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
      return weightDelta !== 0 ? weightDelta : a.localeCompare(b);
    });
  const admissible = ranked.filter((slug) => {
    const paths = pathCandidates.get(slug) ?? [];
    if (paths.length === 1) return true;
    if (paths.length > 1) {
      pushSkippedOnce(skipped, {
        path: paths.join(', '),
        reason: `python-import-element-skip: ambiguous module slug ${slug}`,
      });
    }
    return false;
  });
  const riskAdmissible = [...riskPathCandidates]
    .filter(([slug, paths]) => {
      if (claimed.has(slug)) return false;
      const directPaths = pathCandidates.get(slug) ?? [];
      if (paths.length === 1 && directPaths.length === 0) return true;
      pushSkippedOnce(skipped, {
        path: [...directPaths, ...paths.map((row) => row.path)].join(', '),
        reason: `python-import-element-skip: ambiguous module slug ${slug}`,
      });
      return false;
    })
    .map(([slug, [candidate]]) => ({ slug, ...candidate }))
    .sort((a, b) => b.priority - a.priority || a.slug.localeCompare(b.slug));
  const selectedRisk = riskAdmissible.slice(0, PYTHON_IMPORT_RISK_ELEMENT_LIMIT);
  const selectedRiskSlugs = new Set(selectedRisk.map((row) => row.slug));
  const selected = [
    ...selectedRisk,
    ...admissible
      .filter((slug) => !selectedRiskSlugs.has(slug))
      .slice(0, PYTHON_IMPORT_ELEMENT_LIMIT - selectedRisk.length)
      .map((slug) => ({ slug, path: pathCandidates.get(slug)[0] })),
  ];
  const candidateCount = new Set([
    ...riskAdmissible.map((row) => row.slug),
    ...admissible,
  ]).size;
  const omitted = Math.max(0, candidateCount - selected.length);
  if (omitted > 0) {
    pushSkippedOnce(skipped, {
      path: rootPath,
      reason: `python-import-element-limit: omitted ${omitted} lower-ranked boundaries`,
    });
  }
  return selected
    .map(({ slug, path }) => {
      const name = slug.slice('elements/'.length);
      claimed.add(slug);
      return {
        slug,
        title: humanize(name),
        ...(domainForName(name) ? { domain: domainForName(name) } : {}),
        path,
        evidence: { source: path },
      };
    });
}

function pythonRiskEndpointPriority(fileName) {
  const normalized = fileName.replace(/[_-]/g, '').toLowerCase();
  if (normalized.includes('security')) return 100;
  if (normalized.includes('authorization') || normalized.includes('authentication')) {
    return 90;
  }
  if (normalized.includes('permission') || normalized.includes('credential')) return 80;
  if (normalized.includes('policy') || normalized.includes('encryption')) return 70;
  return 0;
}

export function analyzeImportsForElementEvidence(
  rootPath,
  { extraIgnore, skipped, workspaceDiscovery, admittedWorkspacePackages = null },
) {
  try {
    if (
      admittedWorkspacePackages &&
      workspaceDiscovery.packages.length > admittedWorkspacePackages.length
    ) {
      pushSkippedOnce(skipped, {
        path: '.',
        reason:
          `workspace-import-evidence-limit: omitted ${workspaceDiscovery.packages.length - admittedWorkspacePackages.length} ` +
          'declared package roots to match analyzer elements',
      });
    }
    const options = {
      ignore: extraIgnore,
      ...(admittedWorkspacePackages
        ? { workspacePackages: admittedWorkspacePackages }
        : {}),
    };
    return inferImports(rootPath, options);
  } catch (error) {
    pushSkippedOnce(skipped, {
      path: rootPath,
      reason: `import-evidence-skip: ${error.message}`,
    });
    return null;
  }
}

export function detectWorkspaceElements(
  rootPath,
  { ignore, domainForName, skipped, workspaceDiscovery, existingElements = [] },
) {
  if (workspaceDiscovery?.hasDeclaration) {
    const elements = [];
    const admittedWorkspacePackages = [];
    const claimed = new Set(existingElements.map((element) => element.slug));
    const admitted = workspaceDiscovery.packages.slice(0, WORKSPACE_ELEMENT_LIMIT);
    const omitted = Math.max(0, workspaceDiscovery.packages.length - admitted.length);
    if (omitted > 0) {
      pushSkippedOnce(skipped, {
        path: '.',
        reason: `workspace-element-limit: omitted ${omitted} declared package elements`,
      });
    }
    for (const workspacePackage of admitted) {
      const slug = `elements/${workspacePackage.slug}`;
      if (claimed.has(slug)) {
        pushSkippedOnce(skipped, {
          path: workspacePackage.path,
          reason: `workspace-element-skip: duplicate implementation slug ${slug}`,
        });
        continue;
      }
      claimed.add(slug);
      elements.push({
        slug,
        title: humanize(workspacePackage.slug),
        path: workspacePackage.path,
        evidence: { source: workspacePackage.path },
      });
      admittedWorkspacePackages.push(workspacePackage);
    }
    return { elements, packages: admittedWorkspacePackages };
  }
  const elements = [];
  for (const folder of WORKSPACE_FOLDERS) {
    const workspaceRoot = join(rootPath, folder);
    if (ignore.has(folder)) {
      if (existsSync(workspaceRoot)) {
        skipped.push({ path: workspaceRoot, reason: 'dotfile/ignore' });
      }
      continue;
    }
    if (!existsSync(workspaceRoot) || !statSync(workspaceRoot).isDirectory()) {
      continue;
    }
    for (const entry of readdirSync(workspaceRoot).sort()) {
      const memberPath = join(workspaceRoot, entry);
      if (ignore.has(entry) || entry.startsWith('.')) {
        skipped.push({ path: memberPath, reason: 'dotfile/ignore' });
        continue;
      }
      if (!statSync(memberPath).isDirectory()) continue;
      if (!existsSync(join(memberPath, 'package.json'))) continue;
      const source = relative(rootPath, memberPath);
      // Flat slugs — the workspace member name is the role name. When apps/foo and
      // packages/foo collide, the folder prefix splits them and avoids a tail collision.
      const flatName = elements.some((el) => el.slug === `elements/${entry}`)
        ? `${folder}-${entry}`
        : entry;
      elements.push({
        slug: `elements/${flatName}`,
        title: humanize(entry),
        ...(domainForName(entry) ? { domain: domainForName(entry) } : {}),
        path: source,
        evidence: { source },
      });
    }
  }
  return { elements, packages: null };
}

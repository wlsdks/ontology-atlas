import { existsSync } from '../confined-source-fs.mjs';
import { join, extname } from 'node:path';
import { RUST_SOURCE_EXTENSION, SOURCE_EXT } from './source-files.mjs';

const SUPPORT_ELEMENT_BUCKETS = new Set([
  'app',
  'apps',
  'domain',
  'domains',
  'helper',
  'helpers',
  'integration',
  'integrations',
  'infra',
  'infrastructure',
  'lib',
  'libs',
  'report',
  'reports',
  'shared',
  'storage',
  'store',
  'stores',
  'util',
  'utils',
]);

export function moduleOf(filePath, sourceFolders, rootPath, workspacePackages = []) {
  // `filePath` is rootPath-relative: the segment after a source folder is the
  // module. Slugs match analyze_repo_structure's
  // (`capabilities/X`, `elements/<flat-name>`) so evidence reconciles with its concepts: flat
  // (`docs/DECISIONS.md`), with a layer suffix only on a cross-layer collision.
  const parts = filePath.split(/[\\/]/);
  if (!SOURCE_EXT.has(extname(parts.at(-1) ?? ''))) return null;
  const workspacePackage = workspacePackageForFile(filePath, workspacePackages);
  if (workspacePackage) return `elements/${workspacePackage.slug}`;
  if (
    parts.length >= 3 &&
    sourceFolderStartsAt(parts[0], sourceFolders) &&
    existsSync(join(rootPath, parts[0], parts[1], '__init__.py'))
  ) {
    // `src/<python-package>/...`: the first module inside the package is treated
    // like a root package, or cross-file imports collapse into one self-edge.
    const modulePart = parts[2];
    const rawName = modulePart === '__init__.py'
      ? parts[1]
      : stripSourceExtension(modulePart);
    const flatName = rawName
      .replace(/_/g, '-')
      .replace(/[^A-Za-z0-9-]/g, '')
      .toLowerCase();
    return flatName ? `elements/${flatName}` : null;
  }
  if (
    parts.length >= 2 &&
    existsSync(join(rootPath, parts[0], '__init__.py'))
  ) {
    const modulePart = parts[1];
    const rawName = modulePart === '__init__.py'
      ? parts[0]
      : stripSourceExtension(modulePart);
    const flatName = rawName
      .replace(/_/g, '-')
      .replace(/[^A-Za-z0-9-]/g, '')
      .toLowerCase();
    return flatName ? `elements/${flatName}` : null;
  }
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (i !== 0) continue;
    if (sourceFolderStartsAt(parts[i], sourceFolders)) {
      const next = parts[i + 1];
      const sourceExtension = extname(parts.at(-1) ?? '');
      if (!SOURCE_EXT.has(sourceExtension)) return null;
      if (sourceExtension === RUST_SOURCE_EXTENSION) {
        const rustModuleName = ontologySourceName(next);
        return rustModuleName ? `elements/${rustModuleName}` : null;
      }
      if (
        (parts[i] === 'apps' || parts[i] === 'packages') &&
        existsSync(join(rootPath, parts[i], next, 'package.json'))
      ) {
        // Same collision rule as analyze: apps keeps the bare name.
        const collidesWithApps =
          parts[i] === 'packages' &&
          existsSync(join(rootPath, 'apps', next, 'package.json'));
        return `elements/${collidesWithApps ? `packages-${next}` : next}`;
      }
      // analyze slugs these by the inner name under capabilities/.
      const capabilityBuckets = new Set(['features']);
      if (capabilityBuckets.has(next) && parts[i + 2]) {
        return `capabilities/${ontologySourceName(parts[i + 2])}`;
      }
      const elementBuckets = ['entities', 'widgets', 'views'];
      if (elementBuckets.includes(next) && parts[i + 2]) {
        const name = ontologySourceName(parts[i + 2]);
        const collides =
          elementBuckets.filter((bucket) =>
            existsSync(join(rootPath, parts[i], bucket, name)),
          ).length > 1;
        const layerSingular = next.replace(/ies$/, 'y').replace(/s$/, '');
        return `elements/${collides ? `${name}-${layerSingular}` : name}`;
      }
      // Single-file layered apps: `src/features/check-in.js` is a capability, while
      // support layers (`src/domain/habit.js`, `src/storage/json-store.js`) are
      // elements; treating every folder as a capability yields `capabilities/storage`.
      if (next === 'features' && parts[i + 2]) {
        return `capabilities/${ontologySourceName(parts[i + 2])}`;
      }
      if (isSupportElementBucket(next) && parts[i + 2]) {
        // The basename is the role name; the location is in the evidence.
        return `elements/${ontologySourceName(parts[parts.length - 1])}`;
      }
      if (SOURCE_EXT.has(extname(next))) {
        const flatName = ontologySourceName(next);
        return flatName ? `elements/${flatName}` : null;
      }
      // A `lib/` tree is a library boundary, not a feature namespace: its edges stay
      // useful for review while capability meaning is left to product evidence.
      if (parts[i] === 'lib') {
        const flatName = ontologySourceName(next);
        return flatName ? `elements/${flatName}` : null;
      }
      return `capabilities/${next}`;
    }
  }
  return null;
}

function workspacePackageForFile(filePath, workspacePackages) {
  return [...workspacePackages]
    .filter((workspacePackage) =>
      filePath === workspacePackage.path || filePath.startsWith(`${workspacePackage.path}/`),
    )
    .sort((a, b) => b.path.length - a.path.length || a.path.localeCompare(b.path))[0] ?? null;
}

function isSupportElementBucket(segment) {
  return SUPPORT_ELEMENT_BUCKETS.has(segment);
}

function sourceFolderStartsAt(segment, sourceFolders) {
  return sourceFolders.some(
    (folder) => folder.split(/[\\/]/).filter(Boolean)[0] === segment,
  );
}

function stripSourceExtension(segment) {
  for (const ext of SOURCE_EXT) {
    if (segment.endsWith(ext)) return segment.slice(0, -ext.length);
  }
  return segment;
}

function ontologySourceName(segment) {
  return stripSourceExtension(segment)
    .replace(/\.(?:test|spec)$/i, '')
    .replace(/[_\s.]+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .toLowerCase();
}

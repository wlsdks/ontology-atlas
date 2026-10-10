import {
  readFileSync,
  readdirSync,
  statSync,
  lstatSync,
  existsSync,
} from '../confined-source-fs.mjs';
import { join, dirname, resolve, relative, extname, sep } from 'node:path';
import { pathResolvesInsideRoot } from './path-confinement.mjs';
import { zeroCounts } from './zero-counts.mjs';

const GO_IMPORT_TEXT_MAX_BYTES = 256 * 1024;
const GO_IMPORTS_PER_FILE_LIMIT = 256;
const GO_PACKAGE_EDGE_EVIDENCE_LIMIT = 5;
export const GO_SOURCE_EXTENSION = '.go';

export function inferGoPackageImports(rootPath, ignore, maxFiles, scopedFolders = null, countKeys) {
  const rootModule = readRootGoModule(rootPath);
  if (!rootModule) return null;
  const receipt = {
    contract: 'goPackageImports:v1',
    modulePath: rootModule.modulePath,
    sourceQualification: 'observed_bounded_go_package_imports_not_runtime_or_semantic_impact',
    writeAllowed: false,
    filesScanned: 0,
    fileScanLimited: false,
    perFileByteLimit: GO_IMPORT_TEXT_MAX_BYTES,
    perFileImportLimit: GO_IMPORTS_PER_FILE_LIMIT,
    skipped: rootModule.skipped,
    limitations: [
      'External Go modules are not included in local package import evidence.',
      'Nested Go modules and go.work workspaces are not scanned.',
      'Observed imports are bounded static source evidence, not runtime execution or semantic depends_on approval.',
    ],
    packageImports: [],
    moduleEdges: [],
  };
  if (maxFiles <= 0) {
    receipt.fileScanLimited = true;
    return receipt;
  }

  const fileScan = listRootGoSourceFiles(rootPath, ignore, maxFiles, scopedFolders);
  receipt.filesScanned = fileScan.files.length;
  receipt.fileScanLimited = fileScan.fileScanLimited;
  for (const file of fileScan.files) {
    const fromFile = relative(rootPath, file).replaceAll('\\', '/');
    let size;
    try {
      size = statSync(file).size;
    } catch {
      receipt.skipped.push({ file: fromFile, reason: 'go-import-skip: unreadable source file' });
      continue;
    }
    if (size > GO_IMPORT_TEXT_MAX_BYTES) {
      receipt.skipped.push({
        file: fromFile,
        reason: `go-import-skip: exceeds ${GO_IMPORT_TEXT_MAX_BYTES} byte limit`,
      });
      continue;
    }
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      receipt.skipped.push({ file: fromFile, reason: 'go-import-skip: unreadable source file' });
      continue;
    }
    const fromPackage = goPackageDirectoryPath(rootPath, dirname(file));
    if (!fromPackage) continue;
    const parsed = parseGoImports(content);
    if (parsed.limited) {
      receipt.skipped.push({
        file: fromFile,
        reason: `go-import-skip: import limit ${GO_IMPORTS_PER_FILE_LIMIT} reached`,
      });
    }
    for (const parsedImport of parsed.imports) {
      const targetDirectory = resolveGoModuleLocalPackage(
        rootPath,
        rootModule.modulePath,
        parsedImport.importSpec,
      );
      if (!targetDirectory) continue;
      const toPackage = goPackageDirectoryPath(rootPath, targetDirectory);
      if (!toPackage || !directoryHasProductionGoSource(rootPath, targetDirectory)) continue;
      receipt.packageImports.push({
        fromFile,
        fromPackage,
        toPackage,
        importSpec: parsedImport.importSpec,
        kind: parsedImport.alias === '_' ? 'side' : 'static',
        sourceRole: goSourceRoleOf(fromFile),
        importUsage: 'value',
      });
    }
  }

  receipt.skipped.sort(compareGoSkippedFile);
  receipt.packageImports.sort(compareGoPackageImportEvidence);
  receipt.moduleEdges = collapseGoPackageImports(receipt.packageImports, countKeys);
  return receipt;
}

function readRootGoModule(rootPath) {
  const goModPath = join(rootPath, 'go.mod');
  if (!existsSync(goModPath)) return null;
  try {
    const goModStat = lstatSync(goModPath);
    if (goModStat.isSymbolicLink() || !goModStat.isFile() || !pathResolvesInsideRoot(rootPath, goModPath)) {
      return null;
    }
    if (goModStat.size > GO_IMPORT_TEXT_MAX_BYTES) {
      return null;
    }
    const moduleLine = readFileSync(goModPath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.replace(/\s*\/\/.*$/, ''))
      .find((line) => /^\s*module\s+\S+\s*$/.test(line));
    const modulePath = moduleLine?.trim().split(/\s+/)[1] ?? null;
    return isSafeGoModulePath(modulePath) ? { modulePath, skipped: [] } : null;
  } catch {
    return null;
  }
}

function isSafeGoModulePath(modulePath) {
  if (typeof modulePath !== 'string' || !modulePath || modulePath.startsWith('/') || modulePath.includes('\\')) {
    return false;
  }
  return modulePath.split('/').every((segment) => segment && segment !== '.' && segment !== '..' && !segment.includes('\0'));
}

function listRootGoSourceFiles(rootPath, ignore, maxFiles, scopedFolders = null) {
  const files = [];
  const detectionLimit = maxFiles + 1;
  const visit = (directory) => {
    if (files.length >= detectionLimit) return;
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        files.length >= detectionLimit ||
        ignore.has(entry) ||
        entry.startsWith('.') ||
        entry.startsWith('_') ||
        entry === 'vendor' ||
        entry === 'testdata'
      ) continue;
      const path = join(directory, entry);
      let pathStat;
      try {
        pathStat = lstatSync(path);
      } catch {
        continue;
      }
      if (pathStat.isSymbolicLink() || !pathResolvesInsideRoot(rootPath, path)) continue;
      if (pathStat.isDirectory()) {
        if (hasNestedGoModule(rootPath, path)) continue;
        visit(path);
      } else if (pathStat.isFile() && extname(entry) === GO_SOURCE_EXTENSION) {
        if(scopedFolders&&!scopedFolders.some(folder=>{const start=resolve(rootPath,folder);return path===start||path.startsWith(start+sep);}))continue;
        files.push(path);
      }
    }
  };
  visit(rootPath);
  return {
    files: files.slice(0, maxFiles),
    fileScanLimited: files.length > maxFiles,
  };
}

function parseGoImports(content) {
  const imports = [];
  let inGroup = false;
  for (const line of goCodeLines(content)) {
    if (inGroup) {
      if (/^\s*\)\s*$/.test(line)) {
        inGroup = false;
        continue;
      }
      const grouped = parseGoImportSpec(line);
      if (grouped && !appendGoImport(imports, grouped)) return { imports, limited: true };
      continue;
    }
    if (/^\s*import\s*\(\s*$/.test(line)) {
      inGroup = true;
      continue;
    }
    const single = line.match(/^\s*import\s+(.+)$/)?.[1];
    const parsed = single ? parseGoImportSpec(single) : null;
    if (parsed && !appendGoImport(imports, parsed)) return { imports, limited: true };
  }
  return { imports, limited: false };
}

function appendGoImport(imports, parsedImport) {
  if (imports.length >= GO_IMPORTS_PER_FILE_LIMIT) return false;
  imports.push(parsedImport);
  return true;
}

function parseGoImportSpec(value) {
  const match = value.match(/^\s*(?:([_A-Za-z][_A-Za-z0-9]*|\.)\s+)?(?:"([^"\\\r\n]+)"|`([^`\r\n]+)`)\s*$/);
  if (!match) return null;
  return { alias: match[1] ?? null, importSpec: match[2] ?? match[3] };
}

function goCodeLines(content) {
  const lines = [];
  let inBlockComment = false;
  let inRawString = false;
  for (const rawLine of content.split(/\r?\n/)) {
    let line = '';
    let startIndex = 0;
    if (inRawString) {
      const rawStringEnd = rawLine.indexOf('`');
      if (rawStringEnd === -1) {
        lines.push('');
        continue;
      }
      inRawString = false;
      line = '__raw_string__';
      startIndex = rawStringEnd + 1;
    }
    let quote = null;
    let escaped = false;
    for (let index = startIndex; index < rawLine.length; index += 1) {
      if (inBlockComment) {
        const end = rawLine.indexOf('*/', index);
        if (end === -1) {
          index = rawLine.length;
          break;
        }
        index = end + 1;
        inBlockComment = false;
        continue;
      }
      const pair = rawLine.slice(index, index + 2);
      const character = rawLine[index];
      if (!quote && pair === '//') break;
      if (!quote && pair === '/*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
      if (!quote && character === '`') {
        const rawStringEnd = rawLine.indexOf('`', index + 1);
        if (rawStringEnd === -1) {
          inRawString = true;
          break;
        }
        line += rawLine.slice(index, rawStringEnd + 1);
        index = rawStringEnd;
        continue;
      }
      line += character;
      if (escaped) {
        escaped = false;
      } else if (quote && character === '\\') {
        escaped = true;
      } else if (quote && character === quote) {
        quote = null;
      } else if (!quote && ['"', '\''].includes(character)) {
        quote = character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function resolveGoModuleLocalPackage(rootPath, modulePath, importSpec) {
  if (importSpec !== modulePath && !importSpec.startsWith(`${modulePath}/`)) return null;
  const suffix = importSpec === modulePath ? '' : importSpec.slice(modulePath.length + 1);
  const segments = suffix ? suffix.split('/') : [];
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  const targetDirectory = resolve(rootPath, ...segments);
  if (!isRealRootDirectory(rootPath, targetDirectory)) return null;
  if (hasNestedGoModule(rootPath, targetDirectory)) return null;
  return targetDirectory;
}

function goPackageDirectoryPath(rootPath, directory) {
  if (!isRealRootDirectory(rootPath, directory) || hasNestedGoModule(rootPath, directory)) return null;
  const directoryPath = relative(rootPath, directory).replaceAll('\\', '/');
  if (directoryPath === '') return '.';
  if (directoryPath === '..' || directoryPath.startsWith('../') || directoryPath.includes('/../')) return null;
  return directoryPath;
}

function isRealRootDirectory(rootPath, directory) {
  try {
    return lstatSync(directory).isDirectory() &&
      !lstatSync(directory).isSymbolicLink() &&
      pathResolvesInsideRoot(rootPath, directory);
  } catch {
    return false;
  }
}

function hasNestedGoModule(rootPath, directory) {
  const root = resolve(rootPath);
  let current = resolve(directory);
  while (current !== root) {
    const marker = join(current, 'go.mod');
    try {
      if (lstatSync(marker)) return true;
    } catch {
      // No module marker at this level.
    }
    const parent = dirname(current);
    if (parent === current) return true;
    current = parent;
  }
  return false;
}

function directoryHasProductionGoSource(rootPath, directory) {
  let entries;
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return false;
  }
  return entries.some((entry) => {
    if (extname(entry) !== GO_SOURCE_EXTENSION || entry.endsWith('_test.go')) return false;
    const path = join(directory, entry);
    try {
      return lstatSync(path).isFile() &&
        !lstatSync(path).isSymbolicLink() &&
        pathResolvesInsideRoot(rootPath, path);
    } catch {
      return false;
    }
  });
}

function goSourceRoleOf(filePath) {
  return filePath.endsWith('_test.go') ? 'test' : 'production';
}

function collapseGoPackageImports(imports, countKeys) {
  const buckets = new Map();
  for (const receipt of imports) {
    const key = `${receipt.fromPackage}\u0000${receipt.toPackage}`;
    const bucket = buckets.get(key) ?? {
      fromPackage: receipt.fromPackage,
      toPackage: receipt.toPackage,
      count: 0,
      kindCounts: new Map(),
      sourceRoleCounts: zeroCounts(countKeys.sourceRoles),
      importUsageCounts: zeroCounts(countKeys.usages),
      productValueCount: 0,
      evidence: [],
    };
    bucket.count += 1;
    bucket.kindCounts.set(receipt.kind, (bucket.kindCounts.get(receipt.kind) ?? 0) + 1);
    bucket.sourceRoleCounts[receipt.sourceRole] += 1;
    bucket.importUsageCounts[receipt.importUsage] += 1;
    if (receipt.sourceRole === 'production' && receipt.importUsage === 'value') {
      bucket.productValueCount += 1;
    }
    bucket.evidence.push(receipt);
    bucket.evidence.sort(compareGoPackageImportEvidence);
    bucket.evidence.splice(GO_PACKAGE_EDGE_EVIDENCE_LIMIT);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({
      fromPackage: bucket.fromPackage,
      toPackage: bucket.toPackage,
      count: bucket.count,
      kindCounts: Object.fromEntries([...bucket.kindCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
      sourceRoleCounts: bucket.sourceRoleCounts,
      importUsageCounts: bucket.importUsageCounts,
      productValueCount: bucket.productValueCount,
      evidence: bucket.evidence,
      evidenceLimited: bucket.count > bucket.evidence.length,
    }))
    .sort((a, b) =>
      b.count - a.count ||
      a.fromPackage.localeCompare(b.fromPackage) ||
      a.toPackage.localeCompare(b.toPackage),
    );
}

function compareGoPackageImportEvidence(a, b) {
  const priority = (row) => row.sourceRole === 'production' && row.importUsage === 'value' ? 0 : 1;
  return priority(a) - priority(b) ||
    a.fromFile.localeCompare(b.fromFile) ||
    a.toPackage.localeCompare(b.toPackage) ||
    a.importSpec.localeCompare(b.importSpec) ||
    a.kind.localeCompare(b.kind);
}

function compareGoSkippedFile(a, b) {
  return a.file.localeCompare(b.file) || a.reason.localeCompare(b.reason);
}

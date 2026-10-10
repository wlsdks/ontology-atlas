import { readdirSync, lstatSync, existsSync } from '../confined-source-fs.mjs';
import { join, dirname, relative } from 'node:path';
import { pathResolvesInsideRoot } from './path-confinement.mjs';
import { isIgnoredPath } from './source-files.mjs';
import { sourceRoleOf } from './source-role.mjs';

export function discoverRootPythonPackages(rootPath, ignore) {
  let entries;
  try {
    entries = readdirSync(rootPath).sort();
  } catch {
    return [];
  }
  return entries
    .filter(
      (entry) =>
        !ignore.has(entry) &&
        !['test', 'tests'].includes(entry.toLowerCase()) &&
        !entry.startsWith('.'),
    )
    .map((entry) => join(rootPath, entry))
    .filter((path) => {
      try {
        return !lstatSync(path).isSymbolicLink() &&
          lstatSync(path).isDirectory() &&
          existsSync(join(path, '__init__.py')) &&
          !lstatSync(join(path, '__init__.py')).isSymbolicLink();
      } catch {
        return false;
      }
    });
}

export function parsePythonImports(content) {
  const imports = [];
  let typeCheckingIndent = null;
  for (const logicalLine of pythonLogicalLines(content)) {
    const line = logicalLine.text;
    if (!line) continue;
    if (typeCheckingIndent !== null && logicalLine.indent <= typeCheckingIndent) {
      typeCheckingIndent = null;
    }
    if (/^if\s+\(?(?:typing\.)?TYPE_CHECKING\)?\s*:/.test(line)) {
      typeCheckingIndent = logicalLine.indent;
      continue;
    }
    const importUsage =
      typeCheckingIndent !== null && logicalLine.indent > typeCheckingIndent
        ? 'type_only'
        : 'value';
    const fromMatch = line.match(
      /^from\s+([A-Za-z_][\w.]*|\.+[\w.]*)\s+import\s+(.+)$/,
    );
    if (fromMatch) {
      imports.push({
        module: fromMatch[1],
        names: pythonImportedNames(fromMatch[2]),
        importUsage,
      });
      continue;
    }
    const importMatch = line.match(/^import\s+(.+)$/);
    if (!importMatch) continue;
    for (const item of importMatch[1].split(',')) {
      const moduleName = item.trim().split(/\s+as\s+/i)[0]?.trim();
      if (moduleName) imports.push({ module: moduleName, names: [], importUsage });
    }
  }
  return imports;
}

function pythonImportedNames(value) {
  return value
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((item) => item.trim().split(/\s+as\s+/i)[0]?.trim())
    .filter((item) => item && item !== '*');
}

function pythonLogicalLines(content) {
  const lines = [];
  let buffer = '';
  let bufferIndent = 0;
  let parenthesisDepth = 0;
  let tripleQuote = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const code = stripPythonStringsAndComment(rawLine, {
      get tripleQuote() { return tripleQuote; },
      set tripleQuote(value) { tripleQuote = value; },
    });
    const continued = /\\\s*$/.test(code);
    const fragment = code.replace(/\\\s*$/, '').trim();
    if (fragment) {
      if (!buffer) bufferIndent = rawLine.match(/^[\t ]*/)?.[0].length ?? 0;
      buffer = buffer ? `${buffer} ${fragment}` : fragment;
    }
    parenthesisDepth += [...code].reduce(
      (depth, character) =>
        character === '(' ? depth + 1 : character === ')' ? depth - 1 : depth,
      0,
    );
    if (!tripleQuote && parenthesisDepth <= 0 && !continued) {
      if (buffer) lines.push({ text: buffer, indent: bufferIndent });
      buffer = '';
      bufferIndent = 0;
      parenthesisDepth = 0;
    }
  }
  if (!tripleQuote && buffer) lines.push({ text: buffer, indent: bufferIndent });
  return lines;
}

function stripPythonStringsAndComment(line, state) {
  let result = '';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    if (state.tripleQuote) {
      const closingIndex = line.indexOf(state.tripleQuote, index);
      if (closingIndex < 0) return result;
      index = closingIndex + state.tripleQuote.length - 1;
      state.tripleQuote = null;
      continue;
    }
    const triple = line.slice(index, index + 3);
    if (!quote && (triple === '"""' || triple === "'''")) {
      state.tripleQuote = triple;
      index += 2;
      continue;
    }
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (!quote && character === '#') break;
    if (!quote) result += character;
  }
  return result;
}

export function classifyPythonImport(
  pythonImport,
  file,
  rootPath,
  edges,
  external,
  unresolved,
  ignore,
  sourceFolders,
  pythonEdgeKeys,
) {
  const moduleSpec = resolvePythonRelativeModule(
    pythonImport.module,
    file,
    rootPath,
  );
  if (!moduleSpec) {
    unresolved.push({
      from: relative(rootPath, file),
      spec: pythonImport.module,
      reason: 'relative-not-found',
    });
    return;
  }
  const baseTarget = resolvePythonModule(moduleSpec, rootPath, sourceFolders);
  const targets = pythonImport.names.length > 0
    ? pythonImport.names
        .map(
          (name) =>
            resolvePythonModule(`${moduleSpec}.${name}`, rootPath, sourceFolders) ?? baseTarget,
        )
        .filter(Boolean)
    : baseTarget
      ? [baseTarget]
      : [];
  if (targets.length > 0) {
    const from = relative(rootPath, file);
    for (const target of targets) {
      const targetPath = relative(rootPath, target);
      if (isIgnoredPath(targetPath, ignore)) continue;
      // Hash membership keeps Python edge deduplication O(E) across the scan.
      const key = `${from}\0${targetPath}`;
      if (!pythonEdgeKeys.has(key)) {
        pythonEdgeKeys.add(key);
        edges.push({
          from,
          to: targetPath,
          kind: 'static',
          sourceRole: sourceRoleOf(from),
          importUsage: pythonImport.importUsage ?? 'unknown',
        });
      }
    }
    return;
  }
  const topLevel = moduleSpec.split('.')[0];
  if (resolvePythonModule(topLevel, rootPath, sourceFolders)) {
    unresolved.push({
      from: relative(rootPath, file),
      spec: pythonImport.module,
      reason: 'alias-not-found',
    });
  } else {
    external.push({ from: relative(rootPath, file), spec: pythonImport.module });
  }
}

function resolvePythonRelativeModule(spec, file, rootPath) {
  if (!spec.startsWith('.')) return spec;
  const leadingDots = spec.match(/^\.+/)?.[0].length ?? 0;
  const suffix = spec.slice(leadingDots);
  const fromParts = relative(rootPath, dirname(file)).split(/[\\/]/).filter(Boolean);
  const keep = fromParts.length - Math.max(0, leadingDots - 1);
  if (keep < 0) return null;
  return [...fromParts.slice(0, keep), ...suffix.split('.').filter(Boolean)].join('.');
}

function resolvePythonModule(spec, rootPath, sourceFolders = []) {
  if (!spec || spec.startsWith('.')) return null;
  const sourceRoots = new Set(
    sourceFolders
      .map((folder) => folder.split(/[\\/]/).filter(Boolean)[0])
      .filter(Boolean),
  );
  for (const searchRoot of [rootPath, ...[...sourceRoots].map((folder) => join(rootPath, folder))]) {
    const base = join(searchRoot, ...spec.split('.'));
    const file = `${base}.py`;
    if (
      existsSync(file) &&
      !lstatSync(file).isSymbolicLink() &&
      lstatSync(file).isFile() &&
      pathResolvesInsideRoot(rootPath, file)
    ) return file;
    const packageEntry = join(base, '__init__.py');
    if (
      existsSync(packageEntry) &&
      !lstatSync(packageEntry).isSymbolicLink() &&
      lstatSync(packageEntry).isFile() &&
      pathResolvesInsideRoot(rootPath, packageEntry)
    ) {
      return packageEntry;
    }
  }
  return null;
}

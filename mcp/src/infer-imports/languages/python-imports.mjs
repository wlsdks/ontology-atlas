import { readdirSync, lstatSync, existsSync } from '../confinement/confined-source-fs.mjs';
import { join, dirname, relative } from 'node:path';
import { isIgnoredPath } from '../source-files.mjs';
import { sourceRoleOf } from '../source-role.mjs';

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
    // Every statement below starts with `if`, `from` or `import`.
    const first = line.charCodeAt(0);
    if (first !== 105 && first !== 102) continue;
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
    // An imported name is an identifier; anything else is a list that never closed.
    .filter((item) => item && /^[A-Za-z_]\w*$/.test(item));
}

function pythonLogicalLines(content) {
  const lines = [];
  let buffer = '';
  let bufferIndent = 0;
  let parenthesisDepth = 0;
  const strings = { tripleQuote: null };
  for (const rawLine of content.split(/\r?\n/)) {
    const code = stripPythonStringsAndComment(rawLine, strings);
    const continued = /\\\s*$/.test(code);
    const fragment = (continued ? code.replace(/\\\s*$/, '') : code).trim();
    if (fragment) {
      if (!buffer) bufferIndent = rawLine.match(/^[\t ]*/)?.[0].length ?? 0;
      buffer = buffer ? `${buffer} ${fragment}` : fragment;
    }
    parenthesisDepth += parenthesisDelta(code);
    if (!strings.tripleQuote && parenthesisDepth <= 0 && !continued) {
      if (buffer) lines.push({ text: buffer, indent: bufferIndent });
      buffer = '';
      bufferIndent = 0;
      parenthesisDepth = 0;
    }
  }
  if (!strings.tripleQuote && buffer) lines.push({ text: buffer, indent: bufferIndent });
  return lines;
}

function parenthesisDelta(code) {
  let delta = 0;
  for (let index = 0; index < code.length; index += 1) {
    const character = code.charCodeAt(index);
    if (character === 40) delta += 1;
    else if (character === 41) delta -= 1;
  }
  return delta;
}

/** A line with no quote and no comment, outside a triple-quoted string, is code as written. */
const PLAIN_CODE_LINE = /^[^"'#]*$/;

function stripPythonStringsAndComment(line, state) {
  if (!state.tripleQuote && PLAIN_CODE_LINE.test(line)) return line;
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

/**
 * The file a dotted module names, searched in the root and then in each source
 * folder's first segment: `a.b` is `a/b.py`, else `a/b/__init__.py`, a regular
 * file whose real location is inside the root. One resolver serves one pass, so
 * each distinct module is resolved once and each probe goes through `facts`.
 *
 * @param {string} rootPath
 * @param {string[]} sourceFolders
 * @param {ReturnType<import('../confinement/path-confinement.mjs').createPathFacts>} facts
 * @returns {(spec: string) => string|null} the root-relative file, or null
 */
export function createPythonModuleResolver(rootPath, sourceFolders, facts) {
  const sourceRoots = new Set(
    sourceFolders
      .map((folder) => folder.split(/[\\/]/).filter(Boolean)[0])
      .filter(Boolean),
  );
  const searchRoots = [rootPath, ...[...sourceRoots].map((folder) => join(rootPath, folder))];
  const resolved = new Map();
  return (spec) => {
    if (!spec || spec.startsWith('.')) return null;
    let target = resolved.get(spec);
    if (target !== undefined) return target;
    target = null;
    const parts = spec.split('.');
    for (const searchRoot of searchRoots) {
      const base = join(searchRoot, ...parts);
      const file = `${base}.py`;
      const packageEntry = join(base, '__init__.py');
      const found = facts.isOwnFile(file) ? file : facts.isOwnFile(packageEntry) ? packageEntry : null;
      if (found) {
        target = relative(rootPath, found);
        break;
      }
    }
    resolved.set(spec, target);
    return target;
  };
}

export function classifyPythonImport(
  pythonImport,
  file,
  rootPath,
  edges,
  external,
  unresolved,
  ignore,
  resolvePythonModule,
  pythonEdgeKeys,
) {
  const from = relative(rootPath, file);
  const moduleSpec = resolvePythonRelativeModule(
    pythonImport.module,
    file,
    rootPath,
  );
  if (!moduleSpec) {
    unresolved.push({
      from,
      spec: pythonImport.module,
      reason: 'relative-not-found',
    });
    return;
  }
  const baseTarget = resolvePythonModule(moduleSpec);
  const targets = pythonImport.names.length > 0
    ? pythonImport.names
        .map((name) => resolvePythonModule(`${moduleSpec}.${name}`) ?? baseTarget)
        .filter(Boolean)
    : baseTarget
      ? [baseTarget]
      : [];
  if (targets.length > 0) {
    for (const targetPath of targets) {
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
  if (resolvePythonModule(topLevel)) {
    unresolved.push({
      from,
      spec: pythonImport.module,
      reason: 'alias-not-found',
    });
  } else {
    external.push({ from, spec: pythonImport.module });
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

import { readFileSync, lstatSync, existsSync } from '../confined-source-fs.mjs';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { pathResolvesInsideRoot } from './path-confinement.mjs';
import { RUST_SOURCE_EXTENSION, isIgnoredPath } from './source-files.mjs';
import { sourceRoleOf } from './source-role.mjs';

export const RUST_IMPORT_TEXT_MAX_BYTES = 256 * 1024;
const RUST_DEPENDENCIES_PER_FILE_LIMIT = 256;
const RUST_BUILTIN_CRATE_ROOTS = new Set(['alloc', 'core', 'proc_macro', 'std', 'test']);

export function classifyRustDependencies(
  content,
  file,
  rootPath,
  edges,
  external,
  unresolved,
  ignore,
  packageName,
) {
  const from = relative(rootPath, file).replaceAll('\\', '/');
  const statements = rustDependencyStatements(content);
  const admitted = statements.slice(0, RUST_DEPENDENCIES_PER_FILE_LIMIT);
  if (statements.length > admitted.length) {
    unresolved.push({
      from,
      spec: '<rust-statement-limit>',
      reason: 'unsupported-static-form',
    });
  }

  for (const statement of admitted) {
    const pathModule = statement.match(
      /^#\s*\[\s*path\s*=\s*"([^"\r\n]+)"\s*\]\s*(?:(?:pub(?:\s*\([^)]*\))?)\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)$/s,
    );
    if (pathModule) {
      const resolved = resolveRustLiteralPath(rootPath, dirname(file), pathModule[1]);
      if (resolved) {
        appendRustEdge(edges, rootPath, file, resolved, ignore);
      } else {
        unresolved.push({ from, spec: statement, reason: 'relative-not-found' });
      }
      continue;
    }

    if (/^#\s*\[/.test(statement) && /\bmod\s+[A-Za-z_][A-Za-z0-9_]*$/s.test(statement)) {
      unresolved.push({ from, spec: statement, reason: 'unsupported-static-form' });
      continue;
    }

    const moduleDeclaration = statement.match(
      /^(?:(?:pub(?:\s*\([^)]*\))?)\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)$/s,
    );
    if (moduleDeclaration) {
      const resolved = resolveRustModuleDeclaration(rootPath, file, moduleDeclaration[1]);
      if (resolved) {
        appendRustEdge(edges, rootPath, file, resolved, ignore);
      } else {
        unresolved.push({ from, spec: statement, reason: 'relative-not-found' });
      }
      continue;
    }

    const include = statement.match(/^(include|include_str|include_bytes)!\s*\((.*)\)$/s);
    if (include) {
      const literal = rustExactStringLiteral(include[2]);
      if (!literal) {
        unresolved.push({ from, spec: statement, reason: 'unsupported-static-form' });
        continue;
      }
      const resolved = resolveRustLiteralPath(rootPath, dirname(file), literal);
      if (resolved) {
        appendRustEdge(edges, rootPath, file, resolved, ignore);
      } else {
        unresolved.push({ from, spec: statement, reason: 'relative-not-found' });
      }
      continue;
    }

    const useStatement = statement.match(
      /^(?:(?:pub(?:\s*\([^)]*\))?)\s+)?use\s+(.+)$/s,
    );
    if (!useStatement) continue;
    const useRoots = rustUseRoots(useStatement[1]);
    if (useRoots.length === 0) {
      unresolved.push({ from, spec: statement, reason: 'unsupported-static-form' });
      continue;
    }
    const externalSeen = new Set();
    for (const useRoot of useRoots) {
      const resolved = resolveRustUsePath(rootPath, file, useRoot, packageName);
      if (resolved.status === 'local') {
        appendRustEdge(edges, rootPath, file, resolved.path, ignore);
      } else if (
        resolved.status === 'external' &&
        !RUST_BUILTIN_CRATE_ROOTS.has(resolved.spec) &&
        !externalSeen.has(resolved.spec)
      ) {
        external.push({ from, spec: resolved.spec });
        externalSeen.add(resolved.spec);
      } else if (resolved.status === 'unresolved') {
        unresolved.push({ from, spec: useRoot, reason: resolved.reason });
      }
    }
  }
}

function appendRustEdge(edges, rootPath, file, target, ignore) {
  const from = relative(rootPath, file).replaceAll('\\', '/');
  const to = relative(rootPath, target).replaceAll('\\', '/');
  if (from === to || isIgnoredPath(to, ignore)) return;
  edges.push({
    from,
    to,
    kind: 'static',
    sourceRole: sourceRoleOf(from),
    importUsage: 'value',
  });
}

function rustDependencyStatements(content) {
  const statements = [];
  let buffer = '';
  let index = 0;
  let blockCommentDepth = 0;
  let suppressedDepth = null;
  let braceDepth = 0;
  let useTreeDepth = 0;
  let quote = null;
  let rawHashes = null;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (blockCommentDepth > 0) {
      if (char === '/' && next === '*') {
        blockCommentDepth += 1;
        index += 2;
      } else if (char === '*' && next === '/') {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (rawHashes !== null) {
      buffer += char;
      if (char === '"' && content.slice(index + 1, index + 1 + rawHashes) === '#'.repeat(rawHashes)) {
        buffer += '#'.repeat(rawHashes);
        index += rawHashes + 1;
        rawHashes = null;
      } else {
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      buffer += char;
      if (char === '\\') {
        if (next !== undefined) buffer += next;
        index += 2;
      } else {
        index += 1;
        if (char === quote) quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      index = content.indexOf('\n', index + 2);
      if (index === -1) break;
      buffer += ' ';
      continue;
    }
    if (char === '/' && next === '*') {
      blockCommentDepth = 1;
      index += 2;
      buffer += ' ';
      continue;
    }
    const raw = content.slice(index).match(/^r(#{0,255})"/);
    if (raw) {
      buffer += raw[0];
      rawHashes = raw[1].length;
      index += raw[0].length;
      continue;
    }
    if (char === '"') {
      quote = char;
      buffer += char;
      index += 1;
      continue;
    }
    if (char === '{') {
      const prefix = buffer.trim();
      if (
        useTreeDepth > 0 ||
        /^(?:(?:pub(?:\s*\([^)]*\))?)\s+)?use\s+[\s\S]*::$/.test(prefix)
      ) {
        useTreeDepth += 1;
        buffer += char;
        index += 1;
        continue;
      }
      braceDepth += 1;
      if (
        suppressedDepth === null &&
        (
          /!\s*$/.test(prefix) ||
          /\bmacro_rules!\s+[A-Za-z_][A-Za-z0-9_]*\s*$/.test(prefix) ||
          /(?:^|\s)(?:(?:pub(?:\s*\([^)]*\))?)\s+)?mod\s+[A-Za-z_][A-Za-z0-9_]*\s*$/s.test(prefix) ||
          /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\][\s\S]*\bmod\s+tests\s*$/.test(prefix)
        )
      ) suppressedDepth = braceDepth;
      buffer = '';
      index += 1;
      continue;
    }
    if (char === '}') {
      if (useTreeDepth > 0) {
        useTreeDepth -= 1;
        buffer += char;
        index += 1;
        continue;
      }
      braceDepth = Math.max(0, braceDepth - 1);
      if (suppressedDepth !== null && braceDepth < suppressedDepth) suppressedDepth = null;
      buffer = '';
      index += 1;
      continue;
    }
    if (char === ';') {
      if (suppressedDepth === null && buffer.trim()) statements.push(buffer.trim());
      buffer = '';
      index += 1;
      continue;
    }
    if (suppressedDepth === null) buffer += char;
    index += 1;
  }
  return statements.filter((statement) =>
    /^(?:#\s*\[|(?:(?:pub(?:\s*\([^)]*\))?)\s+)?(?:use|mod)\b|include(?:_str|_bytes)?!)/s.test(statement),
  );
}

function rustExactStringLiteral(argument) {
  const trimmed = argument.trim();
  const normal = trimmed.match(/^"((?:[^"\\]|\\.)*)"$/s);
  if (normal) {
    try {
      return JSON.parse(`"${normal[1]}"`);
    } catch {
      return null;
    }
  }
  const raw = trimmed.match(/^r(#{0,255})"([\s\S]*)"\1$/);
  return raw?.[2] ?? null;
}

function rustUseRoots(useTree) {
  const compact = useTree.replace(/\s+/g, ' ').trim();
  if (!compact || compact.startsWith('<')) return [];
  const roots = [];
  const collect = (value, prefix = '') => {
    const trimmed = value.trim().replace(/\s+as\s+[A-Za-z_][A-Za-z0-9_]*$/, '');
    if (!trimmed) return;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      for (const item of splitRustTopLevel(trimmed.slice(1, -1))) collect(item, prefix);
      return;
    }
    const brace = rustTopLevelBraceIndex(trimmed);
    if (brace >= 0 && trimmed.endsWith('}')) {
      const nextPrefix = `${prefix}${trimmed.slice(0, brace).replace(/::$/, '')}`;
      for (const item of splitRustTopLevel(trimmed.slice(brace + 1, -1))) {
        collect(item, nextPrefix ? `${nextPrefix}::` : '');
      }
      return;
    }
    const path = `${prefix}${trimmed}`.replace(/::(?:self|\*)$/, '').replace(/::$/, '');
    if (path) roots.push(path);
  };
  collect(compact);
  return [...new Set(roots)];
}

function splitRustTopLevel(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '{') depth += 1;
    else if (value[index] === '}') depth -= 1;
    else if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function rustTopLevelBraceIndex(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '{') {
      if (depth === 0) return index;
      depth += 1;
    } else if (value[index] === '}') {
      depth -= 1;
    }
  }
  return -1;
}

function resolveRustUsePath(rootPath, file, usePath, packageName) {
  const segments = usePath.split('::').filter(Boolean);
  const prefix = segments[0];
  if (!prefix || !segments.every((segment) => /^(?:[A-Za-z_][A-Za-z0-9_]*|\*)$/.test(segment))) {
    return { status: 'unresolved', reason: 'unsupported-static-form' };
  }
  const sourceRoot = rustSourceRoot(rootPath, file);
  const crateRoot = rustCrateRootFile(sourceRoot, file);

  if (prefix === 'crate') {
    const target = resolveRustModuleSegments(rootPath, sourceRoot, segments.slice(1), crateRoot);
    return target
      ? { status: 'local', path: target }
      : { status: 'unresolved', reason: 'alias-not-found' };
  }
  if (prefix === 'self') {
    const target = resolveRustModuleSegments(
      rootPath,
      rustChildModuleDirectory(file),
      segments.slice(1),
      file,
    );
    return target
      ? { status: 'local', path: target }
      : { status: 'unresolved', reason: 'alias-not-found' };
  }
  if (prefix === 'super') {
    let cursor = 0;
    while (segments[cursor] === 'super') cursor += 1;
    const parent = rustAncestorModuleFile(rootPath, file, cursor);
    if (!parent) return { status: 'unresolved', reason: 'alias-not-found' };
    const target = resolveRustModuleSegments(
      rootPath,
      rustChildModuleDirectory(parent),
      segments.slice(cursor),
      parent,
    );
    return target
      ? { status: 'local', path: target }
      : { status: 'unresolved', reason: 'alias-not-found' };
  }

  if (packageName && prefix === packageName.replaceAll('-', '_')) {
    const target = resolveRustModuleSegments(rootPath, sourceRoot, segments.slice(1), crateRoot);
    return target
      ? { status: 'local', path: target }
      : { status: 'unresolved', reason: 'alias-not-found' };
  }
  const local = resolveRustModuleSegments(rootPath, sourceRoot, segments, null);
  return local ? { status: 'local', path: local } : { status: 'external', spec: prefix };
}

function resolveRustModuleDeclaration(rootPath, file, moduleName) {
  const base = rustChildModuleDirectory(file);
  return firstSafeRustFile(rootPath, [
    join(base, `${moduleName}.rs`),
    join(base, moduleName, 'mod.rs'),
  ]);
}

function resolveRustModuleSegments(rootPath, base, segments, fallback) {
  const clean = segments.filter((segment) => segment !== '*' && segment !== 'self');
  for (let length = clean.length; length >= 1; length -= 1) {
    const path = join(base, ...clean.slice(0, length));
    const target = firstSafeRustFile(rootPath, [`${path}.rs`, join(path, 'mod.rs')]);
    if (target) return target;
  }
  return clean.length <= 1 && fallback && safeRustFile(rootPath, fallback) ? fallback : null;
}

function rustSourceRoot(rootPath, file) {
  const relativeFile = relative(rootPath, file).replaceAll('\\', '/');
  return relativeFile.startsWith('src/') ? join(rootPath, 'src') : dirname(file);
}

function rustCrateRootFile(sourceRoot, file) {
  for (const candidate of [join(sourceRoot, 'lib.rs'), join(sourceRoot, 'main.rs')]) {
    if (existsSync(candidate)) return candidate;
  }
  return file;
}

function rustChildModuleDirectory(file) {
  const base = file.endsWith(`${sep}mod.rs`) || /(?:^|[\\/])(?:lib|main)\.rs$/.test(file)
    ? dirname(file)
    : join(dirname(file), file.slice(file.lastIndexOf(sep) + 1, -RUST_SOURCE_EXTENSION.length));
  return base;
}

function rustAncestorModuleFile(rootPath, file, levels) {
  let current = file;
  for (let index = 0; index < levels; index += 1) {
    const parentDirectory = dirname(current);
    const fileName = current.slice(current.lastIndexOf(sep) + 1);
    if (['lib.rs', 'main.rs', 'mod.rs'].includes(fileName)) {
      const directoryName = parentDirectory.slice(parentDirectory.lastIndexOf(sep) + 1);
      const grandparent = dirname(parentDirectory);
      current = firstSafeRustFile(rootPath, [
        `${parentDirectory}.rs`,
        join(grandparent, `${directoryName}.rs`),
        join(grandparent, 'mod.rs'),
        join(grandparent, 'lib.rs'),
        join(grandparent, 'main.rs'),
      ]);
    } else {
      current = firstSafeRustFile(rootPath, [
        join(parentDirectory, 'mod.rs'),
        join(parentDirectory, 'lib.rs'),
        join(parentDirectory, 'main.rs'),
      ]);
    }
    if (!current) return null;
  }
  return current;
}

function resolveRustLiteralPath(rootPath, fromDirectory, literal) {
  if (!literal || literal.includes('\0') || isAbsolute(literal)) return null;
  return safeRustFile(rootPath, resolve(fromDirectory, literal));
}

function firstSafeRustFile(rootPath, candidates) {
  for (const candidate of candidates) {
    const safe = safeRustFile(rootPath, candidate);
    if (safe) return safe;
  }
  return null;
}

function safeRustFile(rootPath, candidate) {
  try {
    const pathStat = lstatSync(candidate);
    if (pathStat.isSymbolicLink() || !pathStat.isFile() || !pathResolvesInsideRoot(rootPath, candidate)) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

export function readRootRustPackageName(rootPath) {
  const cargoPath = join(rootPath, 'Cargo.toml');
  try {
    const cargoStat = lstatSync(cargoPath);
    if (
      cargoStat.isSymbolicLink() ||
      !cargoStat.isFile() ||
      cargoStat.size > RUST_IMPORT_TEXT_MAX_BYTES ||
      !pathResolvesInsideRoot(rootPath, cargoPath)
    ) return null;
    let inPackage = false;
    for (const line of readFileSync(cargoPath, 'utf-8').split(/\r?\n/)) {
      const table = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/)?.[1];
      if (table) {
        inPackage = table === 'package';
        continue;
      }
      if (!inPackage) continue;
      const name = line.match(/^\s*name\s*=\s*"([A-Za-z0-9_-]+)"\s*(?:#.*)?$/)?.[1];
      if (name) return name;
    }
  } catch {
    return null;
  }
  return null;
}

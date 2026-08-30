// What the analyzer is allowed to read, and what it records when it refuses.
// Option validation for `analyzeRepoStructure`, symlink-escape containment against
// the requested root, manifest size/existence checks, and the deduplicated
// `skipped` rows every walker appends to.

import { statSync, realpathSync } from 'node:fs';
import { relative, isAbsolute, sep } from 'node:path';

export function packageContractPathIssue(rootPath, path, source, maxBytes) {
  if (!pathResolvesInsideRoot(rootPath, path)) {
    return `package-contract-skip: ${source} resolves outside repository root`;
  }
  if (statSync(path).size > maxBytes) {
    return `package-contract-skip: ${source} exceeds ${maxBytes} bytes`;
  }
  return null;
}

export function pathResolvesInsideRoot(rootPath, path) {
  const resolvedFromRoot = relative(realpathSync(rootPath), realpathSync(path));
  return !(
    resolvedFromRoot === '..' ||
    resolvedFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(resolvedFromRoot)
  );
}

export function pushSkippedOnce(skipped, row) {
  if (
    skipped.some(
      (existing) =>
        existing.path === row.path && existing.reason === row.reason,
    )
  ) {
    return;
  }
  skipped.push(row);
}

export function validateRootPath(rootPath) {
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    throw new Error('rootPath must be a non-empty string.');
  }
  if (rootPath.trim() !== rootPath) {
    throw new Error('rootPath must not have leading or trailing whitespace.');
  }
  if (rootPath.includes('\0')) {
    throw new Error('rootPath must not contain a null byte.');
  }
}

export function optionalNonNegativeInteger(value, name, options = {}) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
  return value;
}

export function optionalStringArray(value, name, options = {}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new Error(`${name} must contain at most ${options.max} items.`);
  }
  return value.map((item) => {
    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== item) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    return trimmed;
  });
}

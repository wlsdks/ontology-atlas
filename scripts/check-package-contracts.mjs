#!/usr/bin/env node
// Verify publish-package manifests against the files they actually execute.
// This catches npm tarball drift before a maintainer reaches `npm publish`.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = [
  { label: 'mcp', dir: join(ROOT, 'mcp') },
  { label: 'cli', dir: join(ROOT, 'cli') },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

function normalizeRel(path) {
  return toPosix(normalize(path)).replace(/^\.\//, '');
}

function globToRegExp(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${escaped}$`);
}

function isCoveredByFiles(relPath, files) {
  const path = normalizeRel(relPath);
  return files.some((entry) => {
    const normalized = normalizeRel(entry).replace(/\/$/, '');
    if (normalized === path) return true;
    if (normalized.includes('*')) return globToRegExp(normalized).test(path);
    return path.startsWith(`${normalized}/`);
  });
}

function parseScriptFileRefs(command) {
  const tokens = command.split(/\s+/).filter(Boolean);
  const refs = [];
  for (const token of tokens) {
    const clean = token.replace(/^['"]|['"]$/g, '');
    if (/^(src|scripts|templates)\//.test(clean) && /\.(mjs|js|cjs)$/.test(clean)) {
      refs.push(clean);
    }
  }
  return refs;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.mjs`, `${base}.js`, join(base, 'index.mjs'), join(base, 'index.js')];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? base;
}

function importedSpecifiers(source) {
  const imports = [];
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"][^;]*;?/gm)) {
    imports.push(match[1]);
  }
  for (const match of source.matchAll(/^\s*import\b[^;]*?\bfrom\s+['"]([^'"]+)['"][^;]*;?/gm)) {
    imports.push(match[1]);
  }
  for (const match of source.matchAll(
    /^\s*(?:const|let|var)?\s*[\w{}[\],\s]*=?\s*(?:await\s+)?import\(\s*['"]([^'"]+)['"]\s*\)/gm,
  )) {
    imports.push(match[1]);
  }
  return imports;
}

function collectReachableFiles(entryFiles) {
  const seen = new Set();
  const stack = [...entryFiles];

  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf-8');
    for (const specifier of importedSpecifiers(source)) {
      const next = resolveImport(file, specifier);
      if (next) stack.push(next);
    }
  }

  return [...seen].sort();
}

function packageEntrypoints(pkg, dir) {
  const refs = new Set();
  if (pkg.main) refs.add(pkg.main);
  for (const bin of Object.values(pkg.bin ?? {})) refs.add(bin);
  for (const script of Object.values(pkg.scripts ?? {})) {
    for (const ref of parseScriptFileRefs(script)) refs.add(ref);
  }
  return [...refs].map((ref) => resolve(dir, ref));
}

function checkPackage({ label, dir }) {
  const pkg = readJson(join(dir, 'package.json'));
  const files = pkg.files ?? [];
  assert.ok(files.length > 0, `${label}: package.json#files must be explicit`);

  const entrypoints = packageEntrypoints(pkg, dir);
  const reachable = collectReachableFiles(entrypoints);

  for (const file of reachable) {
    const rel = normalizeRel(relative(dir, file));
    assert.equal(existsSync(file), true, `${label}: referenced file is missing: ${rel}`);
    assert.equal(
      isCoveredByFiles(rel, files),
      true,
      `${label}: ${rel} is reachable from package entrypoints/scripts but missing from package.json#files`,
    );
  }

  console.log(`${label}: ${reachable.length} reachable package files covered`);
}

for (const pkg of PACKAGES) {
  checkPackage(pkg);
}

const mcpPkg = readJson(join(ROOT, 'mcp', 'package.json'));
const cliPkg = readJson(join(ROOT, 'cli', 'package.json'));
assert.equal(
  cliPkg.dependencies?.['oh-my-ontology-mcp'],
  `^${mcpPkg.version}`,
  'cli: oh-my-ontology-mcp dependency must track the current local MCP package version',
);

console.log('package contracts OK');

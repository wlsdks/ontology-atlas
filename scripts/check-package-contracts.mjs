#!/usr/bin/env node
// Verify publish-package manifests against the files they actually execute.
// This catches npm tarball drift before a maintainer reaches `npm publish`.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_PACKAGES = [
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

function listFiles(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(root, full));
    } else if (entry.isFile()) {
      files.push(normalizeRel(relative(root, full)));
    }
  }
  return files.sort();
}

export function isCoveredByFiles(relPath, files) {
  const path = normalizeRel(relPath);
  return files.some((entry) => {
    const normalized = normalizeRel(entry).replace(/\/$/, '');
    if (normalized === path) return true;
    if (normalized.includes('*')) return globToRegExp(normalized).test(path);
    return path.startsWith(`${normalized}/`);
  });
}

export function fileEntryMatches(entry, packageFiles, dir) {
  const normalized = normalizeRel(entry).replace(/\/$/, '');
  if (normalized.includes('*')) {
    const re = globToRegExp(normalized);
    return packageFiles.some((file) => re.test(file));
  }
  if (existsSync(join(dir, normalized))) return true;
  return packageFiles.some((file) => file.startsWith(`${normalized}/`));
}

export function parseScriptFileRefs(command) {
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

export function isPublishRuntimeScript(name) {
  return name !== 'test' && !name.startsWith('test:');
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.mjs`, `${base}.js`, join(base, 'index.mjs'), join(base, 'index.js')];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? base;
}

export function importedSpecifiers(source) {
  const imports = [];
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"][^;]*;?/gm)) {
    imports.push(match[1]);
  }
  for (const match of source.matchAll(/^\s*import\b[^;]*?\bfrom\s+['"]([^'"]+)['"][^;]*;?/gm)) {
    imports.push(match[1]);
  }
  for (const match of source.matchAll(/^\s*export\b[^;]*?\bfrom\s+['"]([^'"]+)['"][^;]*;?/gm)) {
    imports.push(match[1]);
  }
  for (const match of source.matchAll(
    /^\s*(?:const|let|var)?\s*[\w{}[\],\s]*=?\s*(?:await\s+)?import\(\s*['"]([^'"]+)['"]\s*\)/gm,
  )) {
    imports.push(match[1]);
  }
  for (const match of source.matchAll(/\brunner\(\s*['"]([^'"]+\.(?:mjs|js|cjs))['"]/g)) {
    imports.push(`../commands/${match[1]}`);
  }
  return imports;
}

export function collectReachableFiles(entryFiles) {
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

export function packageEntrypoints(pkg, dir) {
  const refs = new Set();
  if (pkg.main) refs.add(pkg.main);
  for (const bin of Object.values(pkg.bin ?? {})) refs.add(bin);
  for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
    if (!isPublishRuntimeScript(name)) continue;
    for (const ref of parseScriptFileRefs(script)) refs.add(ref);
  }
  return [...refs].map((ref) => resolve(dir, ref));
}

export function checkPackage({ label, dir }, options = {}) {
  const pkg = readJson(join(dir, 'package.json'));
  const files = pkg.files ?? [];
  assert.ok(files.length > 0, `${label}: package.json#files must be explicit`);

  const packageFiles = listFiles(dir);
  for (const entry of files) {
    assert.equal(
      fileEntryMatches(entry, packageFiles, dir),
      true,
      `${label}: package.json#files entry does not match any package file: ${entry}`,
    );
  }

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

  if (!options.silent) {
    console.log(`${label}: ${reachable.length} reachable package files covered`);
  }
}

export function checkMcpLeanTarballFiles(files) {
  const allowedTestFiles = new Set(['src/parser.test.mjs']);
  const broadTestEntries = files.filter((entry) => {
    const normalized = normalizeRel(entry);
    return normalized.includes('*') && /\.test\.(mjs|js|cjs)$/.test(normalized);
  });
  assert.deepEqual(
    broadTestEntries,
    [],
    `mcp: package.json#files must not use broad test globs: ${broadTestEntries.join(', ')}`,
  );

  const explicitTestFiles = files.filter((entry) => /\.test\.(mjs|js|cjs)$/.test(normalizeRel(entry)));
  const disallowedTestFiles = explicitTestFiles.filter((entry) => !allowedTestFiles.has(normalizeRel(entry)));
  assert.deepEqual(
    disallowedTestFiles,
    [],
    `mcp: only ${[...allowedTestFiles].join(', ')} may ship as a verify smoke fixture`,
  );
}

export function checkReleasePackages(packages = DEFAULT_PACKAGES) {
  for (const pkg of packages) {
    checkPackage(pkg);
  }

  const mcpPkg = readJson(join(ROOT, 'mcp', 'package.json'));
  checkMcpLeanTarballFiles(mcpPkg.files ?? []);
  const cliPkg = readJson(join(ROOT, 'cli', 'package.json'));
  assert.equal(
    cliPkg.dependencies?.['ontology-atlas-mcp'],
    `^${mcpPkg.version}`,
    'cli: ontology-atlas-mcp dependency must track the current local MCP package version',
  );

  console.log('package contracts OK');
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  checkReleasePackages();
}

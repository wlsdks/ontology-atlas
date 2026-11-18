/**
 * The survey `analyze_repo_structure` returns by default: the breadth map. Size,
 * every product unit with its main files, exported names and import edges, the
 * entry points, and the documents, so the agent can outline the whole product
 * before reading any part of it. It proposes no node: a folder is evidence, and the
 * agent names what the product does. Static text scans only; nothing runs.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { inferImports } from '../infer-imports.mjs';
import { collectSourceUnits } from './source-units.mjs';

const MAIN_FILES_PER_UNIT = 3;
const EXPORTS_PER_UNIT = 6;
const IMPORTS_PER_UNIT = 8;
const ENTRY_POINT_LIMIT = 40;
const ROUTE_LIMIT = 12;
const DOC_PAGE_LIMIT = 40;
const DOC_TITLE_CHARS = 70;
const README_PURPOSE_CHARS = 600;
const SCAN_BYTES = 256 * 1024;

function readText(rootPath, path, limit = SCAN_BYTES) {
  try {
    const text = readFileSync(join(rootPath, path), 'utf8');
    return text.length > limit ? text.slice(0, limit) : text;
  } catch {
    return '';
  }
}

const ENTRY_FILE_STEMS = new Set(['index', 'main', 'mod', 'lib', 'app', 'server', 'cli', '__main__']);

function stemOf(path) {
  return basename(path).replace(/\.[^.]+$/, '');
}

/** The files a reader opens first: one named for its folder, an index or main file, then the longest. */
function mainFilesOf(unit) {
  if (unit.scope === 'file') return [unit.files[0]];
  const folder = basename(unit.path);
  const rank = (file) => {
    const stem = stemOf(file.path);
    if (stem === folder) return 0;
    // A three-line barrel names nothing a reader needs; the file it forwards to does.
    if (ENTRY_FILE_STEMS.has(stem) && file.lines >= 20) return 1;
    return 2;
  };
  const byLength = [...unit.files].sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  const named = byLength.filter((file) => rank(file) < 2).sort((a, b) => rank(a) - rank(b));
  const picked = [];
  for (const file of [...named.slice(0, 1), byLength[0], ...named.slice(1), ...byLength]) {
    if (file && !picked.includes(file)) picked.push(file);
    if (picked.length === MAIN_FILES_PER_UNIT) break;
  }
  return picked;
}

const EXPORT_PATTERNS = {
  js: [
    /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?|enum)\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/gm,
  ],
  go: [
    /^type\s+([A-Z]\w*)\s+(?:struct|interface)\b/gm,
    /^func\s+([A-Z]\w*)\s*\(/gm,
    /^type\s+([A-Z]\w*)\b/gm,
  ],
  py: [
    /^class\s+([A-Za-z]\w*)/gm,
    /^def\s+([A-Za-z]\w*)/gm,
  ],
  rs: [
    /^pub\s+(?:async\s+)?(?:struct|enum|trait)\s+(\w+)/gm,
    /^pub\s+(?:async\s+)?fn\s+(\w+)/gm,
  ],
  rb: [/^\s*(?:class|module)\s+([A-Z]\w*)/gm],
  java: [/^\s*public\s+(?:final\s+|abstract\s+)*(?:class|interface|enum|record)\s+(\w+)/gm],
};

function exportFamily(path) {
  const ext = extname(path).toLowerCase();
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte'].includes(ext)) return 'js';
  if (ext === '.go') return 'go';
  if (ext === '.py') return 'py';
  if (ext === '.rs') return 'rs';
  if (ext === '.rb') return 'rb';
  if (['.java', '.kt', '.kts', '.cs', '.scala'].includes(ext)) return 'java';
  return null;
}

function pythonAll(text) {
  const match = /^__all__\s*=\s*[[(]([\s\S]*?)[\])]/m.exec(text);
  if (!match) return null;
  return [...match[1].matchAll(/['"]([A-Za-z_]\w*)['"]/g)].map((row) => row[1]);
}

function exportsOf(rootPath, files) {
  const names = [];
  for (const file of files) {
    const family = exportFamily(file.path);
    if (!family) continue;
    const text = readText(rootPath, file.path);
    const declared = family === 'py' ? pythonAll(text) : null;
    const found = declared ?? EXPORT_PATTERNS[family].flatMap((pattern) =>
      [...text.matchAll(pattern)].map((row) => row[1]));
    for (const name of found) {
      if (name.startsWith('_') || names.includes(name)) continue;
      names.push(name);
      if (names.length === EXPORTS_PER_UNIT) return names;
    }
  }
  return names;
}

/** Unit-to-unit import edges from product code: no test file, no type-only import. */
function unitImports(rootPath, collection, ignore) {
  const edges = new Map(collection.units.map((unit) => [unit.path, new Set()]));
  let scan;
  try {
    scan = inferImports(rootPath, { ignore });
  } catch {
    return edges;
  }
  const unitOfDir = (dir) => {
    const file = collection.files.find((row) => row.class === 'product' && dirname(row.path) === dir);
    if (file) return collection.unitOfFile.get(file.path) ?? null;
    return collection.units.find((unit) => unit.path === dir) ?? null;
  };
  const add = (fromPath, target) => {
    const from = collection.unitOfFile.get(fromPath);
    if (!from || !target || from === target) return;
    edges.get(from.path).add(target.path);
  };
  for (const edge of scan.edges ?? []) {
    if (edge.sourceRole !== 'production' || edge.importUsage === 'type_only') continue;
    add(edge.from, collection.unitOfFile.get(edge.to));
  }
  for (const row of scan.packageImportEvidence?.packageImports ?? []) {
    if (row.sourceRole !== 'production') continue;
    add(row.fromFile, unitOfDir(row.toPackage));
  }
  const memberUnit = new Map();
  for (const member of collection.members) {
    const units = collection.units
      .filter((unit) => unit.path === member.path || unit.path.startsWith(`${member.path}/`))
      .sort((a, b) => b.lines - a.lines);
    if (units[0] && member.name) memberUnit.set(member.name, units[0]);
  }
  for (const row of scan.externalImports ?? []) {
    const spec = String(row.spec ?? '');
    for (const [name, unit] of memberUnit) {
      if (spec === name || spec.startsWith(`${name}/`)) add(row.from, unit);
    }
  }
  return edges;
}

function resolveScriptPath(rootPath, raw) {
  const path = String(raw ?? '').replace(/^\.\//, '');
  if (!path) return null;
  if (existsSync(join(rootPath, path))) return path;
  const source = path.replace(/^(?:dist|lib|build|out)\//, 'src/').replace(/\.(?:c|m)?js$/, '.ts');
  if (existsSync(join(rootPath, source))) return source;
  return null;
}

function readJson(rootPath, path) {
  try {
    return JSON.parse(readFileSync(join(rootPath, path), 'utf8'));
  } catch {
    return null;
  }
}

function packageEntryPoints(rootPath, collection) {
  const rows = [];
  const manifests = ['.', ...collection.members.map((member) => member.path)];
  for (const folder of manifests) {
    const manifest = readJson(rootPath, folder === '.' ? 'package.json' : `${folder}/package.json`);
    if (!manifest) continue;
    const at = (path) => {
      const inside = resolveScriptPath(join(rootPath, folder), path);
      return inside && (folder === '.' ? inside : `${folder}/${inside}`);
    };
    const bin = manifest.bin;
    if (typeof bin === 'string') rows.push({ path: at(bin), symbol: manifest.name ?? basename(folder), kind: 'command' });
    else if (bin && typeof bin === 'object') {
      for (const [name, path] of Object.entries(bin)) rows.push({ path: at(path), symbol: name, kind: 'command' });
    }
    const isPlugin = folder.split('/')[0] === 'plugins';
    const main = typeof manifest.source === 'string' ? manifest.source : manifest.main;
    if (typeof main === 'string' && !isPlugin) {
      rows.push({ path: at(main), symbol: manifest.name ?? basename(folder), kind: 'library' });
    }
  }
  return rows;
}

function tomlSection(text, header) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    out.push(line);
  }
  return out;
}

function pythonModulePath(rootPath, module) {
  const parts = module.split('.');
  for (const base of ['src', '.']) {
    for (const candidate of [`${parts.join('/')}.py`, `${parts.join('/')}/__init__.py`]) {
      const path = base === '.' ? candidate : `${base}/${candidate}`;
      if (existsSync(join(rootPath, path))) return path;
    }
  }
  return null;
}

function pythonEntryPoints(rootPath) {
  const text = readText(rootPath, 'pyproject.toml');
  if (!text) return [];
  const rows = [];
  const sections = [
    ['[project.scripts]', 'command'],
    ['[tool.poetry.scripts]', 'command'],
    ['[project.gui-scripts]', 'command'],
  ];
  const pluginHeaders = text.split(/\r?\n/).filter((line) => /^\[project\.entry-points\./.test(line.trim()));
  for (const header of pluginHeaders) sections.push([header.trim(), 'plugin']);
  for (const [header, kind] of sections) {
    for (const line of tomlSection(text, header)) {
      const match = /^\s*["']?([\w.-]+)["']?\s*=\s*["']([\w.]+)(?::([\w.]+))?["']/.exec(line);
      if (!match) continue;
      const path = pythonModulePath(rootPath, match[2]);
      if (path) rows.push({ path, symbol: match[3] ?? match[1], kind, name: match[1] });
    }
  }
  return rows;
}

const ROUTE_PATTERNS = [
  /\b(?:HandleFunc|Handle)\(\s*"(\/[^"]*)"/g,
  /\b(?:app|router|server|api|r|e|g)\.(get|post|put|patch|delete|GET|POST|PUT|PATCH|DELETE)\(\s*["'`](\/[^"'`]*)["'`]/g,
  /@(?:app|router|api|bp|blueprint)\.(?:route|get|post|put|patch|delete)\(\s*["'](\/[^"']*)["']/g,
];

function codeEntryPoints(rootPath, collection) {
  const rows = [];
  const routes = [];
  for (const file of collection.files) {
    if (file.class !== 'product') continue;
    const ext = extname(file.path);
    const text = readText(rootPath, file.path);
    if (ext === '.go' && /^package main\b/m.test(text) && /^func main\(\)/m.test(text)) {
      rows.push({ path: file.path, symbol: 'main', kind: 'executable' });
    } else if (ext === '.rs' && /^fn main\(\)/m.test(text)) {
      rows.push({ path: file.path, symbol: 'main', kind: 'executable' });
    } else if (ext === '.py' && (basename(file.path) === '__main__.py' || /^if __name__ == ["']__main__["']/m.test(text))) {
      rows.push({ path: file.path, symbol: '__main__', kind: 'executable' });
    } else if (/^#!.*\bnode\b/.test(text)) {
      rows.push({ path: file.path, symbol: stemOf(file.path), kind: 'executable' });
    }
    if (exportFamily(file.path) === 'js') {
      for (const match of text.matchAll(/^export\s+(?:default\s+)?class\s+(\w+)[^{\n]*\bimplements\s+(?:\w+\.)?I?\w*Plugin\b/gm)) {
        rows.push({ path: file.path, symbol: match[1], kind: 'plugin' });
      }
    }
    if (routes.length < ROUTE_LIMIT) {
      for (const pattern of ROUTE_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
          const route = match.length > 2 ? `${match[1].toUpperCase()} ${match[2]}` : match[1];
          if (routes.length < ROUTE_LIMIT && !routes.some((row) => row.symbol === route)) {
            routes.push({ path: file.path, symbol: route, kind: 'route' });
          }
        }
      }
    }
  }
  return [...rows, ...routes];
}

function pythonPackageEntryPoints(collection) {
  const rows = [];
  for (const file of collection.files) {
    if (file.class !== 'product' || basename(file.path) !== '__init__.py') continue;
    const parts = file.path.split('/');
    const isTopPackage = parts.length === 2 || (parts.length === 3 && parts[0] === 'src');
    if (isTopPackage) rows.push({ path: file.path, symbol: parts.at(-2), kind: 'library' });
  }
  return rows;
}

function entryPointsOf(rootPath, collection) {
  const rows = [];
  const seen = new Set();
  for (const row of [
    ...packageEntryPoints(rootPath, collection),
    ...pythonEntryPoints(rootPath),
    ...pythonPackageEntryPoints(collection),
    ...codeEntryPoints(rootPath, collection),
  ]) {
    if (!row.path) continue;
    const key = `${row.kind}\0${row.path}\0${row.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return { rows: rows.slice(0, ENTRY_POINT_LIMIT), omitted: Math.max(0, rows.length - ENTRY_POINT_LIMIT) };
}

function readmePurpose(rootPath) {
  const name = ['README.md', 'Readme.md', 'readme.md', 'README.rst', 'README.markdown', 'README.txt', 'README']
    .find((candidate) => existsSync(join(rootPath, candidate)));
  if (!name) return null;
  const text = readText(rootPath, name, 64 * 1024).replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  // Prose only: an indented or quoted block is code or a citation, a heading is a label.
  const paragraphs = text.split(/\r?\n[ \t]*\r?\n/)
    .filter((block) => !/^(?: {4}|\t|\s*>)/.test(block.replace(/^\r?\n+/, '')))
    .map((block) => block.split(/\r?\n/)
      .filter((line) => !/^\s*(?:#|[=\-~*_]{3,}\s*$|\||\.\. )/.test(line))
      .join(' ')
      .replace(/<[^>]+>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ').trim())
    .filter((block) => block.length >= 20
      && !/\b(?:licen[sc]e|contribut|bug reports?|pull requests?|security vulnerabilit|sponsor|backers?)\b/i.test(block));
  const purpose = paragraphs.join(' ').slice(0, README_PURPOSE_CHARS).trim();
  return purpose ? { path: name, purpose } : { path: name, purpose: '' };
}

const DOC_FOLDERS = ['docs', 'doc', 'documentation'];
const DOC_SKIP = /(?:^|\/)(?:blog|changelog|changelogs|release-notes|news|_[^/]*|node_modules)(?:\/|$)/i;

function docPages(rootPath, ignore) {
  const pages = [];
  const visit = (dir, depth) => {
    if (depth > 4) return;
    let names;
    try { names = readdirSync(join(rootPath, dir)).sort(); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.') || ignore.has(name)) continue;
      const path = `${dir}/${name}`;
      if (DOC_SKIP.test(path)) continue;
      if (/\.(?:md|mdx|markdown|rst)$/i.test(name)) pages.push(path);
      else if (!/\.[a-z0-9]+$/i.test(name)) visit(path, depth + 1);
    }
  };
  for (const folder of DOC_FOLDERS) visit(folder, 0);
  const titled = pages.map((path) => {
    const text = readText(rootPath, path, 16 * 1024);
    const front = /^---\r?\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m.exec(text);
    const heading = /^#\s+(.+)$/m.exec(text);
    const rst = /^([^\n=\-~]+)\r?\n[=\-~]{3,}\s*$/m.exec(text);
    const title = (front?.[1] ?? heading?.[1] ?? rst?.[1] ?? stemOf(path)).replace(/[`*_]/g, '').trim();
    return { path, title: title.slice(0, DOC_TITLE_CHARS) };
  });
  titled.sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
  return { rows: titled.slice(0, DOC_PAGE_LIMIT), omitted: Math.max(0, titled.length - DOC_PAGE_LIMIT) };
}

function formatCount(value) {
  return value.toLocaleString('en-US');
}

/**
 * The default `analyze_repo_structure` response.
 *
 * @param {string} rootPath absolute repository root
 * @param {{ ignore?: string[], vaultRoot?: string }} [options]
 */
export function buildBreadthMap(rootPath, { ignore = [], vaultRoot } = {}) {
  const collection = collectSourceUnits(rootPath, { ignore, vaultRoot });
  const ignoreSet = new Set(ignore);
  const imports = unitImports(rootPath, collection, ignore);
  const importedBy = new Map();
  for (const targets of imports.values()) {
    for (const target of targets) importedBy.set(target, (importedBy.get(target) ?? 0) + 1);
  }
  const units = collection.units.map((unit) => {
    const mainFiles = mainFilesOf(unit);
    const unitImportsList = [...(imports.get(unit.path) ?? [])].sort();
    return {
      path: unit.path,
      files: unit.files.length,
      lines: unit.lines,
      mainFiles: mainFiles.map((file) => ({ path: file.path, lines: file.lines })),
      exports: exportsOf(rootPath, mainFiles),
      importedBy: importedBy.get(unit.path) ?? 0,
      imports: unitImportsList.slice(0, IMPORTS_PER_UNIT),
      ...(unitImportsList.length > IMPORTS_PER_UNIT ? { importsOmitted: unitImportsList.length - IMPORTS_PER_UNIT } : {}),
    };
  });
  const outside = {};
  for (const row of collection.excluded) {
    const entry = outside[row.class] ?? { files: 0, lines: 0 };
    entry.files += row.files;
    entry.lines += row.lines;
    outside[row.class] = entry;
  }
  const entryPoints = entryPointsOf(rootPath, collection);
  const pages = docPages(rootPath, ignoreSet);
  const readme = readmePurpose(rootPath);
  const next = units.length === 0
    ? 'No product source file was found here: check rootPath and ignore, or build the map from documents.'
    : `${units.length} product units, ${formatCount(collection.productLines)} lines in ${formatCount(collection.productFiles)} files. ` +
      'Outline each unit\'s main file next (sourceReads mode "outline", up to 16 per call, sourceOnly true), ' +
      'then read the entry function of every must-have ability with line ranges before writing its node. ' +
      'Nothing is written yet; add_concepts and validate_vault report how much of these lines node paths cover.';
  const map = {
    contract: 'breadthMap:v1',
    rootPath,
    size: {
      productFiles: collection.productFiles,
      productLines: collection.productLines,
      units: units.length,
      outside,
      ...(collection.truncated ? { truncated: true } : {}),
    },
    units,
    entryPoints: entryPoints.rows,
    ...(entryPoints.omitted > 0 ? { entryPointsOmitted: entryPoints.omitted } : {}),
    docs: {
      readme,
      pages: pages.rows,
      ...(pages.omitted > 0 ? { pagesOmitted: pages.omitted } : {}),
    },
    next,
  };
  return fitBreadthMap(map);
}

/** The rendered map's ceiling: a few hundred files fit whole; a larger repository keeps its largest units. */
const BREADTH_TEXT_BUDGET = 24 * 1024;

/**
 * A repository too large for one map keeps every unit's path and size only for the
 * largest units that fit, and says how to ask for the rest: one folder at a time.
 */
function fitBreadthMap(map) {
  const text = renderBreadthMap(map);
  if (Buffer.byteLength(text, 'utf8') <= BREADTH_TEXT_BUDGET) return { ...map, text };
  const largest = [...map.units]
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
    .map((unit) => ({
      path: unit.path,
      files: unit.files,
      lines: unit.lines,
      mainFiles: unit.mainFiles.slice(0, 1),
      exports: unit.exports.slice(0, 3),
      importedBy: unit.importedBy,
      imports: [],
    }));
  const slim = (count) => {
    const kept = largest.slice(0, count);
    const rest = largest.slice(count);
    const restLines = rest.reduce((sum, unit) => sum + unit.lines, 0);
    return {
      ...map,
      units: kept.sort((a, b) => a.path.localeCompare(b.path)),
      unitsOmitted: { units: rest.length, lines: restLines },
      next: `This repository is larger than one map: the ${count} largest of ${largest.length} units are listed without imports; ${rest.length} smaller units holding ${formatCount(restLines)} lines are not. Call analyze_repo_structure with rootPath set to one folder for its full map. ${map.next}`,
    };
  };
  let low = 0;
  let high = largest.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(renderBreadthMap(slim(middle)), 'utf8') <= BREADTH_TEXT_BUDGET) low = middle;
    else high = middle - 1;
  }
  const fitted = slim(low);
  return { ...fitted, text: renderBreadthMap(fitted) };
}

function fileWithin(unitPath, path) {
  return unitPath !== '.' && path.startsWith(`${unitPath}/`) ? path.slice(unitPath.length + 1) : path;
}

/**
 * The same map as plain rows, which is what the agent reads: one line per unit
 * instead of an indented object per field keeps a 400-file repository near 12 KB.
 * Main files are written relative to their unit; join them to the unit path.
 */
function renderBreadthMap(map) {
  const { size } = map;
  const outside = Object.entries(size.outside)
    .map(([kind, row]) => `${kind} ${formatCount(row.files)} files ${formatCount(row.lines)} lines`)
    .join('; ');
  const lines = [
    `Breadth map of ${map.rootPath}: ${size.units} product units, ${formatCount(size.productLines)} lines in ${formatCount(size.productFiles)} files${outside ? ` (left out: ${outside})` : ''}${size.truncated ? '; the walk stopped at its file limit' : ''}.`,
  ];
  if (map.docs.readme) {
    lines.push(`${map.docs.readme.path}: ${map.docs.readme.purpose || '(no prose paragraph)'}`);
  }
  lines.push('', 'Units: path | files | lines | main files (relative to the unit, lines) | exports | imported by N units | imports');
  for (const unit of map.units) {
    const main = unit.mainFiles
      .map((file) => (file.path === unit.path ? `(${file.lines})` : `${fileWithin(unit.path, file.path)} (${file.lines})`))
      .join(', ');
    const imports = unit.imports.join(', ') + (unit.importsOmitted ? ` +${unit.importsOmitted}` : '');
    lines.push(`${unit.path} | ${unit.files} | ${formatCount(unit.lines)} | ${main} | ${unit.exports.join(', ') || '-'} | ${unit.importedBy} | ${imports || '-'}`);
  }
  if (map.entryPoints.length > 0) {
    lines.push('', 'Entry points: kind path symbol');
    for (const row of map.entryPoints) lines.push(`${row.kind} ${row.path} ${row.symbol}`);
    if (map.entryPointsOmitted) lines.push(`+${map.entryPointsOmitted} more`);
  }
  if (map.docs.pages.length > 0) {
    lines.push('', 'Docs: path - title');
    for (const page of map.docs.pages) lines.push(`${page.path} - ${page.title}`);
    if (map.docs.pagesOmitted) lines.push(`+${map.docs.pagesOmitted} more`);
  }
  lines.push('', `Next: ${map.next}`);
  return lines.join('\n');
}


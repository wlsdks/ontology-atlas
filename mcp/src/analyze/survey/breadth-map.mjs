/**
 * The survey `analyze_repo_structure` returns by default: the breadth map. Size,
 * every product unit with its main files, exported names and import edges, the
 * entry points, the abilities to place (`abilities.mjs`), and the documents, so the agent can outline the whole product
 * before reading any part of it. It proposes no node: a folder is evidence, and the
 * agent names what the product does. Static text scans only; nothing runs.
 */

import { createHash } from 'node:crypto';
import { readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, posix, relative, sep } from 'node:path';

import { inferImports } from '../../infer-imports.mjs';
import { ABILITY_LIMIT, abilitiesOf, fairShares } from '../abilities/abilities.mjs';
import { collectSourceUnits } from './source-units.mjs';
import { abilitiesByArea, areaLocator, surveyAreas } from './survey-areas.mjs';
import { repoText as t } from '../repo-text.mjs';
import { readSurveyText, surveyEntry, surveyRelativePath } from './survey-paths.mjs';
import { withoutSpans } from '../text.mjs';

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
  return readSurveyText(rootPath, path, limit);
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
  const head = /^__all__[ \t]*=[ \t]*([[(])/m.exec(text);
  if (!head) return null;
  const start = head.index + head[0].length;
  const end = text.indexOf(head[1] === '[' ? ']' : ')', start);
  if (end < 0) return null;
  return [...text.slice(start, end).matchAll(/['"]([A-Za-z_]\w*)['"]/g)].map((row) => row[1]);
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
  const unitOfDir = (directory) => {
    const file = collection.files.find((row) => row.class === 'product' && dirname(row.path) === directory);
    if (file) return collection.unitOfFile.get(file.path) ?? null;
    return collection.units.find((unit) => unit.path === directory) ?? null;
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

/** A manifest path inside `folder`, as a repository-relative file that exists inside the root, or null. */
function resolveScriptPath(rootPath, folder, raw) {
  const path = surveyRelativePath(String(raw ?? ''));
  if (!path) return null;
  const at = (inner) => (folder === '.' ? inner : posix.join(folder, inner));
  const source = path.replace(/^(?:dist|lib|build|out)\//, 'src/').replace(/\.(?:c|m)?js$/, '.ts');
  return surveyEntry(rootPath, at(path)) ?? surveyEntry(rootPath, at(source));
}

function readJson(rootPath, path) {
  const text = readSurveyText(rootPath, path, SCAN_BYTES);
  if (!text) return null;
  try {
    return JSON.parse(text);
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
    const at = (path) => resolveScriptPath(rootPath, folder, path);
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
      if (surveyEntry(rootPath, path)) return path;
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
    .find((candidate) => surveyEntry(rootPath, candidate));
  if (!name) return null;
  const text = withoutSpans(withoutSpans(readText(rootPath, name, 64 * 1024), /<!--/, '-->'), /```/, '```');
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
  const visit = (directory, depth) => {
    if (depth > 4) return;
    if (!surveyEntry(rootPath, directory, 'directory')) return;
    let names;
    try { names = readdirSync(join(rootPath, directory)).sort(); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.') || ignore.has(name)) continue;
      const path = `${directory}/${name}`;
      if (DOC_SKIP.test(path)) continue;
      if (/\.(?:md|mdx|markdown|rst)$/i.test(name)) { if (surveyEntry(rootPath, path)) pages.push(path); }
      else if (!/\.[a-z0-9]+$/i.test(name)) visit(path, depth + 1);
    }
  };
  for (const folder of DOC_FOLDERS) visit(folder, 0);
  const titled = pages.map((path) => {
    const text = readText(rootPath, path, 16 * 1024);
    // Front matter is the block a page opens with.
    const frontEnd = text.indexOf('\n---', 3);
    const front = /^---\r?\n/.test(text) ? /^title:[ \t]*(\S.*)$/m.exec(frontEnd > 0 ? text.slice(0, frontEnd) : text) : null;
    const heading = /^#\s+(.+)$/m.exec(text);
    const rst = /^([^\n=\-~]+)\r?\n[=\-~]{3,}\s*$/m.exec(text);
    const title = (front?.[1].trim().replace(/^["']|["']$/g, '') ?? heading?.[1] ?? rst?.[1] ?? stemOf(path)).replace(/[`*_]/g, '').trim();
    return { path, title: title.slice(0, DOC_TITLE_CHARS) };
  });
  titled.sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
  return {
    rows: titled.slice(0, DOC_PAGE_LIMIT),
    omitted: Math.max(0, titled.length - DOC_PAGE_LIMIT),
    all: titled.map((page) => page.path),
  };
}

function formatCount(value) {
  return value.toLocaleString('en-US');
}

/**
 * The default `analyze_repo_structure` response: one flat map of every unit when
 * it fits, else the map by area.
 *
 * @param {string} rootPath absolute repository root
 * @param {{ ignore?: string[], vaultRoot?: string }} [options]
 */
export function buildBreadthMap(rootPath, { ignore = [], vaultRoot, collection: given, fit = true } = {}) {
  const collection = given ?? collectSourceUnits(rootPath, { ignore, vaultRoot });
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
  // The vault's own pages are the map being built, not documentation of the product.
  const vault = vaultRoot ? relative(rootPath, vaultRoot).split(sep).join('/') : '';
  const inVault = vault && !vault.startsWith('..') && !isAbsolute(vault) ? (path) => path === vault || path.startsWith(`${vault}/`) : () => false;
  const abilities = abilitiesOf(rootPath, collection, entryPoints.rows, {
    ignore,
    documents: { readme: readme?.path ?? null, pages: pages.all.filter((path) => !inVault(path)) },
  });
  const next = units.length === 0
    ? 'No product source file was found here: check rootPath and ignore, or build the map from documents.'
    : `${units.length} product units, ${formatCount(collection.productLines)} lines in ${formatCount(collection.productFiles)} files. ` +
      `Outline each unit's main file next (sourceReads mode "outline", up to 16 per call, sourceOnly true) and ` +
      'list every ability the product gives a user, an operator or another system from the outlines and docs. ' +
      `The ${abilities.rows.length} abilities listed are the floor under that list, not all of it: each gets a capability, ` +
      'its name in the title or in code form (\`name\`) of the node that covers it (a family or group names its members), ' +
      'or one line in the project\'s ## Uncertainty that cites its path:Lline or exact name and says why it is excluded. ' +
      'Then read each capability by symbol ' +
      '(sourceReads {path, symbol}, three or four per call): the read returns the body with the guards, defaults ' +
      'and callees that decide it, each with path and lines to cite. Nothing is written yet; add_concepts and ' +
      'validate_vault report which abilities no node places and which rules cite no read lines.';
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
    abilities: abilities.rows,
    ...(abilities.omitted > 0 ? { abilitiesOmitted: abilities.omitted, abilitiesOmittedByKind: abilities.omittedByKind } : {}),
    docs: {
      readme,
      pages: pages.rows,
      ...(pages.omitted > 0 ? { pagesOmitted: pages.omitted } : {}),
    },
    next,
  };
  return fit ? fitBreadthMap(map, collection, abilities.found) : map;
}

/**
 * The flat map's ceiling without its abilities: a few hundred files fit whole; a
 * larger repository is mapped by area. The abilities section (at most 120 rows)
 * comes on top, so a longer floor never pushes units out of the map, and the
 * whole map stays within its own ceiling.
 */
const BREADTH_TEXT_BUDGET = 24 * 1024;
const MAP_TEXT_LIMIT = 30 * 1024;
/**
 * The characters any `analyze_repo_structure` response forwards at most: hosts
 * rejected a 56,806-character survey and accepted 43,935 characters.
 */
export const SURVEY_RESPONSE_CHARS = 40_000;
/** Members a family or group shows before the rest are counted. */
const MEMBERS_SHOWN = 16;
/** An area's path is the rootPath that opens it, so it is cut only where a root path would be. */
const AREA_PATH_CHARS = 400;

/** The bytes a map takes against the budget: everything but its abilities section. */
function budgetBytes(map) {
  return Buffer.byteLength(renderBreadthMap({ ...map, abilities: [], abilitiesOmitted: undefined }), 'utf8');
}

function fitBreadthMap(map, collection, found) {
  if (budgetBytes(map) <= BREADTH_TEXT_BUDGET) {
    return capAbilities(map, {
      fits: (candidate) => Buffer.byteLength(renderBreadthMap(candidate), 'utf8') <= MAP_TEXT_LIMIT,
      keep: keepFairShares,
    });
  }
  return capAbilities(areaMap(map, collection, found), {
    fits: (candidate) => renderBreadthMap(candidate).length <= SURVEY_RESPONSE_CHARS,
    keep: keepFirst,
  });
}

/**
 * A repository too large for one flat map, listed by area (`survey-areas.mjs`):
 * every area with its size, main files and the ability rows it holds, and the
 * rows shared between areas. `Next` maps it one area at a time.
 */
function areaMap(map, collection, found) {
  const product = collection.files.filter((file) => file.class === 'product' && file.lines > 0);
  const areas = surveyAreas(product);
  const locate = areaLocator(areas);
  const filesOf = new Map(areas.map((area) => [area, []]));
  for (const file of product) filesOf.get(locate(file.path))?.push(file);
  const held = new Map();
  for (const row of found) {
    const area = locate(row.path);
    held.set(area, (held.get(area) ?? 0) + 1);
  }
  const rows = areas.map((area) => ({
    path: area.path,
    files: area.files,
    lines: area.lines,
    ...(area.own ? { own: true } : {}),
    ...(area.rest ? { rest: true, members: area.members } : {}),
    mainFiles: area.rest ? [] : mainFilesOf({ path: area.path, scope: area.own ? 'files' : 'tree', files: filesOf.get(area) })
      .map((file) => ({ path: file.path, lines: file.lines })),
    abilities: held.get(area) ?? 0,
  }));
  const listed = abilitiesByArea(found, areas, locate, ABILITY_LIMIT);
  const byArea = {
    ...map,
    areas: rows,
    ...omittedRows(found, listed),
    abilities: listed,
    next: areaNext(map, rows),
  };
  delete byArea.units;
  return byArea;
}

/** The rows `found` holds and `listed` does not, counted per kind. */
function omittedRows(found, listed) {
  const shown = new Set(listed);
  const byKind = {};
  for (const row of found) if (!shown.has(row)) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
  const omitted = found.length - shown.size;
  return omitted > 0 ? { abilitiesOmitted: omitted, abilitiesOmittedByKind: byKind } : { abilitiesOmitted: undefined, abilitiesOmittedByKind: undefined };
}

function areaNext(map, areas) {
  const { size } = map;
  const opened = areas.find((area) => !area.own && !area.rest);
  const open = opened ? `analyze_repo_structure(${JSON.stringify({ rootPath: join(map.rootPath, opened.path) })})` : null;
  return `This repository is larger than one map, so it is listed as ${areas.length} areas: ${formatCount(size.productLines)} lines in ${formatCount(size.productFiles)} files. ` +
    'This run puts the whole product on the map and reads the main ability of every domain; reading the rest is a later request. ' +
    '1. From this response alone, name the domains (a lasting responsibility; several areas usually share one) and write the project and every domain with add_concepts; each domain says which areas it holds. ' +
    '2. Read by symbol the operation that decides the main ability of each domain (sourceReads {path, symbol}, three or four per call, sourceOnly true; outline a file first when you do not know its symbols). ' +
    (open ? `Open an area when the rows below do not show what a domain holds, like ${open}: its map lists its units, entry points and every ability it holds, with paths relative to that folder, so write each node's path: from the repository root (${t(opened.path, AREA_PATH_CHARS)}/...). ` : '') +
    '3. Write every domain\'s capabilities: one per thing a user, an operator or another system gets, a family as one capability naming its members and how many of them were read. ' +
    'A capability whose code was not read states no rule and says so under ## Uncertainty. ' +
    'Every ability row below ends up as a capability, named in the node that covers it, or on one line of the project\'s ## Uncertainty that says why it is left out; the rows are a floor shared between areas, not all of them. ' +
    'Every write and validate_vault names the areas not mapped yet with the Not mapped yet lines to keep under the project\'s ## Uncertainty: keep them as given, and end by telling the person how many capabilities are still unread, which they can ask for next.';
}

/** The first `count` rows, in the order the areas shared them. */
function keepFirst(rows, count, map) {
  const kept = rows.slice(0, count);
  const cut = rows.slice(count);
  const byKind = { ...(map.abilitiesOmittedByKind ?? {}) };
  for (const row of cut) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
  const omitted = (map.abilitiesOmitted ?? 0) + cut.length;
  return { kept, ...(omitted > 0 ? { abilitiesOmitted: omitted, abilitiesOmittedByKind: byKind } : {}) };
}

/** `count` rows shared fairly between kinds. */
function keepFairShares(rows, count, map) {
  const counts = new Map();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  const shares = fairShares(counts, count);
  const taken = new Map();
  const kept = rows.filter((row) => {
    if ((taken.get(row.kind) ?? 0) >= shares.get(row.kind)) return false;
    taken.set(row.kind, (taken.get(row.kind) ?? 0) + 1);
    return true;
  });
  const byKind = { ...(map.abilitiesOmittedByKind ?? {}) };
  for (const [kind, total] of counts) {
    if (total > shares.get(kind)) byKind[kind] = (byKind[kind] ?? 0) + total - shares.get(kind);
  }
  const omitted = (map.abilitiesOmitted ?? 0) + rows.length - kept.length;
  return { kept, ...(omitted > 0 ? { abilitiesOmitted: omitted, abilitiesOmittedByKind: byKind } : {}) };
}

/**
 * The map with its text, the abilities section cut to fit the map's ceiling: a
 * group shows fewer members first (16, then 8, 4, 2, 1, none), each cut counted
 * in `membersOmitted`; a map still too long then keeps fewer rows (`keep` says
 * which), the rows left out added to `abilitiesOmitted`. The returned rows are
 * the ones the text shows.
 */
function capAbilities(map, { fits, keep }) {
  const shown = (rows, limit) => rows.map((row) => {
    if (!row.members || row.members.length <= limit) return row;
    return { ...row, members: row.members.slice(0, limit), membersOmitted: (row.membersOmitted ?? 0) + row.members.length - limit };
  });
  const rows = map.abilities ?? [];
  let capped = map;
  for (const limit of [MEMBERS_SHOWN, 8, 4, 2, 1, 0]) {
    capped = { ...map, abilities: shown(rows, limit) };
    if (fits(capped)) return { ...capped, text: renderBreadthMap(capped) };
  }
  const memberless = capped.abilities;
  const kept = (count) => {
    const { kept: abilities, ...omitted } = keep(memberless, count, map);
    return { ...map, abilities, ...omitted };
  };
  // Binary search on the row count: O(log rows) renders.
  let low = 0;
  let high = memberless.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(kept(middle))) low = middle;
    else high = middle - 1;
  }
  const fitted = kept(low);
  return { ...fitted, text: renderBreadthMap(fitted) };
}

function fileWithin(unitPath, path) {
  return unitPath !== '.' && path.startsWith(`${unitPath}/`) ? path.slice(unitPath.length + 1) : path;
}

function mainFilesText(row) {
  return row.mainFiles
    .map((file) => (file.path === row.path ? `(${file.lines})` : `${t(fileWithin(row.path, file.path))} (${file.lines})`))
    .join(', ');
}

function areaLines(map) {
  const lines = ['', 'Areas, largest first: path | files | lines | main files (relative to the area, lines) | abilities it holds'];
  for (const area of map.areas) {
    const path = t(area.path, AREA_PATH_CHARS);
    if (area.rest) {
      const names = area.members.slice(0, 40).map((member) => t(fileWithin(area.path, member), AREA_PATH_CHARS)).join(', ');
      lines.push(`+${area.members.length} smaller folders in ${path} | ${formatCount(area.files)} | ${formatCount(area.lines)} | ${names}${area.members.length > 40 ? ` +${area.members.length - 40}` : ''} | ${area.abilities}`);
      continue;
    }
    lines.push(`${path}${area.own ? ' (its own files, not its folders)' : ''} | ${formatCount(area.files)} | ${formatCount(area.lines)} | ${mainFilesText(area) || '-'} | ${area.abilities}`);
  }
  return lines;
}

/**
 * The same map as plain rows, which is what the agent reads: one line per unit
 * (or per area) instead of an indented object per field keeps a 400-file
 * repository near 12 KB. Main files are written relative to their unit or area;
 * join them to its path.
 */
function renderBreadthMap(map) {
  const { size } = map;
  const outside = Object.entries(size.outside)
    .map(([kind, row]) => `${kind} ${formatCount(row.files)} files ${formatCount(row.lines)} lines`)
    .join('; ');
  const lines = [
    `Breadth map of ${t(map.rootPath, 400)}: ${size.units} product units, ${formatCount(size.productLines)} lines in ${formatCount(size.productFiles)} files${outside ? ` (left out: ${outside})` : ''}${size.truncated ? '; the walk stopped at its file limit' : ''}.`,
  ];
  if (map.docs.readme) {
    lines.push(`${t(map.docs.readme.path)}: ${t(map.docs.readme.purpose, 700) || '(no prose paragraph)'}`);
  }
  if (map.areas) lines.push(...areaLines(map));
  else {
    lines.push('', 'Units: path | files | lines | main files (relative to the unit, lines) | exports | imported by N units | imports');
    for (const unit of map.units) {
      const imports = unit.imports.map((path) => t(path)).join(', ') + (unit.importsOmitted ? ` +${unit.importsOmitted}` : '');
      lines.push(`${t(unit.path)} | ${unit.files} | ${formatCount(unit.lines)} | ${mainFilesText(unit)} | ${unit.exports.map((name) => t(name, 80)).join(', ') || '-'} | ${unit.importedBy} | ${imports || '-'}`);
    }
  }
  if (map.entryPoints.length > 0) {
    lines.push('', 'Entry points: kind path symbol');
    for (const row of map.entryPoints) lines.push(`${row.kind} ${t(row.path)} ${t(row.symbol, 120)}`);
    if (map.entryPointsOmitted) lines.push(`+${map.entryPointsOmitted} more`);
  }
  if (map.abilities?.length > 0) {
    lines.push('', 'Abilities to place, the floor: kind name evidence symbol (a family or group lists its members; a documented one names its heading)');
    for (const row of map.abilities) {
      const hidden = (row.membersOmitted ?? 0) + Math.max(0, (row.members?.length ?? 0) - MEMBERS_SHOWN);
      const listed = (row.members ?? []).slice(0, MEMBERS_SHOWN).map((name) => t(name, 80)).join(', ');
      const members = row.members ? `: ${[listed, hidden > 0 ? `+${hidden}` : ''].filter(Boolean).join(' ')}` : '';
      const symbol = row.symbol && row.symbol !== row.name ? ` ${t(row.symbol, 120)}` : '';
      const doc = row.doc ? ` (${t(row.doc)})` : '';
      lines.push(row.kind === 'family'
        ? `family ${row.name && row.name !== row.path ? `${t(row.name, 120)} in ` : ''}${t(row.path)} ${t(row.evidence)}${members}`
        : `${row.kind} ${t(row.name, 120)} ${t(row.evidence)}${symbol}${doc}${members}`);
    }
    if (map.abilitiesOmitted) {
      const byKind = Object.entries(map.abilitiesOmittedByKind ?? {}).map(([kind, count]) => `${kind} ${count}`).join(', ');
      lines.push(map.areas
        ? `+${map.abilitiesOmitted} more not listed${byKind ? ` (${byKind})` : ''}: every area shows rows before any shows a second, and a module API or lone export only where an area has no other row; an area's own map lists the rest.`
        : `+${map.abilitiesOmitted} more not listed${byKind ? ` (${byKind})` : ''}: each kind keeps an equal share of 120 rows and of the map's 30 KB; call analyze_repo_structure with rootPath set to one folder to list them.`);
    }
  }
  if (map.docs.pages.length > 0) {
    lines.push('', 'Docs: path - title');
    for (const page of map.docs.pages) lines.push(`${t(page.path)} - ${t(page.title, 80)}`);
    if (map.docs.pagesOmitted) lines.push(`+${map.docs.pagesOmitted} more`);
  }
  lines.push('', `Next: ${map.next}`);
  return lines.join('\n');
}

const SURVEYS = new Map();

function canonicalRoot(rootPath) {
  try {
    return realpathSync(rootPath);
  } catch {
    return rootPath;
  }
}

/**
 * The breadth map and its unit collection for a repository: the map the first
 * call built, until a source file is added, removed or changed. The survey call,
 * every write and validate_vault share it; the map costs seconds on a large
 * repository, the file walk under a tenth of that.
 *
 * @param {string} rootPath absolute repository root
 * @param {{ vaultRoot?: string, ignore?: string[] }} [options]
 * @returns {{ collection: ReturnType<typeof collectSourceUnits>, survey: ReturnType<typeof buildBreadthMap> }}
 */
export function cachedSurvey(rootPath, { vaultRoot, ignore = [] } = {}) {
  const collection = collectSourceUnits(rootPath, { ignore, vaultRoot });
  const fingerprint = createHash('sha256');
  for (const file of collection.files) fingerprint.update(`${file.path}\0${file.size}\0${file.mtimeMs}\n`);
  const key = [canonicalRoot(rootPath), vaultRoot ?? '', ...ignore].join('\0');
  const digest = fingerprint.digest('hex');
  const cached = SURVEYS.get(key);
  if (cached && cached.digest === digest) return { collection, survey: cached.survey };
  const survey = buildBreadthMap(rootPath, { vaultRoot, ignore, collection });
  if (SURVEYS.size > 8) SURVEYS.clear();
  SURVEYS.set(key, { digest, survey });
  return { collection, survey };
}

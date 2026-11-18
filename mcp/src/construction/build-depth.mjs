/**
 * How far a first map reaches and how deep it read. Breadth is measured against the
 * survey: every product unit, entry point and main file is under a node's `path:`,
 * named inside a node, or excluded with a reason. Depth is measured against the
 * reads this server process served, matched to each capability's `path:`, never
 * against a body's wording. The findings name what a newcomer would trip over (a
 * relation note about a node that says it was not read, a dependency both ways, an
 * entry file with no code, one file for many nodes). Writes and validate_vault report
 * the line, finalize_project_meaning refuses an `answered` it does not support, and
 * every message names the next call.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

import { cachedSurvey } from '../analyze/breadth-map.mjs';
import { UNIT_SOURCE_EXTENSIONS, unitForPath } from '../analyze/source-units.mjs';

/** Wording a node uses for a subject it only outlined; read under `## Uncertainty` alone. */
const OUTLINED_ONLY = /\b(?:outlined only|only outlined|outline only|outlined,? (?:but )?(?:the )?(?:body |bodies )?(?:not read|unread)|bod(?:y|ies) (?:was |were |is |are )?(?:not read|unread)|unread|not opened)\b/i;

const SHARED_PATH_LIMIT = 5;
const PATH_KINDS = new Set(['capability', 'element']);

/** The `## Uncertainty` section of a body, or '' when it has none. */
function uncertaintySection(body) {
  const match = /^##\s+Uncertainty\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(String(body ?? ''));
  return match ? match[1] : '';
}

/** Whether a node says, under `## Uncertainty`, that its subject was outlined and not read. */
export function saysOutlinedOnly(body) {
  return OUTLINED_ONLY.test(uncertaintySection(body));
}

function kindOf(doc) {
  return typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
}

function pathOf(doc) {
  const path = doc?.frontmatter?.path;
  return typeof path === 'string' && path.trim() ? path.trim().replace(/^\.\//, '') : null;
}

function refsOf(doc, keys) {
  const refs = [];
  for (const key of keys) {
    const value = doc?.frontmatter?.[key];
    if (Array.isArray(value)) refs.push(...value.filter((ref) => typeof ref === 'string' && ref.trim()).map((ref) => ref.trim()));
  }
  return refs;
}

const DEPENDENCY_KEYS = ['dependencies', 'depends_on'];

/** A ref as an exact slug, or the unique node whose slug ends with it. */
function slugResolver(docs) {
  const bySlug = new Set(docs.map((doc) => doc.slug));
  const byTail = new Map();
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop();
    byTail.set(tail, byTail.has(tail) ? null : doc.slug);
  }
  return (ref) => (bySlug.has(ref) ? ref : byTail.get(ref) ?? null);
}

/** Every `depends_on` edge as [from, to] slugs that resolve. */
function dependencyEdges(docs) {
  const resolve = slugResolver(docs);
  const edges = [];
  for (const doc of docs) {
    for (const ref of refsOf(doc, DEPENDENCY_KEYS)) {
      const to = resolve(ref);
      if (to && to !== doc.slug) edges.push([doc.slug, to]);
    }
  }
  return edges;
}

/**
 * The survey of a grounded repository (`cachedSurvey`: every unit with its main
 * files and importers, and the entry points) or null when it has no product units.
 */
export function repositorySurvey(repoRoot, vaultRoot) {
  if (!repoRoot) return null;
  try {
    const { collection, survey } = cachedSurvey(repoRoot, { vaultRoot });
    return collection.units.length > 0 ? { repoRoot, collection, survey } : null;
  } catch {
    return null;
  }
}

function formatLines(value) {
  return value.toLocaleString('en-US');
}

function sectionOf(body, heading) {
  const match = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im').exec(String(body ?? ''));
  return match ? match[1] : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namesWord(text, word) {
  if (!word || word.length < 3) return false;
  return new RegExp(`(^|[^\\w/.-])${escapeRegExp(word)}(?=$|[^\\w-])`, 'i').test(text);
}

function lastSegment(path) {
  return path.split('/').pop().replace(/\.[^.]+$/, '');
}

function parentOf(path) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

/** The unit a node path enters: the longest unit path equal to it or above it. */
function unitPathFor(units, path) {
  let best = null;
  for (const unit of units) {
    if ((path === unit.path || path.startsWith(`${unit.path}/`)) && (!best || unit.path.length > best.length)) best = unit.path;
  }
  return best;
}

/** Entry symbols too generic to place anything by name. */
const GENERIC_SYMBOLS = new Set(['main', '__main__', 'run', 'default', 'index', 'app', 'cli', 'server']);
const MAIN_FILE_LINES = 300;
const GENERIC_STEMS = new Set(['index', 'main', 'utils', 'util', 'types', 'base', 'core', 'init', '__init__', 'common', 'helpers', 'config', 'constants', 'module', 'server', 'client', 'handler']);
const LISTED = 12;

/**
 * Where every unit, entry point and main file the survey lists sits on the map:
 * under a node's `path:`, named inside a node, or excluded with a reason in the
 * project's `## Uncertainty` or `## Excludes`. A must-have unit (one holding an
 * entry point, or imported by two or more units) with no node is listed by name.
 */
function measureBreadth(docs, survey) {
  const units = survey.units;
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const exclusionLines = project
    ? `${sectionOf(project.body, 'Uncertainty')}\n${sectionOf(project.body, 'Excludes')}`
      .split('\n').filter((line) => line.trim().split(/\s+/).length >= 4)
    : [];
  const excludes = (path, words = []) => exclusionLines.some((line) => line.includes(path) || words.some((word) => namesWord(line, word)));
  const nodes = docs.filter((doc) => doc !== project && kindOf(doc) !== 'vault-readme');
  const nodeText = nodes.map((doc) => `${doc.frontmatter?.title ?? ''}\n${doc.body ?? ''}`).join('\n');
  const nodePaths = nodes.map(pathOf).filter(Boolean);
  const pathSet = new Set(nodePaths);
  const unitsWithNode = new Set(nodePaths.map((path) => unitPathFor(units, path)).filter(Boolean));
  // A family node names its siblings in `## Includes`: the parent folder its path's unit sits in.
  const includesByParent = new Map();
  for (const doc of nodes) {
    const path = pathOf(doc);
    const unit = path ? unitPathFor(units, path) : null;
    if (!unit) continue;
    const parent = parentOf(unit);
    includesByParent.set(parent, `${includesByParent.get(parent) ?? ''}\n${sectionOf(doc.body, 'Includes')}\n${doc.frontmatter?.title ?? ''}`);
  }
  const place = new Map();
  for (const unit of units) {
    if (unitsWithNode.has(unit.path)) place.set(unit.path, 'node');
    else if (nodeText.includes(unit.path) || namesWord(includesByParent.get(parentOf(unit.path)) ?? '', lastSegment(unit.path))) place.set(unit.path, 'named');
    else if (excludes(unit.path, [lastSegment(unit.path)])) place.set(unit.path, 'excluded');
    else place.set(unit.path, 'unplaced');
  }
  const entryUnits = new Set(survey.entryPoints.map((entry) => unitPathFor(units, entry.path)).filter(Boolean));
  const mustHave = units.filter((unit) => entryUnits.has(unit.path) || unit.importedBy >= 2);
  const inherited = (path) => {
    const unit = unitPathFor(units, path);
    return unit ? ['named', 'excluded'].includes(place.get(unit)) : false;
  };
  const entryUnplaced = survey.entryPoints.filter((entry) => {
    if (pathSet.has(entry.path) || nodeText.includes(entry.path) || inherited(entry.path)) return false;
    const words = [entry.symbol, entry.name].filter((word) => word && !GENERIC_SYMBOLS.has(word));
    if (words.some((word) => namesWord(nodeText, word))) return false;
    return !excludes(entry.path, words);
  });
  const mainFiles = units.flatMap((unit) => unit.mainFiles.filter((file) => file.lines >= MAIN_FILE_LINES));
  // A main file is named by its path, its file name, or its stem as a word ("motion.py" by "Random motion").
  const stemOf = (path) => {
    const stem = lastSegment(path);
    return stem.length >= 4 && !GENERIC_STEMS.has(stem.toLowerCase()) ? stem.replace(/[_-]+/g, ' ') : null;
  };
  const mainUnplaced = mainFiles.filter((file) => !(pathSet.has(file.path) || nodeText.includes(file.path)
    || namesWord(nodeText, file.path.split('/').pop()) || namesWord(nodeText, stemOf(file.path))
    || inherited(file.path) || excludes(file.path, [file.path.split('/').pop()])));
  const count = (state) => units.filter((unit) => place.get(unit.path) === state).length;
  return {
    units: units.length,
    node: count('node'),
    named: count('named'),
    excluded: count('excluded'),
    unplaced: units.filter((unit) => place.get(unit.path) === 'unplaced')
      .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
      .map((unit) => ({ path: unit.path, lines: unit.lines })),
    mustHaveWithoutNode: mustHave.filter((unit) => !['node', 'named'].includes(place.get(unit.path)))
      .map((unit) => ({ path: unit.path, lines: unit.lines })),
    entryPoints: survey.entryPoints.length,
    entryUnplaced: entryUnplaced.map((entry) => ({ path: entry.path, symbol: entry.symbol, kind: entry.kind })),
    mainFiles: mainFiles.length,
    mainUnplaced: mainUnplaced.map((file) => ({ path: file.path, lines: file.lines })),
  };
}

/**
 * The symbol a body cites right after its path, in any of the forms builders write:
 * "`src/x.ts` `issueInvoice`", "src/x.ts issueInvoice", "src/x.py#Owner.method".
 */
function citedSymbol(doc, path) {
  const body = String(doc?.body ?? '');
  const pattern = new RegExp(`${escapeRegExp(path)}\`?(?:#|:|\\s+|,\\s*)\`?([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)?)`, 'g');
  for (const match of body.matchAll(pattern)) {
    const symbol = match[1].replace(/\.$/, '');
    if (!/^(?:L\d+|and|or|the|was|is|not|in|at|line|lines)$/i.test(symbol)) return symbol;
  }
  return null;
}

const READ_CALL_SELECTORS = 16;

/** The exact call that reads the listed nodes' entry files, by symbol where the body names one. */
function readCall(unread) {
  const seen = new Set();
  const selectors = [];
  for (const { path, symbol } of unread) {
    const key = `${path}\0${symbol ?? ''}`;
    if (seen.has(key) || selectors.length >= READ_CALL_SELECTORS) continue;
    seen.add(key);
    selectors.push(symbol ? { path, symbol } : { path, startLine: 1, maxLines: 200 });
  }
  return `analyze_repo_structure(${JSON.stringify({ sourceOnly: true, sourceReads: selectors })})`;
}

/**
 * Which capabilities' entry files this server process served a line or symbol read
 * for. Null when it served none: a restarted server cannot tell, and says so.
 */
function measureReads(docs, reads) {
  if (!reads || reads.size === 0) return null;
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability' && pathOf(doc));
  const unread = capabilities.filter((doc) => !reads.has(pathOf(doc)))
    .map((doc) => ({ slug: doc.slug, path: pathOf(doc), symbol: citedSymbol(doc, pathOf(doc)) }));
  return { capabilities: capabilities.length, read: capabilities.length - unread.length, unread };
}

function listed(rows, render) {
  const shown = rows.slice(0, LISTED).map(render);
  const more = rows.length - shown.length;
  return `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
}

/**
 * Placement against the survey and reads against this session, with the line a
 * write and validate_vault report. Each list names what to do next.
 */
export function measureBuildDepth(docs, repo, reads) {
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const dependsOn = dependencyEdges(docs).length;
  const breadth = repo ? measureBreadth(docs, repo.survey) : null;
  const depth = measureReads(docs, reads);
  const parts = [];
  if (breadth) {
    parts.push(`Breadth, of ${breadth.units} product units the survey lists: ${breadth.node} under a node's path, ${breadth.named} named inside a node, ${breadth.excluded} excluded with a reason, ${breadth.unplaced.length} not placed.`);
    if (breadth.unplaced.length > 0) parts.push(`Not placed: ${listed(breadth.unplaced, (unit) => `${unit.path} (${formatLines(unit.lines)} lines)`)}.`);
    if (breadth.mustHaveWithoutNode.length > 0) parts.push(`Must-have units with no node: ${listed(breadth.mustHaveWithoutNode, (unit) => unit.path)}.`);
    const loose = [
      ...breadth.entryUnplaced.map((entry) => `${entry.path} ${entry.symbol} (${entry.kind})`),
      ...breadth.mainUnplaced.map((file) => `${file.path} (${formatLines(file.lines)} lines)`),
    ];
    if (loose.length > 0) parts.push(`Entry points and main files no node names: ${listed(loose, (row) => row)}.`);
    if (breadth.unplaced.length + breadth.mustHaveWithoutNode.length + loose.length > 0) {
      parts.push('Place each: add_concepts a node whose path is inside it, name it in the ## Includes of the node that covers it, or name it with a reason in the project\'s ## Uncertainty.');
    }
  }
  if (depth && depth.unread.length > 0) {
    parts.push(`Depth: ${depth.read} of ${depth.capabilities} capabilities had their entry file read this session. Not read: ${listed(depth.unread, (row) => `${row.slug} (${row.path})`)}. Read next, then follow the calls each names until the deciding condition: ${readCall(depth.unread)}.`);
  } else if (!depth && capabilities.length > 0) {
    parts.push('Depth: this server process has served no line or symbol reads, so which entry files were read is unknown.');
  }
  return {
    breadth,
    reads: depth,
    capabilities: capabilities.length,
    dependsOn,
    line: parts.length > 0 ? parts.join(' ') : null,
  };
}

/* ---------------------------------------------------------------------------
 * validate_vault findings
 * ------------------------------------------------------------------------- */

const NOTE_KEYS = ['dependencies', 'depends_on', 'relates', 'elements', 'capabilities'];
const TYPE_OF_KEY = { dependencies: 'depends_on', depends_on: 'depends_on', relates: 'relates', elements: 'elements', capabilities: 'capabilities' };

function relationNoteFindings(docs) {
  const resolve = slugResolver(docs);
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const findings = [];
  for (const doc of docs) {
    const notes = doc?.frontmatter?.relation_notes;
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) continue;
    const typeOf = new Map();
    for (const key of NOTE_KEYS) for (const ref of refsOf(doc, [key])) if (!typeOf.has(ref)) typeOf.set(ref, TYPE_OF_KEY[key]);
    for (const [ref, note] of Object.entries(notes)) {
      if (typeof note !== 'string' || !note.trim() || !typeOf.has(ref)) continue;
      const target = bySlug.get(resolve(ref));
      if (!target) continue;
      const unread = [doc, target].filter((node) => saysOutlinedOnly(node.body));
      if (unread.length === 0) continue;
      const type = typeOf.get(ref);
      const reads = unread.map((node) => pathOf(node)).filter(Boolean)
        .map((path) => ({ path, symbol: citedSymbol(unread.find((node) => pathOf(node) === path), path) }));
      const rewrite = `replace_relation(${JSON.stringify({ from: doc.slug, oldTo: target.slug, oldType: type, newTo: target.slug, newType: type, why: '<what the read shows>', confirm: true })})`;
      findings.push({
        slug: doc.slug,
        code: 'relation-note-on-unread',
        message: `The why on ${doc.slug} -> ${target.slug} says how they work together, but ${unread.map((node) => node.slug).join(' and ')} says it was not read. Repair in two calls: ${reads.length > 0 ? readCall(reads) : 'read the entry with analyze_repo_structure sourceReads'}, then ${rewrite}, and patch_concept the ## Uncertainty line that said it was not read. Without the read, make the same replace_relation call with a why that says only what the outline shows.`,
      });
    }
  }
  return findings;
}

function twoWayDependencyFindings(docs) {
  const edges = new Set(dependencyEdges(docs).map(([from, to]) => `${from}\0${to}`));
  const findings = [];
  for (const key of edges) {
    const [from, to] = key.split('\0');
    if (from > to || !edges.has(`${to}\0${from}`)) continue;
    findings.push({
      slug: from,
      code: 'dependency-both-ways',
      message: `${from} and ${to} each depend on the other. A dependency runs from consumer to provider: a caller depends on the interface it calls, an implementation does not depend on its interface, and a composition root depends on what it wires. Keep the direction the code shows and remove_relation the other.`,
    });
  }
  return findings;
}

/** Comments, docstrings, imports and re-exports removed; what is left is code. */
function hasCode(text, path) {
  const ext = extname(path).toLowerCase();
  let rest = String(text);
  if (ext === '.py' || ext === '.rb') {
    rest = rest
      .replace(/("""|''')[\s\S]*?\1/g, '')
      .replace(/^\s*from\s+[\w.]+\s+import\s*\([^)]*\)/gm, '')
      .replace(/^__all__\s*\+?=\s*[[(][^\])]*[\])]/gm, '')
      .replace(/#.*$/gm, '');
  } else {
    rest = rest
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/^\s*(?:import|export)\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"];?/gm, '')
      .replace(/^\s*import\s*\([^)]*\)/gm, '');
  }
  const lines = rest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const declarative = /^(?:import\s|from\s+[\w.]+\s+import\s|export\s+\*|export\s+(?:type\s+)?\{[^}]*\}\s*from\s|package\s+\w+|use\s+[\w:{}, *]+;|(?:pub\s+)?mod\s+\w+;|['"]use strict['"];?|module\.exports\s*=\s*require\(|[)\]};,]+$)/;
  return lines.some((line) => !declarative.test(line));
}

function readSmallSource(repoRoot, path) {
  if (!UNIT_SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  try {
    const abs = join(repoRoot, path);
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/** Up to three product files near `path`, longest first: its unit's, then its folder's. */
function nearbyFiles(collection, path) {
  const unit = unitForPath(collection, path);
  const folder = dirname(path);
  const candidates = collection.files
    .filter((file) => file.class === 'product' && file.path !== path && file.lines > 0)
    .filter((file) => (unit && unit.files.includes(file)) || file.path.startsWith(`${folder}/`))
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  return candidates.slice(0, 3).map((file) => file.path);
}

function entryPathFindings(docs, repoRoot, collection) {
  const findings = [];
  const byPath = new Map();
  for (const doc of docs) {
    if (!PATH_KINDS.has(kindOf(doc))) continue;
    const path = pathOf(doc);
    if (!path) continue;
    byPath.set(path, [...(byPath.get(path) ?? []), doc.slug]);
    const text = readSmallSource(repoRoot, path);
    if (text === null || hasCode(text, path)) continue;
    const nearby = collection ? nearbyFiles(collection, path) : [];
    findings.push({
      slug: doc.slug,
      code: 'path-without-code',
      message: `path: ${path} holds no code (only comments, a docstring, imports or re-exports), so "where does this live" lands on nothing. Point path at the file the ability starts in${nearby.length > 0 ? `, such as ${nearby.join(', ')}` : ''}, with patch_concept.`,
    });
  }
  for (const [path, slugs] of byPath) {
    if (slugs.length <= SHARED_PATH_LIMIT) continue;
    const nearby = collection ? nearbyFiles(collection, path) : [];
    const listed = slugs.slice(0, 6).join(', ') + (slugs.length > 6 ? ` and ${slugs.length - 6} more` : '');
    for (const slug of slugs) {
      findings.push({
        slug,
        code: 'path-shared',
        message: `${slugs.length} nodes share path: ${path} (${listed}), so a drift check cannot tell them apart. Give each node the more specific file its ability enters through${nearby.length > 0 ? ` (for example ${nearby.join(', ')})` : ''} with patch_concept, and keep one element for this file's role.`,
      });
    }
  }
  return findings;
}

/** The validate_vault warnings this module owns; `repoRoot` null skips the file checks. */
export function buildDepthFindings(docs, { repoRoot, collection } = {}) {
  return [
    ...relationNoteFindings(docs),
    ...twoWayDependencyFindings(docs),
    ...(repoRoot ? entryPathFindings(docs, repoRoot, collection) : []),
  ];
}

/* ---------------------------------------------------------------------------
 * finalize_project_meaning
 * ------------------------------------------------------------------------- */

/**
 * Why an `answered` competency row is not supported by the map, one reason per row.
 * Each leads with the call that fixes the map (reading is the cheapest repair for
 * evidence), and only then the partial fallback.
 */
export function competencyDepthRefusals(questions, depth) {
  const status = new Map(questions.map((question) => [question.id, question.status]));
  const reasons = [];
  const fallback = (id, gap) => `Only if that cannot be done, mark ${id} partial with "- Gap: ${gap}".`;
  const reads = depth.reads;
  if (status.get('evidence') === 'answered' && reads && reads.capabilities > 0 && reads.unread.length * 3 > reads.capabilities) {
    reasons.push(`- evidence: ${reads.unread.length} of ${reads.capabilities} capabilities have an entry file this server never served a read for: ${listed(reads.unread, (row) => `${row.slug} (${row.path})`)}. Next call: ${readCall(reads.unread)}; follow the callees each read names to the condition, order or default that decides it, patch_concept the body with that rule, and finalize again. ${fallback('evidence', 'these abilities were outlined, not read')}`);
  }
  const breadth = depth.breadth;
  if (breadth && status.get('domains') === 'answered' && breadth.unplaced.length > 0) {
    reasons.push(`- domains: ${breadth.unplaced.length} of ${breadth.units} product units the survey lists sit under no node and no exclusion: ${listed(breadth.unplaced, (unit) => unit.path)}. Next call: add_concepts a node for each, or patch_concept the node that covers it to name it in ## Includes, or name it with a reason in the project's ## Uncertainty. ${fallback('domains', 'units not placed')}`);
  }
  if (breadth && status.get('abilities') === 'answered') {
    const loose = [
      ...breadth.mustHaveWithoutNode.map((unit) => `${unit.path} (must-have unit)`),
      ...breadth.entryUnplaced.map((entry) => `${entry.path} ${entry.symbol}`),
      ...breadth.mainUnplaced.map((file) => file.path),
    ];
    if (loose.length > 0) {
      reasons.push(`- abilities: no node names ${listed(loose, (row) => row)}. Next call: add_concepts a capability for each thing a user gets there, or patch_concept the node that covers it to name it in ## Includes. ${fallback('abilities', 'abilities not yet named')}`);
    }
  }
  if (status.get('impact') === 'answered' && depth.capabilities > 0 && depth.dependsOn * 2 < depth.capabilities) {
    reasons.push(`- impact: ${depth.dependsOn} depends_on edges for ${depth.capabilities} capabilities, below one per two. Next call: add_relations with the dependencies the code shows, each why naming the call. ${fallback('impact', 'dependencies are recorded for only part of the map')}`);
  }
  return reasons;
}

/**
 * How far a first map reaches and how deep it read. Breadth is measured against the
 * abilities the survey lists (entry points, dispatched operations, library
 * exports): each has a node, is named inside one, or is excluded with a reason.
 * Depth is measured against the lines this server process served, never against a
 * body's wording: which capabilities' entry files were read, and whether each
 * stated rule cites read lines that hold its condition. Ability-to-ability edges
 * are counted so impact does not end at shared roles. The findings name what a
 * newcomer would trip over (a relation note about a node nobody read, a rule with
 * no read lines, a dependency both ways, an entry file with no code, one file for
 * many nodes). Writes and validate_vault report the line,
 * finalize_project_meaning refuses an `answered` it does not support, and every
 * message names the next call.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

import { cachedSurvey } from '../analyze/breadth-map.mjs';
import { UNIT_SOURCE_EXTENSIONS, unitForPath } from '../analyze/source-units.mjs';
import { decidesLine } from '../evidence-search/symbol-context.mjs';

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

/** Entry symbols too generic to place anything by name. */
const GENERIC_SYMBOLS = new Set(['main', '__main__', 'run', 'default', 'index', 'app', 'cli', 'server', 'next', 'version', 'release', 'label', 'message', 'comment']);
const LISTED = 12;
const NAMING_KINDS = new Set(['capability', 'element']);

/** A name in the vault's words: `create-labels` and `createLabels` are both "create labels". */
function spokenForms(name) {
  const plain = String(name ?? '').replace(/^@[\w-]+\//, '');
  const words = plain.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_/]+/g, ' ').trim();
  return [...new Set([plain, words].filter((form) => form.length >= 3))];
}

/**
 * Where every ability the survey lists sits on the map: a capability or element
 * for it (its file and its name), its name inside a capability or element (a
 * family when half its members are named), or excluded with a reason in the
 * project's `## Uncertainty` or `## Excludes`. Domains and the project do not
 * place an ability: a word in a domain sentence is not a node a reader finds.
 */
function measureAbilities(docs, survey) {
  const abilities = Array.isArray(survey.abilities) ? survey.abilities : [];
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const exclusionLines = project
    ? `${sectionOf(project.body, 'Uncertainty')}\n${sectionOf(project.body, 'Excludes')}`
      .split('\n').filter((line) => line.trim().split(/\s+/).length >= 4)
    : [];
  const nodes = docs.filter((doc) => NAMING_KINDS.has(kindOf(doc)));
  const textOf = (doc) => `${doc.frontmatter?.title ?? ''}\n${doc.body ?? ''}`;
  // A common word ("next", "label") names an ability only in code form or as "the next command".
  const names = (text, row) => {
    const words = [row.name, row.symbol].filter(Boolean).map(String);
    const forms = words.filter((word) => !GENERIC_SYMBOLS.has(word.toLowerCase())).flatMap(spokenForms);
    if (forms.some((form) => namesWord(text, form))) return true;
    if (words.some((word) => GENERIC_SYMBOLS.has(word.toLowerCase())
      && new RegExp(`\`${escapeRegExp(word)}\`|\\b${escapeRegExp(word)}\\s+command\\b`, 'i').test(text))) return true;
    return row.kind === 'executable' && text.includes(dirname(row.path));
  };
  const place = (row) => {
    if (row.kind === 'family') {
      const named = row.members.filter((member) => nodes.some((doc) => namesWord(textOf(doc), member))).length;
      if (named * 2 >= row.members.length) return 'named';
      if (exclusionLines.some((line) => line.includes(row.path) || namesWord(line, lastSegment(row.path)))) return 'excluded';
      return 'unplaced';
    }
    const onFile = nodes.filter((doc) => pathOf(doc) === row.path);
    const sameFile = abilities.filter((other) => other.path === row.path).length;
    if (onFile.some((doc) => sameFile === 1 || names(textOf(doc), row))) return 'node';
    if (nodes.some((doc) => names(textOf(doc), row))) return 'named';
    if (exclusionLines.some((line) => line.includes(row.path) || names(line, row))) return 'excluded';
    return 'unplaced';
  };
  const placed = abilities.map((row) => ({ ...row, place: place(row) }));
  const count = (state) => placed.filter((row) => row.place === state).length;
  return {
    abilities: abilities.length,
    node: count('node'),
    named: count('named'),
    excluded: count('excluded'),
    unplaced: placed.filter((row) => row.place === 'unplaced'),
  };
}

function abilityLabel(row) {
  if (row.kind === 'family') return `the ${row.path} family (${row.members.slice(0, 4).join(', ')}${row.members.length > 4 ? ', ...' : ''})`;
  return `${row.name} (${row.kind}, ${row.path}${row.symbol && row.symbol !== row.name ? ` ${row.symbol}` : ''})`;
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

/** Wording that states a rule: a condition, an order or a default. */
const RULE_WORDS = /\b(?:if|unless|only|when|whenever|before|after|until|otherwise|default|defaults|first|must|requires?|refuses?|rejects?|never|skips?|falls? back|instead)\b/i;
/** A cite of lines: `path:L12-L30`, `path#L12-30`, `path L12–30`, `path:12`. */
const LINE_CITE = /([\w./-]+\.[A-Za-z]{1,5})(?::|#|\s+)L?(\d+)(?:\s*[-–]\s*L?(\d+))?/g;

function preSectionParagraphs(body) {
  const head = String(body ?? '').split(/^##\s/m)[0];
  return head.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function lineCites(body) {
  return [...String(body ?? '').matchAll(LINE_CITE)].map((match) => {
    const startLine = Number(match[2]);
    const endLine = Number(match[3] ?? match[2]);
    return { path: match[1].replace(/^\.\//, ''), startLine: Math.min(startLine, endLine), endLine: Math.max(startLine, endLine) };
  }).filter((cite) => cite.startLine > 0 && cite.endLine - cite.startLine < 400);
}

function servedLines(reads, cite) {
  const ranges = reads?.get(cite.path) ?? [];
  for (let line = cite.startLine; line <= cite.endLine; line += 1) {
    if (!ranges.some((range) => range.startLine <= line && line <= range.endLine)) return false;
  }
  return true;
}

function citedLinesDecide(repoRoot, cite) {
  if (!repoRoot) return true;
  const text = readSmallSource(repoRoot, cite.path);
  if (text === null) return false;
  return text.split(/\r?\n/).slice(cite.startLine - 1, cite.endLine).some(decidesLine);
}

/**
 * Capabilities whose body states a rule (a paragraph after the definition with a
 * condition, order or default) but cites no read lines that hold a condition.
 * With this session's reads, a cite counts only when every cited line was served;
 * without them (a restarted server, the CLI), only the cited lines are checked.
 */
function measureRules(docs, reads, repoRoot) {
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const uncited = [];
  for (const doc of capabilities) {
    const rules = preSectionParagraphs(doc.body).slice(1).filter((paragraph) => RULE_WORDS.test(paragraph));
    if (rules.length === 0) continue;
    const cites = lineCites(doc.body);
    const exact = cites.some((cite) => (!reads || reads.size === 0 || servedLines(reads, cite)) && citedLinesDecide(repoRoot, cite));
    if (exact) continue;
    const path = pathOf(doc);
    uncited.push({ slug: doc.slug, path, symbol: path ? citedSymbol(doc, path) : null, cited: cites.length > 0 });
  }
  return { capabilities: capabilities.length, uncited, judgedAgainstReads: Boolean(reads && reads.size > 0) };
}

/** Capability -> capability `depends_on` edges, and the capabilities in none. */
function measureAbilityEdges(docs) {
  const capability = new Set(docs.filter((doc) => kindOf(doc) === 'capability').map((doc) => doc.slug));
  const edges = dependencyEdges(docs).filter(([from, to]) => capability.has(from) && capability.has(to));
  const linked = new Set(edges.flat());
  return { edges: edges.length, alone: [...capability].filter((slug) => !linked.has(slug)).sort() };
}

function listed(rows, render) {
  const shown = rows.slice(0, LISTED).map(render);
  const more = rows.length - shown.length;
  return `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
}

/** The read and patch that give each listed rule its exact cite. */
function citeRepair(rows) {
  const readable = rows.filter((row) => row.path);
  return `${readable.length > 0 ? `${readCall(readable)}, then ` : ''}patch_concept each rule with the cite of the returned lines that hold its condition, as \`path:L12-L30\``;
}

/**
 * Placement against the survey's abilities, reads and cites against this
 * session, and ability-to-ability edges, with the line a write and validate_vault
 * report. Each list names what to do next.
 */
export function measureBuildDepth(docs, repo, reads) {
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const dependsOn = dependencyEdges(docs).length;
  const breadth = repo ? measureAbilities(docs, repo.survey) : null;
  const depth = measureReads(docs, reads);
  const rules = measureRules(docs, reads, repo?.repoRoot ?? null);
  const abilityEdges = measureAbilityEdges(docs);
  const parts = [];
  if (breadth && breadth.abilities > 0) {
    parts.push(`Breadth, of ${breadth.abilities} abilities the survey lists: ${breadth.node} with their own node, ${breadth.named} named inside a capability or element, ${breadth.excluded} excluded with a reason, ${breadth.unplaced.length} not placed.`);
    if (breadth.unplaced.length > 0) {
      parts.push(`Not placed: ${listed(breadth.unplaced, abilityLabel)}. Place each: add_concepts a capability for it, name it in the node that covers it (a family names its members), or name it with a reason in the project's ## Uncertainty.`);
    }
  }
  if (depth && depth.unread.length > 0) {
    parts.push(`Depth: ${depth.read} of ${depth.capabilities} capabilities had their entry file read this session. Not read: ${listed(depth.unread, (row) => `${row.slug} (${row.path})`)}. Read next; each symbol read returns the guards, defaults and callees that decide it: ${readCall(depth.unread)}.`);
  } else if (!depth && capabilities.length > 0) {
    parts.push('Depth: this server process has served no line or symbol reads, so which entry files were read is unknown.');
  }
  if (rules.uncited.length > 0) {
    parts.push(`Rules: ${rules.uncited.length} of ${rules.capabilities} capabilities state a rule without citing ${rules.judgedAgainstReads ? 'read ' : ''}lines that hold its condition: ${listed(rules.uncited, (row) => row.slug)}. Next: ${citeRepair(rules.uncited)}.`);
  }
  if (capabilities.length > 1 && abilityEdges.alone.length > 0) {
    parts.push(`Abilities: ${abilityEdges.edges} depends_on edges run from one capability to another; none touch ${listed(abilityEdges.alone, (slug) => slug)}. For each, ask which other ability must have run, be configured or be present first, and add_relations that edge with a why citing the read lines that show it.`);
  }
  return {
    breadth,
    reads: depth,
    rules,
    abilityEdges,
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

/**
 * Whether a node's subject was left unread: with this session's reads, a node
 * whose `path:` file was never served; without them (a restarted server, the
 * CLI), a node whose `## Uncertainty` says so.
 */
function unreadBy(reads) {
  if (reads && reads.size > 0) return (node) => Boolean(pathOf(node)) && !reads.has(pathOf(node));
  return (node) => saysOutlinedOnly(node.body);
}

function relationNoteFindings(docs, reads) {
  const isUnread = unreadBy(reads);
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
      const unread = [doc, target].filter(isUnread);
      if (unread.length === 0) continue;
      const type = typeOf.get(ref);
      const selectors = unread.map((node) => pathOf(node)).filter(Boolean)
        .map((path) => ({ path, symbol: citedSymbol(unread.find((node) => pathOf(node) === path), path) }));
      const rewrite = `replace_relation(${JSON.stringify({ from: doc.slug, oldTo: target.slug, oldType: type, newTo: target.slug, newType: type, why: '<what the read shows>', confirm: true })})`;
      findings.push({
        slug: doc.slug,
        code: 'relation-note-on-unread',
        message: `The why on ${doc.slug} -> ${target.slug} says how they work together, but ${unread.map((node) => node.slug).join(' and ')} ${reads && reads.size > 0 ? `${unread.length > 1 ? 'were' : 'was'} never read this session` : 'says it was not read'}. Repair in two calls: ${selectors.length > 0 ? readCall(selectors) : 'read the entry with analyze_repo_structure sourceReads'}, then ${rewrite}, and patch_concept any ## Uncertainty line that said it was not read. Without the read, make the same replace_relation call with a why that says only what the outline shows.`,
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

function ruleCiteFindings(docs, reads, repoRoot) {
  return measureRules(docs, reads, repoRoot).uncited.map((row) => ({
    slug: row.slug,
    code: 'rule-without-read-lines',
    message: `${row.slug} states a rule but cites no ${reads && reads.size > 0 ? 'read ' : ''}lines that hold its condition${row.cited ? ' (its cites name lines that were not served or hold no condition)' : ''}. A reader cannot check it, and a rule taken from a body without its guard or default can be backwards. Repair: ${citeRepair([row])}.`,
  }));
}

/**
 * The validate_vault warnings this module owns; `repoRoot` null skips the file
 * checks, and `reads` (this session's served lines) makes the relation-note and
 * rule checks judge reads instead of wording.
 */
export function buildDepthFindings(docs, { repoRoot, collection, reads } = {}) {
  return [
    ...relationNoteFindings(docs, reads),
    ...ruleCiteFindings(docs, reads, repoRoot ?? null),
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
    reasons.push(`- evidence: ${reads.unread.length} of ${reads.capabilities} capabilities have an entry file this server never served a read for: ${listed(reads.unread, (row) => `${row.slug} (${row.path})`)}. Next call: ${readCall(reads.unread)}; each read returns the guards, defaults and callees that decide it. Patch each body with that rule and the cite of its lines, and finalize again. ${fallback('evidence', 'these abilities were outlined, not read')}`);
  }
  const rules = depth.rules;
  if (status.get('evidence') === 'answered' && rules?.judgedAgainstReads && rules.uncited.length > 0) {
    reasons.push(`- evidence: ${rules.uncited.length} capabilities state a rule without citing read lines that hold its condition: ${listed(rules.uncited, (row) => row.slug)}. Next call: ${citeRepair(rules.uncited)}, and finalize again. ${fallback('evidence', 'some rules cite no read lines')}`);
  }
  const breadth = depth.breadth;
  if (breadth && status.get('abilities') === 'answered' && breadth.unplaced.length > 0) {
    reasons.push(`- abilities: ${breadth.unplaced.length} of ${breadth.abilities} abilities the survey lists sit on no node and no exclusion: ${listed(breadth.unplaced, abilityLabel)}. Next call: add_concepts a capability for each thing a user gets there, or patch_concept the node that covers it to name it (a family names its members), or name it with a reason in the project's ## Uncertainty. ${fallback('abilities', 'abilities not yet placed')}`);
  }
  if (status.get('impact') === 'answered' && depth.capabilities > 0) {
    const edges = depth.abilityEdges;
    if (depth.dependsOn * 2 < depth.capabilities) {
      reasons.push(`- impact: ${depth.dependsOn} depends_on edges for ${depth.capabilities} capabilities, below one per two. Next call: add_relations with the dependencies the code shows, each why naming the call. ${fallback('impact', 'dependencies are recorded for only part of the map')}`);
    } else if (edges && depth.capabilities >= 3 && edges.edges * 3 < depth.capabilities) {
      reasons.push(`- impact: ${edges.edges} depends_on edges run from one capability to another for ${depth.capabilities} capabilities, so "what else stops working" ends at shared roles. Next call: add_relations for each ability that needs another to have run, be configured or be present (none touch ${listed(edges.alone, (slug) => slug)}), each why citing the read lines that show it. ${fallback('impact', 'conditions between abilities are recorded for only part of the map')}`);
    }
  }
  return reasons;
}

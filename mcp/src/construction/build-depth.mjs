/**
 * How far a first map reaches and how deep it read. Breadth is measured against the
 * abilities the survey lists (entry points, dispatched operations, library
 * exports): each has a node, is named inside one, or is excluded with a reason.
 * Depth is measured against the lines this server process served, never against a
 * body's wording: which capabilities' entry files were read, and whether each
 * stated rule cites read lines that hold its condition. Ability-to-ability edges
 * are counted so impact does not end at shared roles, and the roles several
 * capabilities' reads pass through are measured against the elements, the same
 * floor abilities have. The findings name what a
 * newcomer would trip over (a relation note about a node nobody read, a rule with
 * no read lines, a dependency both ways, an entry file with no code, one file for
 * many nodes). Writes and validate_vault report the line,
 * finalize_project_meaning refuses an `answered` it does not support, and every
 * message names the next call.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

import { cachedSurvey } from '../analyze/breadth-map.mjs';
import { repoText } from '../analyze/repo-text.mjs';
import { surveyEntry } from '../analyze/survey-paths.mjs';
import { withoutSpans } from '../analyze/text.mjs';
import { UNIT_SOURCE_EXTENSIONS, unitForPath } from '../analyze/source-units.mjs';
import { decidesLine } from '../evidence-search/symbol-context.mjs';
import { readPath } from './session-reads.mjs';
import { measureUnreadClaims, unreadClaimParts } from './unread-claims.mjs';

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

const ENTRY_STEMS = new Set(['index', '__init__', 'main', 'mod', 'lib']);
const LAYOUT_FOLDERS = new Set(['src', 'lib', 'bin', 'source', 'dist']);

/** The package folder an entry file opens, or null when the file is not a package entry. */
function packageFolder(path) {
  const parts = String(path ?? '').split('/');
  if (!ENTRY_STEMS.has(lastSegment(parts.at(-1) ?? ''))) return null;
  const folders = parts.slice(0, -1).filter((part) => !LAYOUT_FOLDERS.has(part));
  return folders.at(-1) ?? null;
}

/** Kinds whose row is a group placed through its members: a folder family, a module's API. */
const MEMBER_KINDS = new Set(['family', 'api']);
/** Words a reason must keep once the abilities it names are taken out. */
const REASON_WORDS = 3;

/**
 * A one-word flag (`--force`) names an ability only in code form, or as "the
 * force flag"; "--dry-run" also answers to "dry run".
 */
function flagNamed(text, name) {
  const bare = String(name).replace(/^--?/, '');
  if (new RegExp(`(^|[^\\w-])--${escapeRegExp(bare)}(?=$|[^\\w-])|\`${escapeRegExp(bare)}\`|\\b${escapeRegExp(bare)}\\s+(?:flag|option|switch)\\b`, 'i').test(text)) return true;
  const words = bare.split(/[-_.]+/).filter(Boolean);
  return words.length >= 2 && namesWord(text, words.join(' '));
}

/**
 * Whether an exclusion line gives a reason: once every ability name, code span
 * and path it holds is taken out, at least three words remain. "Not modeled: log,
 * ssl, ping." lists names; "log and ssl only tune the transport" says why.
 */
function givesReason(line, abilities) {
  let rest = line.replace(/`[^`]*`/g, ' ').replace(/\S+\/\S+/g, ' ');
  for (const row of abilities) {
    for (const word of [row.name, row.symbol].filter(Boolean).map(String).flatMap(spokenForms)) {
      rest = rest.replace(new RegExp(`(^|[^\\w/.-])${escapeRegExp(word)}(?=$|[^\\w-])`, 'gi'), '$1 ');
    }
  }
  return rest.split(/[^\p{L}\p{N}']+/u).filter((word) => word.length >= 2).length >= REASON_WORDS;
}

/** The tokens of every inline code span: "`cli.List` and `--force`" holds cli, List, cli.List and --force. */
function codeTokens(text) {
  const tokens = new Set();
  for (const span of String(text ?? '').matchAll(/`([^`\n]{1,200})`/g)) {
    const code = span[1].trim();
    tokens.add(code);
    for (const part of code.split(/[^\w.$:/-]+/)) {
      if (!part) continue;
      tokens.add(part);
      for (const piece of part.split(/[.:/]+/)) if (piece) tokens.add(piece);
    }
  }
  return tokens;
}

/** Whether `text` names the row in code form: a code span holding its exact name or symbol, or its evidence cite. */
function namedInCode(text, row, tokens = codeTokens(text)) {
  if (row.kind === 'flag') return flagNamed(text, row.name);
  if (row.evidence && new RegExp(`${escapeRegExp(row.evidence)}(?!\\d)`).test(text)) return true;
  return [row.name, row.symbol, row.kind === 'family' ? lastSegment(row.path) : packageFolder(row.path)]
    .filter(Boolean)
    .some((name) => tokens.has(String(name)));
}

/**
 * Where every ability the survey lists sits on the map:
 * - `node`: a capability or element whose `path:` is its file and which names it
 *   (or is the file's only ability);
 * - `named`: a capability or element whose title names it, or whose body names it
 *   in code form (`list`, `--force`, its `path:Lline`); a family or module API
 *   when half its members are named that way, a flag group by its name or half its
 *   flags. A word in passing ("users list invoices") places nothing;
 * - `excluded`: one line in the project's `## Uncertainty` or `## Excludes` that
 *   points at exactly this ability, by its `path:Lline` or its exact name, and
 *   says why. A line that names several abilities excludes none of them.
 * Domains and the project do not place an ability: a word in a domain sentence
 * is not a node a reader finds.
 */
function measureAbilities(docs, survey) {
  const abilities = Array.isArray(survey.abilities) ? survey.abilities : [];
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const nodes = docs.filter((doc) => NAMING_KINDS.has(kindOf(doc))).map((doc) => {
    const body = String(doc.body ?? '');
    return { doc, title: String(doc.frontmatter?.title ?? ''), body, tokens: codeTokens(body) };
  });
  // A title is a name a reader sees: it may name an ability in words, a common word
  // ("next", "label") only in code form or as "the next command". An ability whose
  // file is a package's entry (index, __init__, main) also answers to the package folder.
  const titleNames = (title, row) => {
    if (row.kind === 'flag') return flagNamed(title, row.name);
    if (row.kind === 'flags') return !row.name.startsWith('--') && namesWord(title, row.name);
    const words = [row.name, row.symbol, packageFolder(row.path)].filter(Boolean).map(String);
    const forms = words.filter((word) => !GENERIC_SYMBOLS.has(word.toLowerCase())).flatMap(spokenForms);
    if (forms.some((form) => namesWord(title, form))) return true;
    return words.some((word) => GENERIC_SYMBOLS.has(word.toLowerCase())
      && new RegExp(`\`${escapeRegExp(word)}\`|\\b${escapeRegExp(word)}\\s+command\\b`, 'i').test(title));
  };
  const nodeNames = (node, row) => {
    if (titleNames(node.title, row) || namedInCode(node.body, row, node.tokens)) return true;
    if (row.kind === 'flags') {
      const members = row.members ?? [];
      return (!row.name.startsWith('--') && node.tokens.has(row.name))
        || members.filter((member) => flagNamed(node.body, member)).length * 2 >= Math.max(members.length, 2);
    }
    return row.kind === 'executable' && node.body.includes(dirname(row.path));
  };
  const memberNamed = (member) => nodes.some((node) => node.tokens.has(member) || namesWord(node.title, member));
  const excludedRows = new Set();
  if (project) {
    const lines = `${sectionOf(project.body, 'Uncertainty')}\n${sectionOf(project.body, 'Excludes')}`.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      const tokens = codeTokens(line);
      const cited = abilities.filter((row) => row.evidence && new RegExp(`${escapeRegExp(row.evidence)}(?!\\d)`).test(line));
      const pointed = cited.length > 0 ? cited : abilities.filter((row) => namedInCode(line, row, tokens) || exactlyNamed(line, row));
      if (pointed.length === 1 && givesReason(line, pointed)) excludedRows.add(pointed[0]);
    }
  }
  const place = (row) => {
    if (MEMBER_KINDS.has(row.kind)) {
      const named = row.members.filter(memberNamed).length;
      if (named * 2 >= row.members.length || nodes.some((node) => namedInCode(node.body, row, node.tokens))) return 'named';
      return excludedRows.has(row) ? 'excluded' : 'unplaced';
    }
    const sameFile = abilities.filter((other) => other.path === row.path).length;
    if (nodes.some((node) => pathOf(node.doc) === row.path && (sameFile === 1 || nodeNames(node, row)))) return 'node';
    if (nodes.some((node) => nodeNames(node, row))) return 'named';
    return excludedRows.has(row) ? 'excluded' : 'unplaced';
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

/**
 * Whether a line holds the row's exact name (case and all) as a whole word: list,
 * not "List" or "listing". A common word ("App", "next") points at a row only in
 * code form or by its cite.
 */
function exactlyNamed(line, row) {
  const name = String(row.name ?? '');
  if (name.length < 2 || GENERIC_SYMBOLS.has(name.toLowerCase())) return false;
  return new RegExp(`(^|[^\\w/.-])${escapeRegExp(name)}(?=$|[^\\w-])`).test(line);
}

function abilityLabel(row) {
  const members = row.members ? `: ${row.members.slice(0, 4).map((name) => repoText(name, 80)).join(', ')}${row.members.length > 4 ? ', ...' : ''}` : '';
  if (row.kind === 'family') return `the ${repoText(row.path)} family (${repoText(row.evidence ?? row.path)}${members})`;
  const at = row.evidence ?? row.path;
  return `${repoText(row.name, 120)} (${row.kind}, ${repoText(at)}${row.symbol && row.symbol !== row.name ? ` ${repoText(row.symbol, 120)}` : ''}${members})`;
}

/** Every row, none cut: finalize names each ability it holds the map to. */
function listedAll(rows, render) {
  return rows.map(render).join('; ');
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
/**
 * A capability counts as read when its body cites lines this session served, under
 * the file's current stamp, and those lines hold a condition. Opening a file, or
 * line 1 of it, is not reading the rule. Null only when no repository is grounded.
 */
function measureReads(docs, reads, repoRoot) {
  if (!reads) return null;
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability' && pathOf(doc));
  const unread = capabilities
    .filter((doc) => !lineCites(doc.body, reads, repoRoot).some((cite) => servedLines(reads, cite) && citedLinesDecide(repoRoot, cite)))
    .map((doc) => ({ slug: doc.slug, path: pathOf(doc), symbol: citedSymbol(doc, pathOf(doc)) }))
    .sort((left, right) => (left.slug < right.slug ? -1 : 1));
  return { capabilities: capabilities.length, read: capabilities.length - unread.length, unread, served: reads.size };
}

/** Wording that states a rule: a condition, an order or a default. */
const RULE_WORDS = /\b(?:if|unless|only|when|whenever|before|after|until|otherwise|default|defaults|first|must|requires?|refuses?|rejects?|never|skips?|falls? back|instead)\b/i;
/**
 * A cite of lines: `path:L12-L30`, `path#L12-30`, `path L12–30`, `path:12`. The
 * path takes any character a repository file name may hold (`app/[locale]/(shop)`,
 * `@scope/x`, `$id`, `+page`), so every cite the server emits parses.
 */
const LINE_CITE = /([^\s`'"<>|,;]{1,300}?\.[A-Za-z]{1,5})(?::|#|\s+)L?(\d+)(?:\s*[-–]\s*L?(\d+))?/g;
const OPENERS = /^[([{]/;

function preSectionParagraphs(body) {
  const head = String(body ?? '').split(/^##\s/m)[0];
  return head.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

/**
 * The repository path a cited token names. Prose brackets around a cite join the
 * token (`(app/(shop)/page.tsx:L2)`), so each leading bracket is tried off in turn;
 * a path this session read wins, mapped back from the sub-root it was cited under,
 * then a file that exists in the repository.
 */
function citePath(token, reads, repoRoot) {
  const candidates = [token.replace(/^\.\//, '')];
  while (OPENERS.test(candidates.at(-1))) candidates.push(candidates.at(-1).slice(1).replace(/^\.\//, ''));
  const read = candidates.find((path) => reads?.has(path));
  if (read) return readPath(reads, read);
  return (repoRoot && candidates.find((path) => surveyEntry(repoRoot, path))) || candidates.at(-1);
}

function lineCites(body, reads = null, repoRoot = null) {
  return [...String(body ?? '').matchAll(LINE_CITE)].map((match) => {
    const startLine = Number(match[2]);
    const endLine = Number(match[3] ?? match[2]);
    return { path: citePath(match[1], reads, repoRoot), startLine: Math.min(startLine, endLine), endLine: Math.max(startLine, endLine) };
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
    const cites = lineCites(doc.body, reads, repoRoot);
    const exact = cites.some((cite) => (!reads || servedLines(reads, cite)) && citedLinesDecide(repoRoot, cite));
    if (exact) continue;
    const path = pathOf(doc);
    uncited.push({ slug: doc.slug, path, symbol: path ? citedSymbol(doc, path) : null, cited: cites.length > 0 });
  }
  return { capabilities: capabilities.length, uncited, judgedAgainstReads: Boolean(reads) };
}

/** Context parts that are code a capability leans on: not its callers, its own class header or a constant. */
const ROLE_PARTS = new Set(['callee', 'constructor', 'implementation']);
/** Shared roles listed at most, most shared first; a longer list is a tail of helpers. */
const ROLE_LIMIT = 8;

/** A Go method's role is its type: `Session.Send` and `Session.close` are both the session. */
function roleName(symbol) {
  const [owner, member] = String(symbol).split('.');
  return member && /^[A-Z]/.test(owner) ? owner : String(symbol);
}

/**
 * The implementation roles two or more capabilities' reads pass through, and
 * where each sits: an element whose `path:` is its file (and, when the file
 * holds several listed roles, whose cited symbol is this one or whose body cites
 * lines inside this role's) or whose title names it, one
 * line in the project's ## Uncertainty or ## Excludes that points at it alone
 * and says why, or unplaced. A capability's reads are the symbol reads whose
 * body it cites, or whose context it cites when the read is of its own `path:`
 * file; a role is a callee,
 * constructor or implementation one of those reads returned, grouped by its
 * type. A capability's own entry symbol, or lines it cites in its own entry
 * file, are an ability, not a role. Null without
 * this session's reads: a restarted server cannot tell.
 */
function measureRoles(docs, reads, repoRoot) {
  if (!reads || reads.size === 0) return null;
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const usersOf = new Map();
  const entries = new Set();
  // The lines a capability cites in its own entry file: code there is that ability, not a role it leans on.
  const own = [];
  for (const doc of capabilities) {
    const path = pathOf(doc);
    const symbol = path ? citedSymbol(doc, path) : null;
    if (symbol) entries.add(`${path}\0${symbol.split('.').pop()}`);
    for (const cite of lineCites(doc.body, reads, repoRoot)) {
      if (cite.path === path) own.push(cite);
      for (const range of reads.get(cite.path) ?? []) {
        if (!range.read || range.startLine > cite.endLine || range.endLine < cite.startLine) continue;
        // A part another read returned (its callee) is not this capability's way through that read's other callees.
        if (range.role && range.read.slice(0, range.read.lastIndexOf(':L')) !== path) continue;
        if (!usersOf.has(range.read)) usersOf.set(range.read, new Set());
        usersOf.get(range.read).add(doc.slug);
      }
    }
  }
  const groups = new Map();
  for (const [path, ranges] of reads) {
    if (reads.cited?.has(path)) continue;
    for (const range of ranges) {
      const users = range.read ? usersOf.get(range.read) : null;
      // A part found by name alone (its import names no file here) is weaker evidence, not a shared role.
      if (!users || !ROLE_PARTS.has(range.role) || range.byName || typeof range.symbol !== 'string') continue;
      if (entries.has(`${path}\0${range.symbol.split('.').pop()}`)
        || own.some((cite) => cite.path === path && cite.startLine <= range.endLine && cite.endLine >= range.startLine)) continue;
      const name = roleName(range.symbol);
      const key = `${path}\0${name}`;
      const group = groups.get(key) ?? { name, symbol: name, kind: 'role', path, line: range.startLine, endLine: range.endLine, users: new Set() };
      group.line = Math.min(group.line, range.startLine);
      group.endLine = Math.max(group.endLine, range.endLine);
      for (const slug of users) group.users.add(slug);
      groups.set(key, group);
    }
  }
  const candidates = [...groups.values()].filter((group) => group.users.size >= 2)
    .sort((a, b) => b.users.size - a.users.size || a.path.localeCompare(b.path) || a.line - b.line)
    .slice(0, ROLE_LIMIT)
    .map((group) => ({ ...group, evidence: `${group.path}:L${group.line}`, lines: `${group.path}:L${group.line}-L${group.endLine}`, users: [...group.users].sort() }));
  const elements = docs.filter((doc) => kindOf(doc) === 'element').map((doc) => {
    const path = pathOf(doc);
    const symbol = path ? citedSymbol(doc, path) : null;
    const cites = path ? lineCites(doc.body, reads, repoRoot).filter((cite) => cite.path === path) : [];
    return { path, symbol: symbol ? roleName(symbol) : null, cites, title: String(doc.frontmatter?.title ?? '') };
  });
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const exclusionLines = project
    ? `${sectionOf(project.body, 'Uncertainty')}\n${sectionOf(project.body, 'Excludes')}`.split('\n').filter((line) => line.trim())
    : [];
  // A title is a name a reader sees; a body that mentions a role ("it does not call `x`") places nothing.
  const titled = (element, row) => !GENERIC_SYMBOLS.has(row.name.toLowerCase()) && spokenForms(row.name).some((form) => namesWord(element.title, form));
  const place = (row) => {
    const sameFile = candidates.filter((other) => other.path === row.path).length;
    // In a file holding several listed roles, the element says which: its symbol, or a cite inside this role's lines.
    const names = (element) => element.symbol === row.name
      || element.cites.some((cite) => cite.startLine >= row.line && cite.endLine <= row.endLine);
    if (elements.some((element) => (element.path === row.path && (sameFile === 1 || names(element))) || titled(element, row))) return 'element';
    const excluded = exclusionLines.some((line) => {
      const pointed = candidates.filter((other) => new RegExp(`${escapeRegExp(other.evidence)}(?!\\d)`).test(line)
        || namedInCode(line, other, codeTokens(line)) || exactlyNamed(line, other));
      return pointed.length === 1 && pointed[0] === row && givesReason(line, pointed);
    });
    return excluded ? 'excluded' : 'unplaced';
  };
  const placed = candidates.map((row) => ({ ...row, place: place(row) }));
  return {
    candidates: placed.length,
    element: placed.filter((row) => row.place === 'element').length,
    excluded: placed.filter((row) => row.place === 'excluded').length,
    unplaced: placed.filter((row) => row.place === 'unplaced'),
  };
}

function roleLabel(row) {
  const users = row.users.slice(0, 3).join(', ') + (row.users.length > 3 ? ` and ${row.users.length - 3} more` : '');
  return `${repoText(row.name, 120)} (${repoText(row.lines ?? row.evidence)}, read for ${users})`;
}

/** The writes that give each unplaced role its element, or its one-line exclusion. */
const ROLE_REPAIR = 'add_concepts an element for each, titled for the job it does for those abilities (not its code name), with path: its file and a body saying what they rely on it for that cites lines inside the range listed for it (path:Lstart-Lend, not the whole file); then add_relations from each capability that leans on it. Or exclude one in the project\'s ## Uncertainty with one line for it alone that cites its path:Lline and says why it is no shared role';

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
  const depth = measureReads(docs, reads, repo?.repoRoot ?? null);
  const rules = measureRules(docs, reads, repo?.repoRoot ?? null);
  const abilityEdges = measureAbilityEdges(docs);
  const roles = measureRoles(docs, reads, repo?.repoRoot ?? null);
  const unread = measureUnreadClaims(docs, repo, reads);
  const parts = [];
  if (breadth && breadth.abilities > 0) {
    parts.push(`Breadth, of ${breadth.abilities} abilities the survey lists: ${breadth.node} with their own node, ${breadth.named} named inside a capability or element, ${breadth.excluded} excluded with a reason, ${breadth.unplaced.length} not placed.`);
    if (breadth.unplaced.length > 0) {
      parts.push(`Not placed: ${listed(breadth.unplaced, abilityLabel)}. Place each: add_concepts a capability for it, name it in the title or in code form (\`name\`) of the node that covers it (a family or group names its members), or exclude it in the project's ## Uncertainty with one line for it alone that cites its path:Lline or exact name and says why.`);
    }
  }
  if (depth && depth.unread.length > 0) {
    parts.push(`Depth: ${depth.read} of ${depth.capabilities} capabilities cite lines this session read that hold a condition.${depth.served === 0 ? ' This server process has served no reads; a restarted server keeps none.' : ''} Not yet: ${listed(depth.unread, (row) => `${row.slug} (${row.path})`)}. Read next, then cite the lines that decide each; a symbol read returns the guards, defaults and callees that decide it: ${readCall(depth.unread)}.`);
  }
  // The rule and edge lists name slugs across the vault; they speak only for a grounded build.
  if (repo && rules.uncited.length > 0) {
    parts.push(`Rules: ${rules.uncited.length} of ${rules.capabilities} capabilities state a rule without citing ${rules.judgedAgainstReads ? 'read ' : ''}lines that hold its condition: ${listed(rules.uncited, (row) => row.slug)}. Next: ${citeRepair(rules.uncited)}.`);
  }
  if (repo && roles && roles.unplaced.length > 0) {
    parts.push(`Roles: ${roles.unplaced.length} of the ${roles.candidates} implementation roles that two or more capabilities' reads pass through have no element: ${listedAll(roles.unplaced, roleLabel)}. Next: ${ROLE_REPAIR}.`);
  }
  parts.push(...unreadClaimParts(unread));
  if (repo && capabilities.length > 1 && abilityEdges.alone.length > 0) {
    parts.push(`Abilities: ${abilityEdges.edges} depends_on edges run from one capability to another; none touch ${listed(abilityEdges.alone, (slug) => slug)}. For each, ask which other ability must have run, be configured or be present first, and add_relations that edge with a why citing the read lines that show it.`);
  }
  return {
    breadth,
    reads: depth,
    rules,
    abilityEdges,
    roles,
    unread,
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
    // Each span is found in one forward pass: an unclosed opener never rescans the file.
    rest = withoutSpans(rest, /("""|''')/, (match) => match[1]);
    rest = withoutSpans(rest, /^[ \t]*from[ \t]+[\w.]+[ \t]+import[ \t]*\(/m, ')');
    rest = withoutSpans(rest, /^__all__[ \t]*\+?=[ \t]*([[(])/m, (match) => (match[1] === '[' ? ']' : ')'));
    rest = rest.replace(/#.*$/gm, '');
  } else {
    rest = withoutSpans(rest, /\/\*/, '*/').replace(/(^|[^:])\/\/.*$/gm, '$1');
    rest = withoutSpans(rest, /^[ \t]*(?:import|export)[ \t]+(?:type[ \t]+)?\{/m, '}', { after: /[ \t]*from[ \t]*['"][^'"\n]+['"];?/y });
    rest = withoutSpans(rest, /^[ \t]*import[ \t]*\(/m, ')');
  }
  const lines = rest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const declarative = /^(?:import\s|from\s+[\w.]+\s+import\s|export\s+\*|export\s+(?:type\s+)?\{[^}]*\}\s*from\s|package\s+\w+|use\s+[\w:{}, *]+;|(?:pub\s+)?mod\s+\w+;|['"]use strict['"];?|module\.exports\s*=\s*require\(|[)\]};,]+$)/;
  return lines.some((line) => !declarative.test(line));
}

/** A small source file the vault names, or null: a path outside the root, through a link or under a private name is never opened. */
function readSmallSource(repoRoot, path) {
  if (!UNIT_SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  const inside = surveyEntry(repoRoot, path);
  if (!inside) return null;
  try {
    const abs = join(repoRoot, inside);
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
    message: `${row.slug} states a rule but cites no ${reads ? 'read ' : ''}lines that hold its condition${row.cited ? ' (its cites name lines that were not served or hold no condition)' : ''}. A reader cannot check it, and a rule taken from a body without its guard or default can be backwards. Repair: ${citeRepair([row])}.`,
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
    reasons.push(`- evidence: ${reads.unread.length} of ${reads.capabilities} capabilities cite no lines this server read that hold a condition${reads.served === 0 ? ' (this server process has served no reads; a restarted server keeps none)' : ''}: ${listed(reads.unread, (row) => `${row.slug} (${row.path})`)}. Next call: ${readCall(reads.unread)}; each read returns the guards, defaults and callees that decide it. Patch each body with that rule and the cite of its lines, and finalize again. ${fallback('evidence', 'these abilities were outlined, not read')}`);
  }
  const rules = depth.rules;
  if (status.get('evidence') === 'answered' && reasons.length === 0 && rules?.judgedAgainstReads && rules.uncited.length > 0) {
    reasons.push(`- evidence: ${rules.uncited.length} capabilities state a rule without citing read lines that hold its condition: ${listed(rules.uncited, (row) => row.slug)}. Next call: ${citeRepair(rules.uncited)}, and finalize again. ${fallback('evidence', 'some rules cite no read lines')}`);
  }
  const breadth = depth.breadth;
  if (breadth && status.get('abilities') === 'answered' && breadth.unplaced.length > 0) {
    reasons.push(`- abilities: ${breadth.unplaced.length} of ${breadth.abilities} abilities the survey lists, the floor under the map, sit on no node by name and no exclusion: ${listedAll(breadth.unplaced, abilityLabel)}. Next call: add_concepts a capability for each thing a user or operator gets there, or patch_concept the node that covers it to name it in its title or in code form (\`name\`, a family or group names its members; a word in passing does not count), or exclude it in the project's ## Uncertainty with one line for it alone that cites its path:Lline or exact name and says why it is not an ability. ${fallback('abilities', 'abilities not yet placed')}`);
  }
  if (status.get('impact') === 'answered' && depth.roles?.unplaced.length > 0) {
    reasons.push(`- impact: ${depth.roles.unplaced.length} implementation roles that two or more capabilities' reads pass through have no element, so "what breaks if I change it" has no node to start from: ${listedAll(depth.roles.unplaced, roleLabel)}. Next call: ${ROLE_REPAIR}. ${fallback('impact', 'shared roles not modelled as elements')}`);
  }
  if (status.get('impact') === 'answered' && depth.capabilities > 0 && !reasons.some((reason) => reason.startsWith('- impact:'))) {
    const edges = depth.abilityEdges;
    if (depth.dependsOn * 2 < depth.capabilities) {
      reasons.push(`- impact: ${depth.dependsOn} depends_on edges for ${depth.capabilities} capabilities, below one per two. Next call: add_relations with the dependencies the code shows, each why naming the call. ${fallback('impact', 'dependencies are recorded for only part of the map')}`);
    } else if (edges && depth.capabilities >= 3 && edges.edges * 3 < depth.capabilities) {
      reasons.push(`- impact: ${edges.edges} depends_on edges run from one capability to another for ${depth.capabilities} capabilities, so "what else stops working" ends at shared roles. Next call: add_relations for each ability that needs another to have run, be configured or be present (none touch ${listed(edges.alone, (slug) => slug)}), each why citing the read lines that show it. ${fallback('impact', 'conditions between abilities are recorded for only part of the map')}`);
    }
  }
  return reasons;
}

import { repoText } from '../../analyze/repo-text.mjs';
import { citedSymbol, lineCites } from './line-cites.mjs';
import {
  codeTokens,
  escapeRegExp,
  exactlyNamed,
  GENERIC_SYMBOLS,
  givesReason,
  namedInCode,
  namesWord,
  spokenForms,
} from './name-matching.mjs';
import { kindOf, pathOf, sectionOf } from './node-fields.mjs';

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
export function measureRoles(docs, reads, repoRoot) {
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

export function roleLabel(row) {
  const users = row.users.slice(0, 3).join(', ') + (row.users.length > 3 ? ` and ${row.users.length - 3} more` : '');
  return `${repoText(row.name, 120)} (${repoText(row.lines ?? row.evidence)}, read for ${users})`;
}

/** The writes that give each unplaced role its element, or its one-line exclusion. */
export const ROLE_REPAIR = 'add_concepts an element for each, titled for the job it does for those abilities (not its code name), with path: its file and a body saying what they rely on it for that cites lines inside the range listed for it (path:Lstart-Lend, not the whole file); then add_relations from each capability that leans on it. Or exclude one in the project\'s ## Uncertainty with one line for it alone that cites its path:Lline and says why it is no shared role';

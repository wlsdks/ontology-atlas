/**
 * The code around a symbol that decides what its body does, returned with a
 * `{path, symbol}` read so depth does not depend on the reader following calls.
 * Places that hold a rule the body alone hides: the caller's guard (the `if` or
 * early return around the call), the owner's constructor or header (defaults,
 * the resolver a field holds), a direct callee (an options builder, a
 * `_drain_if_full`), the implementations a field call may reach (a store that
 * refuses a lookup), a callee one call deeper (the route table a lazy accessor
 * builds), and a named constant the served code uses (a header name). Each
 * candidate is ranked by its lines that decide: a condition, a branch, a throw,
 * or a literal default. A callee named in the body's own condition, or one that
 * refuses, ranks higher; one call deeper ranks lower. The best are returned
 * within a byte cap, and each part names its path and lines so a body can cite
 * it exactly.
 */

import { calleesOf, callsOnLine, enclosingClass } from './callees.mjs';
import { callSitesOf } from './declaration-index.mjs';
import { repoText } from '../analyze/repo-text.mjs';

/**
 * 6 KiB holds the three to five deciding parts measured on the trial
 * repositories (a guard window is about 0.5 KiB, a constructor or options
 * builder 0.5 to 2 KiB) beside an 8 KiB body, so a full read stays under 14 KiB
 * and two still fit the 32 KiB text budget of one call. A part longer than 60
 * lines is cut there and its remainder named for the next read.
 */
export const SYMBOL_CONTEXT_LIMITS = Object.freeze({
  bytes: 6 * 1024,
  partLines: 60,
  callers: 2,
  callerSites: 8,
  guardWindow: 12,
  wholeCaller: 40,
  ownerHeader: 30,
  // Direct callees whose own callees are ranked, and the parts that adds at most.
  deeperSources: 6,
  deeperCallees: 24,
  // A callee this short (a getter, a lazy default) is no level of its own.
  accessorLines: 8,
  // Decisive lines counted for one part one call deeper, so one long body cannot crowd out the rest.
  deeperDeciding: 8,
  constantLines: 8,
  // Lines of a callee examined for its calls, conditions and refusals: what one read serves.
  examinedLines: 200,
  // The deciding lines served in place of a pointer to them: a caller's guard the
  // read would only name, or the conditions in the part of a long body it cut.
  decidingLines: 40,
});
// A line this long is generated or minified: a cut body is not scanned past it,
// since the outline may not see a declaration that starts on it.
const SCANNED_LINE_CHARS = 1000;

const CONDITION = /\b(?:if|elif|else|unless|switch|case|when|match|guard|while|raise|throw|except|catch|default)\b|\b(?:errors\.New|fmt\.Errorf)\(|\?\?|\|\||&&/u;
/** A line that refuses: it throws, raises, panics or builds an error to return. */
const REFUSAL = /\b(?:throw|raise|panic|errors\.New|fmt\.Errorf)\b/u;
// A decisive line longer than this is generated or minified; only its head is examined.
const DECIDE_CHARS = 2000;
const SPACE = /\s/u;
const DEFAULT_VALUE = /(?:^|[\s(,{])[A-Za-z_$][\w$]*\s*(?::=|=(?!=)|:)\s*(?:true|false|True|False|None|null|nil|-?\d[\d_.]*|"[^"\n]*"|'[^'\n]*')\s*(?:[,)}]|$)/u;
const COMMENT = /^\s*(?:\/\/|#|\*|\/\*)/u;
const DECIDING_NAME = /default|Default|option|Option|config|Config|setting|resolve|Resolve|verif|Verif|valid|Valid|check|Check|allow|Allow|should|mark|guard|policy|filter|select|choose|decide|^new[A-Z]|^New[A-Z]|^__init__$|^constructor$|^can[A-Z]|^is[A-Z]|^_?drain|^_?ensure/u;

/** Whether one source line decides: a condition, a branch, a throw or a literal default. */
export function decidesLine(line) {
  const head = withoutTerminator(line.length > DECIDE_CHARS ? line.slice(0, DECIDE_CHARS) : line);
  if (COMMENT.test(head)) return false;
  return CONDITION.test(head) || hasTernary(head) || DEFAULT_VALUE.test(head);
}

/**
 * `a ? b : c` with spaces around both marks and no colon between them, in one
 * right-to-left pass: each ` ? ` is checked against the nearest colon after it.
 */
function hasTernary(line) {
  let colon = -1;
  for (let index = line.length - 1; index > 0; index -= 1) {
    const char = line[index];
    if (char === ':') colon = index;
    else if (char === '?' && SPACE.test(line[index - 1]) && SPACE.test(line[index + 1] ?? '')
      && colon > index + 3 && SPACE.test(line[colon - 1]) && SPACE.test(line[colon + 1] ?? '')) return true;
  }
  return false;
}

/** A line without its `\n` or `\r\n`, so a default at the end of a served line still reads as one. */
function withoutTerminator(line) {
  let end = line.length;
  while (end > 0 && (line.charCodeAt(end - 1) === 10 || line.charCodeAt(end - 1) === 13)) end -= 1;
  return end === line.length ? line : line.slice(0, end);
}

/** Names called on the lines that branch: `if !a.Routes().Empty()` names Routes. */
function calledInConditions(lines) {
  const names = new Set();
  for (const line of lines) {
    const head = line.length > DECIDE_CHARS ? line.slice(0, DECIDE_CHARS) : line;
    if (COMMENT.test(head) || !(CONDITION.test(head) || hasTernary(head))) continue;
    for (const call of callsOnLine(head)) names.add(call.name);
  }
  return names;
}

/** What makes a callee more likely to hold the rule: a deciding name, a call in a condition, a refusal. */
function calleeBonus(name, lines, conditionNames) {
  return (DECIDING_NAME.test(name) ? 3 : 0) + (conditionNames.has(name) ? 4 : 0)
    + (lines.some((line) => !COMMENT.test(line) && REFUSAL.test(line.length > DECIDE_CHARS ? line.slice(0, DECIDE_CHARS) : line)) ? 2 : 0);
}

const CONSTANT = /^(?:export\s+)?(?:(?:const|let|var|final|static|readonly|pub)\s+){0,3}([A-Za-z_$][\w$]*)(?:\s+[\w$.*]+)?\s*(?::\s*[\w$.]+\s*)?(?::=|=)\s*(?:"[^"\n]*"|'[^'\n]*'|`[^`\n]*`|-?\d[\w.]*|true|false|True|False|None|null|nil)\s*[,;]?\s*(?:(?:\/\/|#).*)?$/u;
const CONSTANT_BLOCK = /^(?:const|var)\s*\(\s*$/u;
const CONSTANTS = new WeakMap();

/**
 * name -> line of each literal constant a file declares at module level (or in a
 * Go `const (` block): `resumeHeader = "X-RESUME-ID"`, `MAX_RETRIES = 3`.
 * One anchored match per line.
 */
function constantsOf(file) {
  if (CONSTANTS.has(file)) return CONSTANTS.get(file);
  const constants = new Map();
  let block = false;
  for (const [index, raw] of file.lines.entries()) {
    const line = withoutTerminator(raw);
    if (line.length > 400) continue;
    const indent = /^[\t ]*/u.exec(line)[0].length;
    if (indent === 0 && CONSTANT_BLOCK.test(line)) {
      block = true;
      continue;
    }
    if (block && indent === 0 && line.startsWith(')')) block = false;
    if (indent > 0 && !block) continue;
    const match = CONSTANT.exec(line.trim());
    if (match && !constants.has(match[1])) constants.set(match[1], index + 1);
  }
  CONSTANTS.set(file, constants);
  return constants;
}

function decidingCount(lines) {
  return lines.reduce((count, line) => count + (decidesLine(line) ? 1 : 0), 0);
}

function indentAt(lines, line) {
  return /^[\t ]*/u.exec(lines[line - 1] ?? '')[0].length;
}

function isCode(declaration) {
  return declaration.kind !== 'export' && declaration.kind !== 'section';
}

/** The last line of a declaration: before the next declaration at its indent or shallower. */
function declarationEnd(lines, declarations, declaration) {
  const indent = indentAt(lines, declaration.line);
  const next = declarations.find((candidate) => candidate.line > declaration.line && isCode(candidate) && indentAt(lines, candidate.line) <= indent);
  let end = next ? next.line - 1 : lines.length;
  while (end > declaration.line && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return end;
}

/** The innermost function-like declaration whose extent holds `line`. */
function enclosing(lines, declarations, line) {
  let best = null;
  for (const declaration of declarations) {
    if (!isCode(declaration) || declaration.line > line) continue;
    if (!['function', 'method', 'arrow', 'class', 'struct'].includes(declaration.kind) && !/^(?:function|method)/.test(declaration.kind)) continue;
    if (declarationEnd(lines, declarations, declaration) < line) continue;
    if (!best || declaration.line > best.line) best = declaration;
  }
  return best;
}

const OWNER_KINDS = new Set(['class', 'struct', 'interface', 'type']);

/** The class or type a member belongs to: the name prefix (Go) or the declaration around it. */
function ownerOf(lines, declarations, declaration) {
  if (declaration.name.includes('.')) {
    const name = declaration.name.split('.')[0];
    return { name, declaration: declarations.find((candidate) => candidate.name === name && OWNER_KINDS.has(candidate.kind)) ?? null };
  }
  const indent = indentAt(lines, declaration.line);
  if (indent === 0) return null;
  let best = null;
  for (const candidate of declarations) {
    if (candidate.line >= declaration.line || !OWNER_KINDS.has(candidate.kind) || indentAt(lines, candidate.line) >= indent) continue;
    if (declarationEnd(lines, declarations, candidate) < declaration.line) continue;
    if (!best || candidate.line > best.line) best = candidate;
  }
  return best ? { name: best.name, declaration: best } : null;
}

function slice(lines, startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('');
}

/** Runs of a sorted set of line numbers, joined across gaps of up to three lines. */
function runs(numbers) {
  const out = [];
  for (const number of numbers) {
    const last = out.at(-1);
    if (last && number <= last.endLine + 4) last.endLine = Math.max(last.endLine, number);
    else out.push({ startLine: number, endLine: number });
  }
  return out;
}

/**
 * The named constants `texts` use, each in the file that uses it, first used
 * first, at most `constantLines`; lines `taken` already holds are skipped.
 */
function constantsUsed(texts, taken) {
  const rows = [];
  for (const { file, text } of texts) {
    if (!file) continue;
    const constants = constantsOf(file);
    if (constants.size === 0) continue;
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*/gu)) {
      const line = constants.get(match[0]);
      if (!line || rows.some((row) => row.file.path === file.path && row.line === line)) continue;
      if (taken.some((range) => range.path === file.path && range.startLine <= line && line <= range.endLine)) continue;
      rows.push({ file, line, name: match[0], bytes: Buffer.byteLength(file.lines[line - 1] ?? '', 'utf8') });
      if (rows.length >= SYMBOL_CONTEXT_LIMITS.constantLines) return rows;
    }
  }
  return rows;
}

/**
 * A member named as a read selector names it: `Image.load` for `load` inside
 * `class Image`, so the part can be read by symbol and grouped by its class.
 */
function qualified(file, symbol, line) {
  if (symbol.includes('.')) return symbol;
  const declaration = file.declarations.find((candidate) => candidate.line === line && candidate.name === symbol);
  const owner = declaration ? enclosingClass(file, declaration) : null;
  return owner ? `${owner.name}.${symbol}` : symbol;
}

/**
 * The candidates around one symbol read, ranked, then the parts that fit.
 *
 * @param {object} input
 * @param {string} input.rootPath repository root
 * @param {string[]} input.ignore extra ignore names
 * @param {string} input.path the read file
 * @param {string[]} input.lines the read file's lines, with terminators
 * @param {object[]} input.declarations its outline
 * @param {object} input.declaration the symbol's declaration
 * @param {number} input.bodyEnd the body's last line
 * @param {{ name: string, path: string, line: number }[]} input.callees direct callees
 * @param {(path: string) => ({ lines: string[], declarations: object[], sha256: string } | null)} input.open
 * @param {number} input.budget bytes this read may add
 * @param {number} [input.symbolEnd] the declaration's last line, past `bodyEnd` when the read was cut
 * @param {boolean} [input.endTrusted] whether the outline saw every declaration up to `symbolEnd`
 * @param {(path: string, startLine: number, endLine: number) => boolean} [input.served] whether this session already served those lines
 */
export function symbolContext({ rootPath, ignore, path, lines, declarations, declaration, bodyEnd, callees, open, files, budget, symbolEnd = bodyEnd, endTrusted = true, served = null }) {
  const candidates = [];
  const bodyDecides = decidingCount(lines.slice(declaration.line - 1, bodyEnd)) > 0;
  const own = declaration.name.split('.').pop();
  const add = (role, file, symbol, startLine, endLine, bonus = 0, { via = null, cap = Infinity, byName = false } = {}) => {
    const cut = Math.min(endLine, startLine + SYMBOL_CONTEXT_LIMITS.partLines - 1);
    const text = slice(file.lines, startLine, cut);
    const deciding = Math.min(cap, decidingCount(file.lines.slice(startLine - 1, cut)));
    // An implementation is shown for what it decides, never for its name alone.
    if (role === 'implementation' && deciding === 0) return;
    const score = deciding * 2 + bonus;
    if (score <= 0 || text.length === 0) return;
    const candidate = { role, path: file.path, symbol: qualified(file, symbol, startLine), startLine, endLine: cut, more: cut < endLine ? endLine : null, text, sha256: file.sha256, score, via, byName };
    candidates.push(candidate);
    return candidate;
  };
  const self = { path, lines, declarations, sha256: open(path)?.sha256 };

  // The owner: its header (a class docstring, fields with defaults) and its constructors.
  const owner = ownerOf(lines, declarations, declaration);
  if (owner?.declaration && owner.declaration.line < declaration.line) {
    const firstMember = declarations.find((candidate) => candidate.line > owner.declaration.line && isCode(candidate)
      && indentAt(lines, candidate.line) > indentAt(lines, owner.declaration.line));
    const headerEnd = Math.min((firstMember?.line ?? owner.declaration.line + 1) - 1, owner.declaration.line + SYMBOL_CONTEXT_LIMITS.ownerHeader - 1);
    if (headerEnd > owner.declaration.line && !['struct', 'type'].includes(owner.declaration.kind)) {
      add('owner', self, owner.name, owner.declaration.line, headerEnd, 2);
    }
  }
  if (owner) {
    const constructors = declarations.filter((candidate) => isCode(candidate) && candidate.line !== declaration.line && (
      candidate.name === `${owner.name}.__init__` || candidate.name === `${owner.name}.constructor`
      || ((candidate.name === '__init__' || candidate.name === 'constructor') && owner.declaration
        && candidate.line > owner.declaration.line && candidate.line <= declarationEnd(lines, declarations, owner.declaration))
      || (candidate.kind === 'function' && new RegExp(`\\)\\s*\\(?\\*?${owner.name}\\b`, 'u').test(candidate.signature ?? ''))
    ));
    for (const constructor of constructors) {
      add('constructor', self, constructor.name, constructor.line, declarationEnd(lines, declarations, constructor), 3);
    }
  }

  // The callers: the guard around each call, or the whole caller when it is short.
  const { sites, total } = callSitesOf(rootPath, own, { ignore, limit: SYMBOL_CONTEXT_LIMITS.callerSites, files: files?.() });
  const callerRows = [];
  for (const site of sites) {
    if (site.path === path && site.line >= declaration.line && site.line <= bodyEnd) continue;
    const file = site.path === path ? self : open(site.path);
    if (!file) continue;
    const caller = enclosing(file.lines, file.declarations, site.line);
    if (!caller || (site.path === path && caller.line === declaration.line)) continue;
    const key = `${site.path}\0${caller.line}`;
    let row = callerRows.find((candidate) => candidate.key === key);
    if (!row) {
      row = { key, file, caller, sites: [] };
      callerRows.push(row);
    }
    row.sites.push(site.line);
  }
  const callers = callerRows.map((row) => ({ name: row.caller.name, path: row.file.path, line: row.sites[0] }));
  if (callerRows.length > 0 && callerRows.length <= SYMBOL_CONTEXT_LIMITS.callers && total <= SYMBOL_CONTEXT_LIMITS.callerSites) {
    for (const row of callerRows) {
      const start = row.caller.line;
      const end = declarationEnd(row.file.lines, row.file.declarations, row.caller);
      const bonus = bodyDecides ? 3 : 7;
      if (end - start + 1 <= SYMBOL_CONTEXT_LIMITS.wholeCaller) {
        add('caller', row.file, qualified(row.file, row.caller.name, row.caller.line), start, end, bonus);
        continue;
      }
      const numbers = new Set([start]);
      for (const site of row.sites) {
        for (let line = Math.max(start, site - SYMBOL_CONTEXT_LIMITS.guardWindow); line <= Math.min(end, site + 2); line += 1) numbers.add(line);
        const siteIndent = indentAt(row.file.lines, site);
        for (let line = start + 1; line < site - SYMBOL_CONTEXT_LIMITS.guardWindow; line += 1) {
          if (indentAt(row.file.lines, line) < siteIndent && decidesLine(row.file.lines[line - 1] ?? '')) numbers.add(line);
        }
      }
      for (const run of runs([...numbers].sort((a, b) => a - b))) add('caller', row.file, qualified(row.file, row.caller.name, row.caller.line), run.startLine, run.endLine, bonus);
    }
  }

  // The direct callees in this repository, whole when they decide something.
  const conditionNames = calledInConditions(lines.slice(declaration.line - 1, bodyEnd));
  const seen = new Set([`${path}\0${declaration.line}`, ...callees.map((callee) => `${callee.path}\0${callee.line}`)]);
  const expandable = [];
  // A part is by name only when every path that reaches it has a by-name link: an exact
  // arrival found later clears the mark on it and on what it passes through to.
  const reached = new Map();
  const reach = (key, weak, candidate) => {
    const node = { weak, parts: candidate ? [candidate] : [], next: [] };
    reached.set(key, node);
    return node;
  };
  const strengthen = (node) => {
    if (!node.weak) return;
    node.weak = false;
    for (const part of node.parts) part.byName = false;
    for (const edge of node.next) if (!edge.byName) strengthen(edge.node);
  };
  for (const callee of callees) {
    const file = callee.path === path ? self : open(callee.path);
    if (!file) continue;
    const target = file.declarations.find((candidate) => candidate.line === callee.line);
    if (!target) continue;
    const end = declarationEnd(file.lines, file.declarations, target);
    const bonus = calleeBonus(callee.name, file.lines.slice(target.line - 1, Math.min(end, target.line + SYMBOL_CONTEXT_LIMITS.examinedLines - 1)), conditionNames);
    const key = `${callee.path}\0${callee.line}`;
    if (callee.implementation) {
      reach(key, Boolean(callee.byName), add('implementation', file, target.name, target.line, end, bonus, { byName: callee.byName }));
      continue;
    }
    const node = reach(key, Boolean(callee.byName), add('callee', file, target.name, target.line, end, bonus, { byName: callee.byName }));
    expandable.push({ file, target, end, node });
  }

  // One call deeper: what each direct callee calls, through an accessor too short to be a level.
  let deeper = 0;
  // A body is examined as far as a read would serve it.
  const head = (target, end) => Math.min(end, target.line + SYMBOL_CONTEXT_LIMITS.examinedLines - 1);
  const resolve = (file, target, end) => calleesOf({ text: slice(file.lines, target.line, head(target, end)), file, declaration: target, rootPath, ignore, files, open });
  for (const { file, target, end, node: source } of expandable.slice(0, SYMBOL_CONTEXT_LIMITS.deeperSources)) {
    const conditions = calledInConditions(file.lines.slice(target.line - 1, head(target, end)));
    const queue = resolve(file, target, end).map((row) => ({ row, via: qualified(file, target.name, target.line), conditions, through: false, parent: source }));
    while (queue.length > 0 && deeper < SYMBOL_CONTEXT_LIMITS.deeperCallees) {
      const { row, via, conditions: branchedOn, through, parent } = queue.shift();
      // A part reached through a by-name match is as weak as the weakest link above it.
      const byName = parent.weak || Boolean(row.byName);
      const key = `${row.path}\0${row.line}`;
      const earlier = reached.get(key);
      if (earlier) {
        parent.next.push({ node: earlier, byName: Boolean(row.byName) });
        if (!byName) strengthen(earlier);
      }
      if (seen.has(key)) continue;
      seen.add(key);
      const inner = row.path === path ? self : open(row.path);
      const found = inner?.declarations.find((candidate) => candidate.line === row.line);
      if (!found) continue;
      deeper += 1;
      const node = reach(key, byName);
      parent.next.push({ node, byName: Boolean(row.byName) });
      const innerEnd = declarationEnd(inner.lines, inner.declarations, found);
      const innerLines = inner.lines.slice(found.line - 1, head(found, innerEnd));
      if (!through && !row.implementation && innerEnd - found.line + 1 <= SYMBOL_CONTEXT_LIMITS.accessorLines) {
        const innerConditions = calledInConditions(innerLines);
        for (const next of resolve(inner, found, innerEnd)) queue.push({ row: next, via: qualified(inner, found.name, found.line), conditions: innerConditions, through: true, parent: node });
      }
      const part = add(row.implementation ? 'implementation' : 'callee', inner, found.name, found.line, innerEnd,
        calleeBonus(row.name, innerLines, branchedOn) - 3, { via, cap: SYMBOL_CONTEXT_LIMITS.deeperDeciding, byName });
      if (part) node.parts.push(part);
    }
  }

  const order = { deciding: -1, caller: 0, constructor: 1, owner: 2, callee: 3, implementation: 4, constant: 5 };
  candidates.sort((a, b) => b.score - a.score || order[a.role] - order[b.role] || a.startLine - b.startLine);
  const taken = [{ path, startLine: declaration.line, endLine: bodyEnd }];
  const overlaps = (candidate) => taken.some((range) => range.path === candidate.path
    && candidate.startLine <= range.endLine && candidate.endLine >= range.startLine);
  const parts = [];
  const omitted = [];
  let bytes = 0;
  // A constant line is tens of bytes; what the body and the candidates could use is held back for it.
  const bodyText = { file: self, text: slice(lines, declaration.line, bodyEnd) };
  const fileOf = (part) => (part.path === path ? self : open(part.path));
  const reserve = Math.min(budget >> 3, constantsUsed([bodyText, ...candidates.map((candidate) => ({ file: fileOf(candidate), text: candidate.text }))], taken)
    .reduce((sum, row) => sum + row.bytes, 0));
  // Each served part's rank and range, so the deciding lines can take the room of the lowest.
  const held = new Map();
  for (const [index, candidate] of candidates.entries()) {
    if (overlaps(candidate)) continue;
    const size = Buffer.byteLength(candidate.text, 'utf8');
    if (bytes + size > budget - reserve) {
      omitted.push({ role: candidate.role, path: candidate.path, symbol: candidate.symbol, line: candidate.startLine });
      continue;
    }
    bytes += size;
    taken.push(candidate);
    const part = {
      role: candidate.role,
      path: candidate.path,
      symbol: candidate.symbol,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      cite: `${candidate.path}:L${candidate.startLine}-L${candidate.endLine}`,
      text: candidate.text,
      ...(candidate.via ? { via: candidate.via } : {}),
      ...(candidate.byName ? { byName: true } : {}),
      ...(candidate.more ? { next: { path: candidate.path, startLine: candidate.endLine + 1, maxLines: Math.min(200, candidate.more - candidate.endLine) } } : {}),
    };
    parts.push(part);
    held.set(part, { rank: index, range: candidate });
  }

  // The named constants the body and the served parts use, in the file that uses them.
  for (const row of constantsUsed([bodyText, ...parts.map((part) => ({ file: fileOf(part), text: part.text }))], taken)) {
    const text = row.file.lines[row.line - 1] ?? '';
    if (!text || bytes + row.bytes > budget) continue;
    bytes += row.bytes;
    const range = { path: row.file.path, startLine: row.line, endLine: row.line };
    taken.push(range);
    const part = { role: 'constant', path: row.file.path, symbol: row.name, startLine: row.line, endLine: row.line, cite: `${row.file.path}:L${row.line}-L${row.line}`, text };
    parts.push(part);
    held.set(part, { rank: candidates.length + parts.length, range });
  }

  const decidingOmitted = [];
  // Serves the wanted lines (most wanted first, at most `decidingLines` with the gaps
  // `runs` joins) as `deciding` parts. Room comes from the lowest-ranked parts first;
  // what still does not fit is cut from the least wanted end; the budget never grows.
  const inline = (file, symbol, wanted, why) => {
    const free = [...new Set(wanted)].filter((line) => line >= 1 && line <= file.lines.length
      && !taken.some((range) => range.path === file.path && line >= range.startLine && line <= range.endLine));
    const shape = (count) => runs(free.slice(0, count).sort((a, b) => a - b));
    const lineCount = (windows) => windows.reduce((sum, window) => sum + window.endLine - window.startLine + 1, 0);
    const size = (windows) => windows.reduce((sum, window) => sum + Buffer.byteLength(slice(file.lines, window.startLine, window.endLine), 'utf8'), 0);
    let count = free.length;
    let windows = shape(count);
    while (count > 0 && lineCount(windows) > SYMBOL_CONTEXT_LIMITS.decidingLines) windows = shape(--count);
    if (windows.length === 0) return { parts: [], served: [], inContext: wanted.length > 0 };
    if (served && windows.every((window) => served(file.path, window.startLine, window.endLine))) {
      return { parts: [], served: windows.map((window) => `${file.path}:L${window.startLine}-L${window.endLine}`) };
    }
    while (bytes + size(windows) > budget) {
      let lowest = null;
      for (const [part, entry] of held) if (!lowest || entry.rank > held.get(lowest).rank) lowest = part;
      if (!lowest) break;
      const { range } = held.get(lowest);
      held.delete(lowest);
      parts.splice(parts.indexOf(lowest), 1);
      taken.splice(taken.indexOf(range), 1);
      bytes -= Buffer.byteLength(lowest.text, 'utf8');
      omitted.push({ role: lowest.role, path: lowest.path, symbol: lowest.symbol, line: lowest.startLine });
    }
    while (count > 0 && bytes + size(windows) > budget) windows = shape(--count);
    if (windows.length === 0) {
      decidingOmitted.push({ role: 'deciding', path: file.path, symbol, line: free[0] });
      return { parts: [], served: [] };
    }
    const added = windows.map((window) => {
      const text = slice(file.lines, window.startLine, window.endLine);
      bytes += Buffer.byteLength(text, 'utf8');
      const range = { path: file.path, startLine: window.startLine, endLine: window.endLine };
      taken.push(range);
      const cite = `${file.path}:L${window.startLine}-L${window.endLine}`;
      return { role: 'deciding', path: file.path, symbol, startLine: window.startLine, endLine: window.endLine, cite, label: repoText(`deciding lines of ${symbol} ${why}: ${cite}`, 240), text };
    });
    parts.push(...added);
    return { parts: added, served: [] };
  };

  // The conditions in the part of a long body this read cut, each with the line it guards.
  if (symbolEnd > bodyEnd && endTrusted) {
    const wanted = new Set();
    for (let line = bodyEnd + 1; line <= symbolEnd && wanted.size < SYMBOL_CONTEXT_LIMITS.decidingLines; line += 1) {
      const text = lines[line - 1] ?? '';
      if (text.length > SCANNED_LINE_CHARS) break;
      if (!decidesLine(text)) continue;
      wanted.add(line);
      if (line < symbolEnd) wanted.add(line + 1);
    }
    inline(self, declaration.name, [...wanted], `past this read's cut at L${bodyEnd} (it runs to L${symbolEnd})`);
  }

  let deciding = null;
  const callerShown = parts.some((part) => part.role === 'caller');
  if (!callerShown && callers.length > 0 && (!bodyDecides || callers.length > SYMBOL_CONTEXT_LIMITS.callers)) {
    const named = callers.slice(0, 4).map((row) => `${repoText(row.name, 80)} (${repoText(row.path)}:L${row.line})`).join(', ');
    const first = callers[0];
    // The first caller's lines around its call: the call, the guard window before it,
    // then the enclosing conditions above that, nearest first.
    const row = callerRows[0];
    const site = row.sites[0];
    const start = row.caller.line;
    const end = Math.max(site, Math.min(declarationEnd(row.file.lines, row.file.declarations, row.caller), site + 2));
    const wanted = [];
    for (let line = site; line <= end; line += 1) wanted.push(line);
    for (let line = site - 1; line >= Math.max(start, site - SYMBOL_CONTEXT_LIMITS.guardWindow); line -= 1) wanted.push(line);
    const siteIndent = indentAt(row.file.lines, site);
    for (let line = site - SYMBOL_CONTEXT_LIMITS.guardWindow - 1; line > start && wanted.length < 2 * SYMBOL_CONTEXT_LIMITS.decidingLines; line -= 1) {
      const text = row.file.lines[line - 1] ?? '';
      if (indentAt(row.file.lines, line) < siteIndent && decidesLine(text)) wanted.push(line);
    }
    wanted.push(start);
    const callerName = qualified(row.file, row.caller.name, row.caller.line);
    const shown = inline(row.file, callerName, wanted, `around its call at L${site}`);
    const where = `${bodyDecides ? 'This body decides part of it; when it runs at all' : 'This body holds no condition; the deciding condition'} is in its caller${callers.length > 1 ? 's' : ''} ${named}${total > callers.length ? ` and ${total - callers.length} more call sites` : ''}.`;
    if (shown.parts.length > 0) deciding = `${where} The deciding lines of ${repoText(callerName, 80)} are in \`context\` with role "deciding": ${shown.parts.map((part) => repoText(part.cite)).join(', ')}.`;
    else if (shown.inContext) deciding = `${where} Its deciding lines are already among the parts in \`context\`.`;
    else if (shown.served.length > 0) deciding = `${where} Its deciding lines were served earlier in this session: ${shown.served.map((cite) => repoText(cite)).join(', ')}.`;
    else deciding = `${where} Read it: ${JSON.stringify({ path: repoText(first.path), symbol: repoText(first.name, 80) })}.`;
  }
  parts.sort((a, b) => order[a.role] - order[b.role] || a.path.localeCompare(b.path) || a.startLine - b.startLine);
  return { parts, bytes, omitted: [...decidingOmitted, ...omitted].slice(0, 6), callers: callers.slice(0, 6), callerSites: total, deciding };
}

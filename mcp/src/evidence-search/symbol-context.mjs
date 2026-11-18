/**
 * The code around a symbol that decides what its body does, returned with a
 * `{path, symbol}` read so depth does not depend on the reader following calls.
 * Three places hold a rule the body alone hides: the caller's guard (the `if` or
 * early return around the call), the owner's constructor or header (defaults,
 * the resolver a field holds), and a direct callee (an options builder, a
 * `_drain_if_full`). Each candidate is ranked by its lines that decide: a
 * condition, a branch, a throw, or a literal default. The best are returned
 * within a byte cap, and each part names its path and lines so a body can cite
 * it exactly.
 */

import { callSitesOf } from './declaration-index.mjs';

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
});

const CONDITION = /\b(?:if|elif|else|unless|switch|case|when|match|guard|while|raise|throw|except|catch|default)\b|\?\?|\|\||&&|\s\?\s[^:]+\s:\s/u;
const DEFAULT_VALUE = /(?:^|[\s(,{])[A-Za-z_$][\w$]*\s*(?::=|=(?!=)|:)\s*(?:true|false|True|False|None|null|nil|-?\d[\d_.]*|"[^"\n]*"|'[^'\n]*')\s*(?:[,)}]|$)/u;
const COMMENT = /^\s*(?:\/\/|#|\*|\/\*)/u;
const DECIDING_NAME = /default|Default|option|Option|config|Config|setting|resolve|Resolve|verif|Verif|valid|Valid|check|Check|allow|Allow|should|mark|guard|policy|filter|select|choose|decide|^new[A-Z]|^New[A-Z]|^__init__$|^constructor$|^can[A-Z]|^is[A-Z]|^_?drain|^_?ensure/u;

/** Whether one source line decides: a condition, a branch, a throw or a literal default. */
export function decidesLine(line) {
  if (COMMENT.test(line)) return false;
  return CONDITION.test(line) || DEFAULT_VALUE.test(line);
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
 */
export function symbolContext({ rootPath, ignore, path, lines, declarations, declaration, bodyEnd, callees, open, budget }) {
  const candidates = [];
  const bodyDecides = decidingCount(lines.slice(declaration.line - 1, bodyEnd)) > 0;
  const own = declaration.name.split('.').pop();
  const add = (role, file, symbol, startLine, endLine, bonus = 0) => {
    const cut = Math.min(endLine, startLine + SYMBOL_CONTEXT_LIMITS.partLines - 1);
    const text = slice(file.lines, startLine, cut);
    const deciding = decidingCount(file.lines.slice(startLine - 1, cut));
    const score = deciding * 2 + bonus;
    if (score <= 0 || text.length === 0) return;
    candidates.push({ role, path: file.path, symbol, startLine, endLine: cut, more: cut < endLine ? endLine : null, text, sha256: file.sha256, score });
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
  const { sites, total } = callSitesOf(rootPath, own, { ignore, limit: SYMBOL_CONTEXT_LIMITS.callerSites });
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
        add('caller', row.file, row.caller.name, start, end, bonus);
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
      for (const run of runs([...numbers].sort((a, b) => a - b))) add('caller', row.file, row.caller.name, run.startLine, run.endLine, bonus);
    }
  }

  // The direct callees in this repository, whole when they decide something.
  for (const callee of callees) {
    const file = callee.path === path ? self : open(callee.path);
    if (!file) continue;
    const target = file.declarations.find((candidate) => candidate.line === callee.line);
    if (!target) continue;
    add('callee', file, target.name, target.line, declarationEnd(file.lines, file.declarations, target), DECIDING_NAME.test(callee.name) ? 3 : 0);
  }

  const order = { caller: 0, constructor: 1, owner: 2, callee: 3 };
  candidates.sort((a, b) => b.score - a.score || order[a.role] - order[b.role] || a.startLine - b.startLine);
  const taken = [{ path, startLine: declaration.line, endLine: bodyEnd }];
  const overlaps = (candidate) => taken.some((range) => range.path === candidate.path
    && candidate.startLine <= range.endLine && candidate.endLine >= range.startLine);
  const parts = [];
  const omitted = [];
  let bytes = 0;
  for (const candidate of candidates) {
    if (overlaps(candidate)) continue;
    const size = Buffer.byteLength(candidate.text, 'utf8');
    if (bytes + size > budget) {
      omitted.push({ role: candidate.role, path: candidate.path, symbol: candidate.symbol, line: candidate.startLine });
      continue;
    }
    bytes += size;
    taken.push(candidate);
    parts.push({
      role: candidate.role,
      path: candidate.path,
      symbol: candidate.symbol,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      cite: `${candidate.path}:L${candidate.startLine}-L${candidate.endLine}`,
      text: candidate.text,
      ...(candidate.more ? { next: { path: candidate.path, startLine: candidate.endLine + 1, maxLines: Math.min(200, candidate.more - candidate.endLine) } } : {}),
    });
  }
  parts.sort((a, b) => order[a.role] - order[b.role] || a.path.localeCompare(b.path) || a.startLine - b.startLine);

  let deciding = null;
  const callerShown = parts.some((part) => part.role === 'caller');
  if (!callerShown && callers.length > 0 && (!bodyDecides || callers.length > SYMBOL_CONTEXT_LIMITS.callers)) {
    const named = callers.slice(0, 4).map((row) => `${row.name} (${row.path}:L${row.line})`).join(', ');
    const first = callers[0];
    deciding = `${bodyDecides ? 'This body decides part of it; when it runs at all' : 'This body holds no condition; the deciding condition'} is in its caller${callers.length > 1 ? 's' : ''} ${named}${total > callers.length ? ` and ${total - callers.length} more call sites` : ''}. Read it: {"path":"${first.path}","symbol":"${first.name}"}.`;
  }
  return { parts, bytes, omitted: omitted.slice(0, 6), callers: callers.slice(0, 6), callerSites: total, deciding };
}

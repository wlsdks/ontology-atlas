/**
 * The family a symbol read belongs to, as one plain line on the read: how many
 * members the repository holds and how many this session has read. A family is
 * only members with a written structural tie:
 *
 * - classes whose header names the same base or interface (`class A(Base):`,
 *   `extends Base`, `implements Plugin`), where that name is declared exactly
 *   once in the repository;
 * - Go types whose methods cover one interface the repository declares with two
 *   or more methods, the read method among them.
 *
 * Declarations that only share a name, or share a folder, are no family, and a
 * read whose tie cannot be established gets no line: a wrong count would be a
 * false fact handed to the builder. Registration tables, switches and
 * decorators are not read as ties.
 *
 * The cost is one pass over the cached declarations per read call that holds
 * a symbol read.
 */

import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { repoText } from '../analyze/repo-text.mjs';
import { enclosingClass } from '../evidence-search/callees.mjs';
import { declarationsByFile } from '../evidence-search/declaration-index.mjs';

// Members named in the line; the rest are counted.
const SHOWN = 3;
const TYPE_KINDS = new Set(['class', 'interface', 'struct', 'type', 'enum', 'trait']);
const MAX_FILE_BYTES = 256 * 1024;

const lastSegment = (name) => String(name).split('.').pop();

/** One pass over the declarations: classes by base, type names, Go method sets and interfaces. */
function familyIndex(repoRoot, files) {
  const byPath = new Map();
  const subclasses = new Map();
  const typeCount = new Map();
  const goMethods = new Map();
  const goInterfaces = [];
  for (const { path, declarations } of declarationsByFile(repoRoot, files ? { files } : {})) {
    byPath.set(path, declarations);
    const go = path.endsWith('.go');
    const folder = posix.dirname(path);
    for (const declaration of declarations) {
      if (TYPE_KINDS.has(declaration.kind)) typeCount.set(declaration.name, (typeCount.get(declaration.name) ?? 0) + 1);
      for (const base of declaration.bases ?? []) {
        const rows = subclasses.get(base) ?? [];
        rows.push({ path, declaration });
        subclasses.set(base, rows);
      }
      if (!go) continue;
      if (declaration.kind === 'interface' && declaration.methods?.length >= 2) goInterfaces.push({ path, declaration });
      if (declaration.kind === 'method' && declaration.name.includes('.')) {
        const receiver = declaration.name.slice(0, declaration.name.lastIndexOf('.'));
        const key = `${folder}\0${receiver}`;
        const methods = goMethods.get(key) ?? { receiver, folder, lines: new Map() };
        const method = lastSegment(declaration.name);
        if (!methods.lines.has(method)) methods.lines.set(method, { path, line: declaration.line });
        goMethods.set(key, methods);
      }
    }
  }
  return { byPath, subclasses, typeCount, goMethods, goInterfaces };
}

function linesOf(repoRoot, path) {
  try {
    const text = readFileSync(join(repoRoot, path), 'utf8');
    return text.length > MAX_FILE_BYTES ? null : text.split('\n');
  } catch {
    return null;
  }
}

/** The member's own declaration of `method`: the first one after its header and before the next type in its file. */
function ownMethod(declarations, owner, method) {
  for (const declaration of declarations) {
    if (declaration.line <= owner.line) continue;
    if (TYPE_KINDS.has(declaration.kind)) return null;
    if (lastSegment(declaration.name) === method && (declaration.kind === 'method' || declaration.kind === 'function')) return declaration;
  }
  return null;
}

/** Classes whose header names the read class's first base that the repository declares once. */
function classFamily(index, row, declaration, repoRoot) {
  const declarations = index.byPath.get(row.path) ?? [];
  let owner = declaration.kind === 'class' ? declaration : null;
  if (!owner) {
    const lines = linesOf(repoRoot, row.path);
    owner = lines ? enclosingClass({ lines, declarations }, declaration) : null;
  }
  if (!owner?.bases) return null;
  const method = owner === declaration ? null : lastSegment(declaration.name);
  for (const base of owner.bases) {
    if (index.typeCount.get(base) !== 1) continue;
    const members = (index.subclasses.get(base) ?? []).map(({ path, declaration: member }) => {
      const own = method ? ownMethod(index.byPath.get(path) ?? [], member, method) : null;
      return { name: member.name, path, line: own?.line ?? member.line };
    });
    if (members.length >= 2) return { members, what: `classes whose header names \`${repoText(base, 80)}\`` };
  }
  return null;
}

/** Go types whose methods cover the widest interface holding the read method, when that interface is one. */
function goFamily(index, row, declaration) {
  if (!row.path.endsWith('.go') || declaration.kind !== 'method' || !declaration.name.includes('.')) return null;
  const receiver = declaration.name.slice(0, declaration.name.lastIndexOf('.'));
  const method = lastSegment(declaration.name);
  const own = index.goMethods.get(`${posix.dirname(row.path)}\0${receiver}`);
  if (!own) return null;
  const covers = (methods, interfaceMethods) => interfaceMethods.every((name) => methods.lines.has(name));
  const candidates = index.goInterfaces
    .filter(({ declaration: face }) => face.methods.includes(method) && covers(own, face.methods))
    .sort((a, b) => b.declaration.methods.length - a.declaration.methods.length);
  if (candidates.length === 0) return null;
  const widest = candidates.filter((candidate) => candidate.declaration.methods.length === candidates[0].declaration.methods.length);
  const membersOf = ({ declaration: face }) => [...index.goMethods.values()].filter((methods) => covers(methods, face.methods));
  const sets = widest.map((candidate) => membersOf(candidate).map((methods) => `${methods.folder}\0${methods.receiver}`).sort().join('\n'));
  // Two interfaces of the same width that different types implement: no one tie.
  if (new Set(sets).size !== 1) return null;
  const face = widest[0];
  const members = membersOf(face).map((methods) => ({ name: methods.receiver, ...methods.lines.get(method) }));
  if (members.length < 2) return null;
  return { members, what: `Go types implementing \`${repoText(face.declaration.name, 80)}\` (${repoText(`${face.path}:L${face.declaration.line}`)})` };
}

/** Whether this session has served the member: a range holding its declaration line. */
function served(reads, member) {
  return (reads?.get(member.path) ?? []).some((range) => range.startLine <= member.line && member.line <= range.endLine);
}

function line({ members: unordered, what, reads }) {
  const members = [...unordered].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
  const read = members.filter((member) => served(reads, member)).length;
  const shown = members.slice(0, SHOWN).map((member) => `${repoText(member.name, 80)} ${repoText(`${member.path}:L${member.line}`)}`).join(', ');
  const more = members.length > SHOWN ? ` and ${members.length - SHOWN} more` : '';
  return `This family has ${members.length} members: ${what} (${shown}${more}). This session has read ${read} of them; a sentence about the family says "${read} of ${members.length} read" or speaks only for the member${read === 1 ? '' : 's'} read, and what the others do is an Uncertainty line.`;
}

/**
 * Adds `family`, one plain line, to each symbol read in the packet whose
 * declaration has a structural family of two or more members.
 *
 * @param {object} packet a `sourceEvidence:v1` packet, changed in place
 * @param {{ repoRoot: string, files?: object[], reads?: Map<string, object[]> }} context
 */
export function noteReadFamilies(packet, { repoRoot, files, reads }) {
  const rows = (packet?.rows ?? []).filter((row) => row?.status === 'read' && typeof row.symbol === 'string' && row.actualRange);
  if (rows.length === 0 || !repoRoot) return packet;
  const index = familyIndex(repoRoot, files);
  for (const row of rows) {
    const declarations = index.byPath.get(row.path) ?? [];
    const declaration = declarations.find((candidate) => candidate.line === row.actualRange.startLine)
      ?? declarations.find((candidate) => candidate.name === row.symbol && candidate.line >= row.actualRange.startLine && candidate.line <= row.actualRange.endLine);
    if (!declaration) continue;
    const family = classFamily(index, row, declaration, repoRoot) ?? goFamily(index, row, declaration);
    if (family) row.family = line({ ...family, reads });
  }
  return packet;
}

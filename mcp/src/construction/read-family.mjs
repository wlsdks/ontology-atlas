/**
 * The family a symbol read belongs to, as one plain line on the read: how many
 * members the repository holds and how many this session has read. Members are
 * only those `type-family` can establish from written ties (a class header's
 * resolved base, a Go interface's method set); where it cannot, the read gets
 * no line, because a wrong count is a false fact handed to the builder.
 *
 * Members are counted across the whole repository root, not only the analysed
 * folder, and a member counts as read when a range this session served
 * overlaps its own code: its declaration of the read method, else the whole
 * class or method.
 */

import { posix, relative, sep } from 'node:path';

import { repoText } from '../analyze/repo-text.mjs';
import { productFiles } from '../evidence-search/declaration-index.mjs';
import { createFamilies } from '../evidence-search/type-family.mjs';

// Members named in the line; the rest are counted.
const SHOWN = 3;

const toPosix = (path) => path.split(sep).join('/');
const byPlace = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);

/**
 * Adds `family`, one plain line, to each symbol read in the packet whose
 * declaration has a family `type-family` can establish.
 *
 * @param {object} packet a `sourceEvidence:v1` packet whose paths are relative to `root`, changed in place
 * @param {object} context
 * @param {string} [context.root] absolute folder the read was made in (default `repoRoot`)
 * @param {string} [context.repoRoot] absolute repository root holding `root` (default `root`); members are counted across it
 * @param {object[]} [context.files] product files under `repoRoot`
 * @param {Map<string, object[]>} [context.reads] ranges this session served under `root`
 * @param {Map<string, object[]>} [context.rootReads] ranges this session served under `repoRoot`, when it differs
 */
export function noteReadFamilies(packet, { root: folder, repoRoot: repository, files, reads, rootReads }) {
  const root = folder ?? repository;
  const repoRoot = repository ?? folder;
  const rows = (packet?.rows ?? []).filter((row) => row?.status === 'read' && typeof row.symbol === 'string' && row.actualRange);
  if (rows.length === 0 || !root) return packet;
  const prefix = toPosix(relative(repoRoot, root));
  if (prefix.startsWith('..')) return packet;
  const families = createFamilies(repoRoot, files ?? productFiles(repoRoot, []));
  const inRepo = (path) => (prefix ? `${prefix}/${path}` : path);
  const shown = (path) => repoText(prefix ? posix.relative(prefix, path) : path);
  const rangesOf = (path) => {
    const inner = !prefix ? path : path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null;
    return [...(inner === null ? [] : reads?.get(inner) ?? []), ...(prefix ? rootReads?.get(path) ?? [] : [])];
  };
  for (const row of rows) {
    const family = families.familyOf(inRepo(row.path), row.actualRange, row.symbol);
    if (!family) continue;
    const members = [...family.members].sort(byPlace);
    const read = members.filter((member) => {
      const ranges = rangesOf(member.path);
      if (ranges.length === 0) return false;
      const span = families.spanOf(member, family.method);
      return Boolean(span) && ranges.some((range) => range.startLine <= span.endLine && span.startLine <= range.endLine);
    }).length;
    const base = `\`${repoText(family.base.name, 80)}\` (${shown(family.base.path)}:L${family.base.line})`;
    const what = family.tie === 'go'
      ? `the Go types in or importing ${shown(posix.dirname(family.base.path))}/ whose methods match ${base}`
      : `the classes whose header names ${base}`;
    const named = members.slice(0, SHOWN).map((member) => `${repoText(member.name, 80)} ${shown(member.path)}:L${member.line}`).join(', ');
    const more = members.length > SHOWN ? ` and ${members.length - SHOWN} more` : '';
    row.family = `This family has ${members.length} members: ${what} (${named}${more}). This session has read ${read} of them; a sentence about the family says "${read} of ${members.length} read" or speaks only for the member${read === 1 ? '' : 's'} read, and what the others do is an Uncertainty line.`;
  }
  return packet;
}

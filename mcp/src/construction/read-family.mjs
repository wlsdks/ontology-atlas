/**
 * The family a symbol read belongs to, as one plain line on the read: how many
 * members the analysed folder holds and how many this session has read.
 * Members are only those `type-family` can establish from written ties (a
 * class header's resolved base, a Go interface's method set); where it cannot,
 * the read gets no line, because a wrong count is a false fact handed to the
 * builder.
 *
 * Members are counted only inside the folder the read was made in, never above
 * it: that folder is all the server was granted. A folder that is not itself a
 * repository root says the count is within this folder. A member counts as read
 * when a range this session served overlaps its own code: its declaration of
 * the read method, else the whole class or method.
 */

import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';

import { repoText } from '../analyze/repo-text.mjs';
import { productWalk } from '../evidence-search/declaration-index.mjs';
import { createFamilies } from '../evidence-search/type-family.mjs';

// Members named in the line; the rest are counted.
const SHOWN = 3;

const byPlace = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);

/**
 * Adds `family`, one plain line, to each symbol read in the packet whose
 * declaration has a family `type-family` can establish.
 *
 * @param {object} packet a `sourceEvidence:v1` packet whose paths are relative to `root`, changed in place
 * @param {object} context
 * @param {string} context.root absolute folder the read was made in; members are counted inside it only
 * @param {string[]} [context.ignore] folders the walk skips
 * @param {Map<string, object[]>} [context.reads] ranges this session served under `root`
 */
export function noteReadFamilies(packet, { root, ignore = [], reads }) {
  const rows = (packet?.rows ?? []).filter((row) => row?.status === 'read' && typeof row.symbol === 'string' && row.actualRange);
  if (rows.length === 0 || !root) return packet;
  const walk = productWalk(root, ignore);
  const families = createFamilies(root, walk.files, { truncated: walk.truncated });
  const scope = existsSync(join(root, '.git')) ? '' : ' within this folder';
  const shown = (path) => repoText(path);
  for (const row of rows) {
    const family = families.familyOf(row.path, row.actualRange, row.symbol);
    if (!family) continue;
    const members = [...family.members].sort(byPlace);
    const read = members.filter((member) => {
      const ranges = reads?.get(member.path) ?? [];
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
    row.family = `This family has ${members.length} members${scope}: ${what} (${named}${more}). This session has read ${read} of them; a sentence about the family says "${read} of ${members.length} read" or speaks only for the member${read === 1 ? '' : 's'} read, and what the others do is an Uncertainty line.`;
  }
  return packet;
}

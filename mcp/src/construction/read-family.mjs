/**
 * The family a symbol read belongs to, as one plain line on the read: how many
 * members the analysed folder holds and how many this session has read.
 * Members are only those `type-family` can establish from written ties (a
 * class header's resolved base, a Go interface's method set); where it cannot,
 * the read gets no line, because a wrong count is a false fact handed to the
 * builder.
 *
 * Members are counted only inside the folder the read was made in, never above
 * it: that folder is all the server was granted. The count is a floor, and the
 * line says so: ties written in a way this pass cannot follow are not found,
 * while a member it lists is always one. A member counts as read when a range
 * this session served overlaps its own code: its declaration of the read
 * method, else the whole class or method.
 *
 * A declaration file and its implementation twin (`x.d.ts` beside `x.js`,
 * `x.mjs`, `x.cjs` or `x.ts`; same folder, same class name) are one member,
 * listed at the implementation; Python `.pyi` stubs are not product files, so
 * the walk never counts them. Reading its code counts,
 * and so does the read the line is written on, made on either twin; a range
 * served from the declaration file alone does not, since it holds signatures,
 * not what the member does.
 */

import { posix } from 'node:path';

import { repoText } from '../analyze/repo-text.mjs';
import { productWalk } from '../evidence-search/declaration-index.mjs';
import { createFamilies } from '../evidence-search/type-family.mjs';

// Members named in the line; the rest are counted.
const SHOWN = 3;

// A declaration file's stem, and the implementation files that may be its twin.
const DECLARATION_FILES = [
  [/\.d\.ts$/u, ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx']],
  [/\.d\.mts$/u, ['.mjs', '.mts']],
  [/\.d\.cts$/u, ['.cjs', '.cts']],
];

/** The implementation paths a declaration file may stand for, or null when `path` is no declaration file. */
function implementationsOf(path) {
  for (const [pattern, extensions] of DECLARATION_FILES) {
    if (pattern.test(path)) return extensions.map((extension) => path.replace(pattern, extension));
  }
  return null;
}

/** Members with each declaration-file twin folded into its implementation, as `{ ...implementation, twins }`. */
function withoutTwins(members) {
  const byPlaceAndName = new Map(members.map((member) => [`${member.path}\0${member.name}`, member]));
  const twinsOf = new Map();
  const folded = new Set();
  for (const member of members) {
    const implementation = (implementationsOf(member.path) ?? [])
      .map((path) => byPlaceAndName.get(`${path}\0${member.name}`))
      .find(Boolean);
    if (!implementation) continue;
    folded.add(member);
    twinsOf.set(implementation, [...(twinsOf.get(implementation) ?? []), member]);
  }
  return members.filter((member) => !folded.has(member)).map((member) => ({ ...member, twins: twinsOf.get(member) ?? [] }));
}

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
  for (const row of rows) {
    const family = families.familyOf(row.path, row.actualRange, row.symbol);
    if (!family) continue;
    const count = familyCount(families, family, reads, row);
    if (!count) continue;
    const { members, read } = count;
    row.family = `This family has at least ${members.length} members found in this folder: ${familyWhat(family, members)}. You read ${read} of them; a sentence about the family says "${read} of at least ${members.length} read" or speaks only for the member${read === 1 ? '' : 's'} read, never "every" unless all were read, and what the others do is an Uncertainty line.`;
  }
  return packet;
}

/**
 * A family's members, declaration twins folded, and how many this session has
 * read; null when fewer than two remain.
 *
 * @param {object} families `createFamilies` of the folder
 * @param {object} family a family `familyOf` or `familyNamed` returned
 * @param {Map<string, object[]>} [reads] ranges this session served
 * @param {{ path: string, actualRange: object }} [row] the read the count is written on, if any
 */
export function familyCount(families, family, reads, row = null) {
  const members = withoutTwins([...family.members].sort(byPlace));
  if (members.length < 2) return null;
  const hit = (span, ranges) => ranges.some((range) => range.startLine <= span.endLine && span.startLine <= range.endLine);
  const readIn = (member, rangesOf) => families.spansOf(member, family.method).some((span) => hit(span, rangesOf(span.path)));
  // The read this line is written on, made on either twin.
  const own = (member) => Boolean(row) && [member, ...member.twins].some((place) => readIn(place, (path) => (path === row.path ? [row.actualRange] : [])));
  const read = members.filter((member) => own(member) || readIn(member, (path) => reads?.get(path) ?? [])).length;
  return { members, read };
}

/** What ties the family and a few members with their lines, as plain text. */
export function familyWhat(family, members) {
  const base = `\`${repoText(family.base.name, 80)}\` (${repoText(family.base.path)}:L${family.base.line})`;
  const what = family.tie === 'go'
    ? `the Go types in or importing ${repoText(posix.dirname(family.base.path))}/ whose methods match ${base}`
    : `the classes whose header names ${base}`;
  const named = members.slice(0, SHOWN).map((member) => `${repoText(member.name, 80)} ${repoText(member.path)}:L${member.line}`).join(', ');
  const more = members.length > SHOWN ? ` and ${members.length - SHOWN} more` : '';
  return `${what} (${named}${more})`;
}
